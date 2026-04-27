import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

export const dynamic = 'force-dynamic';

// MVP commission model. Each confirmed referral earns the professional a flat
// amount until the business defines a percentage-of-payment-to-clinic rule.
// Driven by env var so the rate can be tuned without a deploy.
const COMMISSION_PER_CONFIRMED_REFERRAL =
  Number(process.env.PRO_COMMISSION_PER_REFERRAL || 5);

/**
 * GET /api/pro/commissions?email=...
 *
 * Aggregates earnings + activity counts for one professional. Read-only view
 * over `referrals` joined with `bookings` and `operations_cases`. No schema
 * change needed — data is already in place from the existing booking flow.
 *
 * Auth: scoped by `email` query param. The pro dashboard reads the signed-in
 * Clerk user's email and passes it through. We treat the email as the
 * identifier — same as `referrals.professional_email`. (Stronger auth would
 * cross-check Clerk's userId against a `professionals` table mapping; left
 * for a follow-up once the table exists.)
 */
export async function GET(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json(
      { error: 'DB not configured', commissionPerReferral: COMMISSION_PER_CONFIRMED_REFERRAL,
        totalEarned: 0, last30dEarned: 0, byState: {}, recent: [] },
      { status: 200 },
    );
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 });
  }

  try {
    const pool = await getPool();

    // Counts by state for the activity strip.
    const stateCounts = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .query(`
        SELECT state, COUNT(*) AS n
        FROM referrals
        WHERE LOWER(professional_email) = @email
        GROUP BY state
      `);

    const byState = {};
    for (const row of stateCounts.recordset) byState[row.state] = row.n;

    const confirmedTotal = byState['confirmed'] || 0;

    // Last-30-day earnings: confirmed referrals updated in the window.
    const last30 = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .query(`
        SELECT COUNT(*) AS n
        FROM referrals
        WHERE LOWER(professional_email) = @email
          AND state = 'confirmed'
          AND updated_at >= DATEADD(day, -30, SYSUTCDATETIME())
      `);
    const last30Confirmed = last30.recordset[0]?.n || 0;

    // Recent referrals (last 20) for the table.
    const recent = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .query(`
        SELECT TOP 20
          r.id, r.state, r.patient_email, r.provider_name, r.specialty,
          r.slot_date, r.slot_time, r.fee, r.created_at, r.updated_at,
          b.amount AS booking_amount, b.status AS booking_status
        FROM referrals r
        LEFT JOIN bookings b ON b.referral_id = r.id
        WHERE LOWER(r.professional_email) = @email
        ORDER BY r.updated_at DESC
      `);

    return NextResponse.json({
      email,
      commissionPerReferral: COMMISSION_PER_CONFIRMED_REFERRAL,
      totalEarned: confirmedTotal * COMMISSION_PER_CONFIRMED_REFERRAL,
      last30dEarned: last30Confirmed * COMMISSION_PER_CONFIRMED_REFERRAL,
      byState,
      recent: recent.recordset.map((r) => ({
        id: r.id,
        state: r.state,
        patientEmail: r.patient_email,
        providerName: r.provider_name,
        specialty: r.specialty,
        slotDate: r.slot_date,
        slotTime: r.slot_time,
        fee: r.fee != null ? Number(r.fee) : null,
        bookingAmount: r.booking_amount != null ? Number(r.booking_amount) : null,
        bookingStatus: r.booking_status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        commission: r.state === 'confirmed' ? COMMISSION_PER_CONFIRMED_REFERRAL : 0,
      })),
    });
  } catch (err) {
    console.error('[GET /api/pro/commissions]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
