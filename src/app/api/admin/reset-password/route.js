// EMERGENCY ONE-SHOT — DELETE AFTER F12 RECOVERY
//
// Resets an admin password to a known plaintext using the new `scrypt2:`
// format (per-user random salt). Used to recover from the second
// SESSION_SECRET-rotation lockout on 2026-05-08.
//
// Why a deployed endpoint instead of a local script?
//   Both my IP and the user's IP are blocked by the Azure SQL firewall
//   (Vercel's IP is the only one whitelisted). Local pymssql/mssql
//   clients return 18456 immediately. The only place that can write to
//   `admin_users` is from inside a Vercel Lambda — hence this endpoint.
//
// Auth: `Authorization: Bearer ${DB_SETUP_SECRET}` (rotated in B6 step
// 1, so a leaked older value cannot trigger this).
// Body: `{ username: string, plaintext: string }`.
//
// CLEANUP: this file MUST be deleted in a follow-up PR within ~30 min
// of recovery completing. It's a backdoor for any holder of the setup
// secret.

import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';
import { hashPassword } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = request.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.DB_SETUP_SECRET || ''}`;
  if (!process.env.DB_SETUP_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const username = String(body?.username || '').trim();
  const plaintext = String(body?.plaintext || '');
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });
  if (!plaintext || plaintext.length < 6) {
    return NextResponse.json({ error: 'plaintext required (min 6 chars)' }, { status: 400 });
  }

  const newHash = hashPassword(plaintext);

  try {
    const r = await query(
      'UPDATE admin_users SET password_hash = @hash WHERE LOWER(username) = LOWER(@username)',
      {
        username: { type: sql.NVarChar(255), value: username },
        hash: { type: sql.NVarChar(255), value: newHash },
      },
    );
    return NextResponse.json({
      ok: true,
      rowsAffected: r.rowsAffected?.[0] ?? 0,
      hashFormat: 'scrypt2',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
