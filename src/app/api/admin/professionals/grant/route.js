import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/adminAuth';

/**
 * POST /api/admin/professionals/grant
 *
 * Promotes a Clerk user to `publicMetadata.role = 'professional'` (or 'admin')
 * so they can reach `/pro/dashboard`. Without this endpoint there is no path
 * for a real professional to gain access — they'd sign up, hit middleware,
 * bounce back to /sign-in, repeat.
 *
 * Body: { email: string, role?: 'professional' | 'admin' }
 *  - role defaults to 'professional'
 *
 * Auth: admin-only via HMAC token. Ops users intentionally cannot promote
 * users (privilege escalation surface).
 */
export async function POST(request) {
  const rr = requireRole(request, ['admin']);
  if (rr instanceof Response) return rr;

  if (!process.env.CLERK_SECRET_KEY) {
    return NextResponse.json(
      { error: 'CLERK_SECRET_KEY not configured — cannot mutate Clerk users' },
      { status: 503 },
    );
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const email = String(body?.email || '').trim().toLowerCase();
  const role = body?.role === 'admin' ? 'admin' : 'professional';

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'valid email required' }, { status: 400 });
  }

  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();

    // Look up the user by email. Clerk's getUserList accepts emailAddress[]
    // and returns paginated results. We expect exactly one match.
    const list = await client.users.getUserList({ emailAddress: [email], limit: 2 });
    const users = list?.data ?? list ?? [];
    if (users.length === 0) {
      return NextResponse.json(
        { error: 'No Clerk user with that email. Ask them to sign up first.' },
        { status: 404 },
      );
    }
    if (users.length > 1) {
      return NextResponse.json(
        { error: 'Multiple Clerk users match — refusing to act ambiguously.' },
        { status: 409 },
      );
    }

    const user = users[0];

    // Merge — never blow away other publicMetadata fields the user may have.
    const updated = await client.users.updateUserMetadata(user.id, {
      publicMetadata: { ...(user.publicMetadata || {}), role },
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        email,
        role: updated.publicMetadata?.role,
      },
    });
  } catch (err) {
    console.error('[admin/professionals/grant]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
