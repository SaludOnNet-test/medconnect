import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCase, updateCase, appendCallLog, CASE_STATUS } from '@/lib/opsCases';
import { requireRole } from '@/lib/adminAuth';
import { sendEmail } from '@/lib/email';
import { query, sql } from '@/lib/db';
import { isRefundable, refundAmountFor } from '@/lib/refundPolicy';
import {
  patientFinalConfirmation,
  patientAlternativeSlot,
  patientRefunded,
  clinicConfirmationWithOnboarding,
  clinicSaleCancellation,
} from '@/lib/emailTemplates';
import {
  getClinicNotificationConfig,
  resolveActiveClinicForBooking,
  CANCELLATION_REASON_LABELS,
} from '@/lib/clinicNotifications';
import { notifyInternalWatcher } from '@/lib/internalWatcher';

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
  // Resolve the destination clinic's address from the DB so the email
  // shows the real street/city instead of just a name. Best-effort —
  // if the lookup fails (legacy alternative_clinic_id is null because
  // the operator typed the name free-text), the email still gets sent
  // with just the clinic name.
  let alternativeAddress = null;
  let alternativeCity = null;
  if (c.alternative_clinic_id) {
    try {
      const r = await query(
        `SELECT TOP 1 address, city FROM clinics WHERE id = @id`,
        { id: { type: sql.Int, value: Number(c.alternative_clinic_id) } },
      );
      const row = r.recordset[0];
      if (row) {
        alternativeAddress = row.address || null;
        alternativeCity = row.city || null;
      }
    } catch (err) {
      console.error('[ops/notifyAlternative] clinic address lookup', err?.message);
    }
  }
  const tpl = patientAlternativeSlot({
    patientName: c.patient_name,
    originalClinicName: c.original_clinic_name,
    originalDate: c.original_slot_date,
    originalTime: c.original_slot_time,
    alternativeClinicName: c.alternative_clinic_name,
    alternativeAddress,
    alternativeCity,
    alternativeDate: c.alternative_slot_date,
    alternativeTime: c.alternative_slot_time,
    alternativeReason: c.alternative_reason,
    acceptUrl: `${BASE_URL}/booking/respond?token=${c.patient_response_token}&decision=accept`,
    rejectUrl: `${BASE_URL}/booking/respond?token=${c.patient_response_token}&decision=reject`,
  });
  await sendEmail({ to: c.patient_email, subject: tpl.subject, html: tpl.html });
}

// Best-effort cancellation/refund notification to the destination clinic
// (the one currently expecting the patient — may be original or, if the
// patient previously accepted an alternative, the alternative). Resolves
// the active clinic via the shared helper. Fire-and-forget so a Resend
// hiccup doesn't break the ops action.
async function notifyClinicOfOpsCancellation(c, { reasonLabel, reason, refundAmount }) {
  try {
    const activeClinicId = await resolveActiveClinicForBooking(c.booking_id);
    if (!activeClinicId) return;
    const cfg = await getClinicNotificationConfig(activeClinicId);
    if (!cfg || !cfg.enabled || !cfg.email) return;
    // Slot info: prefer the alternative when one was confirmed.
    const slotDate = c.alternative_slot_date || c.original_slot_date;
    const slotTime = c.alternative_slot_time || c.original_slot_time;
    const tpl = clinicSaleCancellation({
      clinicName: cfg.clinicName,
      bookingId: c.booking_id,
      patientName: c.patient_name,
      patientEmail: c.patient_email,
      slotDate,
      slotTime,
      reason,
      reasonLabel,
      refundAmount,
    });
    await sendEmail({ to: cfg.email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error('[ops/cases/action] clinic cancellation notification failed', err?.message);
  }
}

async function issueRefund(c, reason, opts = {}) {
  // Consult the refund policy. By default Ops follows it (cutoff = slot − 72 h,
  // sin-seguro fuera de cutoff recupera servicio, asegurado fuera de cutoff
  // no recupera nada). Ops PUEDE forzar un refund total fuera de cutoff
  // pasando opts.override = true — queda registrado en el call_log con
  // un flag explícito para auditoría.
  const policy = isRefundable(c.original_slot_date, c.original_slot_time, {
    hasInsurance: c.has_insurance == null ? null : !!c.has_insurance,
  });
  const totalPaid = Number(c.amount_paid || 0);
  const servicePrice = Number(c.service_price || 0);
  const policyAmount = refundAmountFor(policy, { amount: totalPaid, servicePrice });
  const policyAllowed = policy.allowed;
  const forced = opts.override === true;

  // The actual amount to refund: policy says X. If the operator forces an
  // override, we refund the full amount paid. Otherwise we cap at the
  // policy amount.
  const targetAmount = forced ? totalPaid : policyAmount;

  let refundId = null;
  let refundAmount = targetAmount;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const piId = c.payment_intent_id || c.booking_id;
  if (stripeKey && piId && targetAmount > 0) {
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });
      const refundParams = {
        payment_intent: piId,
        reason: 'requested_by_customer',
      };
      // Stripe refunds in cents. If the target is < total paid, pass
      // the explicit amount; otherwise omit and Stripe defaults to full.
      if (targetAmount < totalPaid) {
        refundParams.amount = Math.round(targetAmount * 100);
      }
      const refund = await stripe.refunds.create(
        refundParams,
        { idempotencyKey: `ops_action_refund_${c.id}` },
      );
      refundId = refund.id;
      refundAmount = (refund.amount || 0) / 100;
    } catch (err) {
      console.error('[ops/refund] stripe error:', err.message);
    }
  }

  // Compose reason with policy context so the call log has full provenance.
  const fullReason = (() => {
    const parts = [reason || 'Reembolso emitido por el operador'];
    parts.push(`política: ${policy.refundableAmount}${policyAllowed ? ' (dentro de cutoff)' : ' (fuera de cutoff)'}`);
    if (forced && !policyAllowed) parts.push('ANULACIÓN OPS · refund total forzado fuera de cutoff');
    if (forced && policy.refundableAmount === 'service_only') parts.push('ANULACIÓN OPS · refund total forzado (política decía service_only)');
    return parts.join(' · ');
  })();

  await updateCase(c.id, {
    status: CASE_STATUS.REFUNDED,
    refund_id: refundId,
    refund_amount: refundAmount,
    refund_reason: fullReason,
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
  return { refundId, refundAmount, policy, forced };
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
        notifyInternalWatcher({
          kind: 'clinic_accepted',
          summary: `${c.patient_name || 'paciente'} · ${c.original_clinic_name || ''}`,
          booking: { id: c.booking_id, patientName: c.patient_name, patientEmail: c.patient_email },
          case: c,
          extra: { 'Ops user': session.username, 'Email a clínica': clinicMail.sent ? clinicMail.to : `no enviado (${clinicMail.reason})` },
        });
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
          // Stamp the proposal time so the Ops dashboard can compute the
          // 24h response window (Aceptada / Rechazada / Sin respuesta /
          // Expirada). Reset patient_decision in case this is a re-proposal
          // after a previous expired round.
          alternative_proposed_at: new Date().toISOString(),
          patient_decision: null,
          assigned_to: session.username,
        });
        c = await getCase(id);
        await notifyAlternative(c);
        await appendCallLog(id, `Clínica propone ${altDate} ${altTime}. Email enviado al paciente. Tiene 24 h para responder.`, session.username);
        notifyInternalWatcher({
          kind: 'alternative_proposed',
          summary: `${c.patient_name || 'paciente'} · misma clínica, nuevo slot ${altDate} ${altTime}`,
          booking: { id: c.booking_id, patientName: c.patient_name, patientEmail: c.patient_email },
          case: c,
          extra: { 'Tipo': 'misma clínica, nuevo slot', 'Ops user': session.username, 'Motivo': reason || '—' },
        });
        break;
      }
      case 'clinic_rejected': {
        await updateCase(id, { status: CASE_STATUS.CLINIC_REJECTED_SEARCHING, assigned_to: session.username });
        await appendCallLog(id, 'Clínica rechazó. Buscando clínica alternativa.', session.username);
        notifyInternalWatcher({
          kind: 'clinic_rejected',
          summary: `${c.patient_name || 'paciente'} · ${c.original_clinic_name || ''} rechazó — buscando alternativa`,
          booking: { id: c.booking_id, patientName: c.patient_name, patientEmail: c.patient_email },
          case: c,
          extra: { 'Ops user': session.username },
        });
        break;
      }
      case 'alternative_clinic_proposed': {
        const { altClinicId, altClinicName, altDate, altTime, reason } = body;
        if (!altClinicName || !altDate || !altTime) {
          return NextResponse.json({ error: 'altClinicName, altDate, altTime are required' }, { status: 400 });
        }
        // altClinicId is now required when the operator picked from the
        // typeahead (which only lists real DB clinics). We tolerate null
        // for legacy callers but log a warning so it's visible.
        if (!altClinicId) {
          console.warn('[ops/action] alternative_clinic_proposed without altClinicId — paciente recibirá nombre sin dirección. Use el typeahead.');
        }
        await updateCase(id, {
          status: CASE_STATUS.ALTERNATIVE_CLINIC_PROPOSED,
          alternative_clinic_id: altClinicId || null,
          alternative_clinic_name: altClinicName,
          alternative_slot_date: altDate,
          alternative_slot_time: altTime,
          alternative_reason: reason || 'la clínica original no podía atenderte y encontramos esta alternativa',
          // 24 h response window — see clinic_proposed_alternative for
          // rationale. Same fields, same UI computation.
          alternative_proposed_at: new Date().toISOString(),
          patient_decision: null,
          assigned_to: session.username,
        });
        c = await getCase(id);
        await notifyAlternative(c);
        await appendCallLog(id, `Alternativa propuesta: ${altClinicName} ${altDate} ${altTime}. Email al paciente. Tiene 24 h para responder.`, session.username);
        notifyInternalWatcher({
          kind: 'alternative_proposed',
          summary: `${c.patient_name || 'paciente'} · cambio de clínica → ${altClinicName} ${altDate} ${altTime}`,
          booking: { id: c.booking_id, patientName: c.patient_name, patientEmail: c.patient_email },
          case: c,
          extra: { 'Tipo': 'clínica alternativa', 'Ops user': session.username, 'Motivo': reason || '—' },
        });
        break;
      }
      case 'no_alternative_refund': {
        // El motivo es obligatorio en TODOS los refunds — incluido este
        // que la mayoría de las veces es un valor por defecto. Ops debe
        // explicitar (clínica no contesta, paciente pidió alta…) para que
        // el log del caso refleje la decisión.
        const reasonRaw = String(body.reason || '').trim();
        if (reasonRaw.length < 3) {
          return NextResponse.json(
            { error: 'reason is required (mínimo 3 caracteres) — explica por qué reembolsas' },
            { status: 400 },
          );
        }
        await updateCase(id, { status: CASE_STATUS.NO_ALTERNATIVE_REFUNDING, assigned_to: session.username });
        c = await getCase(id);
        const r = await issueRefund(c, reasonRaw, { override: body.overrideCutoff === true });
        const tail = r.forced ? ' (override fuera de cutoff)' : '';
        await appendCallLog(
          id,
          `Sin alternativa. Reembolso ${r.refundId || 'manual'} de €${r.refundAmount}${tail}. Motivo: ${reasonRaw}`,
          session.username,
        );
        notifyClinicOfOpsCancellation(c, {
          reasonLabel: CANCELLATION_REASON_LABELS.ops_refund,
          reason: `Sin alternativa disponible — reembolso emitido. ${reasonRaw}`,
          refundAmount: r.refundAmount,
        }).catch(() => {});
        notifyInternalWatcher({
          kind: 'refunded',
          summary: `${c.patient_name || 'paciente'} · sin alternativa · €${r.refundAmount}`,
          booking: { id: c.booking_id, patientName: c.patient_name, patientEmail: c.patient_email },
          case: c,
          extra: { 'Ops user': session.username, 'Motivo': reasonRaw, 'Refund €': r.refundAmount, 'Refund Stripe ID': r.refundId, 'Override fuera de cutoff': r.forced || null },
        });
        break;
      }
      case 'refund': {
        // Mismo gate: el motivo es obligatorio.
        const reasonRaw = String(body.reason || '').trim();
        if (reasonRaw.length < 3) {
          return NextResponse.json(
            { error: 'reason is required (mínimo 3 caracteres) — explica por qué reembolsas' },
            { status: 400 },
          );
        }
        const r = await issueRefund(c, reasonRaw, { override: body.overrideCutoff === true });
        const tail = r.forced ? ' (override fuera de cutoff)' : '';
        await appendCallLog(
          id,
          `Reembolso manual ${r.refundId || '(stripe pending)'} de €${r.refundAmount}${tail}. Motivo: ${reasonRaw}`,
          session.username,
        );
        notifyClinicOfOpsCancellation(c, {
          reasonLabel: CANCELLATION_REASON_LABELS.ops_refund,
          reason: `Reembolso manual de Operaciones. ${reasonRaw}`,
          refundAmount: r.refundAmount,
        }).catch(() => {});
        notifyInternalWatcher({
          kind: 'refunded',
          summary: `${c.patient_name || 'paciente'} · refund manual · €${r.refundAmount}`,
          booking: { id: c.booking_id, patientName: c.patient_name, patientEmail: c.patient_email },
          case: c,
          extra: { 'Ops user': session.username, 'Motivo': reasonRaw, 'Refund €': r.refundAmount, 'Refund Stripe ID': r.refundId, 'Override fuera de cutoff': r.forced || null },
        });
        break;
      }
      case 'cancel': {
        await updateCase(id, { status: CASE_STATUS.CANCELLED, ops_notes: body.reason || null });
        await appendCallLog(id, `Caso cancelado: ${body.reason || 'sin motivo'}.`, session.username);
        notifyClinicOfOpsCancellation(c, {
          reasonLabel: CANCELLATION_REASON_LABELS.ops_cancel,
          reason: body.reason || 'El caso fue cancelado por el equipo de Operaciones.',
        }).catch(() => {});
        notifyInternalWatcher({
          kind: 'cancelled',
          summary: `${c.patient_name || 'paciente'} · ${c.original_clinic_name || ''} (ops cancel)`,
          booking: { id: c.booking_id, patientName: c.patient_name, patientEmail: c.patient_email },
          case: c,
          extra: { 'Ops user': session.username, 'Origen': 'Ops cancel', 'Motivo': body.reason || '—' },
        });
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
