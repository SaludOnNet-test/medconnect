// GET /api/bookings/recover-pending-payment
//
// Vercel cron: */30 * * * * (every 30 min). Finds bookings rows where:
//   - status = 'pending_payment' (reserve succeeded, Stripe never confirmed),
//   - created_at between 30 minutes and 24 hours ago,
//   - patient_email IS NOT NULL,
//   - we haven't already sent a recovery email (no email_sends row with
//     category='pending_payment_recovery' for the same recipient + booking
//     created date),
//   - the slot is still future-dated (no point recovering past appointments).
//
// 2026-06-22 — Born from the Verónica Sagasta incident (17-jun €29 con-
// seguro Adeslas, never paid; the Jacques racha; and the recurring
// Stripe-step abandonment that we kept watching from Clarity). The
// reserve creates the row but the side-effects (ops case, watcher
// email, patient confirmation) only fire on FINALIZE. So a patient who
// closes the tab at Stripe gets zero follow-up.
//
// This cron is the recovery layer. One nudge, gentle tone, deep-link
// back to /book with all the slot params preserved so they can resume
// in one click.
//
// Auth: same `CRON_SECRET` pattern as the other Vercel crons.

import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { pendingPaymentRecovery } from '@/lib/emailTemplates';
import { internalError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';
const RECOVERY_BATCH = 50;
// Window: not too fresh (give the patient a chance to come back on their
// own) and not too stale (after a day they've moved on or chosen another
// provider).
const MIN_AGE_MIN = 30;
const MAX_AGE_HRS = 24;

export async function GET(request) {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const secret = bearer || request.headers.get('x-cron-secret') || '';
  const expected = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    if (!expected) return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 });
    if (secret !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const pool = await getPool();

    // Find candidates. We use a LEFT JOIN to email_sends to skip rows that
    // already got a recovery email — email_sends has no booking_id column,
    // so the cheapest dedup is recipient + category + a date-range check.
    const result = await pool.request()
      .input('batch', sql.Int, RECOVERY_BATCH)
      .input('min_age_min', sql.Int, MIN_AGE_MIN)
      .input('max_age_hrs', sql.Int, MAX_AGE_HRS)
      .query(`
        SELECT TOP (@batch)
          b.id, b.patient_name, b.patient_email,
          b.provider_id, b.provider_name, b.specialty,
          b.slot_date, b.slot_time, b.amount,
          b.has_insurance, b.insurance_company,
          b.procedure_slug, b.procedure_name, b.service_price,
          b.created_at, b.self_service_token
        FROM bookings b
        WHERE b.status = 'pending_payment'
          AND b.patient_email IS NOT NULL
          AND b.created_at <= DATEADD(MINUTE, -@min_age_min, SYSDATETIMEOFFSET())
          AND b.created_at >= DATEADD(HOUR, -@max_age_hrs, SYSDATETIMEOFFSET())
          AND (
            b.slot_date IS NULL
            OR CAST(b.slot_date AS DATE) >= CAST(SYSDATETIMEOFFSET() AS DATE)
          )
          AND NOT EXISTS (
            SELECT 1 FROM email_sends es
            WHERE es.recipient = b.patient_email
              AND es.category = 'pending_payment_recovery'
              AND es.sent_at >= b.created_at
          )
        ORDER BY b.created_at ASC
      `);

    const candidates = result.recordset || [];

    for (const row of candidates) {
      try {
        // Build resume URL. Mirror /book's accepted query params so the
        // page restores form state in one click. providerId / providerName
        // are required to identify the slot; specialty + procedure for
        // pricing context; insurance flag + name to skip the toggle step.
        const params = new URLSearchParams();
        if (row.provider_id != null) params.set('providerId', String(row.provider_id));
        if (row.provider_name) params.set('providerName', row.provider_name);
        if (row.specialty) params.set('specialty', row.specialty);
        if (row.slot_date) params.set('date', row.slot_date);
        if (row.slot_time) params.set('time', row.slot_time);
        if (row.amount != null) params.set('fee', String(row.amount));
        if (row.procedure_slug) params.set('procedureSlug', row.procedure_slug);
        if (row.procedure_name) params.set('procedureName', row.procedure_name);
        if (row.service_price != null) params.set('procedurePrice', String(row.service_price));
        if (row.has_insurance === false) params.set('isSinSeguro', 'true');
        if (row.insurance_company) params.set('insurance', row.insurance_company);
        // UTM marker so we can measure recovery effectiveness in analytics.
        params.set('utm_source', 'medconnect');
        params.set('utm_medium', 'email');
        params.set('utm_campaign', 'pending-payment-recovery');
        // Hint to the /book page that this is a resume — lets the UI
        // surface "Continuando tu reserva" copy if we want it later.
        params.set('resumeBookingId', String(row.id));

        const resumeUrl = `${BASE_URL.replace(/\/$/, '')}/book?${params.toString()}`;

        const tpl = pendingPaymentRecovery({
          patientName: row.patient_name,
          providerName: row.provider_name,
          slotDate: row.slot_date,
          slotTime: row.slot_time,
          amount: row.amount,
          resumeUrl,
        });

        const result = await sendEmail({
          to: row.patient_email,
          subject: tpl.subject,
          html: tpl.html,
          category: 'pending_payment_recovery',
        });

        if (result?.ok !== false) {
          sent += 1;
        } else {
          failed += 1;
        }
      } catch (e) {
        failed += 1;
        console.error('[recover-pending-payment] send failed for booking', row?.id, e?.message);
      }
    }

    if (candidates.length === 0) skipped = 0;

    return NextResponse.json({
      ok: true,
      candidates: candidates.length,
      sent,
      failed,
      skipped,
    });
  } catch (err) {
    return internalError(err, '[GET /api/bookings/recover-pending-payment]');
  }
}
