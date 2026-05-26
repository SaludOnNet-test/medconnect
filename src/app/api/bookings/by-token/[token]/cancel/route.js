import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { patientRefunded, clinicSaleCancellation } from '@/lib/emailTemplates';
import { bookingByTokenCancelSchema, formatZodError } from '@/lib/schemas';
import { clientError } from '@/lib/errors';
import { isRefundable, refundAmountFor } from '@/lib/refundPolicy';
import {
  getClinicNotificationConfig,
  resolveActiveClinicForBooking,
  CANCELLATION_REASON_LABELS,
} from '@/lib/clinicNotifications';

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
  const parsed = bookingByTokenCancelSchema.safeParse(body || {});
  if (!parsed.success) {
    return clientError(formatZodError(parsed.error), 400);
  }
  const reason = parsed.data.reason || 'patient_self_service';

  const pool = await getPool();

  // Look up the booking by token. We need patient details + payment intent id.
  // self_service_token_expires_at is COALESCE'd because legacy rows pre-
  // migration have a NULL there; we treat NULL as "not yet enforced".
  const r = await pool.request()
    .input('token', sql.NVarChar(64), token)
    .query(`
      SELECT id, patient_name, patient_email, provider_name, slot_date,
             slot_time, amount, status, payment_intent_id,
             has_insurance, service_price,
             self_service_token_expires_at
      FROM bookings WHERE self_service_token = @token
    `);
  const booking = r.recordset[0];
  if (!booking) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  if (booking.self_service_token_expires_at &&
      new Date(booking.self_service_token_expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'Este enlace de cancelación ha expirado. Escribe a operaciones@medconnect.es.' },
      { status: 410 },
    );
  }

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

  // Consult the refund policy. Política (decidida 2026-05-14):
  //   > 72h antes de la cita → reembolso completo
  //   <= 72h asegurado        → 0 €  (la consulta corre por su seguro)
  //   <= 72h sin-seguro       → service_price (la prioridad no es reembolsable)
  //
  // El paciente solo tiene self-service; si quiere forzar reembolso
  // fuera de cutoff debe escribir a Ops (mensaje al final si aplica).
  const policy = isRefundable(booking.slot_date, booking.slot_time, {
    hasInsurance: booking.has_insurance == null ? null : !!booking.has_insurance,
  });
  const totalPaid = Number(booking.amount || 0);
  const servicePrice = Number(booking.service_price || 0);
  const allowedRefund = refundAmountFor(policy, { amount: totalPaid, servicePrice });

  if (!policy.allowed && allowedRefund === 0) {
    // Pasado el cutoff y sin servicio que devolver: rechazamos la
    // cancelación con un 200 + ok:false. Ops puede aún forzarla.
    return NextResponse.json({
      ok: false,
      reason: 'outside_cutoff',
      message: 'La cita es en menos de 72 h. La prioridad no es reembolsable. Escribe a operaciones@medconnect.es si crees que aplica una excepción.',
      policy,
    }, { status: 409 });
  }

  // Best-effort Stripe refund por el importe que la política permite.
  let refundId = null;
  let refundAmount = allowedRefund;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const piId = booking.payment_intent_id || booking.id;
  if (stripeKey && piId && piId.startsWith('pi_') && allowedRefund > 0) {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });
      // Idempotency-Key bound to the booking id makes a double-clicking
      // patient — or a Vercel retry on a crashed Lambda — safe: Stripe
      // returns the same refund object instead of creating a second one.
      const refundParams = {
        payment_intent: piId,
        reason: 'requested_by_customer',
      };
      // Refund partial when the policy is service_only — pasamos amount
      // en cents para que Stripe no devuelva el total.
      if (allowedRefund < totalPaid) {
        refundParams.amount = Math.round(allowedRefund * 100);
      }
      const refund = await stripe.refunds.create(
        refundParams,
        { idempotencyKey: `refund_${booking.id}` },
      );
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

  // ── Clinic notification: patient self-service cancellation ───────────
  // Fire-and-forget. Resolve the *active* clinic (the one currently
  // expecting the patient — may be the original or an ops alternative).
  resolveActiveClinicForBooking(booking.id)
    .then(async (activeClinicId) => {
      if (!activeClinicId) return;
      const cfg = await getClinicNotificationConfig(activeClinicId);
      if (!cfg || !cfg.enabled || !cfg.email) return;
      const tpl = clinicSaleCancellation({
        clinicName: cfg.clinicName || booking.provider_name,
        bookingId: booking.id,
        patientName: booking.patient_name,
        patientEmail: booking.patient_email,
        slotDate: booking.slot_date,
        slotTime: booking.slot_time,
        reason: 'El paciente canceló su cita desde el enlace del email de confirmación.',
        reasonLabel: CANCELLATION_REASON_LABELS.self_service,
        refundAmount,
      });
      await sendEmail({ to: cfg.email, subject: tpl.subject, html: tpl.html });
    })
    .catch((e) => console.error('[bookings/cancel] clinic notification failed', e?.message));

  return NextResponse.json({ ok: true, refundId, refundAmount });
}
