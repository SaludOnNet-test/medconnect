// Browser-side anonymous session id.
//
// Persists in localStorage so a patient who opens the booking modal in
// one tab and finishes payment in another keeps the same hold. Cleared
// on browser-data wipe. Sent as the `x-mc-session` request header on
// booking-flow fetches.
//
// The id is opaque — the only thing it gates is "does this browser own
// this slot hold?". A 15-minute window doesn't unlock anything that
// would benefit from forgery, so we keep this simple (no HMAC, no
// cookie, no server signature). If we later need to tie sessions to
// real identity we layer on top.

const STORAGE_KEY = 'mc_sid';

/**
 * Returns the session id for this browser, creating one on first call.
 * Safe to call from server-rendered code — returns `null` when
 * `window` is undefined.
 */
export function getOrCreateSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    let sid = window.localStorage.getItem(STORAGE_KEY);
    if (!sid) {
      sid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(STORAGE_KEY, sid);
    }
    return sid;
  } catch {
    // localStorage can throw in privacy mode (Safari, Firefox strict).
    // Fall back to a per-tab in-memory id — the hold won't survive a
    // reload, but the booking flow still works.
    if (!globalThis.__mcSidFallback) {
      globalThis.__mcSidFallback = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `mem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    return globalThis.__mcSidFallback;
  }
}

/**
 * Returns the current session id WITHOUT creating one. Useful for
 * server-side handlers reading the `x-mc-session` header — they should
 * use that directly, not this. Exposed for client-side read-only
 * usages (e.g. an analytics ping that shouldn't create a session).
 */
export function getSessionIdSync() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return globalThis.__mcSidFallback || null;
  }
}

/**
 * Wraps `fetch` with the `x-mc-session` header attached. The booking
 * flow uses this for slot-holds + bookings POST so the server can
 * attribute the request to a specific browser.
 */
export function fetchWithSession(url, options = {}) {
  const sid = getOrCreateSessionId();
  const headers = { ...(options.headers || {}) };
  if (sid) headers['x-mc-session'] = sid;
  return fetch(url, { ...options, headers });
}
