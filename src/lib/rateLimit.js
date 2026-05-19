// Rate limiter with two backends:
//
//   1. **Upstash Redis (REST API)** — when UPSTASH_REDIS_REST_URL +
//      UPSTASH_REDIS_REST_TOKEN are set. Buckets are shared across all
//      Vercel Lambdas, so an attacker can't fan out across cold starts.
//      No npm dependency: we hit the REST API with plain fetch().
//   2. **In-memory fallback** — per Lambda Map. Useful for local dev and
//      as a graceful degradation if Upstash is unreachable. Note that with
//      this backend horizontal scale-out leaks the bucket; treat the
//      configured `max` as a per-instance hint, not a hard global cap.
//
// `check(request)` is async to keep the Upstash path honest. All callers are
// already inside async route handlers.
//
// Usage:
//   const r = await limits.payments.check(request);
//   if (!r.ok) return NextResponse.json({error:'rate_limited'}, {status:429, headers:r.headers});

import { fetchWithTimeout } from '@/lib/http';

// ---------------------------------------------------------------------------
// Upstash backend
// ---------------------------------------------------------------------------

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const HAS_UPSTASH = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function upstashIncr(key, windowMs) {
  try {
    const res = await fetchWithTimeout(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['PEXPIRE', key, String(windowMs), 'NX'],
      ]),
      timeoutMs: 1500, // rate-limit checks are hot path; fail fast
    });
    if (!res.ok) return null;
    const data = await res.json();
    const count = Number(data?.[0]?.result);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback (per Lambda)
// ---------------------------------------------------------------------------

const buckets = new Map();

function memCheck(bucketKey, id, windowMs, max) {
  if (!buckets.has(bucketKey)) buckets.set(bucketKey, new Map());
  const bucket = buckets.get(bucketKey);
  const now = Date.now();
  const entry = bucket.get(id);

  if (!entry || now - entry.start >= windowMs) {
    bucket.set(id, { start: now, count: 1 });
    if (bucket.size > 1000) {
      for (const [k, v] of bucket) {
        if (now - v.start >= windowMs) bucket.delete(k);
      }
    }
    return { count: 1, resetMs: windowMs };
  }

  if (entry.count < max) {
    entry.count += 1;
    return { count: entry.count, resetMs: windowMs - (now - entry.start) };
  }
  return { count: entry.count + 1, resetMs: windowMs - (now - entry.start) };
}

function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

/**
 * @param {object}  cfg
 * @param {string}  cfg.key       Logical bucket name, e.g. 'payments'.
 * @param {number}  cfg.windowMs  Sliding window length in ms.
 * @param {number}  cfg.max       Max requests allowed within the window.
 * @param {(req:Request)=>string} [cfg.identify]
 */
export function rateLimit({ key, windowMs, max, identify }) {
  return {
    async check(request) {
      const id = (identify ? identify(request) : getClientIp(request)) || 'unknown';

      if (HAS_UPSTASH) {
        const window = Math.floor(Date.now() / windowMs);
        const k = `rl:${key}:${window}:${id}`;
        const count = await upstashIncr(k, windowMs);
        if (count === null) {
          return memToResult(memCheck(key, id, windowMs, max), max, windowMs);
        }
        const remaining = Math.max(0, max - count);
        const resetMs = windowMs - (Date.now() % windowMs);
        if (count > max) {
          const retryAfterSec = Math.max(1, Math.ceil(resetMs / 1000));
          return {
            ok: false,
            remaining: 0,
            retryAfterSec,
            headers: {
              ...rateHeaders(max, 0, resetMs),
              'Retry-After': String(retryAfterSec),
            },
          };
        }
        return {
          ok: true,
          remaining,
          retryAfterSec: 0,
          headers: rateHeaders(max, remaining, resetMs),
        };
      }

      return memToResult(memCheck(key, id, windowMs, max), max, windowMs);
    },
  };
}

function memToResult(memResult, max, windowMs) {
  const { count, resetMs } = memResult;
  const remaining = Math.max(0, max - count);
  if (count > max) {
    const retryAfterSec = Math.max(1, Math.ceil(resetMs / 1000));
    return {
      ok: false,
      remaining: 0,
      retryAfterSec,
      headers: {
        ...rateHeaders(max, 0, resetMs),
        'Retry-After': String(retryAfterSec),
      },
    };
  }
  return {
    ok: true,
    remaining,
    retryAfterSec: 0,
    headers: rateHeaders(max, remaining, resetMs),
  };
}

function rateHeaders(limit, remaining, resetMs) {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.ceil(resetMs / 1000)),
  };
}

// Pre-configured limiters. `check()` is async — all call sites must `await`.
export const limits = {
  analyticsEvent:  rateLimit({ key: 'analytics:event',  windowMs: 60_000, max: 100 }),
  referralsPost:   rateLimit({ key: 'referrals:post',   windowMs: 60 * 60_000, max: 10 }),
  emailSend:       rateLimit({ key: 'email:send',       windowMs: 60_000, max: 5 }),
  adminLogin:      rateLimit({ key: 'admin:login',      windowMs: 15 * 60_000, max: 5 }),
  payments:        rateLimit({ key: 'payments',         windowMs: 60_000, max: 10 }),
  proVerification: rateLimit({ key: 'pro:verification', windowMs: 60 * 60_000, max: 5 }),
  clinicSearch:    rateLimit({ key: 'clinics:search',   windowMs: 60_000, max: 60 }),
  contact:         rateLimit({ key: 'contact:post',     windowMs: 60_000, max: 5 }),
  // /api/agents/health is protected by DB_SETUP_SECRET, but we still cap
  // it to avoid a script accidentally hammering Sentry/Vercel/GitHub.
  agentsHealth:    rateLimit({ key: 'agents:health',    windowMs: 60_000, max: 10 }),
};
