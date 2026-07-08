// Signed action tokens for email CTA links (confirm / propose / refund).
//
// Previously the "token" in /api/booking/respond links was just
// `${action}-${bookingId}-${Date.now()}` — unsigned, so anyone who knew a
// booking id could forge a confirm/refund link. Tokens are now HMAC-signed
// with SESSION_SECRET and expire after 7 days.
//
// Format: base64url(`${action}:${bookingId}:${expiresAt}`) + '.' + base64url(hmac-sha256)

import crypto from 'crypto';
import { timingSafeEqualStr } from '@/lib/exec/auth';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is missing or too short (need >= 32 chars).');
  }
  return fromEnv || 'dev-session-secret-not-for-production';
}

function hmac(payload) {
  return crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');
}

/**
 * Sign an action token.
 * @param {string} action    e.g. 'confirm' | 'propose' | 'refund'
 * @param {string} bookingId
 * @param {number} [ttlMs]   Defaults to 7 days.
 * @returns {string} `<payloadB64url>.<sigB64url>`
 */
export function signActionToken(action, bookingId, ttlMs = DEFAULT_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${action}:${bookingId}:${expiresAt}`;
  return `${Buffer.from(payload).toString('base64url')}.${hmac(payload)}`;
}

/**
 * Verify a signed action token.
 * @param {string} token
 * @param {string} [expectedAction]  When provided, the token's action must match.
 * @returns {{ ok: true, action: string, bookingId: string, expiresAt: number } |
 *           { ok: false, reason: 'malformed'|'bad_signature'|'expired'|'action_mismatch' }}
 */
export function verifyActionToken(token, expectedAction) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return { ok: false, reason: 'malformed' };
  let payload;
  try {
    payload = Buffer.from(b64, 'base64url').toString();
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!timingSafeEqualStr(hmac(payload), sig)) {
    return { ok: false, reason: 'bad_signature' };
  }
  // bookingId may itself contain ':'? Ours don't (MC-XXXX / REF-XXXX), but be
  // defensive: action is first segment, expiry the last, bookingId the middle.
  const parts = payload.split(':');
  if (parts.length < 3) return { ok: false, reason: 'malformed' };
  const action = parts[0];
  const expiresAt = Number(parts[parts.length - 1]);
  const bookingId = parts.slice(1, -1).join(':');
  if (!bookingId || !Number.isFinite(expiresAt)) return { ok: false, reason: 'malformed' };
  if (expiresAt < Date.now()) return { ok: false, reason: 'expired' };
  if (expectedAction && action !== expectedAction) return { ok: false, reason: 'action_mismatch' };
  return { ok: true, action, bookingId, expiresAt };
}
