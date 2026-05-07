// EMERGENCY ONE-SHOT — DELETE AFTER USE
//
// Context: rotating SESSION_SECRET in B6 invalidated all admin password
// hashes (adminAuth.js uses SESSION_SECRET as scrypt salt — see F12 in
// the plan file). Local DB write is blocked because pymssql/mssql from
// our IPs return 18456 on the rotated dbadmin credentials. Production
// runtime works (it has the current AZURE_SQL_PASSWORD via Vercel env)
// so we expose this endpoint to recompute hashes from inside the
// Lambda where SESSION_SECRET is also current.
//
// Auth: requires `Authorization: Bearer ${DB_SETUP_SECRET}` (the same
// gate as /api/db/setup, which is the most privileged endpoint we
// have). DB_SETUP_SECRET was rotated in B6 step 1, so a leaked older
// value cannot trigger this.
//
// Body: { username: string, plaintext: string }
//
// Behaviour:
//   - Looks up the admin_users row by username (case-insensitive)
//   - Recomputes the scrypt hash via lib/adminAuth.js#hashPassword
//     (uses runtime SESSION_SECRET)
//   - UPDATEs password_hash
//   - Returns { ok, rowsAffected }
//
// CLEANUP: this file MUST be deleted in a follow-up PR before any
// public traffic — it's a backdoor for any holder of DB_SETUP_SECRET.

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
      hashPrefix: newHash.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
