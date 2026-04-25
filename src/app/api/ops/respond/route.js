import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCaseByToken, updateCase, appendCallLog, CASE_STATUS } from '@/lib/opsCases';
import { sendEmail } from '@/lib/email';
import { patientFinalConfirmation, patientRefunded } from '@/lib/emailTemplates';

// Public endpoint — patient clicks accept/reject from the alternative-slot email.
// GET /api/ops/respond?token=...&decision=accept|reject
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const decision = searchParams.get('decision');

  if (!token || !['accept', 'reject'].includes(decision)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const c = await getCaseByToken(token);
  if (!c) return NextResponse.json({ error: 'Token not found or expired' }, { status: 404 });

  const terminal = [CASE_STATUS.CONFIRMED, CASE_STATUS.REFUNDED, CASE_STATUS.CANCELLED, CASE_STATUS.EXPIRED];
  if (terminal.includes(c.status)) {
    return NextResponse.json({ ok: true, already: c.status, decision: c.patient_decision });
  }

  if (decision === 'accept') {
    await updateCase(c.id, {
      status: CASE_STATUS.CONFIRMED,
      patient_decision: 'accepted',
    });
    if (c.patient_email) {
      const tpl = patientFinalConfirmation({
        patientName: c.patient_name,
        providerName: c.alternative_clinic_name || c.original_clinic_name,
        slotDate: c.alternative_slot_date || c.original_slot_date,
        slotTime: c.alternative_slot_time || c.original_slot_time,
      });
      await sendEmail({ to: c.patient_email, subject: tpl.subject, html: tpl.html });
    }
    await appendCallLog(c.id, 'Paciente aceptó la alternativa. Cita confirmada.', 'patient');
    return NextResponse.json({
      ok: true,
      decision: 'accepted',
      clinic: c.alternative_clinic_name || c.original_clinic_name,
      date: c.alternative_slot_date || c.original_slot_date,
      time: c.alternative_slot_time || c.original_slot_time,
    });
  }

  // reject → refund flow
  let refundId = null;
  let refundAmount = Number(c.amount_paid || 0);
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const piId = c.payment_intent_id || c.booking_id;
  if (stripeKey && piId) {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });
      const refund = await stripe.refunds.create({
        payment_intent: piId,
        reason: 'requested_by_customer',
      });
      refundId = refund.id;
      refundAmount = (refund.amount || 0) / 100;
    } catch (err) {
      console.error('[ops/respond] stripe refund error:', err.message);
    }
  }
  await updateCase(c.id, {
    status: CASE_STATUS.REFUNDED,
    patient_decision: 'rejected',
    refund_id: refundId,
    refund_amount: refundAmount,
    refund_reason: 'Paciente rechazó la alternativa propuesta',
  });
  if (c.patient_email) {
    const tpl = patientRefunded({
      patientName: c.patient_name,
      providerName: c.original_clinic_name,
      slotDate: c.original_slot_date,
      slotTime: c.original_slot_time,
      amount: refundAmount,
      reason: 'rechazaste la alternativa que te propusimos',
    });
    await sendEmail({ to: c.patient_email, subject: tpl.subject, html: tpl.html });
  }
  await appendCallLog(c.id, `Paciente rechazó. Reembolso ${refundId || 'manual'} de €${refundAmount}.`, 'patient');
  return NextResponse.json({ ok: true, decision: 'rejected', refundAmount });
}
