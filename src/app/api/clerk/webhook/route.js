import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { hashPassword } from '@/lib/adminAuth';
import crypto from 'crypto';

/**
 * POST /api/clerk/webhook
 *
 * Clerk webhooks land here. We verify the Svix signature (CLERK_WEBHOOK_SECRET
 * must be set on Vercel) and react to `user.created`:
 *
 *   - If `unsafeMetadata.signupSource === 'pro'`, promote the new user to
 *     publicMetadata.role = 'professional' and create the matching
 *     admin_users row so /api/pro/me returns data and /pro/dashboard
 *     middleware lets them through.
 *
 *   - Patients (no signupSource flag) are left untouched. They become
 *     plain Clerk users with no DB row — that's fine for the booking
 *     flow, which keys off the patient email field, not admin_users.
 *
 * Configure the endpoint in the Clerk dashboard:
 *   Webhooks → Add → URL: https://www.medconnect.es/api/clerk/webhook
 *   Events: user.created
 *   Signing secret → Vercel env var CLERK_WEBHOOK_SECRET.
 */
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[clerk webhook] CLERK_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });
  }

  // Svix sends the body raw — we need to verify the signature against the
  // exact bytes Clerk sent. Read as text first.
  const payload = await request.text();
  const headers = {
    'svix-id': request.headers.get('svix-id') || '',
    'svix-timestamp': request.headers.get('svix-timestamp') || '',
    'svix-signature': request.headers.get('svix-signature') || '',
  };
  if (!headers['svix-id'] || !headers['svix-signature']) {
    return NextResponse.json({ error: 'missing svix headers' }, { status: 400 });
  }

  let event;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, headers);
  } catch (err) {
    console.error('[clerk webhook] signature verification failed', err);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  if (event?.type !== 'user.created') {
    // Other events arrive (e.g. user.updated) — ack and ignore for now.
    return NextResponse.json({ ok: true, ignored: event?.type });
  }

  const data = event.data || {};
  const isProSignup = data?.unsafe_metadata?.signupSource === 'pro';
  if (!isProSignup) {
    return NextResponse.json({ ok: true, type: 'patient' });
  }

  const userId = data?.id;
  const email =
    data?.email_addresses?.find?.((e) => e.id === data.primary_email_address_id)?.email_address
    || data?.email_addresses?.[0]?.email_address
    || '';
  const fullName = [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim();

  if (!userId || !email) {
    console.error('[clerk webhook] user.created missing userId/email', data);
    return NextResponse.json({ error: 'user payload incomplete' }, { status: 400 });
  }

  // 1. Promote the Clerk user to publicMetadata.role = 'professional'.
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const existingUser = await client.users.getUser(userId);
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { ...(existingUser.publicMetadata || {}), role: 'professional' },
    });
  } catch (err) {
    console.error('[clerk webhook] failed to promote role', err);
    // Don't 500 — we still want to create the admin_users row so the
    // user can at least see /pro/onboarding. Ops can re-grant later.
  }

  // 2. Best-effort: create admin_users row so /api/pro/me has data.
  if (DB_AVAILABLE) {
    try {
      const pool = await getPool();
      const existing = await pool.request()
        .input('email', sql.NVarChar(255), email)
        .query(`SELECT TOP 1 id FROM admin_users WHERE LOWER(username) = LOWER(@email)`);
      if (!existing.recordset[0]) {
        // Random password — auth is via Clerk, this hash is just to satisfy
        // the NOT NULL column. Never used for login.
        const randomPwd = crypto.randomBytes(24).toString('hex');
        await pool.request()
          .input('username', sql.NVarChar(80), email)
          .input('hash', sql.NVarChar(255), hashPassword(randomPwd))
          .input('display', sql.NVarChar(120), fullName || email)
          .input('role', sql.NVarChar(20), 'professional')
          .query(`
            INSERT INTO admin_users (username, password_hash, display_name, role)
            VALUES (@username, @hash, @display, @role)
          `);
      }
    } catch (err) {
      console.error('[clerk webhook] failed to seed admin_users row', err);
    }
  }

  return NextResponse.json({ ok: true, type: 'pro', email });
}
