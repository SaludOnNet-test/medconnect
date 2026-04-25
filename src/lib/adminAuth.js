// Simple admin auth for the ops dashboard.
// Tokens are HMAC(username|expires|role) using SESSION_SECRET.
// Stored client-side in localStorage; verified server-side on each /api/ops or /api/admin call.

import crypto from 'crypto';
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

export { hashPassword };
