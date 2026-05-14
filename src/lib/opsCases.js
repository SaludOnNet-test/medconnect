// Operations cases — state machine and persistence helpers.
// See docs/OPERATIONS_MANUAL.md for the business flow.

import crypto from 'crypto';
import { query, sql, DB_AVAILABLE } from '@/lib/db';

// ── State machine ──────────────────────────────────────────────────────────
//
// pending_call ──────────► clinic_accepted ──────────► confirmed
//      │                          (slot original)
//      ├─────────────────► clinic_proposed_alternative ──► patient_accepted
//      │                                                 ├► patient_rejected_refunding ──► refunded
//      │
//      └─────────────────► clinic_rejected_searching
//                                  │
//                                  └► alternative_clinic_proposed ──► patient_accepted
//                                  │                                ├► patient_rejected_refunding ──► refunded
//                                  └► no_alternative_refunding ──► refunded
//
// terminal: confirmed | refunded | expired | cancelled

export const CASE_STATUS = {
  PENDING_CALL: 'pending_call',
  CLINIC_ACCEPTED: 'clinic_accepted',
  CLINIC_PROPOSED_ALTERNATIVE: 'clinic_proposed_alternative',
  CLINIC_REJECTED_SEARCHING: 'clinic_rejected_searching',
  ALTERNATIVE_CLINIC_PROPOSED: 'alternative_clinic_proposed',
  PATIENT_ACCEPTED: 'patient_accepted',
  PATIENT_REJECTED_REFUNDING: 'patient_rejected_refunding',
  NO_ALTERNATIVE_REFUNDING: 'no_alternative_refunding',
  CONFIRMED: 'confirmed',
  REFUNDED: 'refunded',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

export const TERMINAL_STATUSES = new Set([
  CASE_STATUS.CONFIRMED,
  CASE_STATUS.REFUNDED,
  CASE_STATUS.EXPIRED,
  CASE_STATUS.CANCELLED,
]);

// ── CRUD ───────────────────────────────────────────────────────────────────

export async function createCaseForBooking(booking) {
  if (!DB_AVAILABLE) return null;
  const token = crypto.randomBytes(24).toString('hex');

  // Tier is derived from the platform fee (slot price), NOT from the total
  // amount. For sin-seguro bookings the total includes the SON catalogue price
  // for the procedure, which would skew the tier classification.
  const amount = Number(booking.amount || 0);
  const tierBasis = Number(booking.platformFee ?? booking.amount ?? 0);
  let tier = 4;
  let paymentToClinic = 2;
  if (tierBasis >= 25)      { tier = 1; paymentToClinic = 15; }
  else if (tierBasis >= 15) { tier = 2; paymentToClinic = 10; }
  else if (tierBasis >= 7)  { tier = 3; paymentToClinic = 5; }

  // When the booking came from an external lock-in derivation, surface that
  // context to the operator: the case detail will show a banner and the
  // initial call_log entry primes Raquel with "this is from a referral —
  // here's who derived it, here's the destination clinic, your job is the
  // same as a direct case (confirm the slot or find an alternative)".
  // Persisted via best-effort: pre-migration DBs without referral_id keep
  // working — the column write is wrapped in a fallback INSERT.
  const ctx = booking.referralContext || null;
  const referralId = booking.referralId || null;
  const initialCallLog = ctx
    ? `[${new Date().toISOString()}] [sistema] Caso creado por derivación externa de "${ctx.derivadorClinicName || ctx.derivadorEmail || 'una clínica del marketplace'}". ` +
      `Paciente ya pagó la prioridad. ` +
      `Llama a "${booking.providerName || 'la clínica receptora'}" para confirmar el hueco. ` +
      `Si no están dados de alta en Medconnect, el botón "✓ Aceptar" envía un email con datos del paciente + enlace de onboarding.`
    : null;

  const baseParams = {
    booking_id: { type: sql.NVarChar(50), value: booking.id },
    clinic_id: { type: sql.Int, value: booking.providerId ?? null },
    clinic_name: { type: sql.NVarChar(255), value: booking.providerName ?? null },
    slot_date: { type: sql.NVarChar(20), value: booking.slotDate ?? null },
    slot_time: { type: sql.NVarChar(10), value: booking.slotTime ?? null },
    amount: { type: sql.Decimal(10, 2), value: amount },
    payment: { type: sql.Decimal(10, 2), value: paymentToClinic },
    tier: { type: sql.TinyInt, value: tier },
    token: { type: sql.NVarChar(80), value: token },
  };

  let insert;
  try {
    insert = await query(
      `INSERT INTO operations_cases
       (booking_id, status,
        original_clinic_id, original_clinic_name, original_slot_date, original_slot_time,
        amount_paid, payment_to_clinic, tier,
        patient_response_token, referral_id, call_log)
       OUTPUT INSERTED.id
       VALUES (@booking_id, 'pending_call',
         @clinic_id, @clinic_name, @slot_date, @slot_time,
         @amount, @payment, @tier, @token, @referral_id, @call_log)`,
      {
        ...baseParams,
        referral_id: { type: sql.NVarChar(50), value: referralId },
        call_log: { type: sql.NVarChar(sql.MAX), value: initialCallLog },
      },
    );
  } catch (err) {
    if (!String(err?.message || '').includes('Invalid column name')) throw err;
    // Pre-migration fallback: persist the case without referral_id /
    // call_log seed. The case still shows up for Ops; only the chip /
    // banner / starter note are missing until /api/db/setup runs.
    insert = await query(
      `INSERT INTO operations_cases
       (booking_id, status,
        original_clinic_id, original_clinic_name, original_slot_date, original_slot_time,
        amount_paid, payment_to_clinic, tier,
        patient_response_token)
       OUTPUT INSERTED.id
       VALUES (@booking_id, 'pending_call',
         @clinic_id, @clinic_name, @slot_date, @slot_time,
         @amount, @payment, @tier, @token)`,
      baseParams,
    );
  }
  const id = insert.recordset[0]?.id;
  return { id, token, tier, paymentToClinic };
}

export async function listCases({ status, limit = 100 } = {}) {
  if (!DB_AVAILABLE) return [];
  const where = status ? `WHERE c.status = @status` : '';
  const params = status ? { status: { type: sql.NVarChar(40), value: status } } : {};
  // Best-effort: include referral_id and derivador info via JOIN to referrals.
  // Pre-migration DBs lack the column — we fall back to a query without it so
  // /admin/ops keeps loading until /api/db/setup runs.
  try {
    const result = await query(
      `SELECT TOP (${Math.min(Number(limit) || 100, 500)})
         c.id, c.booking_id, c.status, c.assigned_to, c.referral_id,
         c.original_clinic_id, c.original_clinic_name, c.original_slot_date, c.original_slot_time,
         c.alternative_clinic_id, c.alternative_clinic_name, c.alternative_slot_date, c.alternative_slot_time,
         c.amount_paid, c.payment_to_clinic, c.tier,
         c.created_at, c.updated_at, c.resolved_at,
         b.patient_name, b.patient_email, b.patient_phone, b.has_insurance, b.insurance_company, b.specialty,
         r.professional_email AS derivador_email,
         r.provider_name      AS derivador_provider_name
       FROM operations_cases c
       LEFT JOIN bookings b   ON b.id = c.booking_id
       LEFT JOIN referrals r  ON r.id = c.referral_id
       ${where}
       ORDER BY
         CASE WHEN c.resolved_at IS NULL THEN 0 ELSE 1 END,
         c.created_at DESC`,
      params
    );
    return result.recordset;
  } catch (err) {
    if (!String(err?.message || '').includes('Invalid column name')) throw err;
    const result = await query(
      `SELECT TOP (${Math.min(Number(limit) || 100, 500)})
         c.id, c.booking_id, c.status, c.assigned_to,
         c.original_clinic_id, c.original_clinic_name, c.original_slot_date, c.original_slot_time,
         c.alternative_clinic_id, c.alternative_clinic_name, c.alternative_slot_date, c.alternative_slot_time,
         c.amount_paid, c.payment_to_clinic, c.tier,
         c.created_at, c.updated_at, c.resolved_at,
         b.patient_name, b.patient_email, b.patient_phone, b.has_insurance, b.insurance_company, b.specialty
       FROM operations_cases c
       LEFT JOIN bookings b ON b.id = c.booking_id
       ${where}
       ORDER BY
         CASE WHEN c.resolved_at IS NULL THEN 0 ELSE 1 END,
         c.created_at DESC`,
      params
    );
    return result.recordset;
  }
}

export async function getCase(id) {
  if (!DB_AVAILABLE) return null;
  // SELECT c.* already pulls referral_id once the migration runs. We also
  // LEFT JOIN to referrals so the detail page can show the derivador
  // (clinic name + pro email) without an extra round-trip. Wrapped in
  // a try/fallback so a pre-migration DB still serves the page.
  try {
    const result = await query(
      `SELECT c.*,
         b.patient_name, b.patient_email, b.patient_phone, b.patient_address,
         b.has_insurance, b.insurance_company, b.specialty,
         b.payment_intent_id,
         b.procedure_slug, b.procedure_name, b.service_price, b.platform_fee,
         v.id           AS voucher_id,
         v.status       AS voucher_status,
         v.voucher_url,
         v.voucher_pdf_path,
         v.son_order_ref,
         v.uploaded_by  AS voucher_uploaded_by,
         v.uploaded_at  AS voucher_uploaded_at,
         v.sent_to_patient_at AS voucher_sent_at,
         r.professional_email AS derivador_email,
         r.provider_name      AS derivador_provider_name,
         r.specialty          AS referral_specialty,
         r.fee                AS referral_fee
       FROM operations_cases c
       LEFT JOIN bookings  b ON b.id = c.booking_id
       LEFT JOIN vouchers  v ON v.booking_id = c.booking_id
       LEFT JOIN referrals r ON r.id = c.referral_id
       WHERE c.id = @id`,
      { id: { type: sql.Int, value: Number(id) } }
    );
    return result.recordset[0] || null;
  } catch (err) {
    if (!String(err?.message || '').includes('Invalid column name')) throw err;
    const result = await query(
      `SELECT c.*,
         b.patient_name, b.patient_email, b.patient_phone, b.patient_address,
         b.has_insurance, b.insurance_company, b.specialty,
         b.payment_intent_id,
         b.procedure_slug, b.procedure_name, b.service_price, b.platform_fee,
         v.id           AS voucher_id,
         v.status       AS voucher_status,
         v.voucher_url,
         v.voucher_pdf_path,
         v.son_order_ref,
         v.uploaded_by  AS voucher_uploaded_by,
         v.uploaded_at  AS voucher_uploaded_at,
         v.sent_to_patient_at AS voucher_sent_at
       FROM operations_cases c
       LEFT JOIN bookings b ON b.id = c.booking_id
       LEFT JOIN vouchers v ON v.booking_id = c.booking_id
       WHERE c.id = @id`,
      { id: { type: sql.Int, value: Number(id) } }
    );
    return result.recordset[0] || null;
  }
}

export async function getCaseByToken(token) {
  if (!DB_AVAILABLE) return null;
  const result = await query(
    `SELECT c.*,
       b.patient_name, b.patient_email, b.patient_address,
       b.has_insurance, b.insurance_company,
       b.payment_intent_id
     FROM operations_cases c
     LEFT JOIN bookings b ON b.id = c.booking_id
     WHERE c.patient_response_token = @token`,
    { token: { type: sql.NVarChar(80), value: token } }
  );
  return result.recordset[0] || null;
}

export async function updateCase(id, fields) {
  if (!DB_AVAILABLE) return;
  const allowed = [
    'status', 'assigned_to',
    'alternative_clinic_id', 'alternative_clinic_name',
    'alternative_slot_date', 'alternative_slot_time', 'alternative_reason',
    'refund_id', 'refund_amount', 'refund_reason',
    'call_log', 'ops_notes', 'patient_decision',
  ];
  const sets = [];
  const params = { id: { type: sql.Int, value: Number(id) } };
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.includes(k)) continue;
    sets.push(`${k} = @${k}`);
    if (['alternative_clinic_id'].includes(k)) {
      params[k] = { type: sql.Int, value: v ?? null };
    } else if (['refund_amount'].includes(k)) {
      params[k] = { type: sql.Decimal(10, 2), value: v ?? null };
    } else {
      params[k] = { type: sql.NVarChar(sql.MAX), value: v ?? null };
    }
  }
  if (sets.length === 0) return;
  sets.push('updated_at = SYSDATETIMEOFFSET()');
  if (fields.status && TERMINAL_STATUSES.has(fields.status)) {
    sets.push('resolved_at = SYSDATETIMEOFFSET()');
  }
  await query(`UPDATE operations_cases SET ${sets.join(', ')} WHERE id = @id`, params);
}

export async function appendCallLog(id, entry, author) {
  const c = await getCase(id);
  if (!c) return;
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${author || 'ops'}: ${entry}`;
  const newLog = c.call_log ? `${c.call_log}\n${line}` : line;
  await updateCase(id, { call_log: newLog });
}
