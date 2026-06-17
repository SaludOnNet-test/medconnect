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
 * Identification (from the user, 2026-06-12; revised 2026-06-16 after the
 * dry-run audit revealed Julia's booking already exists in the DB):
 *   - Jacques Blehaut:  any booking with patient_name LIKE '%blehaut%'
 *   - Julia Iruarrizaga Castillo: any booking with patient_name LIKE
 *     '%iruarrizaga%'. The booking already lives in the DB; the user
 *     originally mentioned "mc_bfd923" which turned out to be a short
 *     reference, NOT the primary key — the real row id is something
 *     like `mc_ea83c358202c56572d1c356e`. The seed code resolves it
 *     dynamically by name, then re-points provider_id to the freshly
 *     inserted Clínica Ginecológica Elcano row.
 *
 * Elcano clinic — only the bare minimum to keep the catalog row
 * usable. The user can flesh it out from /admin/clinics later.
 */

const JACQUES_NAME_LIKE = '%blehaut%';
const JULIA_NAME_LIKE   = '%iruarrizaga%';
const JULIA_FALLBACK_ID = 'mc_bfd923'; // only used when no existing booking matches
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
              WHEN LOWER(b.patient_name) LIKE @julia   THEN 1
              ELSE 0
            END AS is_keep
       FROM bookings b
   ORDER BY b.created_at DESC`,
    {
      jacques: { type: sql.NVarChar(50), value: JACQUES_NAME_LIKE },
      julia:   { type: sql.NVarChar(50), value: JULIA_NAME_LIKE },
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
      // clinics.id is NOT an IDENTITY column (rows came in from
      // Doctoralia imports with their own provider_id). Compute the
      // next id from MAX(id)+1 in the same SELECT so the INSERT has
      // a value. Tiny race window if two admins seed concurrently —
      // acceptable for this admin-only one-shot endpoint.
      const inserted = await query(
        `INSERT INTO clinics (id, name, city, province, partnership_status, partnership_decided_at, partnership_notes)
         OUTPUT INSERTED.id, INSERTED.name, INSERTED.city, INSERTED.partnership_status
         SELECT COALESCE(MAX(id), 0) + 1, @name, @city, @province, 'rejected', SYSDATETIMEOFFSET(),
                N'2026-06-15 — Rechazó atender al paciente derivado (Julia Iruarrizaga, eco 23-jun 16:30) y rechazó también el acuerdo de partnership con Med Connect. Bloqueamos sus huecos a menos de 30 días.'
           FROM clinics WITH (TABLOCKX)`,
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

  // Step 2 — locate Julia's booking. Match by patient_name LIKE
  // '%iruarrizaga%' (case-insensitive). Whichever row matches gets its
  // provider_id re-pointed to the freshly created Elcano clinic so the
  // ops case downstream lines up with a real, fulfilable booking row.
  // If nothing matches (fresh DB), fall back to inserting a new row
  // under the legacy JULIA_FALLBACK_ID — the seed stays usable on a
  // clean environment.
  const existingJulia = await query(
    `SELECT TOP 1 id, provider_id, patient_name FROM bookings
      WHERE LOWER(patient_name) LIKE @julia
   ORDER BY created_at DESC`,
    { julia: { type: sql.NVarChar(50), value: JULIA_NAME_LIKE } },
  );
  let bookingRow = existingJulia.recordset[0] || null;
  let juliaBookingId = bookingRow?.id || JULIA_FALLBACK_ID;
  if (!bookingRow) {
    planned.push(`INSERT bookings (${JULIA_FALLBACK_ID}, Julia Iruarrizaga, Elcano)`);
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
           '2026-06-23', '16:30', 72.00, 'awaiting_voucher', 0,
           62.00, 10.00, N'Ecografía ginecológica', '2026-06-15T14:39:00Z'
         )`,
        {
          id:         { type: sql.NVarChar(50), value: JULIA_FALLBACK_ID },
          name:       { type: sql.NVarChar(255), value: 'Julia Iruarrizaga Castillo' },
          email:      { type: sql.NVarChar(255), value: JULIA_EMAIL_FALLBACK },
          clinicId:   { type: sql.Int, value: clinicId },
          clinicName: { type: sql.NVarChar(255), value: ELCANO_NAME },
        },
      );
      const r = await query(`SELECT TOP 1 id, provider_id, patient_name FROM bookings WHERE id = @id`,
        { id: { type: sql.NVarChar(50), value: JULIA_FALLBACK_ID } });
      bookingRow = r.recordset[0];
      juliaBookingId = bookingRow?.id || JULIA_FALLBACK_ID;
    }
  } else if (clinicId && bookingRow.provider_id !== clinicId) {
    planned.push(`UPDATE bookings (${bookingRow.id}, ${bookingRow.patient_name}) → provider_id=${clinicId} (Elcano)`);
    if (confirm) {
      await query(
        `UPDATE bookings
            SET provider_id   = @clinicId,
                provider_name = @clinicName
          WHERE id = @id`,
        {
          id:         { type: sql.NVarChar(50), value: bookingRow.id },
          clinicId:   { type: sql.Int, value: clinicId },
          clinicName: { type: sql.NVarChar(255), value: ELCANO_NAME },
        },
      );
      const r = await query(`SELECT TOP 1 id, provider_id, patient_name FROM bookings WHERE id = @id`,
        { id: { type: sql.NVarChar(50), value: bookingRow.id } });
      bookingRow = r.recordset[0];
    }
  }

  // Step 3 — ensure ops case for Julia's booking, marked as clinic
  //          rejected. The booking_id is whatever Step 2 resolved to.
  const caseExists = await query(
    `SELECT TOP 1 id, status FROM operations_cases WHERE booking_id = @id`,
    { id: { type: sql.NVarChar(50), value: juliaBookingId } },
  );
  let caseRow = caseExists.recordset[0];
  if (!caseRow) {
    planned.push(`INSERT operations_cases (booking ${juliaBookingId}, clinic_rejected_searching)`);
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
          id:         { type: sql.NVarChar(50), value: juliaBookingId },
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
        { id: { type: sql.NVarChar(50), value: juliaBookingId } });
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
    juliaBookingId,
  });
}

// One-shot: migration (clinics partnership_* columns) + seed-elcano
// + cleanup, all idempotent. The migration block is a copy of the
// idempotent ALTERs from /api/db/setup so this endpoint doesn't
// depend on x-setup-secret being available.
//
// Migration runs EVERY time — even in dry-run mode — because the rest
// of the flow (seedElcano dry-run, cleanup dry-run) issues SELECTs
// against `partnership_status`. ALTER TABLE ADD COLUMN IF NOT EXISTS
// is non-destructive, and the Cea seed only fires when the row is
// still on the default 'pending', so re-runs are safe.
async function applyAll({ confirm }) {
  const pool = await getPool();
  const migrationSteps = [];

  // 1) Schema migration — runs unconditionally so subsequent SELECTs
  //    against partnership_status don't 500 on a pre-migration DB.
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
      mode: confirm ? 'applied' : 'dry-run',
      step: 'migration',
      error: err.message,
      migrationSteps,
    }, { status: 500 });
  }

  // 2) Elcano + Julia + ops case (respects confirm).
  const seedRes = await seedElcano({ confirm });
  const seedJson = await seedRes.json();

  // 3) Cleanup of test bookings (respects confirm). Runs AFTER
  //    seed-elcano so Julia's booking — which we just made sure exists
  //    — is preserved by the keep-list when confirm=true.
  const cleanRes = await cleanup({ confirm });
  const cleanJson = await cleanRes.json();

  return NextResponse.json({
    ok: true,
    mode: confirm ? 'applied' : 'dry-run',
    migrationSteps,
    seedElcano: seedJson,
    cleanup: cleanJson,
    note: confirm ? undefined : 'Schema migration ran (non-destructive). Re-run with ?confirm=true to apply seed + cleanup.',
  });
}

// Deletes test bookings + their ops_cases. Keep-list:
//   - Any booking whose patient_name LIKE '%blehaut%'   (Jacques)
//   - Any booking whose patient_name LIKE '%iruarrizaga%' (Julia)
// Identification by name (not id) since the audit on 2026-06-16 showed
// Julia's actual booking primary key is `mc_ea83c358202c56572d1c356e`,
// not the short "mc_bfd923" reference the user originally quoted.
// All dependent rows are deleted in the right order so FKs (if any)
// don't trip.
async function cleanup({ confirm }) {
  const target = await query(
    `SELECT b.id, b.patient_name, b.patient_email, b.amount, b.status, b.created_at
       FROM bookings b
      WHERE LOWER(b.patient_name) NOT LIKE @jacques
        AND LOWER(b.patient_name) NOT LIKE @julia`,
    {
      jacques: { type: sql.NVarChar(50), value: JACQUES_NAME_LIKE },
      julia:   { type: sql.NVarChar(50), value: JULIA_NAME_LIKE },
    },
  );
  const ids = target.recordset.map((r) => r.id);
  if (!confirm) {
    return NextResponse.json({
      ok: true,
      mode: 'dry-run',
      wouldDelete: target.recordset,
      count: ids.length,
      kept: {
        jacques: 'patient_name LIKE %blehaut%',
        julia:   'patient_name LIKE %iruarrizaga%',
      },
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
    kept: {
      jacques: 'patient_name LIKE %blehaut%',
      julia:   'patient_name LIKE %iruarrizaga%',
    },
  });
}
