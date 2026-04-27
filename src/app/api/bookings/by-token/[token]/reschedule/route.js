import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { operationsBookingAlert } from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/by-token/:token/reschedule
 *
 * Patient requests a reschedule from the confirmation email. Rescheduling
 * actually requires clinic coordination (we have to call them to negotiate a
 * new slot), so this endpoint doesn't try to pick a new time itself — it
 * opens an ops ticket and pings the operations inbox so a human can call.
 *
 * Body: { preferredDates?: string, notes?: string }
 *  - preferredDates: free-text "this week morning, next week afternoon"
 *  - notes: anything else the patient wants ops to know
 *
 * Idempotent at the DB level — a second call just appends to the booking
 * notes; ops can dedupe on their side.
 */
export async function POST(request, { params }) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  let body = {};
  try { body = await request.json(); } catch { /* allow empty */ }
  const preferredDates = String(body?.preferredDates || '').slice(0, 500);
  const notes = String(body?.notes || '').slice(0, 1000);

  const pool = await getPool();
  const r = await pool.request()
    .input('token', sql.NVarChar(64), token)
    .query(`
      SELECT id, patient_name, patient_email, provider_name, slot_date,
             slot_time, amount, status, has_insurance, insurance_company
      FROM bookings WHERE self_service_token = @token
    `);
  const booking = r.recordset[0];
  if (!booking) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  // Refuse if the booking is already in a terminal state.
  const terminal = ['cancelled_by_patient', 'cancelled', 'refunded', 'expired'];
  if (terminal.includes(booking.status)) {
    return NextResponse.json(
      { error: `Esta cita ya está en estado "${booking.status}" y no se puede reprogramar.` },
      { status: 409 },
    );
  }

  // Stamp the request onto the booking + flip status so ops sees it in the
  // dashboard. We don't move directly to a new slot — that's a human job.
  const noteLine = `Patient reschedule request${preferredDates ? ` — preferred: ${preferredDates}` : ''}${notes ? ` — notes: ${notes}` : ''}`;
  await pool.request()
    .input('id', sql.NVarChar(50), booking.id)
    .input('note', sql.NVarChar(sql.MAX), noteLine)
    .query(`
      UPDATE bookings
      SET status = CASE WHEN status IN ('confirmed','awaiting_voucher','voucher_sent')
                        THEN 'reschedule_requested' ELSE status END,
          notes = COALESCE(notes + CHAR(10), '') + @note,
          updated_at = SYSDATETIMEOFFSET()
      WHERE id = @id
    `);

  // Ping ops so it lands in someone's inbox the same way a regular ops alert
  // does. The reschedule reason rides along in the subject prefix so it's
  // visible in the inbox preview without opening the email.
  try {
    const tpl = operationsBookingAlert({
      bookingId: booking.id,
      patientName: booking.patient_name,
      patientEmail: booking.patient_email,
      providerName: booking.provider_name,
      slotDate: booking.slot_date,
      slotTime: booking.slot_time,
      amount: booking.amount != null ? Number(booking.amount) : null,
      hasInsurance: !!booking.has_insurance,
      insuranceCompany: booking.insurance_company,
    });
    await sendEmail({
      to: process.env.OPERATIONS_EMAIL || 'operaciones@medconnect.es',
      subject: `[RESCHEDULE] ${tpl.subject}`,
      html: `<p style="background:#fff8e1;padding:10px 14px;border-left:3px solid #d97706;margin:0 0 16px;">
        <strong>Solicitud de reprogramación del paciente.</strong><br/>${noteLine}
      </p>${tpl.html}`,
    });
  } catch (e) {
    console.error('[bookings/reschedule] ops email failed', e.message);
    // Non-fatal — the DB record is the source of truth, ops will see it on
    // the dashboard even if the email failed.
  }

  return NextResponse.json({ ok: true, message: 'Solicitud recibida. Te contactamos en menos de 6 horas hábiles.' });
}
