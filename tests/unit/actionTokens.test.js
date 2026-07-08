import { describe, it, expect } from 'vitest';

// The module reads SESSION_SECRET lazily but set it before import anyway so
// every code path sees a production-grade secret (>= 32 chars).
process.env.SESSION_SECRET = 'x'.repeat(64);
const { signActionToken, verifyActionToken } = await import('@/lib/actionTokens');

describe('actionTokens', () => {
  it('sign + verify roundtrip', () => {
    const token = signActionToken('confirm', 'MC-1234');
    const r = verifyActionToken(token, 'confirm');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('confirm');
    expect(r.bookingId).toBe('MC-1234');
    expect(r.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects a tampered token (payload changed)', () => {
    const token = signActionToken('confirm', 'MC-1234');
    const [, sig] = token.split('.');
    const forgedPayload = Buffer.from(`refund:MC-1234:${Date.now() + 10_000}`).toString('base64url');
    const r = verifyActionToken(`${forgedPayload}.${sig}`);
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a tampered token (signature changed)', () => {
    const token = signActionToken('confirm', 'MC-1234');
    const [b64, sig] = token.split('.');
    const flipped = sig.slice(0, -1) + (sig.at(-1) === 'A' ? 'B' : 'A');
    const r = verifyActionToken(`${b64}.${flipped}`);
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects an expired token', () => {
    const token = signActionToken('confirm', 'MC-1234', -1000);
    const r = verifyActionToken(token, 'confirm');
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a token for a different action', () => {
    const token = signActionToken('propose', 'MC-1234');
    const r = verifyActionToken(token, 'refund');
    expect(r).toEqual({ ok: false, reason: 'action_mismatch' });
  });

  it('rejects malformed input', () => {
    expect(verifyActionToken(null).reason).toBe('malformed');
    expect(verifyActionToken('no-dot-here').reason).toBe('malformed');
    expect(verifyActionToken('a.b.c', 'confirm').ok).toBe(false);
  });
});
