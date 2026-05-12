#!/usr/bin/env node
/**
 * One-off provisioning script · Create Raquel's admin user.
 *
 * Idempotent: if the row already exists, prints the existing user and exits 0.
 *
 * Run locally with:
 *   node --env-file=.env.local scripts/provision/create-admin-raquel.js
 *
 * Optional env overrides:
 *   OPS_ADMIN_USERNAME   default: 'raquel'
 *   OPS_ADMIN_PASSWORD   default: random 20-char password (printed at the end)
 *   OPS_ADMIN_DISPLAY    default: 'Raquel'
 *   OPS_ADMIN_ROLE       default: 'admin'    (other valid: 'ops')
 *
 * After running, copy the printed password into Vercel env var
 * `OPS_ADMIN_PASSWORD` so the Ops handbook deck (/internal/ops) shows it.
 */

import crypto from 'crypto';
import { query, sql, DB_AVAILABLE } from '../../src/lib/db.js';

// Inlined from src/lib/adminAuth.js (createAdmin + hashPassword) to avoid
// pulling in `next/server`, which plain-Node ESM can't resolve outside Next's
// runtime. Keep these in sync with adminAuth.js — same scrypt2 format.
const SCRYPT_KEY_LEN = 32;
const SALT_BYTES = 16;
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN);
  return `scrypt2:${salt.toString('hex')}:${hash.toString('hex')}`;
}
async function createAdmin({ username, password, displayName, role = 'ops' }) {
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

const C = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' };
const log = (c, ...a) => console.log(`${c}${a.join(' ')}${C.reset}`);

function randomPassword() {
  return crypto.randomBytes(15).toString('base64url').slice(0, 20);
}

async function main() {
  if (!DB_AVAILABLE) {
    log(C.red, 'DB not configured — check AZURE_SQL_* env vars in .env.local');
    process.exit(1);
  }

  const username = (process.env.OPS_ADMIN_USERNAME || 'raquel').trim();
  const password = (process.env.OPS_ADMIN_PASSWORD || randomPassword()).trim();
  const displayName = (process.env.OPS_ADMIN_DISPLAY || 'Raquel').trim();
  const role = (process.env.OPS_ADMIN_ROLE || 'admin').trim();

  log(C.cyan, `\n=== Provisioning admin user '${username}' ===\n`);

  const existing = await query(
    `SELECT username, display_name, role, is_active FROM admin_users WHERE username = @username`,
    { username: { type: sql.NVarChar(80), value: username } }
  );

  if (existing.recordset[0]) {
    const row = existing.recordset[0];
    log(C.yellow, `User '${username}' already exists:`);
    console.log(`  display_name: ${row.display_name}`);
    console.log(`  role:         ${row.role}`);
    console.log(`  is_active:    ${row.is_active}`);
    log(C.yellow, '\nSkipping creation. If you need to reset the password, use /admin/users');
    log(C.yellow, 'or rotate via a one-shot script after confirming with the user.\n');
    return;
  }

  await createAdmin({ username, password, displayName, role });

  log(C.green, `\n✓ Created admin user '${username}'`);
  console.log(`  Role:         ${role}`);
  console.log(`  Display:      ${displayName}`);
  console.log(`  Password:     ${password}`);
  log(C.cyan, '\nNext steps:');
  console.log(`  1. Copy this password to Vercel env var: OPS_ADMIN_PASSWORD=${password}`);
  console.log(`  2. Set OPS_ADMIN_USERNAME=${username} (if different from default).`);
  console.log(`  3. Generate handbook secret with:  node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`);
  console.log(`  4. Set OPS_HANDBOOK_SECRET=<the-output> in Vercel.`);
  console.log(`  5. Share with Raquel:  https://medconnect.es/internal/ops?k=<OPS_HANDBOOK_SECRET>\n`);
}

main().catch((err) => {
  log(C.red, '\nFAILED:', err.message);
  console.error(err);
  process.exit(1);
});
