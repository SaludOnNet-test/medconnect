// Sentry REST API tools for the security agent.
//
// Auth: an internal integration token (`SENTRY_AUTH_TOKEN`) with
// `event:read` + `issue:read` scopes. The org/project slugs come from
// `SENTRY_ORG` and `SENTRY_PROJECT`.
//
// All calls go through fetchWithTimeout so a Sentry outage doesn't pin the
// Lambda. Errors are returned as `{ error }` objects so the model can
// decide how to proceed (instead of throwing and aborting the whole run).
//
// Reference: https://docs.sentry.io/api/

import { fetchWithTimeout } from '@/lib/http';

const SENTRY_BASE = 'https://sentry.io/api/0';
const TIMEOUT_MS = 10_000;

function authHeader() {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) throw new Error('SENTRY_AUTH_TOKEN not configured');
  return { Authorization: `Bearer ${token}` };
}

function org() { return process.env.SENTRY_ORG || ''; }
function project() { return process.env.SENTRY_PROJECT || ''; }

async function sentryGet(path, query = {}) {
  const url = new URL(SENTRY_BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetchWithTimeout(url.toString(), {
    headers: authHeader(),
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { error: `sentry ${res.status}: ${body.slice(0, 300)}` };
  }
  return res.json();
}

// Trim Sentry issue payloads to what the model needs — full issue JSON is
// frequently 50+KB and burns tokens.
function compactIssue(i) {
  if (!i || typeof i !== 'object') return i;
  return {
    id: i.id,
    shortId: i.shortId,
    title: i.title,
    culprit: i.culprit,
    permalink: i.permalink,
    level: i.level,
    status: i.status,
    isUnhandled: i.isUnhandled,
    firstSeen: i.firstSeen,
    lastSeen: i.lastSeen,
    timesSeen: Number(i.count || i.timesSeen || 0),
    userCount: i.userCount,
    project: i.project?.slug,
    metadata: i.metadata,
    type: i.type,
    platform: i.platform,
    statusDetails: i.statusDetails,
  };
}

function compactEvent(e) {
  if (!e || typeof e !== 'object') return e;
  // Pull just enough for triage. Keep up to 30 frames per stacktrace and
  // a single representative exception value.
  const exc = e.exception?.values?.[0] || e.entries?.find?.((x) => x.type === 'exception')?.data?.values?.[0];
  const frames = exc?.stacktrace?.frames || [];
  return {
    eventID: e.eventID || e.id,
    title: e.title,
    message: e.message,
    timestamp: e.dateCreated || e.timestamp,
    platform: e.platform,
    environment: e.environment,
    release: e.release?.version || e.release,
    request: {
      url: e.request?.url,
      method: e.request?.method,
      query: e.request?.query,
    },
    exception: exc ? {
      type: exc.type,
      value: exc.value,
      module: exc.module,
      frames: frames.slice(-30).map((f) => ({
        function: f.function,
        filename: f.filename,
        lineno: f.lineNo ?? f.lineno,
        colno: f.colNo ?? f.colno,
        in_app: f.inApp ?? f.in_app,
        context: Array.isArray(f.context) ? f.context.slice(0, 6) : undefined,
      })),
    } : undefined,
    contexts: {
      runtime: e.contexts?.runtime,
      deployment: e.contexts?.deployment,
      url: e.contexts?.url,
    },
    tags: Array.isArray(e.tags) ? e.tags.reduce((acc, t) => { acc[t.key] = t.value; return acc; }, {}) : e.tags,
  };
}

// ---------------------------------------------------------------------------
// Tool: query_sentry_issue
// ---------------------------------------------------------------------------

export async function querySentryIssue({ issueId } = {}) {
  if (!issueId) return { error: 'issueId required' };
  const issue = await sentryGet(`/issues/${encodeURIComponent(issueId)}/`);
  if (issue?.error) return issue;
  // Latest event = the freshest example we can show the model.
  const latest = await sentryGet(`/issues/${encodeURIComponent(issueId)}/events/latest/`);
  return {
    issue: compactIssue(issue),
    latestEvent: latest?.error ? null : compactEvent(latest),
    latestEventError: latest?.error || null,
  };
}

export const QUERY_SENTRY_ISSUE_SCHEMA = {
  name: 'query_sentry_issue',
  description: 'Devuelve el resumen de un issue de Sentry y el evento más reciente, recortado a lo necesario para triage.',
  input_schema: {
    type: 'object',
    properties: {
      issueId: { type: 'string', description: 'ID interno o shortId (e.g. "MEDCONNECT-A1B").' },
    },
    required: ['issueId'],
  },
};

// ---------------------------------------------------------------------------
// Tool: list_recent_issues
// ---------------------------------------------------------------------------

export async function listRecentIssues({ since = '24h', level = 'error', limit = 20 } = {}) {
  if (!org() || !project()) return { error: 'SENTRY_ORG / SENTRY_PROJECT not configured' };
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  // Sentry "statsPeriod": e.g. 1h, 24h, 7d.
  const r = await sentryGet(`/projects/${org()}/${project()}/issues/`, {
    query: `level:${level} is:unresolved`,
    statsPeriod: since,
    limit: safeLimit,
    sort: 'freq',
  });
  if (r?.error) return r;
  return {
    period: since,
    level,
    count: Array.isArray(r) ? r.length : 0,
    issues: Array.isArray(r) ? r.map(compactIssue) : [],
  };
}

export const LIST_RECENT_ISSUES_SCHEMA = {
  name: 'list_recent_issues',
  description: 'Lista issues unresolved del proyecto Sentry. Por defecto últimas 24h, level=error, top 20 por frecuencia.',
  input_schema: {
    type: 'object',
    properties: {
      since: { type: 'string', description: 'statsPeriod tipo "1h", "24h", "7d".' },
      level: { type: 'string', enum: ['fatal', 'error', 'warning', 'info'] },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
};

// ---------------------------------------------------------------------------
// Tool: get_issue_regression_info
// ---------------------------------------------------------------------------
// "Regression" = the same fingerprint was previously resolved and reappeared.
// Sentry exposes this via the issue's `statusDetails.inNextRelease` field
// when the previous resolution was tied to a release. We also check
// `firstSeen` recency and `activity` log for `set_resolved` events in the
// last `regression_window_days`.

export async function getIssueRegressionInfo({ issueId, regressionWindowDays = 30 } = {}) {
  if (!issueId) return { error: 'issueId required' };
  const issue = await sentryGet(`/issues/${encodeURIComponent(issueId)}/`);
  if (issue?.error) return issue;
  const activity = await sentryGet(`/issues/${encodeURIComponent(issueId)}/activity/`);
  const cutoff = Date.now() - regressionWindowDays * 86400_000;

  let priorResolutionAt = null;
  if (Array.isArray(activity) || Array.isArray(activity?.activity)) {
    const items = Array.isArray(activity) ? activity : activity.activity;
    for (const a of items) {
      if (a?.type === 'set_resolved' || a?.type === 'set_resolved_in_release') {
        const at = new Date(a.dateCreated || 0).getTime();
        if (at > cutoff) {
          priorResolutionAt = a.dateCreated;
          break;
        }
      }
    }
  }

  // Sentry's status === 'unresolved' AND a prior set_resolved within the
  // window AND lastSeen > priorResolutionAt is the strict definition.
  const isRegression = Boolean(
    priorResolutionAt &&
    issue.status === 'unresolved' &&
    new Date(issue.lastSeen || 0).getTime() > new Date(priorResolutionAt).getTime()
  );

  return {
    issueId,
    isRegression,
    priorResolutionAt,
    lastSeen: issue.lastSeen,
    firstSeen: issue.firstSeen,
    statusDetails: issue.statusDetails,
    regressionWindowDays,
  };
}

export const GET_REGRESSION_INFO_SCHEMA = {
  name: 'get_issue_regression_info',
  description: 'Determina si un issue Sentry es una regresión (mismo fingerprint resuelto en los últimos N días y reaparecido). Requisito DURO para auto-merge.',
  input_schema: {
    type: 'object',
    properties: {
      issueId: { type: 'string' },
      regressionWindowDays: { type: 'integer', minimum: 1, maximum: 365 },
    },
    required: ['issueId'],
  },
};

// ---------------------------------------------------------------------------
// Tool: correlate_error_rate
// ---------------------------------------------------------------------------
// Compares a short trailing window vs a baseline. Used by the post-deploy
// guard to decide whether auto-rollback should fire.

export async function correlateErrorRate({ windowMinutes = 5 } = {}) {
  if (!org() || !project()) return { error: 'SENTRY_ORG / SENTRY_PROJECT not configured' };
  const minutes = Math.max(1, Math.min(60, Number(windowMinutes) || 5));
  const trailing = await sentryGet(`/projects/${org()}/${project()}/stats/`, {
    stat: 'received',
    resolution: '10s',
    since: Math.floor((Date.now() - minutes * 60_000) / 1000),
  });
  const baseline = await sentryGet(`/projects/${org()}/${project()}/stats/`, {
    stat: 'received',
    resolution: '1h',
    since: Math.floor((Date.now() - 24 * 3600_000) / 1000),
    until: Math.floor((Date.now() - 60 * 60_000) / 1000),
  });
  function avgPerMinute(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    // Sentry returns [timestamp, count] pairs.
    const total = arr.reduce((s, [, c]) => s + Number(c || 0), 0);
    const seconds = arr.length * (arr[1]?.[0] - arr[0]?.[0] || 60);
    return seconds > 0 ? total / (seconds / 60) : total;
  }
  const trailingPerMin = avgPerMinute(trailing);
  const baselinePerMin = avgPerMinute(baseline);
  return {
    windowMinutes: minutes,
    errorsPerMinute: Math.round(trailingPerMin * 100) / 100,
    baselinePerMinute: Math.round(baselinePerMin * 100) / 100,
    multiplier: baselinePerMin > 0 ? Math.round((trailingPerMin / baselinePerMin) * 100) / 100 : null,
  };
}

export const CORRELATE_ERROR_RATE_SCHEMA = {
  name: 'correlate_error_rate',
  description: 'Compara errores/minuto en la ventana reciente contra un baseline de las últimas 24h. Usado por el guard post-deploy.',
  input_schema: {
    type: 'object',
    properties: {
      windowMinutes: { type: 'integer', minimum: 1, maximum: 60, description: 'Ventana trailing en minutos (default 5).' },
    },
  },
};

/**
 * Verify a Sentry webhook signature. Sentry signs webhooks with HMAC-SHA256
 * over the raw request body using the configured client secret.
 * Header: `Sentry-Hook-Signature`.
 * Returns true if the signature matches; false otherwise.
 */
export function verifySentryWebhook({ rawBody, signature }) {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;
  // Lazy crypto import keeps cold-start lean for the read-only routes.
  // eslint-disable-next-line global-require
  const crypto = require('crypto');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
}
