import { NextResponse } from 'next/server';
import sql from 'mssql';
import { getPool, DB_AVAILABLE } from '@/lib/db';

/**
 * GET /api/stats/testimonials?specialty=<slug>&limit=3
 *
 * Returns: { testimonials: [{ firstName, rating, comment, specialty }] }
 *
 * 2026-06-04 — A5. Pulls real reviews from the `reviews` table joined to
 * `bookings` (for patient name + specialty). Filters:
 *   - rating_medconnect >= 4 (only positive)
 *   - comment_medconnect IS NOT NULL and length >= 30 chars (skip empties)
 *   - submitted in the last 180 days (avoid stale tone)
 *
 * The endpoint is intentionally generous about specialty matching: if a
 * specific specialty has < 3 qualifying reviews, we fall back to ANY
 * specialty. The frontend then renders nothing if the array is empty.
 *
 * Privacy: we surface ONLY the patient's first name (not full name) and
 * never the email. This matches the consent the patient gave when leaving
 * the review (the form copy says "Your first name may appear publicly").
 */

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const specialty = (url.searchParams.get('specialty') || '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 3), 1), 6);

  if (!DB_AVAILABLE) {
    return NextResponse.json({ testimonials: [] }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  try {
    const pool = await getPool();
    const req = pool.request()
      .input('specialty', sql.NVarChar(100), specialty || '')
      .input('lim', sql.Int, limit);

    // Two-pass query: prefer same-specialty reviews, fall back to any.
    // Done in a single SQL with a CTE so we only pay one round-trip.
    const result = await req.query(`
      WITH all_reviews AS (
        SELECT TOP (100)
          r.rating_medconnect AS rating,
          r.comment_medconnect AS comment,
          b.patient_name AS patient_name,
          b.specialty AS specialty,
          r.submitted_at AS submitted_at,
          CASE
            WHEN @specialty <> '' AND LOWER(b.specialty) LIKE '%' + @specialty + '%' THEN 1
            ELSE 0
          END AS specialty_match
        FROM reviews r
        JOIN bookings b ON b.id = r.booking_id
        WHERE r.rating_medconnect >= 4
          AND r.comment_medconnect IS NOT NULL
          AND LEN(r.comment_medconnect) >= 30
          AND r.submitted_at >= DATEADD(day, -180, SYSDATETIMEOFFSET())
        ORDER BY r.submitted_at DESC
      )
      SELECT TOP (@lim) rating, comment, patient_name, specialty, specialty_match
      FROM all_reviews
      ORDER BY specialty_match DESC, submitted_at DESC
    `);

    const rows = result.recordset || [];
    const testimonials = rows.map((r) => {
      // Extract first name only — privacy.
      const fullName = (r.patient_name || '').trim();
      const firstName = fullName.split(/\s+/)[0] || 'Paciente';
      return {
        firstName,
        rating: r.rating,
        comment: (r.comment || '').slice(0, 280), // hard cap for layout
        specialty: r.specialty || null,
      };
    });

    return NextResponse.json({ testimonials }, {
      headers: { 'Cache-Control': 'public, max-age=300' }, // 5 min CDN cache
    });
  } catch (err) {
    console.error('[stats/testimonials] query failed', err);
    return NextResponse.json({ testimonials: [] }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }
}
