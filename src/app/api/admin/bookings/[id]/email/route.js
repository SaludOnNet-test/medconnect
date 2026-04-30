import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';
import { appendCallLog } from '@/lib/opsCases';

/**
 * POST /api/admin/bookings/[id]/email
 *
 * Lets ops change the patient_email on a booking after the fact. Use cases:
 *   - Patient mistyped their email at checkout and emails are bouncing.
 *   - Patient asked us to redirect the flow's emails (alternative
 *     proposals, voucher delivery, refund confirmation) to a different
 *     address — common when the booking was made on behalf of a relative.
 *
 * Every email send across the platform reads `bookings.patient_email`
 * (voucherDelivery, alternative-proposal templates, refund notices, the
 * self-service token email at booking creation), so updating this single
 * column is enough to redirect every future flow email for the booking.
 *
 * Audit trail: if the booking has an active operations case, the change
 * is appended to that case's `call_log` so an ops manager can see who
 * made the change and when.
 *
 * Body: { patientEmail }
 */
export async function POST(request, { params }) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;
  const session = rr;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { id: bookingId } = await params;
  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const newEmailRaw = String(body?.patientEmail || '').trim().toLowerCase();
  // Lightweight RFC-5322-ish validation — same shape we use on the
  // /api/payments path. Strict regex matching is brittle; this catches
  // the obvious typos (no @, no TLD) without rejecting valid edge cases.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmailRaw)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }

  const pool = await getPool();

  // Fetch the previous email so the audit log shows the before/after.
  const before = await pool.request()
    .input('id', sql.NVarChar(50), bookingId)
    .query(`SELECT patient_email FROM bookings WHERE id = @id`);
  if (before.recordset.length === 0) {
    return NextResponse.json({ error: 'booking not found' }, { status: 404 });
  }
  const oldEmail = before.recordset[0].patient_email || '';

  if (oldEmail.toLowerCase() === newEmailRaw) {
    // No-op. Return the current state so the UI stays consistent.
    return NextResponse.json({ ok: true, patientEmail: oldEmail, changed: false });
  }

  await pool.request()
    .input('id', sql.NVarChar(50), bookingId)
    .input('email', sql.NVarChar(255), newEmailRaw)
    .query(`UPDATE bookings SET patient_email = @email WHERE id = @id`);

  // Append a call_log entry on the matching ops case (if any) for audit.
  // Booking → case is 1:1; we look up by booking_id.
  const caseRow = await pool.request()
    .input('id', sql.NVarChar(50), bookingId)
    .query(`SELECT id FROM operations_cases WHERE booking_id = @id`);
  const caseId = caseRow.recordset[0]?.id;
  if (caseId) {
    await appendCallLog(
      caseId,
      `Email del paciente actualizado: ${oldEmail || '(sin email)'} → ${newEmailRaw}`,
      session.username || 'ops',
    );
  }

  return NextResponse.json({ ok: true, patientEmail: newEmailRaw, changed: true });
}
