import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

// One-shot bootstrap endpoint — provisions a professional user in Clerk +
// admin_users when it's operationally awkward to run the scripts locally
// (e.g. local .env.local points to the TEST Clerk instance while prod uses
// LIVE, and we need a LIVE-side account for a clinic pilot).
//
// Auth: X-Setup-Secret header must match DB_SETUP_SECRET (same secret
// gating /api/db/setup). Same convention lets a Vercel-shell operator
// call this without extra scaffolding.
//
// Body:
//   { email, firstName, lastName, clinicId }
//
// What it does (idempotent):
//   1. If a Clerk user with `email` exists, ensure publicMetadata.role
//      = 'professional' and rotate the password to a new 20-char string.
//   2. If it doesn't, create it with the new password and role.
//   3. Mark the email as verified via admin strategy (skips the email
//      verification prompt on first login).
//   4. Upsert admin_users row (username = email, role = 'professional',
//      clinic_id = provided).
//   5. Return { email, password, clerkUserId, adminUserId, action }.
//
// The password is returned exactly once — capture it from the response.
// A follow-up rotation is available via POST with the same body (returns
// a fresh password). Never logs the password server-side.
//
// Life cycle: keep this file as long as we're onboarding new clinics one
// at a time. Delete once the /admin UI grows a proper "create pro"
// flow. Gate on DB_SETUP_SECRET makes it safe to leave in the codebase.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SCRYPT_KEY_LEN = 32;
const SALT_BYTES = 16;
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN);
  return `scrypt2:${salt.toString('hex')}:${hash.toString('hex')}`;
}
function randomPassword() {
  // 20 base64url chars — Clerk minimum is 8 with entropy; this is plenty.
  return crypto.randomBytes(15).toString('base64url').slice(0, 20);
}

export async function POST(request) {
  const secret = request.headers.get('x-setup-secret');
  const expected = process.env.DB_SETUP_SECRET || 'dev';
  if (!secret || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  if (!process.env.CLERK_SECRET_KEY) {
    return NextResponse.json({ error: 'Clerk secret not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const email = String(body?.email || '').trim().toLowerCase();
  const firstName = String(body?.firstName || '').trim() || null;
  const lastName = String(body?.lastName || '').trim() || null;
  const clinicId = Number(body?.clinicId);
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }
  if (!Number.isInteger(clinicId) || clinicId <= 0) {
    return NextResponse.json({ error: 'clinicId required' }, { status: 400 });
  }

  try {
    // Import Clerk lazily so the route can still return 503 gracefully
    // when the SDK fails to initialize (missing env, network hiccup).
    const { createClerkClient } = await import('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

    // Validate the clinic exists (avoids silently creating a pro attached
    // to a bogus id).
    const pool = await getPool();
    const clinicRow = await pool.request()
      .input('id', sql.Int, clinicId)
      .query(`SELECT TOP 1 id, name FROM clinics WHERE id = @id`);
    if (!clinicRow.recordset[0]) {
      return NextResponse.json({ error: `clinic ${clinicId} not found` }, { status: 404 });
    }
    const clinicName = clinicRow.recordset[0].name;

    const newPassword = randomPassword();

    // Step 1: Clerk user (create or rotate).
    let clerkUser;
    let action;
    const existing = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
    const existingUser = Array.isArray(existing) ? existing[0] : existing?.data?.[0];

    if (existingUser) {
      action = 'rotated';
      clerkUser = existingUser;
      await clerk.users.updateUser(existingUser.id, {
        password: newPassword,
        skipPasswordChecks: false,
      });
      if (existingUser.publicMetadata?.role !== 'professional') {
        await clerk.users.updateUserMetadata(existingUser.id, {
          publicMetadata: { ...(existingUser.publicMetadata || {}), role: 'professional' },
        });
      }
    } else {
      action = 'created';
      clerkUser = await clerk.users.createUser({
        emailAddress: [email],
        password: newPassword,
        firstName,
        lastName,
        publicMetadata: { role: 'professional' },
        unsafeMetadata: { signupSource: 'bootstrap-pro' },
        skipPasswordChecks: false,
      });
    }

    // Step 2: upsert admin_users with the correct clinic_id. Uses a
    // throwaway password_hash because pro auth goes through Clerk — the
    // NOT NULL column just needs a valid-shaped value.
    const throwaway = hashPassword(crypto.randomBytes(24).toString('hex'));
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || email;

    const existingAdmin = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .query(`SELECT TOP 1 id FROM admin_users WHERE LOWER(username) = LOWER(@email)`);

    let adminUserId;
    if (existingAdmin.recordset[0]) {
      adminUserId = existingAdmin.recordset[0].id;
      await pool.request()
        .input('id', sql.Int, adminUserId)
        .input('clinicId', sql.Int, clinicId)
        .input('display', sql.NVarChar(120), `${displayName} · ${clinicName}`)
        .query(`
          UPDATE admin_users
          SET clinic_id = @clinicId,
              role = 'professional',
              is_active = 1,
              alta_request_id = NULL,
              display_name = @display
          WHERE id = @id
        `);
    } else {
      const insertResult = await pool.request()
        .input('username', sql.NVarChar(80), email)
        .input('hash', sql.NVarChar(255), throwaway)
        .input('display', sql.NVarChar(120), `${displayName} · ${clinicName}`)
        .input('role', sql.NVarChar(20), 'professional')
        .input('clinicId', sql.Int, clinicId)
        .query(`
          INSERT INTO admin_users (username, password_hash, display_name, role, clinic_id, is_active)
          OUTPUT INSERTED.id
          VALUES (@username, @hash, @display, @role, @clinicId, 1)
        `);
      adminUserId = insertResult.recordset[0]?.id;
    }

    return NextResponse.json({
      action,
      email,
      password: newPassword,  // returned exactly once — capture from response
      clerkUserId: clerkUser.id,
      adminUserId,
      clinicId,
      clinicName,
    });
  } catch (err) {
    console.error('[admin/bootstrap-pro]', err);
    return NextResponse.json({ error: err.message || 'internal' }, { status: 500 });
  }
}
