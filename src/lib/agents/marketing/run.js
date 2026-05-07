// Marketing agent orchestrator.
//
// Multi-turn loop:
//   1. Build the warm context (config + memory + run intro) once at the start.
//   2. Send to Claude with the cached system prompt + cached tool definitions.
//   3. Execute tool_use blocks in the response, append tool_result blocks.
//   4. Loop until stop_reason === 'end_turn' (or max iterations).
//   5. Persist agent_runs row with usage + cost + summary.
//
// Each turn's response can include both `tool_use` blocks (which we execute
// server-side and feed back) AND `text` blocks (which we accumulate as the
// model's running narration; the LAST text after end_turn is treated as the
// summary).

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
import { MARKETING_SYSTEM_PROMPT } from './systemPrompt';

import { queryAnalyticsEventsDb, QUERY_DB_TOOL_SCHEMA } from '@/lib/agents/tools/db';
import { listLandingPages, LIST_LANDINGS_TOOL_SCHEMA } from '@/lib/agents/tools/landings';
import { fetchGa4Metrics, FETCH_GA4_TOOL_SCHEMA, isGa4Configured } from '@/lib/agents/tools/ga4';
import { proposeAction, PROPOSE_ACTION_TOOL_SCHEMA } from '@/lib/agents/tools/proposeAction';

const MAX_ITERATIONS = 12;

// query_agent_memory is a thin tool wrapper over readMemory.
const QUERY_MEMORY_TOOL_SCHEMA = {
  name: 'query_agent_memory',
  description:
    'Consulta la memoria del agente. Topics típicos: "last_run", "acknowledged_proposals", "rejected_proposals", "guardrail_violations". Devuelve hasta `limit` (default 20) entradas más recientes con su content_json.',
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
    required: ['topic'],
  },
};

const TOOLS = [
  QUERY_DB_TOOL_SCHEMA,
  LIST_LANDINGS_TOOL_SCHEMA,
  FETCH_GA4_TOOL_SCHEMA,
  QUERY_MEMORY_TOOL_SCHEMA,
  PROPOSE_ACTION_TOOL_SCHEMA,
];

async function executeTool(name, input) {
  switch (name) {
    case 'query_analytics_events_db':
      return queryAnalyticsEventsDb(input || {});
    case 'list_landing_pages':
      return listLandingPages(input || {});
    case 'fetch_ga4_metrics':
      return fetchGa4Metrics(input || {});
    case 'query_agent_memory':
      return readMemory({
        agent: 'marketing',
        topic: String(input?.topic || ''),
        limit: Math.max(1, Math.min(50, Number(input?.limit) || 20)),
      });
    case 'propose_action':
      return proposeAction({ agent: 'marketing', ...input });
    default:
      return { error: `unknown tool ${name}` };
  }
}

function buildIntro({ config, memory, periodDays, manual }) {
  const lines = [];
  lines.push(`# Run de Marketing Growth Agent`);
  lines.push('');
  lines.push(`- Fecha (UTC): ${new Date().toISOString()}`);
  lines.push(`- Periodo de análisis: últimos ${periodDays} días.`);
  lines.push(`- Trigger: ${manual ? 'manual (operador desde Telegram)' : 'cron semanal'}`);
  lines.push(`- GA4 configurado: ${isGa4Configured() ? 'sí' : 'no — solo Azure SQL'}`);
  lines.push('');
  lines.push('## Configuración (live, vía agent_config)');
  for (const [k, v] of Object.entries(config || {})) {
    lines.push(`- \`${k}\` = \`${v}\``);
  }
  lines.push('');
  lines.push('## Memoria reciente');
  if (memory.lastRuns.length) {
    lines.push('### Resúmenes de runs anteriores (más reciente primero)');
    for (const m of memory.lastRuns.slice(0, 4)) {
      const summary = m.content?.summary || '(sin resumen)';
      lines.push(`- ${new Date(m.createdAt).toISOString().slice(0, 10)} — ${summary.slice(0, 200)}`);
    }
    lines.push('');
  }
  if (memory.rejected.length) {
    lines.push('### Propuestas rechazadas en últimos 60 días (NO repetir)');
    for (const m of memory.rejected.slice(0, 8)) {
      lines.push(`- ${m.content?.title || '(sin título)'}`);
    }
    lines.push('');
  }
  if (memory.acknowledged.length) {
    lines.push('### Propuestas aceptadas (escalar / continuar)');
    for (const m of memory.acknowledged.slice(0, 8)) {
      lines.push(`- ${m.content?.title || '(sin título)'}`);
    }
    lines.push('');
  }
  lines.push('## Instrucción');
  lines.push(`Procede con tu análisis siguiendo el protocolo. Limita a max ${
    config.max_proposals_per_run || 5
  } propuestas. Termina con un mensaje resumen breve.`);
  return lines.join('\n');
}

async function loadMemory() {
  const [lastRuns, rejected, acknowledged] = await Promise.all([
    readMemory({ agent: 'marketing', topic: 'last_run', limit: 8 }),
    readMemory({ agent: 'marketing', topic: 'rejected_proposals', limit: 30 }),
    readMemory({ agent: 'marketing', topic: 'acknowledged_proposals', limit: 30 }),
  ]);
  return { lastRuns, rejected, acknowledged };
}

/**
 * @param {object} opts
 * @param {'cron'|'manual'} [opts.trigger='cron']
 * @param {number} [opts.periodDays=7]
 * @param {boolean} [opts.silent=false] — skip the operator-facing Telegram digest at the end.
 */
export async function runMarketingAgent({ trigger = 'cron', periodDays = 7, silent = false } = {}) {
  // Anti-concurrency lock — covers cron + manual + retries.
  const lockOk = await acquireLock('agent:lock:marketing', 600);
  if (!lockOk) {
    return { ok: false, skipped: 'locked', reason: 'another marketing run is in progress' };
  }

  const runId = await startAgentRun({ agent: 'marketing', trigger });
  let config = {};
  let memory = { lastRuns: [], rejected: [], acknowledged: [] };

  try {
    config = await getConfig('marketing');
    memory = await loadMemory();
  } catch (err) {
    // If config/memory load fails the agent should still try to run with defaults.
    captureException(err, { scope: '[marketing/run] load context' }).catch(() => {});
  }

  const intro = buildIntro({ config, memory, periodDays, manual: trigger === 'manual' });

  const client = getClient();
  const messages = [{ role: 'user', content: intro }];

  let totalIn = 0;
  let totalOut = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;
  let proposalsCreated = 0;
  let lastAssistantText = '';
  let stopReason = null;

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const resp = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 1500,
        system: withCache(MARKETING_SYSTEM_PROMPT),
        tools: withToolCache(TOOLS),
        messages,
      });

      const usage = resp.usage || {};
      totalIn  += Number(usage.input_tokens  || 0);
      totalOut += Number(usage.output_tokens || 0);
      cacheRead  += Number(usage.cache_read_input_tokens || 0);
      cacheWrite += Number(usage.cache_creation_input_tokens || 0);
      cost += estimateCostUsd(usage, DEFAULT_MODEL);

      // Persist the assistant's response message in the conversation.
      messages.push({ role: 'assistant', content: resp.content });

      // Collect text + execute tool calls.
      const toolUses = [];
      for (const block of resp.content || []) {
        if (block.type === 'text') {
          if (block.text) lastAssistantText = block.text;
        } else if (block.type === 'tool_use') {
          toolUses.push(block);
        }
      }

      stopReason = resp.stop_reason;
      if (stopReason !== 'tool_use' || toolUses.length === 0) break;

      // Execute tools in parallel — they're all read-only or idempotent
      // (`propose_action` writes one row + sends one message; safe to fan out).
      const toolResults = await Promise.all(
        toolUses.map(async (tu) => {
          let result;
          try {
            result = await executeTool(tu.name, tu.input || {});
            if (tu.name === 'propose_action' && result?.actionId) {
              proposalsCreated += 1;
            }
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

    // Persist memory: a digest of this run.
    const summary = lastAssistantText?.slice(0, 4000) ||
      `(${proposalsCreated} propuestas, sin resumen narrativo)`;
    await appendMemory({
      agent: 'marketing',
      topic: 'last_run',
      content: { runId, periodDays, proposalsCreated, summary },
    });

    await finishAgentRun({
      runId,
      status: 'ok',
      summary,
      tokensIn: totalIn + cacheRead + cacheWrite,
      tokensOut: totalOut,
      costUsd: Math.round(cost * 10000) / 10000,
    });

    // Operator-facing digest. Marketing emits per-proposal Telegram messages
    // already (via propose_action); the digest is just a wrap-up.
    if (!silent) {
      const lines = [
        `*[MKT] Análisis ${periodDays}d completado*`,
        '',
        summary,
        '',
        `_${proposalsCreated} propuestas · ${totalIn + cacheRead + cacheWrite} tokens in · $${cost.toFixed(4)}_`,
      ];
      await sendMessage({ text: lines.join('\n') });
    }

    return {
      ok: true,
      runId,
      proposalsCreated,
      tokensIn: totalIn,
      tokensOut: totalOut,
      cacheRead,
      cacheWrite,
      costUsd: cost,
      summary,
    };
  } catch (err) {
    captureException(err, { scope: '[marketing/run] orchestrator', runId }).catch(() => {});
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
        text: `*[MKT] Run abortado:* \`${(err?.message || String(err)).slice(0, 200)}\``,
      });
    }
    return { ok: false, runId, error: err?.message || String(err) };
  } finally {
    await releaseLock('agent:lock:marketing');
  }
}
