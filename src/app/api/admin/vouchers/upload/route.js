import { NextResponse } from 'next/server';
import { getPool, query, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';
import { sendEmail } from '@/lib/email';
import { voucherDelivery } from '@/lib/emailTemplates';

/**
 * POST /api/admin/vouchers/upload
 *
 * Body: { bookingId, voucherUrl?, sonOrderRef?, voucherPdfPath?, resend? }
 *
 * - First-time upload: stores voucher fields, marks status=voucher_sent,
 *   triggers `voucherDelivery` email to the patient (idempotent — won't send
 *   twice based on `vouchers.sent_to_patient_at`).
 * - resend=true: just re-sends the email using the stored fields.
 */
export async function POST(request) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;
  const session = rr;
  if (!DB_AVAILABLE) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const { bookingId, voucherUrl, sonOrderRef, voucherPdfPath, resend } = body || {};

  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 });

  const pool = await getPool();

  // Load booking + existing voucher row (if any).
  const bookingResult = await pool.request()
    .input('id', sql.NVarChar(50), bookingId)
    .query(`
      SELECT b.id, b.patient_email, b.patient_name, b.provider_name, b.slot_date,
             b.slot_time, b.has_insurance, b.procedure_name, b.procedure_slug,
             b.service_price,
             v.id AS voucher_id, v.status AS voucher_status,
             v.voucher_url, v.son_order_ref, v.voucher_pdf_path,
             v.sent_to_patient_at
      FROM bookings b
      LEFT JOIN vouchers v ON v.booking_id = b.id
      WHERE b.id = @id
    `);
  const booking = bookingResult.recordset[0];
  if (!booking) return NextResponse.json({ error: 'booking not found' }, { status: 404 });
  if (booking.has_insurance) {
    return NextResponse.json({ error: 'booking has insurance — no voucher needed' }, { status: 400 });
  }

  // First-time upload: persist voucher fields and flip booking status.
  if (!resend) {
    if (!voucherUrl && !sonOrderRef && !voucherPdfPath) {
      return NextResponse.json({ error: 'voucherUrl, sonOrderRef or voucherPdfPath required' }, { status: 400 });
    }

    const reqUpsert = pool.request()
      .input('booking_id', sql.NVarChar(50), bookingId)
      .input('voucher_url', sql.NVarChar(500), voucherUrl || null)
      .input('son_order_ref', sql.NVarChar(100), sonOrderRef || null)
      .input('voucher_pdf_path', sql.NVarChar(500), voucherPdfPath || null)
      .input('uploaded_by', sql.NVarChar(100), session.username || null);

    if (booking.voucher_id) {
      await reqUpsert.query(`
        UPDATE vouchers
        SET voucher_url = COALESCE(@voucher_url, voucher_url),
            son_order_ref = COALESCE(@son_order_ref, son_order_ref),
            voucher_pdf_path = COALESCE(@voucher_pdf_path, voucher_pdf_path),
            uploaded_by = @uploaded_by,
            uploaded_at = SYSDATETIMEOFFSET(),
            status = 'voucher_sent'
        WHERE booking_id = @booking_id
      `);
    } else {
      await reqUpsert.query(`
        INSERT INTO vouchers (booking_id, voucher_url, son_order_ref, voucher_pdf_path,
                              uploaded_by, uploaded_at, status)
        VALUES (@booking_id, @voucher_url, @son_order_ref, @voucher_pdf_path,
                @uploaded_by, SYSDATETIMEOFFSET(), 'voucher_sent')
      `);
    }

    await pool.request()
      .input('id', sql.NVarChar(50), bookingId)
      .query(`UPDATE bookings SET status = 'voucher_sent' WHERE id = @id AND status = 'awaiting_voucher'`);
  }

  // Re-load voucher to get the canonical fields for the email.
  const finalResult = await pool.request()
    .input('id', sql.NVarChar(50), bookingId)
    .query(`SELECT voucher_url, son_order_ref, voucher_pdf_path, sent_to_patient_at
            FROM vouchers WHERE booking_id = @id`);
  const finalVoucher = finalResult.recordset[0] || {};

  // Send the email. B10 — idempotency on first-time upload: only flip
  // sent_to_patient_at the first time; on resend we send again unconditionally.
  const alreadySent = !!finalVoucher.sent_to_patient_at;

  let emailResult = { ok: true, mock: true };
  if (resend || !alreadySent) {
    try {
      // Call template + sendEmail directly — avoids a fragile self-fetch that
      // breaks when NEXT_PUBLIC_BASE_URL points to a domain that doesn't
      // resolve from the runtime (common in local dev).
      const { subject, html } = voucherDelivery({
        patientName: booking.patient_name,
        providerName: booking.provider_name,
        slotDate: booking.slot_date,
        slotTime: booking.slot_time,
        procedureName: booking.procedure_name,
        servicePrice: booking.service_price,
        voucherUrl: finalVoucher.voucher_url || null,
        sonOrderRef: finalVoucher.son_order_ref || null,
      });
      emailResult = await sendEmail({ to: booking.patient_email, subject, html });
    } catch (e) {
      console.error('[vouchers/upload] email send failed', e);
      emailResult = { ok: false, error: e.message };
    }

    // Only mark "sent" when the transport actually succeeded. Without this,
    // a transient Resend failure (sandbox mode, throttling, downtime) would
    // silently bury the email — alreadySent would be true on the next attempt
    // and the function would skip retrying. Ops would have to manually pass
    // resend=true to recover. Found during the H8 smoke test on 2026-04-27
    // while Resend was returning 403s for unverified medconnect.es.
    if (!alreadySent && emailResult?.ok) {
      await pool.request()
        .input('id', sql.NVarChar(50), bookingId)
        .query(`UPDATE vouchers SET sent_to_patient_at = SYSDATETIMEOFFSET() WHERE booking_id = @id`);
    }
  }

  return NextResponse.json({ ok: true, email: emailResult });
}
