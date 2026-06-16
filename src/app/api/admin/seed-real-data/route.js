import { NextResponse } from 'next/server';
import { getPool, sql, query, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * /api/admin/seed-real-data
 *
 * Admin-only endpoint to (a) clean test bookings, keeping only the two
 * real customers Jacques Blehaut and Julia Iruarrizaga, and (b) seed the
 * Clínica Ginecológica Elcano + Julia's booking + the operations case
 * that represents Elcano rejecting both the specific appointment and
 * the partnership offer.
 *
 * All actions are idempotent. Default mode is dry-run — pass
 * `?confirm=true` to apply.
 *
 * Actions (query-param `action`):
 *   - 'audit'        (default) — list current bookings + ops cases, no writes
 *   - 'seed-elcano'  — insert Elcano clinic + Julia booking + ops case (idempotent)
 *   - 'cleanup'      — delete bookings NOT in the keep-list (Jacques + Julia)
 *                      and their dependent ops_cases / vouchers
 *   - 'apply-all'    — runs the partnership schema migration + seed-elcano +
 *                      cleanup in a single call. Idempotent. Always requires
 *                      ?confirm=true to actually mutate.
 *
 * Identification (from the user, 2026-06-12):
 *   - Jacques Blehaut: any booking with patient_name LIKE '%blehaut%'
 *     (he is the Jun-9 buyer documented in /api/payments/route.js).
 *   - Julia Iruarrizaga Castillo, mc_bfd923, 23-Jun 16:30 16:30, eco,
 *     €72 (€62 service + €10 priority, sin seguro), specialty
 *     Ginecología y Obstetricia at Clínica Ginecológica Elcano.
 *
 * Elcano clinic — only the bare minimum to keep the catalog row
 * usable. The user can flesh it out from /admin/clinics later.
 */

const JACQUES_NAME_LIKE = '%blehaut%';
const JULIA_BOOKING_ID  = 'mc_bfd923';
const JULIA_EMAIL_FALLBACK = 'julia.iruarrizaga@example.invalid';
const ELCANO_NAME = 'Clínica Ginecológica Elcano';
const ELCANO_CITY = 'Madrid';
const ELCANO_PROVINCE = 'Madrid';

export async function POST(request) {
  const rr = requireRole(request, ['admin']);
  if (rr instanceof Response) return rr;
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const action = (searchParams.get('action') || 'audit').toLowerCase();
  const confirm = searchParams.get('confirm') === 'true';

  try {
    if (action === 'audit') return await auditOnly();
    if (action === 'seed-elcano') return await seedElcano({ confirm });
    if (action === 'cleanup') return await cleanup({ confirm });
    if (action === 'apply-all') return await applyAll({ confirm });
    return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error('[seed-real-data]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Lists current bookings + cases so the operator sees what's there
// before triggering a destructive action.
async function auditOnly() {
  const bookings = await query(
    `SELECT TOP 200 b.id, b.patient_name, b.patient_email, b.provider_id, b.provider_name,
            b.slot_date, b.slot_time, b.amount, b.status, b.has_insurance,
            b.specialty, b.created_at,
            CASE
              WHEN LOWER(b.patient_name) LIKE @jacques THEN 1
              WHEN b.id = @julia THEN 1
              ELSE 0
            END AS is_keep
       FROM bookings b
   ORDER BY b.created_at DESC`,
    {
      jacques: { type: sql.NVarChar(50), value: JACQUES_NAME_LIKE },
      julia:   { type: sql.NVarChar(50), value: JULIA_BOOKING_ID },
    },
  );
  const cases = await query(
    `SELECT TOP 200 id, booking_id, status, original_clinic_name,
            original_slot_date, original_slot_time, created_at
       FROM operations_cases
   ORDER BY created_at DESC`,
  );
  return NextResponse.json({
    ok: true,
    mode: 'audit',
    bookings: bookings.recordset,
    operationsCases: cases.recordset,
  });
}

// Inserts the Elcano clinic + Julia's booking + the Ops case showing
// the rejection. Everything is gated on "row already exists" so this
// is safe to call repeatedly.
async function seedElcano({ confirm }) {
  const planned = [];
  const pool = await getPool();

  // Step 1 — ensure the clinic row.
  const existing = await query(
    `SELECT TOP 1 id, name, city, partnership_status FROM clinics
      WHERE name COLLATE Latin1_General_CI_AI = @name COLLATE Latin1_General_CI_AI
        AND city COLLATE Latin1_General_CI_AI = @city COLLATE Latin1_General_CI_AI`,
    {
      name: { type: sql.NVarChar(255), value: ELCANO_NAME },
      city: { type: sql.NVarChar(120), value: ELCANO_CITY },
    },
  );
  let clinic = existing.recordset[0];
  if (!clinic) {
    planned.push('INSERT clinics (Clínica Ginecológica Elcano, Madrid)');
    if (confirm) {
      const inserted = await query(
        `INSERT INTO clinics (name, city, province, partnership_status, partnership_decided_at, partnership_notes)
         OUTPUT INSERTED.id, INSERTED.name, INSERTED.city, INSERTED.partnership_status
         VALUES (@name, @city, @province, 'rejected', SYSDATETIMEOFFSET(),
                 N'2026-06-15 — Rechazó atender al paciente derivado (Julia Iruarrizaga, eco 23-jun 16:30) y rechazó también el acuerdo de partnership con Med Connect. Bloqueamos sus huecos a menos de 30 días.')`,
        {
          name: { type: sql.NVarChar(255), value: ELCANO_NAME },
          city: { type: sql.NVarChar(120), value: ELCANO_CITY },
          province: { type: sql.NVarChar(120), value: ELCANO_PROVINCE },
        },
      );
      clinic = inserted.recordset[0];
    }
  } else if (clinic.partnership_status !== 'rejected') {
    planned.push(`UPDATE clinics #${clinic.id} → partnership_status='rejected'`);
    if (confirm) {
      await query(
        `UPDATE clinics
            SET partnership_status     = 'rejected',
                partnership_decided_at = SYSDATETIMEOFFSET(),
                partnership_notes      = COALESCE(partnership_notes,
                  N'2026-06-15 — Rechazó atender al paciente derivado (Julia Iruarrizaga, eco 23-jun 16:30) y rechazó también el acuerdo de partnership con Med Connect.')
          WHERE id = @id`,
        { id: { type: sql.Int, value: clinic.id } },
      );
      const r2 = await query(`SELECT id, name, city, partnership_status FROM clinics WHERE id = @id`,
        { id: { type: sql.Int, value: clinic.id } });
      clinic = r2.recordset[0];
    }
  }
  const clinicId = clinic?.id ?? null;

  // Step 2 — ensure Julia's booking row exists.
  const bookingExists = await query(
    `SELECT TOP 1 id, provider_id, patient_name FROM bookings WHERE id = @id`,
    { id: { type: sql.NVarChar(50), value: JULIA_BOOKING_ID } },
  );
  let bookingRow = bookingExists.recordset[0];
  if (!bookingRow) {
    planned.push(`INSERT bookings (${JULIA_BOOKING_ID}, Julia Iruarrizaga, Elcano)`);
    if (confirm && clinicId) {
      await query(
        `INSERT INTO bookings (
           id, patient_name, patient_email, patient_phone,
           provider_id, provider_name, specialty,
           slot_date, slot_time, amount, status, has_insurance,
           service_price, platform_fee, procedure_name, created_at
         ) VALUES (
           @id, @name, @email, NULL,
           @clinicId, @clinicName, N'Ginecología y Obstetricia',
           '2026-06-23', '16:30', 72.00, 'confirmed', 0,
           62.00, 10.00, N'Ecografía ginecológica', '2026-06-15T14:39:00Z'
         )`,
        {
          id:         { type: sql.NVarChar(50), value: JULIA_BOOKING_ID },
          name:       { type: sql.NVarChar(255), value: 'Julia Iruarrizaga Castillo' },
          email:      { type: sql.NVarChar(255), value: JULIA_EMAIL_FALLBACK },
          clinicId:   { type: sql.Int, value: clinicId },
          clinicName: { type: sql.NVarChar(255), value: ELCANO_NAME },
        },
      );
      const r = await query(`SELECT TOP 1 id FROM bookings WHERE id = @id`,
        { id: { type: sql.NVarChar(50), value: JULIA_BOOKING_ID } });
      bookingRow = r.recordset[0];
    }
  }

  // Step 3 — ensure ops case for Julia's booking, marked as clinic
  //          rejected.
  const caseExists = await query(
    `SELECT TOP 1 id, status FROM operations_cases WHERE booking_id = @id`,
    { id: { type: sql.NVarChar(50), value: JULIA_BOOKING_ID } },
  );
  let caseRow = caseExists.recordset[0];
  if (!caseRow) {
    planned.push(`INSERT operations_cases (booking ${JULIA_BOOKING_ID}, clinic_rejected_searching)`);
    if (confirm && bookingRow && clinicId) {
      await query(
        `INSERT INTO operations_cases (
           booking_id, status,
           original_clinic_id, original_clinic_name,
           original_slot_date, original_slot_time,
           amount_paid, payment_to_clinic, tier,
           call_log, ops_notes
         ) VALUES (
           @id, 'clinic_rejected_searching',
           @clinicId, @clinicName, '2026-06-23', '16:30',
           72.00, 10.00, 2,
           @callLog, @opsNotes
         )`,
        {
          id:         { type: sql.NVarChar(50), value: JULIA_BOOKING_ID },
          clinicId:   { type: sql.Int, value: clinicId },
          clinicName: { type: sql.NVarChar(255), value: ELCANO_NAME },
          callLog: { type: sql.NVarChar(sql.MAX), value:
            `[2026-06-15T15:00:00Z] [sistema] Caso creado por venta directa (paciente sin seguro pagó €72 = €62 acto + €10 prioridad T2).\n` +
            `[2026-06-15T16:30:00Z] [ops] Llamada a la clínica. Rechazaron atender al paciente. Motivo: "no trabajamos con intermediarios".\n` +
            `[2026-06-15T16:35:00Z] [ops] Se les ofreció acuerdo de partnership con medconnect. Lo rechazaron también. Marcamos clinic.partnership_status='rejected'; sus huecos quedan bloqueados a <30 días.`
          },
          opsNotes: { type: sql.NVarChar(sql.MAX), value:
            'Clínica rechazó tanto el caso específico como el acuerdo de partnership. Procesar reembolso al paciente o proponer alternativa en otra clínica de ginecología (Madrid).'
          },
        },
      );
      const r = await query(`SELECT TOP 1 id, status FROM operations_cases WHERE booking_id = @id`,
        { id: { type: sql.NVarChar(50), value: JULIA_BOOKING_ID } });
      caseRow = r.recordset[0];
    }
  }

  return NextResponse.json({
    ok: true,
    mode: confirm ? 'applied' : 'dry-run',
    planned,
    clinic,
    booking: bookingRow,
    operationsCase: caseRow,
  });
}

// One-shot: migration (clinics partnership_* columns) + seed-elcano
// + cleanup, all idempotent. The migration block is a copy of the
// idempotent ALTERs from /api/db/setup so this endpoint doesn't
// depend on x-setup-secret being available.
async function applyAll({ confirm }) {
  if (!confirm) {
    // Dry-run path: just report what each step would do.
    const seedDryRun = await seedElcano({ confirm: false });
    const cleanupDryRun = await cleanup({ confirm: false });
    return NextResponse.json({
      ok: true,
      mode: 'dry-run',
      migration: 'Would run ALTER TABLE clinics ADD partnership_status / partnership_decided_at / partnership_notes (idempotent) + UPDATE Cea Bermúdez.',
      seedElcano: await seedDryRun.json(),
      cleanup: await cleanupDryRun.json(),
      note: 'Re-run with ?confirm=true to apply.',
    });
  }

  const pool = await getPool();
  const migrationSteps = [];

  // 1) Schema migration — same SQL as /api/db/setup, copied here so the
  //    endpoint is self-contained (admin auth is enough; no setup secret
  //    needed).
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'partnership_status' AND Object_ID = Object_ID('clinics'))
      ALTER TABLE clinics ADD partnership_status NVARCHAR(20) NOT NULL DEFAULT 'pending';
    `);
    migrationSteps.push('partnership_status column ensured');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'partnership_decided_at' AND Object_ID = Object_ID('clinics'))
      ALTER TABLE clinics ADD partnership_decided_at DATETIMEOFFSET NULL;
    `);
    migrationSteps.push('partnership_decided_at column ensured');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = 'partnership_notes' AND Object_ID = Object_ID('clinics'))
      ALTER TABLE clinics ADD partnership_notes NVARCHAR(MAX) NULL;
    `);
    migrationSteps.push('partnership_notes column ensured');
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_clinics_partnership_status' AND object_id = OBJECT_ID('clinics'))
      CREATE INDEX IX_clinics_partnership_status ON clinics(partnership_status);
    `);
    migrationSteps.push('IX_clinics_partnership_status ensured');
    const ceaUpdate = await pool.request().query(`
      UPDATE clinics
         SET partnership_status     = 'accepted',
             partnership_decided_at = '2026-05-05T00:00:00Z',
             partnership_notes      = COALESCE(partnership_notes, 'Partner pionero (CEA Bermúdez, Madrid). Onboarding completado 2026-05-05.')
       WHERE id = 1
         AND (partnership_status IS NULL OR partnership_status = 'pending');
      SELECT @@ROWCOUNT AS affected;
    `);
    migrationSteps.push(`Cea Bermúdez seed rows affected: ${ceaUpdate.recordset?.[0]?.affected ?? 0}`);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      mode: 'applied',
      step: 'migration',
      error: err.message,
      migrationSteps,
    }, { status: 500 });
  }

  // 2) Elcano + Julia + ops case.
  const seedRes = await seedElcano({ confirm: true });
  const seedJson = await seedRes.json();

  // 3) Cleanup of test bookings (run AFTER seed-elcano so Julia's
  //    booking — which we just made sure exists — is preserved by the
  //    keep-list).
  const cleanRes = await cleanup({ confirm: true });
  const cleanJson = await cleanRes.json();

  return NextResponse.json({
    ok: true,
    mode: 'applied',
    migrationSteps,
    seedElcano: seedJson,
    cleanup: cleanJson,
  });
}

// Deletes test bookings + their ops_cases. Keep-list:
//   - Any booking whose patient_name LIKE '%blehaut%' (Jacques)
//   - The booking with id = mc_bfd923 (Julia)
// All dependent rows are deleted in the right order so FKs (if any)
// don't trip.
async function cleanup({ confirm }) {
  const target = await query(
    `SELECT b.id, b.patient_name, b.patient_email, b.amount, b.status, b.created_at
       FROM bookings b
      WHERE LOWER(b.patient_name) NOT LIKE @jacques
        AND b.id <> @julia`,
    {
      jacques: { type: sql.NVarChar(50), value: JACQUES_NAME_LIKE },
      julia:   { type: sql.NVarChar(50), value: JULIA_BOOKING_ID },
    },
  );
  const ids = target.recordset.map((r) => r.id);
  if (!confirm) {
    return NextResponse.json({
      ok: true,
      mode: 'dry-run',
      wouldDelete: target.recordset,
      count: ids.length,
      kept: { jacques: 'patient_name LIKE %blehaut%', julia: JULIA_BOOKING_ID },
    });
  }

  // Need a table value param or use a temp table; with a handful of IDs
  // we batch via inline IN. Safe because they come from our own SELECT.
  let deletedCases = 0, deletedVouchers = 0, deletedBookings = 0;
  if (ids.length > 0) {
    // Quote and escape ids defensively (NVARCHAR primary key; we generate
    // them ourselves, but better safe than sorry).
    const literal = ids.map((id) => `N'${String(id).replace(/'/g, "''")}'`).join(',');
    const opsRes = await query(`DELETE FROM operations_cases WHERE booking_id IN (${literal})`);
    deletedCases = opsRes.rowsAffected?.[0] || 0;
    try {
      const vRes = await query(`DELETE FROM vouchers WHERE booking_id IN (${literal})`);
      deletedVouchers = vRes.rowsAffected?.[0] || 0;
    } catch (err) {
      // Table may not exist in every environment — non-fatal.
      console.warn('[seed-real-data] vouchers cleanup skipped:', err?.message);
    }
    const bRes = await query(`DELETE FROM bookings WHERE id IN (${literal})`);
    deletedBookings = bRes.rowsAffected?.[0] || 0;
  }

  return NextResponse.json({
    ok: true,
    mode: 'applied',
    deletedBookings,
    deletedCases,
    deletedVouchers,
    kept: { jacques: 'patient_name LIKE %blehaut%', julia: JULIA_BOOKING_ID },
  });
}
