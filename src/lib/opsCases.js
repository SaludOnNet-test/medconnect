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

  // Derive payment_to_clinic and tier from amount paid (matches PRICING_TIERS)
  const amount = Number(booking.amount || 0);
  let tier = 4;
  let paymentToClinic = 2;
  if (amount >= 25)      { tier = 1; paymentToClinic = 15; }
  else if (amount >= 15) { tier = 2; paymentToClinic = 10; }
  else if (amount >= 7)  { tier = 3; paymentToClinic = 5; }

  const insert = await query(
    `INSERT INTO operations_cases
     (booking_id, status,
      original_clinic_id, original_clinic_name, original_slot_date, original_slot_time,
      amount_paid, payment_to_clinic, tier,
      patient_response_token)
     OUTPUT INSERTED.id
     VALUES (@booking_id, 'pending_call',
       @clinic_id, @clinic_name, @slot_date, @slot_time,
       @amount, @payment, @tier, @token)`,
    {
      booking_id: { type: sql.NVarChar(50), value: booking.id },
      clinic_id: { type: sql.Int, value: booking.providerId ?? null },
      clinic_name: { type: sql.NVarChar(255), value: booking.providerName ?? null },
      slot_date: { type: sql.NVarChar(20), value: booking.slotDate ?? null },
      slot_time: { type: sql.NVarChar(10), value: booking.slotTime ?? null },
      amount: { type: sql.Decimal(10, 2), value: amount },
      payment: { type: sql.Decimal(10, 2), value: paymentToClinic },
      tier: { type: sql.TinyInt, value: tier },
      token: { type: sql.NVarChar(80), value: token },
    }
  );
  const id = insert.recordset[0]?.id;
  return { id, token, tier, paymentToClinic };
}

export async function listCases({ status, limit = 100 } = {}) {
  if (!DB_AVAILABLE) return [];
  const where = status ? `WHERE c.status = @status` : '';
  const params = status ? { status: { type: sql.NVarChar(40), value: status } } : {};
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

export async function getCase(id) {
  if (!DB_AVAILABLE) return null;
  const result = await query(
    `SELECT c.*,
       b.patient_name, b.patient_email, b.patient_phone, b.patient_address,
       b.has_insurance, b.insurance_company, b.specialty,
       b.payment_intent_id
     FROM operations_cases c
     LEFT JOIN bookings b ON b.id = c.booking_id
     WHERE c.id = @id`,
    { id: { type: sql.Int, value: Number(id) } }
  );
  return result.recordset[0] || null;
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
