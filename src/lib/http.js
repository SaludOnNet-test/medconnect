// Tiny wrapper around fetch that applies an AbortController-based timeout.
// Without this, an upstream that hangs (Resend, Anthropic, internal self-fetch)
// keeps the Lambda alive until Vercel's 45 s default kills it — long enough
// to backlog the cron and surface as user-visible 504s.
//
// Default timeout is intentionally short (10 s) for outbound calls. Callers
// that need longer (Stripe SCA, Anthropic completions) override per-call.

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * fetch() with a timeout. Resolves like fetch() if the response arrives in
 * time, throws an AbortError otherwise.
 *
 * @param {string|URL} url
 * @param {RequestInit & { timeoutMs?: number }} [options]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...rest } = options;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) ac.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', () => ac.abort(externalSignal.reason), { once: true });
  }

  try {
    return await fetch(url, { ...rest, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}
