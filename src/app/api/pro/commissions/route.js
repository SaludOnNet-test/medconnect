import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Commission tiers — keyed off how far in advance the slot is booked.
// 0–14 days (first two weeks):  5 €
// 15–30 days (weeks 3–4):       3 €
// >30 days:                     N/A — frontend + /api/referrals reject
//                              these before we ever get here.
const COMMISSION_TIERS = [
  { upToDays: 14, amount: 5 },
  { upToDays: 30, amount: 3 },
];

function commissionFor(slotDate, createdAt) {
  if (!slotDate || !createdAt) return 0;
  const slot = new Date(`${slotDate}T00:00:00`);
  const created = new Date(createdAt);
  if (!Number.isFinite(slot.getTime()) || !Number.isFinite(created.getTime())) return 0;
  const days = Math.round((slot - created) / 86400000);
  if (days < 0) return 0;
  for (const tier of COMMISSION_TIERS) {
    if (days <= tier.upToDays) return tier.amount;
  }
  return 0;
}

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
      { error: 'DB not configured', commissionTiers: COMMISSION_TIERS,
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

    // Confirmed referrals — needed to compute commission per row, since the
    // amount depends on how far ahead the slot was booked.
    const confirmed = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .query(`
        SELECT id, slot_date, created_at, updated_at
        FROM referrals
        WHERE LOWER(professional_email) = @email
          AND state = 'confirmed'
      `);

    let totalEarned = 0;
    let last30dEarned = 0;
    const last30Cutoff = new Date();
    last30Cutoff.setDate(last30Cutoff.getDate() - 30);
    for (const row of confirmed.recordset) {
      const amount = commissionFor(row.slot_date, row.created_at);
      totalEarned += amount;
      if (row.updated_at && new Date(row.updated_at) >= last30Cutoff) {
        last30dEarned += amount;
      }
    }

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
      commissionTiers: COMMISSION_TIERS,
      totalEarned,
      last30dEarned,
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
        commission: r.state === 'confirmed' ? commissionFor(r.slot_date, r.created_at) : 0,
      })),
    });
  } catch (err) {
    console.error('[GET /api/pro/commissions]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
