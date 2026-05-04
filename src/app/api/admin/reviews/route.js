import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';
import { internalError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/reviews
 *
 * Reads the full reviews ledger joined to bookings for the admin/ops
 * /admin/reviews page. Role-gated to admin or ops. No mutations from
 * this endpoint — read-only audit view. Edits / takedowns happen via
 * direct SQL with audit log (intentionally not building UI for that
 * in MVP per the plan's "out of scope" list).
 *
 * Query params:
 *   - limit  (1-200, default 100)
 *   - offset (default 0)
 *   - filter: 'positive' (≥4 stars MC), 'negative' (≤2 stars MC), 'all' (default)
 *   - since:  'week' | 'month' | 'all' (default)
 */
export async function GET(request) {
  const rr = requireRole(request, ['admin', 'ops']);
  if (rr instanceof Response) return rr;

  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 100)));
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
  const filter = url.searchParams.get('filter') || 'all';
  const since = url.searchParams.get('since') || 'all';

  const whereClauses = ['1 = 1'];
  if (filter === 'positive') whereClauses.push('r.rating_medconnect >= 4');
  if (filter === 'negative') whereClauses.push('r.rating_medconnect <= 2');
  if (since === 'week')  whereClauses.push("r.submitted_at >= DATEADD(day, -7, SYSDATETIMEOFFSET())");
  if (since === 'month') whereClauses.push("r.submitted_at >= DATEADD(day, -30, SYSDATETIMEOFFSET())");
  const whereSql = whereClauses.join(' AND ');

  try {
    const pool = await getPool();

    // Aggregate stats first — useful for the admin header strip.
    const stats = await pool.request().query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN rating_medconnect = 5 THEN 1 ELSE 0 END) AS five_star_mc,
        SUM(CASE WHEN trustpilot_clicked = 1 THEN 1 ELSE 0 END) AS trustpilot_clicked,
        AVG(CAST(rating_medconnect AS FLOAT)) AS avg_mc,
        AVG(CAST(rating_clinic AS FLOAT)) AS avg_clinic
      FROM reviews
    `);

    // Build a parameterised LIMIT/OFFSET query. SQL Server uses OFFSET …
    // FETCH NEXT … ROWS ONLY rather than LIMIT.
    const reqRows = pool.request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit);
    const rowsResult = await reqRows.query(`
      SELECT
        r.id, r.booking_id,
        r.rating_medconnect, r.rating_clinic,
        r.comment_medconnect, r.comment_clinic,
        r.trustpilot_clicked, r.submitted_at,
        b.patient_name, b.patient_email,
        b.provider_name, b.specialty, b.slot_date, b.slot_time
      FROM reviews r
      INNER JOIN bookings b ON b.id = r.booking_id
      WHERE ${whereSql}
      ORDER BY r.submitted_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const s = stats.recordset[0] || {};
    return NextResponse.json({
      stats: {
        total: Number(s.total) || 0,
        fiveStarMc: Number(s.five_star_mc) || 0,
        trustpilotClicked: Number(s.trustpilot_clicked) || 0,
        avgMc: s.avg_mc != null ? Number(s.avg_mc.toFixed(2)) : null,
        avgClinic: s.avg_clinic != null ? Number(s.avg_clinic.toFixed(2)) : null,
      },
      reviews: rowsResult.recordset.map((r) => ({
        id: r.id,
        bookingId: r.booking_id,
        ratingMedconnect: r.rating_medconnect,
        ratingClinic: r.rating_clinic,
        commentMedconnect: r.comment_medconnect,
        commentClinic: r.comment_clinic,
        trustpilotClicked: !!r.trustpilot_clicked,
        submittedAt: r.submitted_at,
        patientName: r.patient_name,
        patientEmail: r.patient_email,
        providerName: r.provider_name,
        specialty: r.specialty,
        slotDate: r.slot_date,
        slotTime: r.slot_time,
      })),
      paging: { offset, limit },
    });
  } catch (err) {
    return internalError(err, '[GET /api/admin/reviews]');
  }
}
