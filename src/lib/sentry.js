// Lightweight Sentry transport. Speaks Sentry's "envelope" wire format directly
// over HTTPS so we don't have to vendor @sentry/nextjs and its Webpack plugin
// chain. Drop in @sentry/nextjs later if you want breadcrumbs, performance
// traces, or replay — all this does is "here's an error event, please ingest".
//
// Reads SENTRY_DSN from env. If missing, captureException is a no-op so dev
// without a DSN still works.
//
// DSN format: https://<key>@<host>/<projectId>
//   e.g.       https://abc123@o0.ingest.sentry.io/1234567

let parsedDsn = null;
let dsnError = null;

function parseDsn() {
  if (parsedDsn || dsnError) return parsedDsn;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    dsnError = 'no_dsn';
    return null;
  }
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!projectId) throw new Error('missing project id');
    parsedDsn = {
      key: u.username,
      host: u.host,
      projectId,
      envelopeUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
    };
    return parsedDsn;
  } catch (e) {
    console.warn('[sentry] invalid SENTRY_DSN:', e.message);
    dsnError = e.message;
    return null;
  }
}

function nowSec() { return Math.floor(Date.now() / 1000); }
function uuidNoDashes() {
  // 32 hex chars. Cheap, doesn't need crypto.randomUUID (Edge-compatible).
  let s = '';
  for (let i = 0; i < 8; i++) s += Math.random().toString(16).slice(2, 10);
  return s.slice(0, 32);
}

/**
 * Capture an exception. Fire-and-forget — never throws.
 *
 * @param {Error}  error
 * @param {object} [extra]   Free-form metadata stitched into event.contexts.extra.
 * @param {object} [opts]
 * @param {string} [opts.release]      Defaults to VERCEL_GIT_COMMIT_SHA.
 * @param {string} [opts.environment]  Defaults to VERCEL_ENV / NODE_ENV.
 */
export async function captureException(error, extra = {}, opts = {}) {
  const dsn = parseDsn();
  if (!dsn || !error) return;

  const eventId = uuidNoDashes();
  const ts = nowSec();

  // Sentry expects an "envelope": header line + item header + item payload,
  // newline-delimited JSON. https://develop.sentry.dev/sdk/envelopes/
  const envelopeHeader = JSON.stringify({
    event_id: eventId,
    sent_at: new Date().toISOString(),
    dsn: process.env.SENTRY_DSN,
  });

  const event = {
    event_id: eventId,
    timestamp: ts,
    platform: 'javascript',
    level: 'error',
    logger: 'medconnect',
    release: opts.release || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    environment: opts.environment || process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    server_name: process.env.VERCEL_URL || undefined,
    exception: {
      values: [
        {
          type: error.name || 'Error',
          value: error.message || String(error),
          stacktrace: error.stack
            ? {
                frames: parseStack(error.stack).reverse(), // Sentry wants oldest → newest
              }
            : undefined,
        },
      ],
    },
    contexts: {
      runtime: { name: typeof window === 'undefined' ? 'node' : 'browser' },
      extra,
    },
    tags: {
      runtime: typeof window === 'undefined' ? 'server' : 'client',
    },
  };

  const itemHeader = JSON.stringify({ type: 'event' });
  const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}`;

  try {
    await fetch(dsn.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': sentryAuthHeader(dsn.key),
      },
      body,
      // Don't keep the runtime alive waiting for Sentry on serverless.
      keepalive: true,
    });
  } catch (e) {
    // Swallow — Sentry being down should never crash the request handler.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[sentry] capture failed:', e.message);
    }
  }
}

function sentryAuthHeader(key) {
  return [
    'Sentry sentry_version=7',
    'sentry_client=medconnect-lite/1.0',
    `sentry_key=${key}`,
  ].join(', ');
}

// Minimal V8 stack parser. Handles "    at Foo (file:line:col)" and
// "    at file:line:col". Skips the "Error: ..." first line.
function parseStack(stack) {
  const out = [];
  for (const line of String(stack).split('\n')) {
    const m = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (!m) continue;
    out.push({
      function: m[1] || '<anonymous>',
      filename: m[2],
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !/node_modules|next\/dist/.test(m[2]),
    });
  }
  return out;
}
