// Security/reliability agent orchestrator.
//
// Triggered by:
//   - Sentry webhook (`/api/agents/sentry-webhook`) — fires for matching
//     issues; the route filters by level + times_seen before calling here.
//   - Vercel webhook (`/api/agents/vercel-webhook`) — opens a 10-min guard
//     window in Redis after a successful deploy.
//   - Manual: `/security investigar <issueId>` from Telegram.
//
// The agent runs the full multi-turn loop until end_turn, then persists
// agent_runs. Auto-actions (merge_pr, rollback_vercel) are gated by
// `src/lib/agents/guardrails.js`. Failed gates degrade the call to a
// `request_approval` so the operator decides.

import { getClient, DEFAULT_MODEL, estimateCostUsd, withCache, withToolCache } from '@/lib/agents/anthropicClient';
import {
  startAgentRun,
  finishAgentRun,
  appendMemory,
  readMemory,
  getConfig,
  acquireLock,
  releaseLock,
} from '@/lib/agents/state';
import { sendMessage } from '@/lib/agents/telegram';
import { captureException } from '@/lib/sentry';
import { canAutoMergeHotfix, shouldAutoRollback } from '@/lib/agents/guardrails';
import { SECURITY_SYSTEM_PROMPT } from './systemPrompt';

import {
  querySentryIssue, QUERY_SENTRY_ISSUE_SCHEMA,
  listRecentIssues, LIST_RECENT_ISSUES_SCHEMA,
  getIssueRegressionInfo, GET_REGRESSION_INFO_SCHEMA,
  correlateErrorRate, CORRELATE_ERROR_RATE_SCHEMA,
} from '@/lib/agents/tools/sentry';
import {
  listRecentDeployments, LIST_DEPLOYMENTS_SCHEMA,
  rollbackVercel, ROLLBACK_VERCEL_SCHEMA,
} from '@/lib/agents/tools/vercel';
import {
  getFileFromGithub, GET_FILE_SCHEMA,
  proposeHotfixPr, PROPOSE_HOTFIX_PR_SCHEMA,
  getPrStatus, GET_PR_STATUS_SCHEMA,
  mergePr, MERGE_PR_SCHEMA,
} from '@/lib/agents/tools/github';
import { proposeAction } from '@/lib/agents/tools/proposeAction';

const MAX_ITERATIONS = 14;

// `request_approval` is just `propose_action` under a different name, scoped
// to the security agent and with security-relevant defaults.
const REQUEST_APPROVAL_TOOL_SCHEMA = {
  name: 'request_approval',
  description:
    'Crea una propuesta de acción para que el operador decida desde Telegram. Devuelve actionId. Para security el TTL default es 1h. Usa esto siempre que NO se cumplan los criterios duros para acción autónoma.',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Tipo: "rollback" | "hotfix_pr" | "investigation_summary" | "other".' },
      summary: { type: 'string', description: 'Resumen ejecutivo en español, ≤ 250 chars (es el title del card).' },
      rationale: { type: 'string', description: 'Análisis completo. Markdown OK.' },
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
      payload: { type: 'object', description: 'Detalles estructurados: para "rollback" → { deploymentId, reason }; para "hotfix_pr" → { branch, files, title, body }.' },
    },
    required: ['action', 'summary'],
  },
};

const QUERY_MEMORY_TOOL_SCHEMA = {
  name: 'query_agent_memory',
  description:
    'Consulta memoria del agente security. Topics típicos: "incidents", "rejected_proposals", "guardrail_violations", "executed_actions".',
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
    required: ['topic'],
  },
};

const SEND_TELEGRAM_TOOL_SCHEMA = {
  name: 'send_telegram_message',
  description: 'Envía un mensaje informativo (sin botones) al chat del operador. Para estados, ignorados, o resúmenes intermedios.',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
    },
    required: ['text'],
  },
};

const TOOLS = [
  QUERY_SENTRY_ISSUE_SCHEMA,
  LIST_RECENT_ISSUES_SCHEMA,
  GET_REGRESSION_INFO_SCHEMA,
  CORRELATE_ERROR_RATE_SCHEMA,
  LIST_DEPLOYMENTS_SCHEMA,
  GET_FILE_SCHEMA,
  PROPOSE_HOTFIX_PR_SCHEMA,
  GET_PR_STATUS_SCHEMA,
  MERGE_PR_SCHEMA,
  ROLLBACK_VERCEL_SCHEMA,
  REQUEST_APPROVAL_TOOL_SCHEMA,
  QUERY_MEMORY_TOOL_SCHEMA,
  SEND_TELEGRAM_TOOL_SCHEMA,
];

async function executeTool(name, input, ctx) {
  switch (name) {
    case 'query_sentry_issue': return querySentryIssue(input || {});
    case 'list_recent_issues': return listRecentIssues(input || {});
    case 'get_issue_regression_info': return getIssueRegressionInfo(input || {});
    case 'correlate_error_rate': return correlateErrorRate(input || {});
    case 'list_recent_deployments': return listRecentDeployments(input || {});
    case 'get_file_from_github': return getFileFromGithub(input || {});
    case 'propose_hotfix_pr': return proposeHotfixPr(input || {});
    case 'get_pr_status': return getPrStatus(input || {});

    // Gated: validate guardrails before delegating to the API client.
    case 'merge_pr': {
      const status = await getPrStatus({ prNumber: input?.prNumber });
      if (status?.error) return { error: status.error };
      const paths = []; // we don't know paths from status; fetch via PR files
      // Cheap call to get changed files.
      try {
        // eslint-disable-next-line global-require
        const { fetchWithTimeout } = require('@/lib/http');
        const repo = process.env.GITHUB_REPO;
        const token = process.env.GITHUB_TOKEN;
        if (repo && token) {
          const r = await fetchWithTimeout(
            `https://api.github.com/repos/${repo}/pulls/${input?.prNumber}/files`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'medconnect-agents/1.0',
              },
              timeoutMs: 8000,
            }
          );
          if (r.ok) {
            const files = await r.json();
            for (const f of files || []) paths.push(f.filename);
          }
        }
      } catch {/* ignore — guardrail will refuse if paths unknown */}

      const totalLinesChanged = (status.additions || 0) + (status.deletions || 0);
      const regressionInfo = ctx?.regression;
      const verdict = canAutoMergeHotfix({
        paths,
        totalLinesChanged,
        isRegression: !!regressionInfo?.isRegression,
        ciGreen: !!status.ciGreen,
        config: ctx?.config || {},
      });
      if (!verdict.ok) {
        // Degrade to approval; record the violation.
        await appendMemory({
          agent: 'security',
          topic: 'guardrail_violations',
          content: { tool: 'merge_pr', input, reason: verdict.reason },
        });
        return {
          degraded: true,
          guardrail: verdict.reason,
          message:
            'Auto-merge bloqueado por guardrails. Crea un request_approval para que el operador decida.',
        };
      }
      return mergePr(input || {});
    }

    case 'rollback_vercel': {
      // Auto-rollback path is gated. The agent decides when to call this;
      // we re-validate against the live config + the freshest error-rate
      // snapshot.
      const deployments = await listRecentDeployments({ limit: 5 });
      const newest = deployments?.deployments?.[0];
      const ageMinutes = newest?.createdAt
        ? Math.max(0, Math.round((Date.now() - new Date(newest.createdAt).getTime()) / 60_000))
        : 9999;
      const rate = await correlateErrorRate({ windowMinutes: 5 });
      const verdict = shouldAutoRollback({
        deployAgeMinutes: ageMinutes,
        errorRate: Number(rate?.errorsPerMinute || 0),
        baselineErrorRate: Number(rate?.baselinePerMinute || 0),
        sustainedMinutes: 5,
        config: ctx?.config || {},
      });
      if (!verdict.ok) {
        await appendMemory({
          agent: 'security',
          topic: 'guardrail_violations',
          content: { tool: 'rollback_vercel', input, reason: verdict.reason },
        });
        return {
          degraded: true,
          guardrail: verdict.reason,
          message:
            'Auto-rollback bloqueado por guardrails. Crea un request_approval para que el operador decida.',
        };
      }
      return rollbackVercel(input || {});
    }

    case 'request_approval': {
      const ttlHours = Number(ctx?.config?.pending_action_ttl_hours) || 1;
      return proposeAction({
        agent: 'security',
        type: input?.action || 'other',
        title: input?.summary || 'security action',
        rationale: input?.rationale,
        payload: input?.payload,
        riskLevel: input?.riskLevel || 'medium',
        ttlDays: Math.max(1, Math.ceil(ttlHours / 24)),
      });
    }

    case 'query_agent_memory':
      return readMemory({
        agent: 'security',
        topic: String(input?.topic || ''),
        limit: Math.max(1, Math.min(50, Number(input?.limit) || 20)),
      });

    case 'send_telegram_message':
      return sendMessage({ text: String(input?.text || '').slice(0, 4000) });

    default:
      return { error: `unknown tool ${name}` };
  }
}

function buildIntro({ trigger, issueId, deploymentId, config, memory }) {
  const lines = [];
  lines.push('# Run del Security & Reliability Agent');
  lines.push('');
  lines.push(`- Fecha (UTC): ${new Date().toISOString()}`);
  lines.push(`- Trigger: ${trigger}`);
  if (issueId) lines.push(`- Issue Sentry: \`${issueId}\``);
  if (deploymentId) lines.push(`- Deployment bajo vigilancia: \`${deploymentId}\``);
  lines.push('');
  lines.push('## Configuración (live)');
  for (const [k, v] of Object.entries(config || {})) {
    lines.push(`- \`${k}\` = \`${v}\``);
  }
  lines.push('');
  lines.push('## Memoria reciente');
  if (memory.incidents.length) {
    lines.push('### Incidentes recientes');
    for (const m of memory.incidents.slice(0, 5)) {
      lines.push(`- ${new Date(m.createdAt).toISOString().slice(0, 10)} — ${JSON.stringify(m.content).slice(0, 250)}`);
    }
  }
  if (memory.violations.length) {
    lines.push('');
    lines.push('### Guardrail violations recientes (NO repetir)');
    for (const m of memory.violations.slice(0, 5)) {
      lines.push(`- ${m.content?.tool} bloqueada: ${m.content?.reason}`);
    }
  }
  lines.push('');
  lines.push('## Instrucción');
  if (trigger === 'sentry_webhook' && issueId) {
    lines.push(`Investiga el issue \`${issueId}\`, decide si corresponde rollback, hotfix automático, o aprobación humana, siguiendo el protocolo. Si es ruido, ignóralo y termina.`);
  } else if (trigger === 'manual' && issueId) {
    lines.push(`Investigación bajo demanda del issue \`${issueId}\`. Devuelve un análisis aunque la conclusión sea "no actionable".`);
  } else if (trigger === 'vercel_webhook' && deploymentId) {
    lines.push(`Apertura de ventana de vigilancia para deployment \`${deploymentId}\`. No hay aún issue concreto: lista issues recientes (1h), correlaciona la tasa, y avisa SOLO si encuentras algo significativo.`);
  } else {
    lines.push('Trigger genérico: revisa estado general y reporta si encuentras algo accionable.');
  }
  return lines.join('\n');
}

async function loadMemory() {
  const [incidents, violations] = await Promise.all([
    readMemory({ agent: 'security', topic: 'incidents', limit: 10 }),
    readMemory({ agent: 'security', topic: 'guardrail_violations', limit: 10 }),
  ]);
  return { incidents, violations };
}

/**
 * Invocations:
 *   { trigger: 'sentry_webhook', issueId }
 *   { trigger: 'manual', issueId }
 *   { trigger: 'vercel_webhook', deploymentId }
 */
export async function runSecurityAgent({ trigger = 'manual', issueId, deploymentId, silent = false } = {}) {
  const lockKey = issueId
    ? `agent:lock:security:issue:${issueId}`
    : (deploymentId ? `agent:lock:security:deploy:${deploymentId}` : 'agent:lock:security:misc');
  const lockOk = await acquireLock(lockKey, 1800); // 30 min lock per topic
  if (!lockOk) {
    return { ok: false, skipped: 'locked', reason: `already running for ${lockKey}` };
  }

  const runId = await startAgentRun({ agent: 'security', trigger });
  let config = {};
  let memory = { incidents: [], violations: [] };
  let regressionCache = null;

  try {
    [config, memory] = await Promise.all([getConfig('security'), loadMemory()]);
    // Pre-compute regression info if we have an issueId — speeds up
    // guardrail checks inside the tool dispatcher.
    if (issueId) {
      regressionCache = await getIssueRegressionInfo({
        issueId,
        regressionWindowDays: Number(config.regression_window_days) || 30,
      }).catch(() => null);
    }
  } catch (err) {
    captureException(err, { scope: '[security/run] load context' }).catch(() => {});
  }

  const intro = buildIntro({ trigger, issueId, deploymentId, config, memory });

  const client = getClient();
  const messages = [{ role: 'user', content: intro }];

  let totalIn = 0;
  let totalOut = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;
  let approvalsRequested = 0;
  let autoActionsExecuted = 0;
  let lastAssistantText = '';
  let stopReason = null;

  const ctx = { config, regression: regressionCache };

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const resp = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 1500,
        system: withCache(SECURITY_SYSTEM_PROMPT),
        tools: withToolCache(TOOLS),
        messages,
      });

      const usage = resp.usage || {};
      totalIn  += Number(usage.input_tokens  || 0);
      totalOut += Number(usage.output_tokens || 0);
      cacheRead  += Number(usage.cache_read_input_tokens || 0);
      cacheWrite += Number(usage.cache_creation_input_tokens || 0);
      cost += estimateCostUsd(usage, DEFAULT_MODEL);

      messages.push({ role: 'assistant', content: resp.content });

      const toolUses = [];
      for (const block of resp.content || []) {
        if (block.type === 'text' && block.text) lastAssistantText = block.text;
        else if (block.type === 'tool_use') toolUses.push(block);
      }

      stopReason = resp.stop_reason;
      if (stopReason !== 'tool_use' || toolUses.length === 0) break;

      const toolResults = await Promise.all(
        toolUses.map(async (tu) => {
          let result;
          try {
            result = await executeTool(tu.name, tu.input || {}, ctx);
            if (tu.name === 'request_approval' && result?.actionId) approvalsRequested += 1;
            if ((tu.name === 'merge_pr' || tu.name === 'rollback_vercel') && result?.ok) autoActionsExecuted += 1;
          } catch (err) {
            result = { error: err?.message || String(err) };
          }
          return {
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(result).slice(0, 100_000),
          };
        })
      );
      messages.push({ role: 'user', content: toolResults });
    }

    const summary = lastAssistantText?.slice(0, 4000) || '(sin resumen)';
    await appendMemory({
      agent: 'security',
      topic: 'incidents',
      content: { runId, trigger, issueId, deploymentId, approvalsRequested, autoActionsExecuted, summary },
    });
    await finishAgentRun({
      runId,
      status: 'ok',
      summary,
      tokensIn: totalIn + cacheRead + cacheWrite,
      tokensOut: totalOut,
      costUsd: Math.round(cost * 10000) / 10000,
    });

    if (!silent && (approvalsRequested > 0 || autoActionsExecuted > 0)) {
      const lines = [
        `*[SEC] Run completado*`,
        '',
        summary,
        '',
        `_${approvalsRequested} aprobaciones pedidas · ${autoActionsExecuted} auto-acciones · $${cost.toFixed(4)}_`,
      ];
      await sendMessage({ text: lines.join('\n') });
    }

    return { ok: true, runId, approvalsRequested, autoActionsExecuted, costUsd: cost, summary };
  } catch (err) {
    captureException(err, { scope: '[security/run] orchestrator', runId }).catch(() => {});
    await finishAgentRun({
      runId,
      status: 'error',
      summary: err?.message || String(err),
      tokensIn: totalIn + cacheRead + cacheWrite,
      tokensOut: totalOut,
      costUsd: cost,
    });
    if (!silent) {
      await sendMessage({
        text: `*[SEC] Run abortado:* \`${(err?.message || String(err)).slice(0, 200)}\``,
      });
    }
    return { ok: false, runId, error: err?.message || String(err) };
  } finally {
    await releaseLock(lockKey);
  }
}
