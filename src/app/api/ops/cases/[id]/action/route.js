import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCase, updateCase, appendCallLog, CASE_STATUS } from '@/lib/opsCases';
import { requireRole } from '@/lib/adminAuth';
import { sendEmail } from '@/lib/email';
import { query, sql } from '@/lib/db';
import {
  patientFinalConfirmation,
  patientAlternativeSlot,
  patientRefunded,
  clinicConfirmationWithOnboarding,
} from '@/lib/emailTemplates';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://medconnect-bay.vercel.app';

async function notifyConfirmation(c) {
  if (!c.patient_email) return;
  const tpl = patientFinalConfirmation({
    patientName: c.patient_name,
    providerName: c.original_clinic_name,
    slotDate: c.original_slot_date,
    slotTime: c.original_slot_time,
    address: c.patient_address || null,
    hasInsurance: !!c.has_insurance,
  });
  await sendEmail({ to: c.patient_email, subject: tpl.subject, html: tpl.html });
}

/**
 * After the clinic accepts a booking, mirror the patient-facing confirmation
 * to the clinic with full patient details + an onboarding CTA.
 *
 * Email resolution order:
 *  1. `clinicEmail` explicitly provided in the request body (operator typed it).
 *  2. The `admin_users.username` for the clinic's pro user (when the clinic
 *     is already onboarded — username is the email per Clerk).
 *  3. Skip and log — without an email we can't notify; the operator can
 *     still forward manually from their own mailbox.
 *
 * Always best-effort: failure here must NOT break the case-confirmation flow
 * the patient is waiting on.
 */
async function notifyClinicConfirmation(c, providedEmail) {
  try {
    let to = (providedEmail || '').trim().toLowerCase() || null;
    let alreadyOnboarded = false;

    if (!to && c.original_clinic_id) {
      const r = await query(
        `SELECT TOP 1 username FROM admin_users
         WHERE clinic_id = @cid AND role = 'professional' AND is_active = 1`,
        { cid: { type: sql.Int, value: Number(c.original_clinic_id) } },
      );
      if (r.recordset[0]) {
        to = r.recordset[0].username;
        alreadyOnboarded = true;
      }
    }

    if (!to) {
      console.warn('[ops/clinic-confirm] no clinic email resolved for case', c.id, 'clinic', c.original_clinic_id);
      return { sent: false, reason: 'no_email_on_file' };
    }

    const clinicIdParam = c.original_clinic_id ? `&clinic=${c.original_clinic_id}` : '';
    const tpl = clinicConfirmationWithOnboarding({
      clinicName: c.original_clinic_name,
      patientName: c.patient_name,
      patientPhone: c.patient_phone,
      patientEmail: c.patient_email,
      specialty: c.specialty,
      slotDate: c.original_slot_date,
      slotTime: c.original_slot_time,
      hasInsurance: c.has_insurance == null ? null : !!c.has_insurance,
      insuranceCompany: c.insurance_company,
      onboardingUrl: `${BASE_URL}/pro/onboarding?from=case${clinicIdParam}`,
      alreadyOnboarded,
    });
    await sendEmail({ to, subject: tpl.subject, html: tpl.html });
    return { sent: true, to, alreadyOnboarded };
  } catch (err) {
    // Never let a clinic-confirmation failure block the patient flow.
    console.error('[ops/clinic-confirm] failed to send', err?.message);
    return { sent: false, reason: 'error' };
  }
}

async function notifyAlternative(c) {
  if (!c.patient_email || !c.patient_response_token) return;
  const tpl = patientAlternativeSlot({
    patientName: c.patient_name,
    originalClinicName: c.original_clinic_name,
    originalDate: c.original_slot_date,
    originalTime: c.original_slot_time,
    alternativeClinicName: c.alternative_clinic_name,
    alternativeDate: c.alternative_slot_date,
    alternativeTime: c.alternative_slot_time,
    alternativeReason: c.alternative_reason,
    acceptUrl: `${BASE_URL}/booking/respond?token=${c.patient_response_token}&decision=accept`,
    rejectUrl: `${BASE_URL}/booking/respond?token=${c.patient_response_token}&decision=reject`,
  });
  await sendEmail({ to: c.patient_email, subject: tpl.subject, html: tpl.html });
}

async function issueRefund(c, reason) {
  // Stripe refund (best-effort; if stripe not configured, mark as refunded but log)
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
        { idempotencyKey: `ops_action_refund_${c.id}` },
      );
      refundId = refund.id;
      refundAmount = (refund.amount || 0) / 100;
    } catch (err) {
      console.error('[ops/refund] stripe error:', err.message);
    }
  }
  await updateCase(c.id, {
    status: CASE_STATUS.REFUNDED,
    refund_id: refundId,
    refund_amount: refundAmount,
    refund_reason: reason || null,
  });
  if (c.patient_email) {
    const tpl = patientRefunded({
      patientName: c.patient_name,
      providerName: c.original_clinic_name,
      slotDate: c.original_slot_date,
      slotTime: c.original_slot_time,
      amount: refundAmount,
      reason,
    });
    await sendEmail({ to: c.patient_email, subject: tpl.subject, html: tpl.html });
  }
  return { refundId, refundAmount };
}

export async function POST(request, { params }) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;
  const session = rr;

  const { id } = await params;
  const body = await request.json();
  const action = body.action;

  let c = await getCase(id);
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    switch (action) {
      case 'clinic_accepted': {
        await updateCase(id, { status: CASE_STATUS.CLINIC_ACCEPTED, assigned_to: session.username });
        c = await getCase(id);
        await notifyConfirmation(c);
        // Best-effort: also email the clinic with the booking + onboarding CTA.
        // `clinicEmail` is an optional override from the operator UI for
        // clinics not yet on the platform (where admin_users lookup fails).
        const clinicMail = await notifyClinicConfirmation(c, body.clinicEmail);
        await updateCase(id, { status: CASE_STATUS.CONFIRMED });
        const tail = clinicMail.sent
          ? ` Email a clínica enviado a ${clinicMail.to}${clinicMail.alreadyOnboarded ? ' (ya onboarded)' : ' (CTA onboarding)'}`
          : ` Email a clínica no enviado: ${clinicMail.reason || 'desconocido'}.`;
        await appendCallLog(id, 'Clínica aceptó el slot original. Cita confirmada al paciente.' + tail, session.username);
        break;
      }
      case 'clinic_proposed_alternative': {
        const { altDate, altTime, reason } = body;
        if (!altDate || !altTime) {
          return NextResponse.json({ error: 'altDate and altTime are required' }, { status: 400 });
        }
        await updateCase(id, {
          status: CASE_STATUS.CLINIC_PROPOSED_ALTERNATIVE,
          alternative_clinic_id: c.original_clinic_id,
          alternative_clinic_name: c.original_clinic_name,
          alternative_slot_date: altDate,
          alternative_slot_time: altTime,
          alternative_reason: reason || 'la clínica no puede atenderte exactamente a esa hora',
          assigned_to: session.username,
        });
        c = await getCase(id);
        await notifyAlternative(c);
        await appendCallLog(id, `Clínica propone ${altDate} ${altTime}. Email enviado al paciente.`, session.username);
        break;
      }
      case 'clinic_rejected': {
        await updateCase(id, { status: CASE_STATUS.CLINIC_REJECTED_SEARCHING, assigned_to: session.username });
        await appendCallLog(id, 'Clínica rechazó. Buscando clínica alternativa.', session.username);
        break;
      }
      case 'alternative_clinic_proposed': {
        const { altClinicId, altClinicName, altDate, altTime, reason } = body;
        if (!altClinicName || !altDate || !altTime) {
          return NextResponse.json({ error: 'altClinicName, altDate, altTime are required' }, { status: 400 });
        }
        await updateCase(id, {
          status: CASE_STATUS.ALTERNATIVE_CLINIC_PROPOSED,
          alternative_clinic_id: altClinicId || null,
          alternative_clinic_name: altClinicName,
          alternative_slot_date: altDate,
          alternative_slot_time: altTime,
          alternative_reason: reason || 'la clínica original no podía atenderte y encontramos esta alternativa',
          assigned_to: session.username,
        });
        c = await getCase(id);
        await notifyAlternative(c);
        await appendCallLog(id, `Alternativa propuesta: ${altClinicName} ${altDate} ${altTime}. Email al paciente.`, session.username);
        break;
      }
      case 'no_alternative_refund': {
        await updateCase(id, { status: CASE_STATUS.NO_ALTERNATIVE_REFUNDING, assigned_to: session.username });
        c = await getCase(id);
        const r = await issueRefund(c, body.reason || 'No encontramos clínica alternativa que te encaje');
        await appendCallLog(id, `Sin alternativa. Reembolso ${r.refundId || 'manual'} de €${r.refundAmount}.`, session.username);
        break;
      }
      case 'refund': {
        const r = await issueRefund(c, body.reason || 'Reembolso emitido por el operador');
        await appendCallLog(id, `Reembolso manual ${r.refundId || '(stripe pending)'} de €${r.refundAmount}.`, session.username);
        break;
      }
      case 'cancel': {
        await updateCase(id, { status: CASE_STATUS.CANCELLED, ops_notes: body.reason || null });
        await appendCallLog(id, `Caso cancelado: ${body.reason || 'sin motivo'}.`, session.username);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const updated = await getCase(id);
    return NextResponse.json({ case: updated });
  } catch (err) {
    console.error('[ops/cases/action]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
