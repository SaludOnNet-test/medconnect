import { NextResponse } from 'next/server';
import { authenticate, makeToken } from '@/lib/adminAuth';
import { limits } from '@/lib/rateLimit';

export async function POST(request) {
  try {
    // Brute-force shield: 10 login attempts/min/IP. Generous for legit ops
    // (mistyped password, retry) but blocks credential-stuffing.
    const r = limits.adminLogin.check(request);
    if (!r.ok) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfterSec: r.retryAfterSec },
        { status: 429, headers: r.headers },
      );
    }

    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }
    const user = await authenticate(username, password);
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    const token = makeToken({ username: user.username, role: user.role });
    return NextResponse.json({
      token,
      user: { username: user.username, displayName: user.display_name, role: user.role },
    });
  } catch (err) {
    console.error('[admin/auth/login]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
