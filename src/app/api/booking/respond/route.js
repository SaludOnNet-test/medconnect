import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

// GET /api/booking/respond?action=confirm|propose|refund&token=<bookingId>-<timestamp>
// Links in the adminBookingEdit email land here.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const token = searchParams.get('token'); // format: "confirm-{id}-{timestamp}" or just the booking id

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://medconnect.es';

  if (!action || !token) {
    return NextResponse.redirect(`${BASE_URL}/?error=invalid_link`);
  }

  // Parse booking ID from token (format: action-{bookingId}-{timestamp} → extract middle part)
  // Token was generated as `confirm-${bookingId}-${Date.now()}`
  const parts = token.split('-');
  // bookingId could contain '-' too (e.g. MC-12345), so we take everything except first and last segment
  const bookingId = parts.slice(1, -1).join('-');

  if (!bookingId) {
    return NextResponse.redirect(`${BASE_URL}/?error=invalid_token`);
  }

  if (!DB_AVAILABLE) {
    // If DB is down, still redirect to a meaningful page
    return NextResponse.redirect(`${BASE_URL}/book/${action === 'refund' ? 'refund' : 'confirmed'}?ref=${bookingId}&db=unavailable`);
  }

  try {
    const pool = await getPool();

    if (action === 'confirm') {
      await pool.request()
        .input('id', sql.NVarChar(50), bookingId)
        .query(`UPDATE bookings SET status = 'confirmed', updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);

      return NextResponse.redirect(`${BASE_URL}/book/confirmed?ref=${bookingId}`);

    } else if (action === 'propose') {
      // Update status to flag that patient wants to suggest another time
      await pool.request()
        .input('id', sql.NVarChar(50), bookingId)
        .query(`UPDATE bookings SET status = 'patient_proposing', updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);

      return NextResponse.redirect(`${BASE_URL}/book/propose?ref=${bookingId}`);

    } else if (action === 'refund') {
      await pool.request()
        .input('id', sql.NVarChar(50), bookingId)
        .query(`UPDATE bookings SET status = 'refund_requested', updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);

      // Notify operations team
      const opsEmail = process.env.OPERATIONS_EMAIL || 'operaciones@medconnect.es';
      fetch(`${BASE_URL}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: 'operationsBookingAlert',
          data: {
            bookingId,
            clinicId: '',
            slotType: 'refund_request',
            patientName: 'Paciente',
            providerName: '',
            slotDate: '',
            slotTime: '',
            amount: 0,
          },
        }),
      }).catch(() => {});

      return NextResponse.redirect(`${BASE_URL}/book/refund?ref=${bookingId}`);

    } else {
      return NextResponse.redirect(`${BASE_URL}/?error=unknown_action`);
    }
  } catch (err) {
    console.error('[GET /api/booking/respond]', err);
    return NextResponse.redirect(`${BASE_URL}/?error=server_error`);
  }
}
