import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { verifyActionToken } from '@/lib/actionTokens';

// GET /api/booking/respond?action=confirm|propose|refund&token=<signed>
//
// Links in the adminBookingEdit email land here. The token is an HMAC-signed
// action token (see src/lib/actionTokens.js): `<payloadB64url>.<sigB64url>`
// over `action:bookingId:expiresAt`, signed with SESSION_SECRET, 7-day
// expiry. Unsigned/legacy tokens (`confirm-<id>-<ts>`) are rejected — they
// were forgeable by anyone who knew a booking id.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const token = searchParams.get('token');

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';

  if (!action || !token) {
    return NextResponse.redirect(`${BASE_URL}/?error=invalid_link`);
  }

  const verified = verifyActionToken(token, action);
  if (!verified.ok) {
    const reason = verified.reason === 'expired' ? 'link_expired' : 'invalid_token';
    return NextResponse.redirect(`${BASE_URL}/?error=${reason}`);
  }
  const bookingId = verified.bookingId;

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

      // Notify operations team (server-to-server — carries the internal secret)
      fetch(`${BASE_URL}/api/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INTERNAL_API_SECRET
            ? { 'x-internal-secret': process.env.INTERNAL_API_SECRET }
            : {}),
        },
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
