// MedConnect Agents — Health probe.
//
// Runs every dependency check in parallel and returns a normalized report
// of which services are configured + reachable + how long they took.
//
// Design notes:
//   - The checks are read-only and cheap. The Anthropic check intentionally
//     does NOT call the API (cost). Every other check is a single GET / PING.
//   - Each check has its own ~5 s timeout (Telegram + Sentry + Vercel +
//     GitHub) or ~2 s (Redis). Total wall time should stay under ~6 s thanks
//     to Promise.allSettled.
//   - The shape per service is stable: callers can switch on `name`, render
//     `hint`, log `latencyMs`. Used by both `/api/agents/health` (JSON) and
//     the `/health` Telegram command (Markdown).

import { fetchWithTimeout } from '@/lib/http';
import { getPool, DB_AVAILABLE } from '@/lib/db';

function nowMs() { return Date.now(); }

function result(name, partial) {
  return { name, configured: false, reachable: false, latencyMs: 0, ...partial };
}

// ---------------------------------------------------------------------------
// Anthropic — presence-only. Calling the API to validate would burn credit
// per /health run and we already get hard signals from real agent runs.
// ---------------------------------------------------------------------------
async function checkAnthropic() {
  const start = nowMs();
  const configured = !!process.env.ANTHROPIC_API_KEY;
  return result('Anthropic', {
    configured,
    reachable: configured, // presence is the only signal we expose
    latencyMs: nowMs() - start,
    hint: configured
      ? null
      : 'Falta ANTHROPIC_API_KEY en Vercel Production. Añádela desde console.anthropic.com.',
  });
}

// ---------------------------------------------------------------------------
// Azure SQL — SELECT 1 with a 5 s timeout. Triggers a pool warm-up if cold.
// ---------------------------------------------------------------------------
async function checkAzureSql() {
  const start = nowMs();
  if (!DB_AVAILABLE) {
    return result('Azure SQL', {
      configured: false,
      hint: 'Faltan AZURE_SQL_SERVER / DATABASE / USER / PASSWORD en Vercel.',
      latencyMs: nowMs() - start,
    });
  }
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    return result('Azure SQL', {
      configured: true,
      reachable: true,
      latencyMs: nowMs() - start,
    });
  } catch (err) {
    return result('Azure SQL', {
      configured: true,
      reachable: false,
      latencyMs: nowMs() - start,
      hint: `Pool inalcanzable: ${err?.message?.slice(0, 200) || 'unknown'}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Sentry — GET /organizations/{org}/ validates token + org existence in one
// call. Doesn't require touching issues.
// ---------------------------------------------------------------------------
async function checkSentry() {
  const start = nowMs();
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!token || !org || !project) {
    return result('Sentry', {
      configured: false,
      hint: 'Faltan SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT. Ver docs/AGENTS_SETUP.md §5.',
      latencyMs: nowMs() - start,
    });
  }
  // Two probes: the org endpoint validates Organization:Read, the issues
  // endpoint validates Issue & Event:Read. We need BOTH for the security
  // agent to actually function — passing only the org probe led us to a
  // false-green /health while real investigations 401'd. The headers
  // option object is reused to keep the probes identical apart from URL.
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const orgRes = await fetchWithTimeout(
      `https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/`,
      { headers, timeoutMs: 5000 }
    );
    if (!orgRes.ok) {
      const latencyMs = nowMs() - start;
      let hint;
      if (orgRes.status === 401) {
        hint = 'Token inválido. Asegúrate de pegar el TOKEN de la pestaña "Tokens" de la Internal Integration (NO el Client Secret).';
      } else if (orgRes.status === 404) {
        hint = `Org slug '${org}' no encontrado. Verifica SENTRY_ORG (slug, no nombre).`;
      } else {
        hint = `Sentry respondió ${orgRes.status} en /organizations/.`;
      }
      return result('Sentry', { configured: true, reachable: false, latencyMs, hint });
    }
    // Second probe: validate Issue & Event scope explicitly.
    const issuesRes = await fetchWithTimeout(
      `https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/issues/?limit=1`,
      { headers, timeoutMs: 5000 }
    );
    const latencyMs = nowMs() - start;
    if (issuesRes.ok) {
      return result('Sentry', { configured: true, reachable: true, latencyMs });
    }
    // Org-level works but issue-level doesn't — almost always a missing
    // scope on the Internal Integration. This is the case we *missed* with
    // the previous single-probe version.
    let hint;
    if (issuesRes.status === 401 || issuesRes.status === 403) {
      hint = 'Token llega a /organizations/ pero NO a /issues/. Añade el scope "Issue & Event: Read" en Sentry → Custom Integrations → MedConnect Agents → Permissions, y regenera el token.';
    } else {
      hint = `Sentry respondió ${issuesRes.status} en /organizations/{org}/issues/. Revisa permisos y plan.`;
    }
    return result('Sentry', { configured: true, reachable: false, latencyMs, hint });
  } catch (err) {
    return result('Sentry', {
      configured: true,
      reachable: false,
      latencyMs: nowMs() - start,
      hint: `Network: ${err?.message?.slice(0, 200) || 'unknown'}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Vercel — GET /v9/projects/{projectId}. Validates token + project access.
// ---------------------------------------------------------------------------
async function checkVercel() {
  const start = nowMs();
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    return result('Vercel', {
      configured: false,
      hint: 'Faltan VERCEL_TOKEN (Account Settings → Tokens) y/o VERCEL_PROJECT_ID (Project → Settings → General).',
      latencyMs: nowMs() - start,
    });
  }
  const team = process.env.VERCEL_TEAM_ID;
  const teamQ = team ? `?teamId=${encodeURIComponent(team)}` : '';
  try {
    const res = await fetchWithTimeout(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}${teamQ}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 5000,
    });
    const latencyMs = nowMs() - start;
    if (res.ok) {
      return result('Vercel', { configured: true, reachable: true, latencyMs });
    }
    let hint;
    if (res.status === 401 || res.status === 403) {
      hint = 'VERCEL_TOKEN inválido o sin permisos sobre el team. Re-créalo en Account Settings → Tokens (write-once).';
    } else if (res.status === 404) {
      hint = `Project ID '${projectId}' no encontrado para el team configurado. Revisa VERCEL_PROJECT_ID + VERCEL_TEAM_ID.`;
    } else {
      hint = `Vercel respondió ${res.status}.`;
    }
    return result('Vercel', { configured: true, reachable: false, latencyMs, hint });
  } catch (err) {
    return result('Vercel', {
      configured: true,
      reachable: false,
      latencyMs: nowMs() - start,
      hint: `Network: ${err?.message?.slice(0, 200) || 'unknown'}`,
    });
  }
}

// ---------------------------------------------------------------------------
// GitHub — GET /repos/{repo}. Validates token + repo access in one call.
// Uses the default GITHUB_REPO so a missing env var doesn't show as fatal.
// ---------------------------------------------------------------------------
async function checkGithub() {
  const start = nowMs();
  const token = process.env.GITHUB_TOKEN;
  // Mirror github.js's default so /health stays consistent.
  const repo = process.env.GITHUB_REPO || 'SaludOnNet-test/medconnect';
  if (!token) {
    return result('GitHub', {
      configured: false,
      hint: 'Falta GITHUB_TOKEN. Crea un fine-grained PAT con scopes contents:write + pull_requests:write + actions:read.',
      latencyMs: nowMs() - start,
    });
  }
  try {
    const res = await fetchWithTimeout(`https://api.github.com/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'medconnect-agents/1.0',
      },
      timeoutMs: 5000,
    });
    const latencyMs = nowMs() - start;
    if (res.ok) {
      return result('GitHub', { configured: true, reachable: true, latencyMs });
    }
    let hint;
    if (res.status === 401) {
      hint = 'GITHUB_TOKEN inválido. Verifica scopes y que el PAT no haya caducado.';
    } else if (res.status === 404) {
      hint = `Repo ${repo} no accesible. Verifica que el PAT incluya este repo y que el slug es correcto.`;
    } else {
      hint = `GitHub respondió ${res.status}.`;
    }
    return result('GitHub', { configured: true, reachable: false, latencyMs, hint });
  } catch (err) {
    return result('GitHub', {
      configured: true,
      reachable: false,
      latencyMs: nowMs() - start,
      hint: `Network: ${err?.message?.slice(0, 200) || 'unknown'}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Telegram — getMe. Cheap, no side effects.
// ---------------------------------------------------------------------------
async function checkTelegram() {
  const start = nowMs();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !chatId) {
    return result('Telegram', {
      configured: false,
      hint: 'Faltan TELEGRAM_BOT_TOKEN y/o TELEGRAM_OWNER_CHAT_ID. Ver docs/AGENTS_SETUP.md §1.',
      latencyMs: nowMs() - start,
    });
  }
  try {
    const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getMe`, {
      timeoutMs: 5000,
    });
    const latencyMs = nowMs() - start;
    if (!res.ok) {
      return result('Telegram', {
        configured: true,
        reachable: false,
        latencyMs,
        hint: `Telegram respondió ${res.status}. Verifica TELEGRAM_BOT_TOKEN.`,
      });
    }
    const data = await res.json().catch(() => ({}));
    if (data?.ok) {
      return result('Telegram', { configured: true, reachable: true, latencyMs });
    }
    return result('Telegram', {
      configured: true,
      reachable: false,
      latencyMs,
      hint: 'getMe devolvió ok=false. Token probablemente revocado o inválido.',
    });
  } catch (err) {
    return result('Telegram', {
      configured: true,
      reachable: false,
      latencyMs: nowMs() - start,
      hint: `Network: ${err?.message?.slice(0, 200) || 'unknown'}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Upstash Redis — PING command via REST. Cheap (single round trip).
// ---------------------------------------------------------------------------
async function checkUpstash() {
  const start = nowMs();
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return result('Upstash Redis', {
      configured: false,
      hint: 'Faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Sin Upstash el rate-limiter cae a memoria por Lambda.',
      latencyMs: nowMs() - start,
    });
  }
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['PING']),
      timeoutMs: 2000,
    });
    const latencyMs = nowMs() - start;
    if (!res.ok) {
      return result('Upstash Redis', {
        configured: true,
        reachable: false,
        latencyMs,
        hint: `Upstash respondió ${res.status}.`,
      });
    }
    const data = await res.json().catch(() => ({}));
    const ok = data?.result === 'PONG';
    return result('Upstash Redis', {
      configured: true,
      reachable: ok,
      latencyMs,
      hint: ok ? null : 'PING no devolvió PONG. Token probablemente expirado.',
    });
  } catch (err) {
    return result('Upstash Redis', {
      configured: true,
      reachable: false,
      latencyMs: nowMs() - start,
      hint: `Network: ${err?.message?.slice(0, 200) || 'unknown'}`,
    });
  }
}

/**
 * Run every service check in parallel. Resolves to an array sorted in the
 * canonical order shown to the operator (dependencies first, observability
 * + chat second).
 */
export async function runHealthCheck() {
  const checks = await Promise.allSettled([
    checkAnthropic(),
    checkAzureSql(),
    checkSentry(),
    checkVercel(),
    checkGithub(),
    checkTelegram(),
    checkUpstash(),
  ]);
  return checks.map((c) =>
    c.status === 'fulfilled'
      ? c.value
      : result('unknown', { hint: c.reason?.message || 'check threw' })
  );
}

/**
 * Build a compact Markdown report from the result of runHealthCheck().
 * Used by the `/health` Telegram command. The status icon ordering is:
 *   ✅ configured + reachable
 *   ⚠️  configured + unreachable (most actionable case)
 *   ❌ not configured
 */
export function formatHealthReportMarkdown(results) {
  const icon = (r) => {
    if (!r.configured) return '❌';
    if (!r.reachable) return '⚠️';
    return '✅';
  };
  const lines = ['*MedConnect Agents — Health*', ''];
  for (const r of results) {
    const status = r.reachable ? 'OK' : (r.configured ? 'inalcanzable' : 'no configurado');
    lines.push(`${icon(r)} *${r.name}* — ${status} (${r.latencyMs} ms)`);
    if (r.hint) lines.push(`   ↳ ${r.hint}`);
  }
  const fails = results.filter((r) => !r.reachable).length;
  lines.push('');
  lines.push(fails === 0 ? '_Todos los servicios verdes._' : `_${fails} servicio(s) con problemas._`);
  return lines.join('\n');
}
