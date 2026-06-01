import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { clientError, internalError } from '@/lib/errors';

/**
 * POST /api/bookings/[id]/patient-data
 *
 * Patient-side endpoint to backfill DNI + date of birth after payment has
 * succeeded. We moved these two fields out of the pre-payment form on
 * 2026-06-01 to reduce abandonment (4 of 5 sessions to reach /book in the
 * first SEM week bailed at the 8-field form). The clinic still needs both
 * for visit-day identification — they're just collected on the success
 * page now, when the user has nothing to lose by filling them in.
 *
 * Light auth: we verify the patient's email matches the booking row.
 * That's deliberately weaker than the ops PATCH endpoint (which requires
 * admin/ops role) because the user is in the middle of a freshly
 * authenticated payment flow and we want zero friction. The risk surface
 * is tiny: an attacker would need to know both the booking ID AND the
 * patient's email to overwrite their DOB/DNI — and the worst-case
 * outcome is a clinic identifying the wrong person at the door, which
 * the clinic also verifies against an actual ID document. We additionally
 * reject any booking older than 24 h so this endpoint can't be used for
 * historical record edits.
 */
export async function POST(request, { params }) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { id } = await params;
  if (!id || typeof id !== 'string' || id.length > 50) {
    return clientError('Invalid booking id', 400);
  }

  let body;
  try { body = await request.json(); } catch { return clientError('Body must be JSON', 400); }

  const patientEmail = typeof body?.patientEmail === 'string' ? body.patientEmail.trim().toLowerCase() : '';
  const dateOfBirth  = typeof body?.dateOfBirth === 'string' ? body.dateOfBirth.trim() : '';
  const nationalId   = typeof body?.nationalId === 'string' ? body.nationalId.trim() : '';

  // Email validation — must look like a real address so a typo can't
  // accidentally let a stranger PATCH the booking by guessing partial
  // identifiers.
  if (!patientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) {
    return clientError('patientEmail is required and must be a valid address', 400);
  }
  // Reject totally empty payloads — at least one of the two fields must
  // be set, otherwise this is a no-op.
  if (!dateOfBirth && !nationalId) {
    return clientError('At least one of dateOfBirth or nationalId is required', 400);
  }
  // DOB shape: YYYY-MM-DD. Loose check (the date input on the client
  // already restricts it; this is defense-in-depth).
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return clientError('dateOfBirth must be YYYY-MM-DD', 400);
  }
  // DNI / NIE / passport loose accept (same pattern as the pre-payment
  // form used previously).
  if (nationalId && !/^[A-Za-z0-9 \-\.]{5,20}$/.test(nationalId)) {
    return clientError('nationalId looks invalid', 400);
  }

  try {
    const pool = await getPool();

    // 1) Lookup booking + verify email + check 24 h freshness.
    const lookup = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query(`
        SELECT patient_email, created_at
        FROM bookings
        WHERE id = @id
      `);
    if (!lookup.recordset.length) {
      return clientError('Booking not found', 404);
    }
    const row = lookup.recordset[0];
    const dbEmail = String(row.patient_email || '').trim().toLowerCase();
    if (dbEmail !== patientEmail) {
      // Same 404 shape as "not found" so we don't leak which booking IDs
      // exist if someone scans.
      return clientError('Booking not found', 404);
    }
    const createdMs = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (Date.now() - createdMs > 24 * 60 * 60 * 1000) {
      return clientError(
        'Window expired — contact support to update identification details',
        409
      );
    }

    // 2) Build dynamic UPDATE. Both columns may already be wider in the
    //    bookings table from earlier schema migrations; reusing the same
    //    NVarChar(20) cap that POST /api/bookings uses.
    const req = pool.request().input('id', sql.NVarChar(50), id);
    const sets = [];
    if (dateOfBirth) {
      req.input('dob', sql.NVarChar(20), dateOfBirth);
      sets.push('patient_date_of_birth = @dob');
    }
    if (nationalId) {
      req.input('nid', sql.NVarChar(20), nationalId);
      sets.push('patient_national_id = @nid');
    }
    sets.push('updated_at = SYSDATETIMEOFFSET()');

    try {
      await req.query(`UPDATE bookings SET ${sets.join(', ')} WHERE id = @id`);
    } catch (err) {
      // Pre-migration tables don't have these columns yet — graceful
      // degrade rather than a 500 so the success page doesn't show a red
      // error to a paying customer. /api/db/setup adds them; the booking
      // confirmation email already handles the missing-columns case.
      if (String(err?.message || '').includes('Invalid column name')) {
        return NextResponse.json({ ok: true, note: 'columns_missing_skipped' });
      }
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError(err, '[POST /api/bookings/[id]/patient-data]');
  }
}
