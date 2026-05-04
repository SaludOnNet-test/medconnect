import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { reviewSubmitSchema, formatZodError } from '@/lib/schemas';
import { internalError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const TRUSTPILOT_REVIEW_URL = 'https://es.trustpilot.com/evaluate/medconnect.es';

/**
 * GET /api/reviews/by-token/:token
 *
 * Public, token-gated read. Used by `/review/[token]` to render the form
 * with the booking context and to detect "already submitted" so a refresh
 * doesn't show a duplicate form. Returns just enough for the page; ops/
 * internal fields are stripped on principle (mirrors the bookings/by-token
 * pattern after the security audit).
 *
 * The token reused is `bookings.self_service_token`. It's NULL'd when the
 * patient cancels via /booking/[token]/cancel, so cancelled bookings
 * naturally return 404 here — aligning with the cron's status filter.
 */
export async function GET(request, { params }) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('token', sql.NVarChar(64), token)
      .query(`
        SELECT b.id, b.patient_name, b.provider_name, b.specialty,
               b.slot_date, b.slot_time, b.status,
               r.id AS review_id, r.rating_medconnect, r.rating_clinic,
               r.submitted_at AS review_submitted_at
        FROM bookings b
        LEFT JOIN reviews r ON r.booking_id = b.id
        WHERE b.self_service_token = @token
      `);
    const row = r.recordset[0];
    if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

    return NextResponse.json({
      id: row.id,
      patientName: row.patient_name,
      providerName: row.provider_name,
      specialty: row.specialty,
      slotDate: row.slot_date,
      slotTime: row.slot_time,
      status: row.status,
      alreadySubmitted: !!row.review_id,
      previousRating: row.review_id ? {
        ratingMedconnect: row.rating_medconnect,
        ratingClinic: row.rating_clinic,
        submittedAt: row.review_submitted_at,
      } : null,
    });
  } catch (err) {
    return internalError(err, '[GET /api/reviews/by-token]');
  }
}

/**
 * POST /api/reviews/by-token/:token
 *
 * Submit the review form. Validates with zod, inserts a single row in
 * `reviews`. The UNIQUE (booking_id) constraint gives us idempotency for
 * free — a second submit on the same booking returns 409 instead of
 * creating a duplicate row. Captures the submitter IP + UA for future
 * fraud detection (not actively used in MVP).
 *
 * Response includes `showTrustpilotCta = ratingMedconnect === 5` and the
 * Trustpilot URL so the frontend can render the inline bridge button
 * without hardcoding the URL — single source of truth lives here.
 */
export async function POST(request, { params }) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const parsed = reviewSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }
  const { ratingMedconnect, ratingClinic, commentMedconnect, commentClinic } = parsed.data;

  // Source attribution for fraud detection. x-forwarded-for is what Vercel
  // populates; fall back to remote address for completeness on local dev.
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const ip = (forwardedFor.split(',')[0] || '').trim().slice(0, 45) || null;
  const userAgent = (request.headers.get('user-agent') || '').slice(0, 500) || null;

  try {
    const pool = await getPool();

    // Confirm token resolves to a non-cancelled booking. The status filter
    // here mirrors the cron — if the patient cancelled, the email never
    // went out (cancel NULL's the token) and even if a stale token is
    // used, we refuse the review.
    const bRes = await pool.request()
      .input('token', sql.NVarChar(64), token)
      .query(`
        SELECT id, status FROM bookings
        WHERE self_service_token = @token
      `);
    const booking = bRes.recordset[0];
    if (!booking) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    const allowedStatuses = new Set(['confirmed', 'voucher_sent']);
    if (!allowedStatuses.has(booking.status)) {
      return NextResponse.json(
        { error: 'No es posible reseñar una reserva en este estado.' },
        { status: 409 },
      );
    }

    try {
      await pool.request()
        .input('booking_id', sql.NVarChar(50), booking.id)
        .input('rating_mc', sql.TinyInt, ratingMedconnect)
        .input('rating_cl', sql.TinyInt, ratingClinic ?? null)
        .input('comment_mc', sql.NVarChar(2000), commentMedconnect ?? null)
        .input('comment_cl', sql.NVarChar(2000), commentClinic ?? null)
        .input('ip', sql.NVarChar(45), ip)
        .input('ua', sql.NVarChar(500), userAgent)
        .query(`
          INSERT INTO reviews
            (booking_id, rating_medconnect, rating_clinic,
             comment_medconnect, comment_clinic, submitter_ip, submitter_user_agent)
          VALUES
            (@booking_id, @rating_mc, @rating_cl, @comment_mc, @comment_cl, @ip, @ua)
        `);
    } catch (e) {
      // mssql 2627 / 2601 = unique constraint violation. The user already
      // submitted — return 409 with a helpful message rather than 500.
      const code = e?.number || e?.originalError?.number;
      if (code === 2627 || code === 2601) {
        return NextResponse.json(
          { error: 'Ya enviaste tu reseña para esta cita.', alreadySubmitted: true },
          { status: 409 },
        );
      }
      throw e;
    }

    return NextResponse.json({
      ok: true,
      showTrustpilotCta: ratingMedconnect === 5,
      trustpilotUrl: ratingMedconnect === 5 ? TRUSTPILOT_REVIEW_URL : null,
    });
  } catch (err) {
    return internalError(err, '[POST /api/reviews/by-token]');
  }
}
