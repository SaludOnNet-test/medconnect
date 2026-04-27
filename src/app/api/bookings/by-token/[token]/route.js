import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookings/by-token/:token
 *
 * Public, token-gated read of a single booking. Returns just enough for the
 * patient-facing self-service page (`/booking/[token]`) to render. We
 * deliberately strip ops/internal fields (referral_id, payment_intent_id,
 * card_last4, etc.) so a leaked token doesn't leak more than it should.
 */
export async function GET(request, { params }) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('token', sql.NVarChar(64), token)
      .query(`
        SELECT id, patient_name, patient_email, provider_name, specialty,
               slot_date, slot_time, amount, status, has_insurance,
               procedure_name, created_at
        FROM bookings WHERE self_service_token = @token
      `);
    const row = r.recordset[0];
    if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

    return NextResponse.json({
      id: row.id,
      patientName: row.patient_name,
      patientEmail: row.patient_email,
      providerName: row.provider_name,
      specialty: row.specialty,
      slotDate: row.slot_date,
      slotTime: row.slot_time,
      amount: row.amount != null ? Number(row.amount) : null,
      status: row.status,
      hasInsurance: !!row.has_insurance,
      procedureName: row.procedure_name,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('[GET /api/bookings/by-token]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
