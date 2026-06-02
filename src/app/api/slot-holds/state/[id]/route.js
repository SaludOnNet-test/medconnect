// GET /api/slot-holds/state/[id]
//
// Used by /book on `?restoredHoldId=` arrival from an abandoned-hold
// recovery email. Returns the persisted form snapshot so /book can
// pre-fill the patient fields.
//
// Gate: the row must be one that already received a recovery email
// in the last 48 hours AND hasn't converted. This ensures the link
// only works for legit recovery flows (not arbitrary id guessing),
// and stops working after 48h to bound PII surface.
//
// Returns:
//   { ok: true, snapshot: {...}, slot: { clinicId, date, time, ... } }
//   { ok: false, reason: 'not_found' | 'too_old' | 'converted' | 'no_email_sent' }

import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { internalError, clientError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const RECOVERY_LINK_TTL_HOURS = 48;

export async function GET(request, { params }) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    return clientError('invalid id', 400);
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT id, clinic_id, clinic_name, slot_date, slot_time,
               procedure_slug, procedure_name, procedure_price,
               tier, fee, fee_label, has_insurance, insurance_company,
               form_snapshot, patient_email,
               held_until, converted_at, recovery_email_sent_at, created_at
        FROM slot_holds
        WHERE id = @id
      `);
    const row = result.recordset[0];
    if (!row) {
      return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });
    }
    if (row.converted_at) {
      return NextResponse.json({ ok: false, reason: 'converted' }, { status: 410 });
    }
    if (!row.recovery_email_sent_at) {
      // No recovery email was sent for this row → the link doesn't
      // exist legitimately. Refuse.
      return NextResponse.json({ ok: false, reason: 'no_email_sent' }, { status: 410 });
    }
    const ageMs = Date.now() - new Date(row.recovery_email_sent_at).getTime();
    if (ageMs > RECOVERY_LINK_TTL_HOURS * 60 * 60 * 1000) {
      return NextResponse.json({ ok: false, reason: 'too_old' }, { status: 410 });
    }

    let snapshot = null;
    try { snapshot = row.form_snapshot ? JSON.parse(row.form_snapshot) : null; } catch {}

    return NextResponse.json({
      ok: true,
      snapshot,
      slot: {
        clinicId: row.clinic_id,
        clinicName: row.clinic_name,
        date: row.slot_date,
        time: row.slot_time,
        procedureSlug: row.procedure_slug,
        procedureName: row.procedure_name,
        procedurePrice: row.procedure_price != null ? Number(row.procedure_price) : null,
        tier: row.tier,
        fee: row.fee != null ? Number(row.fee) : null,
        feeLabel: row.fee_label,
        hasInsurance: row.has_insurance == null ? null : !!row.has_insurance,
        insuranceCompany: row.insurance_company,
      },
    });
  } catch (err) {
    if (String(err?.message || '').includes('Invalid object name')) {
      return NextResponse.json({ ok: false, reason: 'migration_pending' }, { status: 503 });
    }
    return internalError(err, '[GET /api/slot-holds/state/[id]]');
  }
}
