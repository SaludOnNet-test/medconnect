import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { requireProEmail } from '@/lib/proAuth';

export const dynamic = 'force-dynamic';

// ─── Commission model ──────────────────────────────────────────────────────
//
// Two streams accrue independently:
//
//  • DERIVING (you sent a patient to another clinic): per-event flat tier
//    based on how far in advance the cita was booked.
//      0–14 days: 5 €
//     15–30 days: 3 €
//      > 30 days: rejected upstream
//    Only applies when the derivation is *external* (is_internal = 0 / NULL).
//    Internal derivations (you derived to your own clinic) deliberately do
//    NOT pay this — self-derivation doesn't increase the fee, so we just
//    collect the accepting commission below.
//
//  • ACCEPTING (a patient was attended at your clinic): 50 % of the priority
//    fee the patient paid. Applies to every confirmed booking landing on
//    the pro's clinic, including:
//      – referrals (internal or external) — sourced from referrals.fee
//      – direct bookings (no referrals row, /search-v2 + ops-routed) —
//        sourced from bookings.amount
//
// totalEarned = derivingTotal + acceptingTotal.
//
const COMMISSION_TIERS = [
  { upToDays: 14, amount: 5 },
  { upToDays: 30, amount: 3 },
];

const ACCEPT_PCT = 0.50;

function derivingCommissionFor(slotDate, createdAt) {
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

function acceptingCommissionFor(priorityFee) {
  const fee = Number(priorityFee || 0);
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  return Math.round(fee * ACCEPT_PCT * 100) / 100;
}

/**
 * GET /api/pro/commissions?email=...
 *
 * Aggregates earnings + activity counts for one professional. Read-only view
 * over `referrals` + `bookings` + `admin_users`. Two commission streams:
 *
 *   - deriving: this pro created the referral. Pays 5 €/3 € per confirmed
 *     external referral (internal referrals don't pay deriving).
 *   - accepting: a confirmed booking landed at this pro's clinic. Pays 50 %
 *     of the priority fee. Sources: referrals.fee (for referrals where this
 *     pro's clinic is the destination) + bookings.amount (for direct
 *     bookings ops-routed to this clinic).
 *
 * Auth: scoped by `email` query param AND cross-checked against the signed-in
 * Clerk user. The candidate email must be one of the user's verified Clerk
 * addresses; otherwise we 403.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const candidateEmail = (searchParams.get('email') || '').trim().toLowerCase();
  if (!candidateEmail) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 });
  }

  const auth = await requireProEmail(request, candidateEmail);
  if (!auth.ok) return auth.response;
  const email = auth.email;

  if (!DB_AVAILABLE) {
    return NextResponse.json(
      {
        error: 'DB not configured',
        commissionTiers: COMMISSION_TIERS,
        acceptPercent: ACCEPT_PCT,
        totalEarned: 0,
        last30dEarned: 0,
        breakdown: { deriving: 0, accepting: 0 },
        byState: {},
        recent: [],
      },
      { status: 200 },
    );
  }

  try {
    const pool = await getPool();

    // Look up the pro's clinic_id once — used by the accepting query and
    // also surfaced in the response so the UI knows whether the pro is
    // currently mapped to a clinic at all.
    let proClinicId = null;
    try {
      const meRes = await pool.request()
        .input('email', sql.NVarChar(255), email)
        .query(`SELECT TOP 1 clinic_id FROM admin_users WHERE LOWER(username) = LOWER(@email)`);
      proClinicId = meRes.recordset[0]?.clinic_id ?? null;
    } catch (meErr) {
      // Pre-migration admin_users.clinic_id; treat as no clinic mapping.
      if (!String(meErr?.message || '').includes('Invalid column name')) {
        console.error('[GET /api/pro/commissions] me lookup', meErr?.message);
      }
    }

    // Counts by state for the activity strip (unchanged).
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

    const last30Cutoff = new Date();
    last30Cutoff.setDate(last30Cutoff.getDate() - 30);

    // ── Stream 1 · DERIVING commission ──────────────────────────────────
    // Confirmed external referrals created by this pro. Internal referrals
    // are filtered out — they accrue under the accepting stream only.
    // is_internal IS NULL (legacy unclassified rows) defaults to external,
    // matching the migration's conservative default.
    let derivingTotal = 0;
    let derivingLast30 = 0;
    const derivingByRefId = new Map(); // referral_id → commission € (for per-row display)
    let derivingFallback = false;
    try {
      const derivingRes = await pool.request()
        .input('email', sql.NVarChar(255), email)
        .query(`
          SELECT id, slot_date, created_at, updated_at
          FROM referrals
          WHERE LOWER(professional_email) = @email
            AND state = 'confirmed'
            AND (is_internal IS NULL OR is_internal = 0)
        `);
      for (const row of derivingRes.recordset) {
        const amount = derivingCommissionFor(row.slot_date, row.created_at);
        derivingTotal += amount;
        if (row.updated_at && new Date(row.updated_at) >= last30Cutoff) {
          derivingLast30 += amount;
        }
        derivingByRefId.set(row.id, amount);
      }
    } catch (derivingErr) {
      // Pre-migration DB without is_internal — fall back to the unfiltered
      // query (every confirmed referral counts as deriving). The dashboard
      // total is slightly off in this transition window but the route
      // doesn't 500.
      if (!String(derivingErr?.message || '').includes('Invalid column name')) throw derivingErr;
      derivingFallback = true;
      const derivingRes = await pool.request()
        .input('email', sql.NVarChar(255), email)
        .query(`
          SELECT id, slot_date, created_at, updated_at
          FROM referrals
          WHERE LOWER(professional_email) = @email
            AND state = 'confirmed'
        `);
      for (const row of derivingRes.recordset) {
        const amount = derivingCommissionFor(row.slot_date, row.created_at);
        derivingTotal += amount;
        if (row.updated_at && new Date(row.updated_at) >= last30Cutoff) {
          derivingLast30 += amount;
        }
        derivingByRefId.set(row.id, amount);
      }
    }

    // ── Stream 2 · ACCEPTING commission ─────────────────────────────────
    // Every confirmed booking that landed on this pro's clinic — referral
    // or not. 50 % of the priority fee per booking. Only runs if the pro
    // is mapped to a clinic; otherwise there's nothing to accept yet.
    let acceptingTotal = 0;
    let acceptingLast30 = 0;
    const acceptingRows = [];
    if (proClinicId != null) {
      const acceptingRes = await pool.request()
        .input('clinicId', sql.Int, proClinicId)
        .query(`
          SELECT
            b.id          AS booking_id,
            b.amount      AS priority_fee,
            b.slot_date,
            b.created_at,
            b.updated_at,
            b.referral_id,
            b.status
          FROM bookings b
          WHERE b.provider_id = @clinicId
            AND b.status = 'confirmed'
        `);
      for (const row of acceptingRes.recordset) {
        const amount = acceptingCommissionFor(row.priority_fee);
        acceptingTotal += amount;
        if (row.updated_at && new Date(row.updated_at) >= last30Cutoff) {
          acceptingLast30 += amount;
        }
        acceptingRows.push({ ...row, commission: amount });
      }
    }

    const totalEarned = Math.round((derivingTotal + acceptingTotal) * 100) / 100;
    const last30dEarned = Math.round((derivingLast30 + acceptingLast30) * 100) / 100;

    // Recent referrals (last 20) for the table. Each row carries the
    // commission attributable to *this* pro on this referral — that is,
    // either the deriving commission (if the pro derived it) OR the
    // accepting commission (if the pro's clinic was the destination).
    // We compute both so the UI can show the right one per tab.
    const recent = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .query(`
        SELECT TOP 20
          r.id, r.state, r.patient_email, r.provider_id, r.provider_name, r.specialty,
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
      acceptPercent: ACCEPT_PCT,
      totalEarned,
      last30dEarned,
      breakdown: {
        deriving: Math.round(derivingTotal * 100) / 100,
        accepting: Math.round(acceptingTotal * 100) / 100,
        derivingFallback,
      },
      byState,
      acceptingRecent: acceptingRows
        .slice()
        .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
        .slice(0, 20)
        .map((r) => ({
          bookingId: r.booking_id,
          referralId: r.referral_id,
          priorityFee: r.priority_fee != null ? Number(r.priority_fee) : null,
          commission: r.commission,
          slotDate: r.slot_date,
          updatedAt: r.updated_at,
        })),
      recent: recent.recordset.map((r) => ({
        id: r.id,
        state: r.state,
        patientEmail: r.patient_email,
        providerId: r.provider_id,
        providerName: r.provider_name,
        specialty: r.specialty,
        slotDate: r.slot_date,
        slotTime: r.slot_time,
        fee: r.fee != null ? Number(r.fee) : null,
        bookingAmount: r.booking_amount != null ? Number(r.booking_amount) : null,
        bookingStatus: r.booking_status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        // Per-row deriving commission (0 for internal referrals or when not
        // confirmed). Useful in the "derivaciones externas" table.
        commission: derivingByRefId.get(r.id) ?? 0,
        // Per-row accepting commission (0 unless this pro's clinic was the
        // destination of this referral). Useful in the "interna" table.
        acceptingCommission: proClinicId != null && r.provider_id === proClinicId && r.booking_amount != null && r.booking_status === 'confirmed'
          ? acceptingCommissionFor(r.booking_amount)
          : 0,
      })),
    });
  } catch (err) {
    console.error('[GET /api/pro/commissions]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
