import { fetchWithTimeout } from '@/lib/http';

// Sentry Developer free tier: 5,000 errors/month.
// API requires a Sentry auth token with `project:read` scope.
// docs: https://docs.sentry.io/api/events/retrieve-event-counts-for-an-organization/
//
// Env vars needed:
//   SENTRY_API_TOKEN   — personal auth token (https://sentry.io/settings/account/api/auth-tokens/)
//   SENTRY_ORG_SLUG    — eg "saludonnet" (find at sentry.io/settings/{org}/)
//   SENTRY_MONTHLY_CAP — override default 5,000
//
// If SENTRY_API_TOKEN isn't configured, we degrade to a "not configured"
// state so the rest of /api/exec/quotas keeps working.
export async function checkSentry() {
  const token = process.env.SENTRY_API_TOKEN;
  const org = process.env.SENTRY_ORG_SLUG;
  const cap = Number(process.env.SENTRY_MONTHLY_CAP) || 5000;

  if (!token || !org) {
    return { provider: 'sentry', ok: false, error: 'SENTRY_API_TOKEN/SENTRY_ORG_SLUG not configured' };
  }

  // First day of the current month in UTC, as ISO string.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const qs = new URLSearchParams({
    field: 'sum(quantity)',
    interval: '1d',
    category: 'error',
    statsPeriod: '30d',
    start: monthStart,
    end: now.toISOString(),
  });

  try {
    const res = await fetchWithTimeout(
      `https://sentry.io/api/0/organizations/${org}/stats_v2/?${qs.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 8000,
      },
    );
    if (!res.ok) {
      return { provider: 'sentry', ok: false, error: `HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => ({}));
    // stats_v2 returns: { groups: [{ totals: { 'sum(quantity)': N } }], ... }
    const total = (body?.groups || []).reduce((s, g) => s + Number(g?.totals?.['sum(quantity)'] || 0), 0);
    const percentage = Math.round((total / cap) * 100);

    return {
      provider: 'sentry',
      ok: true,
      used: total,
      limit: cap,
      percentage,
      status: classify(percentage),
      note: `${total.toLocaleString('es-ES')} de ${cap.toLocaleString('es-ES')} errors este mes`,
    };
  } catch (err) {
    return { provider: 'sentry', ok: false, error: err.message };
  }
}

function classify(p) {
  if (p >= 90) return 'critical';
  if (p >= 80) return 'warn';
  return 'ok';
}
