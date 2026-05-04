import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { reviewRequest } from '@/lib/emailTemplates';
import { internalError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reviews/request-batch
 *
 * Daily cron at 09:00 (Madrid). Picks bookings that:
 *   - had their cita ≥ 24 h ago,
 *   - finished in a "happy path" status (`confirmed` or `voucher_sent`),
 *   - haven't already had the review-request email sent (idempotency
 *     column `review_request_sent_at`),
 *   - still have a self_service_token (cancelled bookings have the
 *     token NULL'd, so this filter is a belt-and-braces alignment with
 *     the status filter — cancelled cases are excluded by both).
 *
 * For each match: render `reviewRequest`, sendEmail, flip
 * `review_request_sent_at = NOW()` only when the transport succeeds.
 * Same idempotency shape as the voucher-upload flow — a transient
 * Resend failure leaves the timestamp NULL so the next run retries.
 *
 * Auth: same `CRON_SECRET` mechanism as `/api/referrals/remind`. Vercel
 * Cron sends `Authorization: Bearer <CRON_SECRET>`; we also accept the
 * legacy `x-cron-secret` header.
 */
export async function GET(request) {
  // Cron auth — copy of the referrals/remind hardening from the security
  // audit. Hard-fail in any non-dev environment if CRON_SECRET is unset
  // (preview deploys included; we don't want a leak vector via the
  // /-vercel-style preview URLs).
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

  try {
    const pool = await getPool();

    // Pick the batch. Window is "24-72h post-cita": lower bound 24h so we
    // give the patient a day after the visit to settle, upper bound 72h
    // so we don't email people 3+ months later if a backfill happens. The
    // index `IX_bookings_review_request_pending` (filtered to where
    // `review_request_sent_at IS NULL`) makes this a fast lookup.
    const result = await pool.request().query(`
      SELECT TOP 200
        b.id, b.patient_email, b.patient_name, b.provider_name,
        b.slot_date, b.self_service_token
      FROM bookings b
      WHERE b.status IN ('confirmed', 'voucher_sent')
        AND b.review_request_sent_at IS NULL
        AND b.self_service_token IS NOT NULL
        AND b.patient_email IS NOT NULL AND b.patient_email <> ''
        AND b.slot_date IS NOT NULL
        AND TRY_CONVERT(date, b.slot_date) IS NOT NULL
        AND TRY_CONVERT(datetime2, b.slot_date + ' ' + ISNULL(b.slot_time, '00:00')) <= DATEADD(hour, -24, SYSDATETIMEOFFSET())
        AND TRY_CONVERT(datetime2, b.slot_date + ' ' + ISNULL(b.slot_time, '00:00')) >  DATEADD(hour, -72, SYSDATETIMEOFFSET())
        AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id)
      ORDER BY b.slot_date ASC
    `);

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const row of result.recordset) {
      let emailOk = false;
      try {
        const { subject, html } = reviewRequest({
          patientName: row.patient_name,
          providerName: row.provider_name,
          slotDate: row.slot_date,
          token: row.self_service_token,
        });
        const r = await sendEmail({ to: row.patient_email, subject, html });
        emailOk = !!r?.ok;
        if (!emailOk) errors.push({ id: row.id, error: r?.error || 'send returned ok=false' });
      } catch (e) {
        errors.push({ id: row.id, error: e?.message || 'unknown' });
      }

      // Stamp only when the transport actually succeeded — same shape as
      // the voucher-upload idempotency. A transient Resend failure leaves
      // the row pending so the next run retries.
      if (emailOk) {
        await pool.request()
          .input('id', sql.NVarChar(50), row.id)
          .query(`UPDATE bookings SET review_request_sent_at = SYSDATETIMEOFFSET() WHERE id = @id AND review_request_sent_at IS NULL`);
        sent++;
      } else {
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      considered: result.recordset.length,
      sent,
      failed,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    return internalError(err, '[GET /api/reviews/request-batch]');
  }
}
