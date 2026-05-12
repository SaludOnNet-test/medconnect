#!/usr/bin/env node
/**
 * MedConnect — referrals.is_internal migration + backfill.
 *
 * Adds the is_internal BIT column (idempotent), then backfills it for
 * existing rows by comparing the derivador's clinic_id (from admin_users)
 * with the referral's provider_id (destination clinic).
 *
 * Classification:
 *   - 1 (internal) when derivador.clinic_id == provider_id
 *   - 0 (external) when they differ
 *   - NULL when the derivador isn't mapped to a clinic_id (the commissions
 *     API treats NULL as external — smaller payout, safer default).
 *
 * Idempotent — safe to re-run. Two run modes:
 *
 *   1. HTTP (recommended in prod) — POST /api/db/setup with the
 *      `x-setup-secret: $DB_SETUP_SECRET` header. The ALTER TABLE is also
 *      embedded in src/app/api/db/setup/route.js so the column lands
 *      whenever setup runs. This script is for the backfill UPDATE.
 *
 *   2. CLI (local / one-off) — requires AZURE_SQL_* env vars and Node 18+:
 *        node --env-file=.env.local scripts/migrate_referrals_is_internal.js
 */

import { query, sql, DB_AVAILABLE } from '../src/lib/db.js';

const C = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m' };
const log = (c, ...a) => console.log(`${c}${a.join(' ')}${C.reset}`);

async function run() {
  if (!DB_AVAILABLE) {
    log(C.red, 'DB not configured — check AZURE_SQL_* env vars in .env.local');
    process.exit(1);
  }

  log(C.cyan, '\n=== referrals.is_internal · migration + backfill ===\n');

  // 1. Ensure the column exists (idempotent — matches the ALTER guarded
  //    in src/app/api/db/setup/route.js).
  process.stdout.write('  • adding is_internal column ... ');
  try {
    await query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'is_internal' AND Object_ID = Object_ID('referrals'))
      ALTER TABLE referrals ADD is_internal BIT NULL;
    `);
    log(C.green, 'ok');
  } catch (err) {
    log(C.red, `FAILED: ${err.message}`);
    throw err;
  }

  // 2. Show counts before.
  const before = await query(`
    SELECT
      SUM(CASE WHEN is_internal IS NULL THEN 1 ELSE 0 END) AS unclassified,
      SUM(CASE WHEN is_internal = 1 THEN 1 ELSE 0 END) AS internal,
      SUM(CASE WHEN is_internal = 0 THEN 1 ELSE 0 END) AS external,
      COUNT(*) AS total
    FROM referrals
  `);
  const b = before.recordset[0] || {};
  log(C.cyan, `\n  Before backfill: total=${b.total ?? 0}, unclassified=${b.unclassified ?? 0}, internal=${b.internal ?? 0}, external=${b.external ?? 0}`);

  // 3. Backfill. Only touches rows currently NULL — re-runs are no-ops.
  //    LEFT JOIN means rows where the derivador isn't in admin_users keep
  //    is_internal = NULL (and the commissions API treats those as external).
  process.stdout.write('\n  • backfilling is_internal ... ');
  let updated = 0;
  try {
    const result = await query(`
      UPDATE r
      SET is_internal = CASE WHEN a.clinic_id = r.provider_id THEN 1 ELSE 0 END
      FROM referrals r
      JOIN admin_users a ON LOWER(a.username) = LOWER(r.professional_email)
      WHERE r.is_internal IS NULL
        AND a.clinic_id IS NOT NULL
        AND r.provider_id IS NOT NULL;
    `);
    updated = result.rowsAffected?.[0] ?? 0;
    log(C.green, `ok (${updated} rows)`);
  } catch (err) {
    log(C.red, `FAILED: ${err.message}`);
    throw err;
  }

  // 4. Show counts after.
  const after = await query(`
    SELECT
      SUM(CASE WHEN is_internal IS NULL THEN 1 ELSE 0 END) AS unclassified,
      SUM(CASE WHEN is_internal = 1 THEN 1 ELSE 0 END) AS internal,
      SUM(CASE WHEN is_internal = 0 THEN 1 ELSE 0 END) AS external,
      COUNT(*) AS total
    FROM referrals
  `);
  const a = after.recordset[0] || {};
  log(C.cyan, `\n  After  backfill: total=${a.total ?? 0}, unclassified=${a.unclassified ?? 0}, internal=${a.internal ?? 0}, external=${a.external ?? 0}`);

  if ((a.unclassified ?? 0) > 0) {
    log(C.yellow,
      `\n  ${a.unclassified} row(s) remain NULL — their derivador isn't mapped to a clinic_id.\n  ` +
      `The commissions API treats NULL as external (smaller payout). To re-classify, either map the\n  ` +
      `derivador via /admin/users → clinic_id, or update directly:\n` +
      `    UPDATE referrals SET is_internal = 1 WHERE professional_email = '<email>' AND provider_id = <id>;\n`);
  }

  log(C.green, '\n✓ Done.\n');
}

run().catch((err) => {
  log(C.red, '\nFAILED:', err.message);
  console.error(err);
  process.exit(1);
});
