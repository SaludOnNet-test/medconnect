#!/usr/bin/env node
/**
 * One-off provisioning script · Attach Arita's and Francisco's professional
 * accounts to Centro Médico Cea Bermúdez.
 *
 * What it does:
 *   1. Looks up the Cea Bermúdez clinic in the `clinics` table.
 *      If not found, prints a clear error so the operator can either
 *      create it manually or pass --create with full clinic data.
 *   2. For each of the two emails, INSERTs an admin_users row (if missing)
 *      and UPDATEs the row's clinic_id = <cea-id>.
 *   3. Both rows get role='professional'. Password hash is a throwaway
 *      (auth is via Clerk; admin_users.password_hash is just NOT NULL).
 *
 * Idempotent: re-running is safe — UPDATE rather than INSERT for rows that
 * already exist, and clinic_id is set to the same value either way.
 *
 * Run locally with:
 *   CEA_PROF_EMAIL=<arita-email> \
 *   CEA_TEST_EMAIL=<francisco-email> \
 *   node --env-file=.env.local scripts/provision/attach-to-cea-bermudez.js
 *
 * Optional flags / env:
 *   CEA_CLINIC_NAME_LIKE  default: '%Cea Berm%' — substring used to locate the row
 *   CEA_CLINIC_ID         explicit ID, overrides the LIKE lookup
 *   --dry-run             prints what would happen without writing
 */

import crypto from 'crypto';
import { query, sql, DB_AVAILABLE } from '../../src/lib/db.js';

// Inlined from src/lib/adminAuth.js — same reasoning as
// scripts/provision/create-admin-raquel.js. Keep in sync.
const SCRYPT_KEY_LEN = 32;
const SALT_BYTES = 16;
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN);
  return `scrypt2:${salt.toString('hex')}:${hash.toString('hex')}`;
}

const C = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' };
const log = (c, ...a) => console.log(`${c}${a.join(' ')}${C.reset}`);

async function findClinicId() {
  if (process.env.CEA_CLINIC_ID) {
    const id = Number(process.env.CEA_CLINIC_ID);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`CEA_CLINIC_ID invalid: ${process.env.CEA_CLINIC_ID}`);
    }
    const res = await query(
      `SELECT TOP 1 id, name, city FROM clinics WHERE id = @id`,
      { id: { type: sql.Int, value: id } }
    );
    if (!res.recordset[0]) throw new Error(`No clinic with id=${id}`);
    return res.recordset[0];
  }

  const pattern = process.env.CEA_CLINIC_NAME_LIKE || '%Cea Berm%';
  const res = await query(
    `SELECT TOP 5 id, name, city FROM clinics WHERE name LIKE @pattern ORDER BY id`,
    { pattern: { type: sql.NVarChar(255), value: pattern } }
  );
  const rows = res.recordset;
  if (rows.length === 0) {
    throw new Error(
      `No clinic matching LIKE '${pattern}' found in 'clinics' table.\n` +
      `Either create the clinic row first (via /admin/clinic-alta or a direct INSERT),\n` +
      `or pass CEA_CLINIC_ID explicitly.`
    );
  }
  if (rows.length > 1) {
    console.log('Multiple matches — pass CEA_CLINIC_ID to disambiguate:');
    rows.forEach((r) => console.log(`  id=${r.id}  name=${r.name}  city=${r.city}`));
    throw new Error('Ambiguous clinic match');
  }
  return rows[0];
}

async function upsertProfessional({ email, clinicId, displayName, dryRun }) {
  const lowered = email.toLowerCase();

  const existing = await query(
    `SELECT id, username, role, clinic_id, display_name FROM admin_users
     WHERE LOWER(username) = LOWER(@email)`,
    { email: { type: sql.NVarChar(255), value: lowered } }
  );

  if (existing.recordset[0]) {
    const row = existing.recordset[0];
    if (row.clinic_id === clinicId && row.role === 'professional') {
      log(C.yellow, `  · '${email}' already attached to clinic ${clinicId} (role=${row.role}). No-op.`);
      return;
    }
    log(C.cyan, `  · '${email}' exists (clinic_id=${row.clinic_id ?? '∅'}, role=${row.role}). Updating ...`);
    if (dryRun) {
      console.log(`    [dry-run] UPDATE admin_users SET clinic_id=${clinicId}, role='professional' WHERE id=${row.id}`);
      return;
    }
    await query(
      `UPDATE admin_users
       SET clinic_id = @clinicId,
           role = 'professional',
           alta_request_id = NULL
       WHERE id = @id`,
      {
        clinicId: { type: sql.Int, value: clinicId },
        id: { type: sql.Int, value: row.id },
      }
    );
    log(C.green, `    Updated.`);
    return;
  }

  log(C.cyan, `  · '${email}' does not exist. Inserting ...`);
  if (dryRun) {
    console.log(`    [dry-run] INSERT INTO admin_users (username, password_hash, display_name, role, clinic_id) VALUES (...)`);
    return;
  }
  // Throwaway password — auth for professionals is via Clerk, this hash is
  // only present to satisfy the NOT NULL column. Never used for login.
  const throwaway = hashPassword(crypto.randomBytes(24).toString('hex'));
  await query(
    `INSERT INTO admin_users (username, password_hash, display_name, role, clinic_id)
     VALUES (@username, @hash, @display, @role, @clinicId)`,
    {
      username: { type: sql.NVarChar(80), value: lowered },
      hash: { type: sql.NVarChar(255), value: throwaway },
      display: { type: sql.NVarChar(120), value: displayName || lowered },
      role: { type: sql.NVarChar(20), value: 'professional' },
      clinicId: { type: sql.Int, value: clinicId },
    }
  );
  log(C.green, `    Inserted and attached to clinic ${clinicId}.`);
}

async function main() {
  if (!DB_AVAILABLE) {
    log(C.red, 'DB not configured — check AZURE_SQL_* env vars in .env.local');
    process.exit(1);
  }

  const aritaEmail = (process.env.CEA_PROF_EMAIL || '').trim().toLowerCase();
  const franciscoEmail = (process.env.CEA_TEST_EMAIL || '').trim().toLowerCase();
  const dryRun = process.argv.includes('--dry-run');

  if (!aritaEmail || !aritaEmail.includes('@')) {
    log(C.red, 'CEA_PROF_EMAIL required (Arita\'s Clerk email)');
    process.exit(1);
  }
  if (!franciscoEmail || !franciscoEmail.includes('@')) {
    log(C.red, 'CEA_TEST_EMAIL required (Francisco\'s Clerk email for the test account)');
    process.exit(1);
  }

  log(C.cyan, `\n=== Attaching Cea Bermúdez professionals ===\n`);
  if (dryRun) log(C.yellow, 'DRY RUN — no writes will happen.\n');

  const clinic = await findClinicId();
  log(C.green, `✓ Cea Bermúdez clinic found: id=${clinic.id}  name='${clinic.name}'  city='${clinic.city}'\n`);

  await upsertProfessional({ email: aritaEmail, clinicId: clinic.id, displayName: 'Arita · Cea Bermúdez', dryRun });
  await upsertProfessional({ email: franciscoEmail, clinicId: clinic.id, displayName: 'Francisco · test', dryRun });

  log(C.cyan, '\nNext steps:');
  console.log(`  1. Verify with:  SELECT id, username, role, clinic_id FROM admin_users WHERE clinic_id = ${clinic.id};`);
  console.log(`  2. Set CEA_PROF_EMAIL=${aritaEmail} and CEA_TEST_EMAIL=${franciscoEmail} in Vercel.`);
  console.log(`  3. Confirm Arita can log in at https://medconnect.es/sign-in and sees Cea Bermúdez in /pro/dashboard.\n`);
}

main().catch((err) => {
  log(C.red, '\nFAILED:', err.message);
  process.exit(1);
});
