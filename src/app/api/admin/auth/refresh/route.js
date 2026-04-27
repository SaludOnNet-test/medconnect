import { NextResponse } from 'next/server';
import { requireAuth, makeToken } from '@/lib/adminAuth';
import { limits } from '@/lib/rateLimit';

/**
 * POST /api/admin/auth/refresh
 *
 * Trades a still-valid token for a new one with a fresh 12 h TTL. Lets the
 * admin/ops UI keep a long session alive without forcing a fresh password
 * prompt every 12 hours, while still bounding the lifetime of any single
 * token. Verification is done from scratch each call (HMAC + expiry), so a
 * compromised token can't be refreshed past its own expiry.
 */
export async function POST(request) {
  // Same brute-force shield as login — refusing to refresh under flood is
  // safer than letting an attacker cycle stolen tokens forever.
  const r = limits.adminLogin.check(request);
  if (!r.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: r.retryAfterSec },
      { status: 429, headers: r.headers },
    );
  }

  const session = requireAuth(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = makeToken({ username: session.username, role: session.role });
  return NextResponse.json({
    token,
    user: { username: session.username, role: session.role },
  });
}
