// Simple admin auth for the ops dashboard.
// Tokens are HMAC(username|expires|role) using SESSION_SECRET.
// Stored client-side in localStorage; verified server-side on each /api/ops or /api/admin call.

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { query, sql, DB_AVAILABLE } from '@/lib/db';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

// scrypt parameters — matched to Node's defaults, sufficient for an admin
// table that's measured in 10s of users (not customer-facing) and that
// already has rate-limiting + password-strength gates upstream.
const SCRYPT_KEY_LEN = 32;
const SALT_BYTES = 16;

// Resolve SESSION_SECRET lazily so `next build` doesn't fail when the env var
// is missing at build time. In production we refuse to operate without an
// explicit secret — the previous fallback chain (DB_SETUP_SECRET → 'dev-…')
// silently degraded HMAC strength to a publicly-known constant, which would
// have let anyone forge admin/ops tokens.
function getSessionSecret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET is missing or too short (need ≥ 32 chars). ' +
      'Generate with `openssl rand -hex 32` and set it in Vercel env vars.',
    );
  }
  return fromEnv || 'dev-session-secret-not-for-production';
}

function sign(payload) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
}

/**
 * Hash a plaintext password.
 *
 * Format: `scrypt2:<salt-hex>:<hash-hex>`
 *
 * Why this changed (F12, 2026-05-08): the previous format used
 * `crypto.scryptSync(password, SESSION_SECRET, 32)` — i.e. SESSION_SECRET
 * acted as the scrypt salt for *every* user. Rotating SESSION_SECRET
 * therefore invalidated every stored hash (the lockout incident on
 * 2026-05-07 took the production admin panel offline until we deployed a
 * one-shot recovery endpoint).
 *
 * The new format generates a per-user random salt and stores it
 * alongside the hash. SESSION_SECRET is now reserved for HMAC of session
 * tokens only (see `sign`/`verifyToken` below). Future SESSION_SECRET
 * rotations are safe — they don't touch stored password hashes.
 *
 * Backward compatibility: `verifyPassword` still accepts the legacy
 * `scrypt:` and `plain:` prefixes, and `authenticate()` auto-upgrades
 * legacy rows to `scrypt2:` on the next successful login.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN);
  return `scrypt2:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify a plaintext password against a stored hash. Accepts three
 * formats during the F12 migration window:
 *
 *   - scrypt2:<salt-hex>:<hash-hex>   ← current (per-user salt)
 *   - scrypt:<hash-hex>               ← legacy (SESSION_SECRET as salt)
 *   - plain:<password>                ← legacy seeded admin only
 *
 * Returns `true` on match. The caller (typically `authenticate()`) is
 * responsible for triggering an auto-upgrade UPDATE when the stored
 * format is legacy — this lib function is intentionally side-effect-free
 * so it stays cheap to call from rate-limited paths.
 */
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;

  if (stored.startsWith('scrypt2:')) {
    const parts = stored.slice(8).split(':');
    if (parts.length !== 2) return false;
    let salt, expected;
    try {
      salt = Buffer.from(parts[0], 'hex');
      expected = Buffer.from(parts[1], 'hex');
    } catch {
      return false;
    }
    if (salt.length !== SALT_BYTES || expected.length !== SCRYPT_KEY_LEN) return false;
    const computed = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN);
    return crypto.timingSafeEqual(computed, expected);
  }

  if (stored.startsWith('plain:')) {
    return stored.slice(6) === password;
  }

  if (stored.startsWith('scrypt:')) {
    // Legacy format — SESSION_SECRET as salt. Auto-upgraded to
    // `scrypt2:` on next successful login (see `authenticate()`).
    let storedHash;
    try {
      storedHash = Buffer.from(stored.slice(7), 'hex');
    } catch {
      return false;
    }
    if (storedHash.length !== SCRYPT_KEY_LEN) return false;
    const expected = crypto.scryptSync(password, getSessionSecret(), SCRYPT_KEY_LEN);
    return crypto.timingSafeEqual(storedHash, expected);
  }

  return false;
}

/**
 * Returns true if the stored hash uses a legacy format that should be
 * migrated on the next successful login. Exported for the auto-upgrade
 * path in `authenticate()`.
 */
function isLegacyHash(stored) {
  if (!stored || typeof stored !== 'string') return false;
  return stored.startsWith('scrypt:') || stored.startsWith('plain:');
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
    // The previous no-DB fallback accepted the literal pair "Admin"/"ADMIN"
    // so the dashboard still rendered when the DB was offline (during
    // local-dev setup, or while the migration was running). That created a
    // hardcoded credential leak in the codebase — easy to grep, harder to
    // rotate. With prod always having DB_AVAILABLE=true the fallback was
    // never used by real users; we just refuse the login now and let the
    // operator surface the actual error via the response body / logs.
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

  // Auto-upgrade legacy `scrypt:` / `plain:` hashes to the new `scrypt2:`
  // format with a per-user random salt. Best-effort: if the UPDATE
  // fails the user still logs in (we already verified them), they'll
  // just get re-prompted to upgrade on their next successful login.
  // After the F12 migration window, legacy rows organically disappear
  // from the table.
  if (isLegacyHash(row.password_hash)) {
    try {
      const upgraded = hashPassword(password);
      await query(
        `UPDATE admin_users SET password_hash = @hash WHERE username = @username`,
        {
          username: { type: sql.NVarChar(80), value: username },
          hash: { type: sql.NVarChar(255), value: upgraded },
        }
      );
    } catch (err) {
      console.error('[auth] hash auto-upgrade failed for', username, err?.message);
    }
  }

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
