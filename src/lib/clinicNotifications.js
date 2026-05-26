// Med Connect — Clinic notification helpers
//
// Resolves where (and whether) to send the "sale derived to your clinic"
// email for the four trigger paths:
//   1. /api/bookings POST (direct + internal/external referrals)
//   2. /api/ops/respond accept (patient accepts ops-proposed alternative)
//   3. /api/bookings/by-token/[token]/cancel (patient self-service cancel)
//   4. /api/ops/cases/[id]/action (ops cancel / refund)
//
// Each call is best-effort: a missing column (pre-migration DB), a missing
// clinic row, or a DB hiccup all return `null` so the trigger code can
// skip silently without breaking the booking/cancel flow the patient is
// waiting on.
//
// Recipient resolution intentionally lives outside of `emailTemplates.js`
// so the templates stay shape-only (subject + html) and route handlers
// stay free of LEFT-JOIN-against-operations_cases logic.

import { query, sql, DB_AVAILABLE } from '@/lib/db';

/**
 * Fetch the notification config for a clinic.
 *
 *   { email: 'araceli...@...', enabled: true,  clinicName: 'Centro...' }  → fire
 *   { email: null,             enabled: true,  clinicName: 'Centro...' }  → skip (no email)
 *   { email: 'a@b',            enabled: false, clinicName: 'Centro...' }  → skip (paused)
 *   null                                                                  → skip (no clinic / no DB / pre-migration)
 *
 * @param {number|string|null|undefined} clinicId
 * @returns {Promise<{email: string|null, enabled: boolean, clinicName: string|null}|null>}
 */
export async function getClinicNotificationConfig(clinicId) {
  if (!DB_AVAILABLE) return null;
  const idNum = Number(clinicId);
  if (!Number.isFinite(idNum) || idNum <= 0) return null;

  try {
    const result = await query(
      `SELECT TOP 1 id, name, notification_email, notifications_enabled
       FROM clinics WHERE id = @id`,
      { id: { type: sql.Int, value: idNum } },
    );
    const row = result.recordset[0];
    if (!row) return null;
    return {
      email: row.notification_email || null,
      enabled: row.notifications_enabled === false ? false : !!row.notifications_enabled,
      clinicName: row.name || null,
    };
  } catch (err) {
    // Pre-migration DB or transient error — silently skip so the trigger
    // doesn't break the upstream flow. The route handler already logs.
    const msg = String(err?.message || '');
    if (!msg.includes('Invalid column name')) {
      console.error('[getClinicNotificationConfig]', err?.message);
    }
    return null;
  }
}

/**
 * Resolve which clinic is "active" for a booking right now — i.e. the
 * clinic that will end up serving the patient.
 *
 *   - Booking with no ops case OR case still in pending/searching state:
 *     the active clinic is the original `bookings.provider_id`.
 *   - Booking whose ops case proposed an alternative and the patient
 *     accepted (status = confirmed AND alternative_clinic_id set):
 *     the active clinic is `operations_cases.alternative_clinic_id`.
 *
 * Used by cancel/refund triggers so we send the cancellation email to the
 * clinic that was *expecting* the patient (which may differ from the
 * original choice when ops proposed an alternative).
 *
 * @param {string} bookingId
 * @returns {Promise<number|null>}
 */
export async function resolveActiveClinicForBooking(bookingId) {
  if (!DB_AVAILABLE) return null;
  if (!bookingId) return null;

  try {
    // LEFT JOIN ensures we still get the booking's provider_id when there
    // is no ops case (direct bookings without manual ops intervention).
    const result = await query(
      `SELECT TOP 1
         b.provider_id            AS booking_clinic_id,
         oc.status                AS case_status,
         oc.alternative_clinic_id AS alt_clinic_id
       FROM bookings b
       LEFT JOIN operations_cases oc ON oc.booking_id = b.id
       WHERE b.id = @id`,
      { id: { type: sql.NVarChar(50), value: bookingId } },
    );
    const row = result.recordset[0];
    if (!row) return null;

    // Only use the alternative when the case was actually confirmed on it.
    // For pending / proposed-but-not-accepted cases, the original clinic
    // is still the one expecting the patient.
    if (row.case_status === 'confirmed' && row.alt_clinic_id != null) {
      return Number(row.alt_clinic_id);
    }
    return row.booking_clinic_id != null ? Number(row.booking_clinic_id) : null;
  } catch (err) {
    console.error('[resolveActiveClinicForBooking]', err?.message);
    return null;
  }
}

// Channel labels — kept here so the email-template caller and the
// triggers share one source of truth.
export const CHANNEL_LABELS = {
  directo: 'Directo (búsqueda en medconnect.es)',
  derivacion_interna: 'Derivación interna (mismo grupo de clínicas)',
  derivacion_externa: 'Derivación externa (otro profesional Med Connect)',
  alternativa_propuesta_por_ops: 'Alternativa propuesta por Operaciones',
};

// Cancellation reason labels — used by the clinicSaleCancellation template
// to render the reason consistently across self-service and ops triggers.
export const CANCELLATION_REASON_LABELS = {
  self_service: 'Cancelación solicitada por el paciente (self-service)',
  ops_cancel: 'Cancelado por el equipo de Operaciones',
  ops_refund: 'Reembolso emitido por el equipo de Operaciones',
};
