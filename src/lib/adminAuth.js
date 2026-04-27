// Simple admin auth for the ops dashboard.
// Tokens are HMAC(username|expires|role) using SESSION_SECRET.
// Stored client-side in localStorage; verified server-side on each /api/ops or /api/admin call.

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.DB_SETUP_SECRET || 'dev-session-secret';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

function sign(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

function hashPassword(password) {
  // Plain prefix is for the seeded default; once a user changes it we move to scrypt.
  return 'scrypt:' + crypto.scryptSync(password, SESSION_SECRET, 32).toString('hex');
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith('plain:')) return stored.slice(6) === password;
  if (stored.startsWith('scrypt:')) {
    const expected = crypto.scryptSync(password, SESSION_SECRET, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(stored.slice(7), 'hex'), Buffer.from(expected, 'hex'));
  }
  return false;
}

export function makeToken({ username, role }) {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `${username}|${expires}|${role}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  let payload;
  try { payload = Buffer.from(b64, 'base64url').toString(); } catch { return null; }
  if (sign(payload) !== sig) return null;
  const [username, expiresStr, role] = payload.split('|');
  const expires = Number(expiresStr);
  if (!username || !expires || expires < Date.now()) return null;
  return { username, role, expires };
}

export async function authenticate(username, password) {
  if (!DB_AVAILABLE) {
    if (username === 'Admin' && password === 'ADMIN') {
      return { username: 'Admin', role: 'admin', display_name: 'Default Admin (no DB)' };
    }
    return null;
  }
  const result = await query(
    `SELECT username, password_hash, display_name, role, is_active
     FROM admin_users WHERE username = @username`,
    { username: { type: sql.NVarChar(80), value: username } }
  );
  const row = result.recordset[0];
  if (!row || !row.is_active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  await query(
    `UPDATE admin_users SET last_login = SYSDATETIMEOFFSET() WHERE username = @username`,
    { username: { type: sql.NVarChar(80), value: username } }
  );
  return { username: row.username, role: row.role, display_name: row.display_name };
}

export async function createAdmin({ username, password, displayName, role = 'ops' }) {
  if (!DB_AVAILABLE) throw new Error('DB not available');
  await query(
    `INSERT INTO admin_users (username, password_hash, display_name, role)
     VALUES (@username, @hash, @display, @role)`,
    {
      username: { type: sql.NVarChar(80), value: username },
      hash: { type: sql.NVarChar(255), value: hashPassword(password) },
      display: { type: sql.NVarChar(120), value: displayName || username },
      role: { type: sql.NVarChar(20), value: role },
    }
  );
}

export function requireAuth(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return verifyToken(token);
}

/**
 * Pure role-membership check. Use this after `requireAuth` so the call site
 * can return 401 (no/expired token) and 403 (valid token, wrong role) with
 * the right HTTP semantics — the admin UI's adminFetch only auto-relogins
 * on 401.
 *
 * Roles in use today (admin_users.role):
 *   - 'admin' — full power (create/manage admins, role changes)
 *   - 'ops'   — handle ops cases, upload vouchers, action bookings
 *
 * Pattern at call site:
 *   const session = requireAuth(request);
 *   if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   if (!hasRole(session, ['admin', 'ops'])) {
 *     return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 *   }
 *
 * Defense-in-depth: even when a route only logically targets admins, prefer
 * `hasRole(session, ['admin'])` over a bare `session.role === 'admin'` check
 * so that future role additions (e.g. 'viewer') don't accidentally inherit
 * permissions they shouldn't.
 */
export function hasRole(session, allowedRoles) {
  if (!session) return false;
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true;
  return allowedRoles.includes(session.role);
}

/**
 * One-call shorthand when you want the 401 distinction baked in. Returns the
 * session object for the success path, or a NextResponse with the right
 * status for the failure path. Call sites can early-return:
 *
 *   const r = requireRole(request, ['admin', 'ops']);
 *   if (r instanceof Response) return r;
 *   const session = r;
 *
 * Avoids two boilerplate lines per route while preserving 401 vs 403.
 */
export function requireRole(request, allowedRoles) {
  const session = requireAuth(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasRole(session, allowedRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return session;
}

export { hashPassword };
