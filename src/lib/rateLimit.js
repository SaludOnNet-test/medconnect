// Simple in-memory rate limiter for MVP. One bucket per key (typically IP),
// per route. State lives on the Lambda instance — leaky across cold starts and
// horizontally-scaled instances, but enough to stop a single spamming client
// or accidental loops. Swap to Vercel KV / Upstash later without changing the
// call sites: keep the same signature.
//
// Usage:
//   import { rateLimit } from '@/lib/rateLimit';
//   const limit = rateLimit({ key: 'analytics:event', windowMs: 60_000, max: 100 });
//   ...
//   const r = limit.check(request);
//   if (!r.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: r.headers });

const buckets = new Map();

function getClientIp(request) {
  // Vercel forwards the real client IP via x-forwarded-for (comma-separated)
  // and falls back to x-real-ip on some edges. Use the leftmost token of XFF.
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  // Hard fallback — same key for everyone, so the limit becomes global. That's
  // worse for legit users but still throttles a runaway bug.
  return 'unknown';
}

/**
 * Build a rate limiter bound to a logical "key" (typically the route name).
 *
 * @param {object}  cfg
 * @param {string}  cfg.key       Logical bucket name, e.g. 'analytics:event'.
 * @param {number}  cfg.windowMs  Sliding window length in ms.
 * @param {number}  cfg.max       Max requests allowed within the window.
 * @param {(req:Request)=>string} [cfg.identify] Custom identifier extractor.
 *                                Default: client IP.
 */
export function rateLimit({ key, windowMs, max, identify }) {
  if (!buckets.has(key)) buckets.set(key, new Map());
  const bucket = buckets.get(key);

  return {
    /**
     * @returns {{ok:boolean, remaining:number, retryAfterSec:number, headers:Record<string,string>}}
     */
    check(request) {
      const id = (identify ? identify(request) : getClientIp(request)) || 'unknown';
      const now = Date.now();
      const entry = bucket.get(id);

      // First hit, or window expired → start a new window.
      if (!entry || now - entry.start >= windowMs) {
        bucket.set(id, { start: now, count: 1 });
        // Opportunistic GC: drop expired entries when we cross a low threshold.
        if (bucket.size > 1000) {
          for (const [k, v] of bucket) {
            if (now - v.start >= windowMs) bucket.delete(k);
          }
        }
        return {
          ok: true,
          remaining: max - 1,
          retryAfterSec: 0,
          headers: rateHeaders(max, max - 1, windowMs - 0),
        };
      }

      if (entry.count < max) {
        entry.count += 1;
        const remaining = max - entry.count;
        const resetIn = windowMs - (now - entry.start);
        return {
          ok: true,
          remaining,
          retryAfterSec: 0,
          headers: rateHeaders(max, remaining, resetIn),
        };
      }

      // Over the limit.
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - entry.start)) / 1000));
      return {
        ok: false,
        remaining: 0,
        retryAfterSec,
        headers: {
          ...rateHeaders(max, 0, retryAfterSec * 1000),
          'Retry-After': String(retryAfterSec),
        },
      };
    },
  };
}

function rateHeaders(limit, remaining, resetMs) {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.ceil(resetMs / 1000)),
  };
}

// Pre-configured limiters for common routes. Import these directly so all call
// sites share the same bucket, otherwise each import would create a new one.
export const limits = {
  analyticsEvent: rateLimit({ key: 'analytics:event', windowMs: 60_000, max: 100 }),
  referralsPost:  rateLimit({ key: 'referrals:post',  windowMs: 60 * 60_000, max: 10 }),
  emailSend:      rateLimit({ key: 'email:send',      windowMs: 60_000, max: 5 }),
  adminLogin:     rateLimit({ key: 'admin:login',     windowMs: 60_000, max: 10 }),
};
