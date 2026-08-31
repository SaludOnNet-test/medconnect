/**
 * Backfill operations_cases rows for paid bookings that never got one.
 *
 * Why this exists — 2026-08-31: the partner-clinic carve-out in
 * `createCaseForBooking` skipped case creation for every booking at a clinic
 * with `partnership_status='accepted'`. For sin-seguro bookings that also
 * removed the only surface where Ops uploads the SaludOnNet voucher, so
 * booking mc_b1ebaf544d679be91a334677 (Cea Bermúdez, 44 €) was charged and
 * then invisible in /admin/ops. The carve-out is fixed in src/lib/opsCases.js;
 * this script recovers bookings that fell through before the fix.
 *
 * Idempotent: a booking that already has a case is skipped.
 *
 * Usage (from the repo root, with .env.local present):
 *   node scripts/backfill-missing-ops-cases.js            # dry run
 *   node scripts/backfill-missing-ops-cases.js --apply    # write
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sql = require('mssql');

// Minimal .env.local loader (this script runs outside Next.js).
//
// `\$` must be unescaped to `$`: Next.js and Vite run .env files through
// dotenv-expand, where a bare `$FOO` is a variable reference, so values that
// contain a literal dollar sign are stored escaped. A naive reader that keeps
// the backslash produces a wrong password and an ELOGIN that looks like
// rotated credentials.
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').replace(/\\\$/g, '$');
    }
  }
}

const APPLY = process.argv.includes('--apply');

// Same tier table as createCaseForBooking: derived from the platform fee.
function tierFor(platformFee, amount) {
  const basis = Number(platformFee ?? amount ?? 0);
  if (basis >= 25) return { tier: 1, paymentToClinic: 15 };
  if (basis >= 15) return { tier: 2, paymentToClinic: 10 };
  if (basis >= 7) return { tier: 3, paymentToClinic: 5 };
  return { tier: 4, paymentToClinic: 2 };
}

(async () => {
  const pool = await sql.connect({
    server: process.env.AZURE_SQL_SERVER,
    database: process.env.AZURE_SQL_DATABASE,
    user: process.env.AZURE_SQL_USER,
    password: process.env.AZURE_SQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: false },
    connectionTimeout: 30000,
  });

  // Orphans = paid bookings (money taken, appointment not resolved) with no
  // case row. pending_payment / cancelled / expired are out of scope.
  const { recordset: orphans } = await pool.request().query(`
    SELECT b.id, b.provider_id, b.provider_name, b.slot_date, b.slot_time,
           b.amount, b.platform_fee, b.referral_id, b.status, b.has_insurance,
           b.created_at, cl.partnership_status
    FROM bookings b
    LEFT JOIN operations_cases c ON c.booking_id = b.id
    LEFT JOIN clinics cl ON cl.id = b.provider_id
    WHERE c.id IS NULL
      AND b.status IN ('confirmed', 'awaiting_voucher', 'voucher_sent')
    ORDER BY b.created_at ASC
  `);

  if (!orphans.length) {
    console.log('No orphan bookings — nothing to backfill.');
    await pool.close();
    return;
  }

  console.log(`${orphans.length} booking(s) without an ops case:\n`);
  for (const b of orphans) {
    const { tier, paymentToClinic } = tierFor(b.platform_fee, b.amount);
    const isPartner = b.partnership_status === 'accepted';
    const needsVoucher = b.has_insurance === false || b.status === 'awaiting_voucher';
    console.log(
      `  ${b.id} · ${b.provider_name} · ${b.slot_date} ${b.slot_time} · ` +
      `${b.status} · ${Number(b.amount).toFixed(2)} € · T${tier} · ` +
      `${isPartner ? 'partner' : 'no partner'}${needsVoucher ? ' · necesita voucher SON' : ''}`,
    );

    if (!APPLY) continue;

    const stamp = `[${new Date().toISOString()}] [sistema]`;
    const notes = [
      `${stamp} Caso creado por backfill: la venta se cobró pero no generó caso ` +
      `(carve-out de clínica partner, corregido el 2026-08-31).`,
    ];
    if (isPartner && needsVoucher) {
      notes.push(
        `${stamp} "${b.provider_name || 'La clínica'}" es clínica partner: no hace falta llamar para ` +
        `confirmar el hueco. El trabajo de este caso es comprar el acto médico en SaludOnNet y ` +
        `subir la autorización al paciente.`,
      );
    }

    const result = await pool.request()
      .input('booking_id', sql.NVarChar(50), b.id)
      .input('clinic_id', sql.Int, b.provider_id ?? null)
      .input('clinic_name', sql.NVarChar(255), b.provider_name ?? null)
      .input('slot_date', sql.NVarChar(20), b.slot_date ?? null)
      .input('slot_time', sql.NVarChar(10), b.slot_time ?? null)
      .input('amount', sql.Decimal(10, 2), Number(b.amount || 0))
      .input('payment', sql.Decimal(10, 2), paymentToClinic)
      .input('tier', sql.TinyInt, tier)
      .input('token', sql.NVarChar(80), crypto.randomBytes(24).toString('hex'))
      .input('referral_id', sql.NVarChar(50), b.referral_id ?? null)
      .input('call_log', sql.NVarChar(sql.MAX), notes.join('\n'))
      .query(`
        INSERT INTO operations_cases
          (booking_id, status,
           original_clinic_id, original_clinic_name, original_slot_date, original_slot_time,
           amount_paid, payment_to_clinic, tier,
           patient_response_token, referral_id, call_log)
        OUTPUT INSERTED.id
        SELECT @booking_id, 'pending_call',
               @clinic_id, @clinic_name, @slot_date, @slot_time,
               @amount, @payment, @tier, @token, @referral_id, @call_log
        WHERE NOT EXISTS (SELECT 1 FROM operations_cases WHERE booking_id = @booking_id)
      `);
    const caseId = result.recordset[0]?.id;
    console.log(caseId ? `    → caso #${caseId} creado` : '    → ya existía, omitido');
  }

  if (!APPLY) console.log('\nDry run. Re-run with --apply to create the cases.');
  await pool.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
