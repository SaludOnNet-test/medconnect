import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCaseByToken, updateCase, appendCallLog, CASE_STATUS } from '@/lib/opsCases';
import { sendEmail } from '@/lib/email';
import { patientFinalConfirmation, patientRefunded, clinicSaleNotification, clinicSaleCancellation } from '@/lib/emailTemplates';
import {
  getClinicNotificationConfig,
  CHANNEL_LABELS,
  CANCELLATION_REASON_LABELS,
} from '@/lib/clinicNotifications';
import { query, sql } from '@/lib/db';

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
        hasInsurance: !!c.has_insurance,
      });
      await sendEmail({ to: c.patient_email, subject: tpl.subject, html: tpl.html });
    }
    await appendCallLog(c.id, 'Paciente aceptó la alternativa. Cita confirmada.', 'patient');

    // ── Clinic notifications: path 4 (alternative accepted) ───────────
    // Two emails, both fire-and-forget so a Resend hiccup doesn't break
    // the patient response endpoint:
    //   (a) New sale at the alternative clinic — they need agenda visibility.
    //   (b) Cancellation at the original clinic — they got a sale email at
    //       booking creation and need to know that slot is now free.
    notifyAlternativeAcceptedClinics(c).catch((e) =>
      console.error('[ops/respond] clinic notifications failed', e?.message),
    );

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
      const refund = await stripe.refunds.create(
        {
          payment_intent: piId,
          reason: 'requested_by_customer',
        },
        { idempotencyKey: `ops_refund_case_${c.id}` },
      );
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

  // ── Clinic notification: cancellation at the ORIGINAL clinic ──────────
  // The original clinic was notified at booking creation; they now need
  // to know the sale fell through so the agenda slot is freed.
  notifyClinicCancellation({
    clinicId: c.original_clinic_id,
    bookingId: c.booking_id,
    patientName: c.patient_name,
    patientEmail: c.patient_email,
    slotDate: c.original_slot_date,
    slotTime: c.original_slot_time,
    reasonLabel: CANCELLATION_REASON_LABELS.ops_refund,
    reason: 'El paciente rechazó la alternativa propuesta — se emitió un reembolso.',
    refundAmount,
  }).catch((e) =>
    console.error('[ops/respond] cancellation notification failed', e?.message),
  );

  return NextResponse.json({ ok: true, decision: 'rejected', refundAmount });
}

// ─────────────────────────────────────────────────────────────────────────
// Clinic notification helpers (path 4 — alternative flow)
// ─────────────────────────────────────────────────────────────────────────

async function notifyAlternativeAcceptedClinics(c) {
  // Pull the extra booking + referral fields the sale template needs.
  // getCaseByToken's projection is intentionally minimal, so we re-fetch
  // here rather than bloating that helper.
  let extra = {};
  try {
    const r = await query(
      `SELECT TOP 1
         b.patient_phone, b.specialty, b.procedure_name, b.service_price,
         b.platform_fee, b.has_insurance, b.insurance_company, b.amount,
         oc.referral_id,
         rf.professional_email AS derivador_email,
         rf.provider_name      AS derivador_clinic_name
       FROM bookings b
       LEFT JOIN operations_cases oc ON oc.booking_id = b.id
       LEFT JOIN referrals rf        ON rf.id = oc.referral_id
       WHERE b.id = @id`,
      { id: { type: sql.NVarChar(50), value: c.booking_id } },
    );
    extra = r.recordset[0] || {};
  } catch (e) {
    console.error('[ops/respond] booking extra lookup', e?.message);
  }

  // (a) Sale notification → ALTERNATIVE clinic.
  if (c.alternative_clinic_id) {
    try {
      const cfg = await getClinicNotificationConfig(c.alternative_clinic_id);
      if (cfg && cfg.enabled && cfg.email) {
        const tpl = clinicSaleNotification({
          clinicName: cfg.clinicName || c.alternative_clinic_name,
          bookingId: c.booking_id,
          referralId: extra.referral_id || null,
          channel: 'alternativa_propuesta_por_ops',
          channelLabel: CHANNEL_LABELS.alternativa_propuesta_por_ops,
          patientName: c.patient_name,
          patientEmail: c.patient_email,
          patientPhone: extra.patient_phone,
          specialty: extra.specialty,
          procedureName: extra.procedure_name,
          slotDate: c.alternative_slot_date,
          slotTime: c.alternative_slot_time,
          status: 'confirmed',
          amountPaid: extra.amount != null ? Number(extra.amount) : null,
          servicePrice: extra.service_price != null ? Number(extra.service_price) : null,
          platformFee: extra.platform_fee != null ? Number(extra.platform_fee) : null,
          hasInsurance: extra.has_insurance == null ? null : !!extra.has_insurance,
          insuranceCompany: extra.insurance_company,
          derivadorEmail: extra.derivador_email || null,
          derivadorClinicName: extra.derivador_clinic_name || null,
        });
        await sendEmail({ to: cfg.email, subject: tpl.subject, html: tpl.html });
      }
    } catch (e) {
      console.error('[ops/respond] sale notification to alt clinic failed', e?.message);
    }
  }

  // (b) Cancellation notification → ORIGINAL clinic.
  if (c.original_clinic_id) {
    await notifyClinicCancellation({
      clinicId: c.original_clinic_id,
      bookingId: c.booking_id,
      patientName: c.patient_name,
      patientEmail: c.patient_email,
      slotDate: c.original_slot_date,
      slotTime: c.original_slot_time,
      reasonLabel: 'Reasignación a otra clínica',
      reason: `El paciente aceptó la alternativa en ${c.alternative_clinic_name || 'otra clínica'}. Podéis liberar el hueco.`,
    });
  }
}

async function notifyClinicCancellation({
  clinicId, bookingId, patientName, patientEmail, slotDate, slotTime,
  reasonLabel, reason, refundAmount,
}) {
  if (!clinicId) return;
  const cfg = await getClinicNotificationConfig(clinicId);
  if (!cfg || !cfg.enabled || !cfg.email) return;
  try {
    const tpl = clinicSaleCancellation({
      clinicName: cfg.clinicName,
      bookingId,
      patientName,
      patientEmail,
      slotDate,
      slotTime,
      reason,
      reasonLabel,
      refundAmount,
    });
    await sendEmail({ to: cfg.email, subject: tpl.subject, html: tpl.html });
  } catch (e) {
    console.error('[ops/respond] clinicSaleCancellation send failed', e?.message);
  }
}
