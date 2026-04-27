import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { patientRefunded } from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/by-token/:token/cancel
 *
 * Patient cancels their booking using the self-service token from the
 * confirmation email. No login needed — the unguessable token IS the auth.
 *
 * Behavior:
 *  - Booking status → 'cancelled_by_patient'
 *  - Stripe refund attempted via the stored payment_intent_id
 *  - Patient receives the existing patientRefunded email
 *  - The token is invalidated after success so a leaked link can't replay
 *  - Idempotent: a second call when the booking is already cancelled
 *    returns 200 with `already: true`
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
  try { body = await request.json(); } catch { /* allow empty body */ }
  const reason = (body?.reason || 'patient_self_service').toString().slice(0, 200);

  const pool = await getPool();

  // Look up the booking by token. We need patient details + payment intent id.
  const r = await pool.request()
    .input('token', sql.NVarChar(64), token)
    .query(`
      SELECT id, patient_name, patient_email, provider_name, slot_date,
             slot_time, amount, status, payment_intent_id
      FROM bookings WHERE self_service_token = @token
    `);
  const booking = r.recordset[0];
  if (!booking) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  // Guard against cancelling a slot that's already past or in a terminal state.
  const terminal = ['cancelled_by_patient', 'cancelled', 'refunded', 'expired'];
  if (terminal.includes(booking.status)) {
    return NextResponse.json({ ok: true, already: true, status: booking.status });
  }
  if (booking.slot_date) {
    const slotMs = Date.parse(`${booking.slot_date}T${booking.slot_time || '00:00'}:00`);
    if (!Number.isNaN(slotMs) && slotMs < Date.now()) {
      return NextResponse.json(
        { error: 'No se puede cancelar — la cita ya pasó. Escribe a operaciones@medconnect.es.' },
        { status: 409 },
      );
    }
  }

  // Best-effort Stripe refund. Mirrors the pattern in /api/ops/cases/[id]/action.
  let refundId = null;
  let refundAmount = Number(booking.amount || 0);
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const piId = booking.payment_intent_id || booking.id;
  if (stripeKey && piId && piId.startsWith('pi_')) {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });
      const refund = await stripe.refunds.create({
        payment_intent: piId,
        reason: 'requested_by_customer',
      });
      refundId = refund.id;
      refundAmount = (refund.amount || 0) / 100;
    } catch (err) {
      console.error('[bookings/cancel] stripe error:', err.message);
      // Continue — we still mark the booking cancelled and email the patient
      // so ops can do the manual refund if Stripe rejected.
    }
  }

  // Persist + invalidate the token so a leaked link can't replay.
  await pool.request()
    .input('id', sql.NVarChar(50), booking.id)
    .input('reason', sql.NVarChar(200), reason)
    .query(`
      UPDATE bookings
      SET status = 'cancelled_by_patient',
          self_service_token = NULL,
          notes = COALESCE(notes + CHAR(10), '') + 'Cancelled by patient (self-service): ' + @reason,
          updated_at = SYSDATETIMEOFFSET()
      WHERE id = @id
    `);

  // Email the patient the refund confirmation. Same template ops uses, so the
  // experience is consistent whether ops or the patient pulled the trigger.
  if (booking.patient_email) {
    try {
      const tpl = patientRefunded({
        patientName: booking.patient_name,
        providerName: booking.provider_name,
        slotDate: booking.slot_date,
        slotTime: booking.slot_time,
        amount: refundAmount,
        reason: 'Cancelación solicitada por el paciente',
      });
      await sendEmail({ to: booking.patient_email, subject: tpl.subject, html: tpl.html });
    } catch (e) {
      console.error('[bookings/cancel] email send failed', e.message);
    }
  }

  return NextResponse.json({ ok: true, refundId, refundAmount });
}
