import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { limits } from '@/lib/rateLimit';
import { requireProEmail } from '@/lib/proAuth';

// Reads Clerk session cookies, so it can't be statically rendered.
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Row → camelCase object
// ---------------------------------------------------------------------------
function toReferral(row) {
  return {
    id: row.id,
    state: row.state,
    patientEmail: row.patient_email,
    professionalEmail: row.professional_email,
    professionName: row.profession_name,
    providerId: row.provider_id,
    providerName: row.provider_name,
    slotDate: row.slot_date,
    slotTime: row.slot_time,
    fee: row.fee ? Number(row.fee) : null,
    specialty: row.specialty,
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
    patientAddress: row.patient_address,
    lockInWarningAt: row.lock_in_warning_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET /api/referrals?professionalEmail=...
//
// Auth: requires `professionalEmail` query param AND cross-checks it
// against the signed-in Clerk user's verified emails. Without this, the
// endpoint used to return ALL referrals (including patient_email,
// patient_name, patient_phone, patient_address) when called without a
// param — a global PII leak — and let any pro read any other pro's
// patient list when called with their email.
// ---------------------------------------------------------------------------
export async function GET(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const candidateEmail = (searchParams.get('professionalEmail') || '').trim();
  if (!candidateEmail) {
    return NextResponse.json({ error: 'professionalEmail query param required' }, { status: 400 });
  }

  const auth = await requireProEmail(request, candidateEmail);
  if (!auth.ok) return auth.response;
  const professionalEmail = auth.email;

  try {
    const pool = await getPool();
    const req = pool.request();
    req.input('professionalEmail', sql.NVarChar(255), professionalEmail);
    const queryStr =
      'SELECT * FROM referrals WHERE LOWER(professional_email) = LOWER(@professionalEmail) ORDER BY created_at DESC';

    const result = await req.query(queryStr);
    return NextResponse.json(result.recordset.map(toReferral));
  } catch (err) {
    console.error('[GET /api/referrals]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/referrals — create a new referral
// ---------------------------------------------------------------------------
export async function POST(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  // 10 referrals/hour/IP. Stops accidental form-loop spam without throttling
  // legitimate professional flow (a real pro creates ≤ a handful per hour).
  const r = limits.referralsPost.check(request);
  if (!r.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: r.retryAfterSec },
      { status: 429, headers: r.headers },
    );
  }

  const body = await request.json();
  const {
    id,
    patientEmail,
    professionalEmail,
    professionName,
    providerId,
    providerName,
    slotDate,
    slotTime,
    fee,
    specialty,
    lockInWarningAt,
    slotSource, // 'list' (default) | 'manual' — see schema for context
  } = body;

  if (!id || !patientEmail) {
    return NextResponse.json({ error: 'id and patientEmail are required' }, { status: 400 });
  }

  // Auth — three valid cases:
  //
  //   1. No `professionalEmail` provided + signed-in pro → use their email.
  //      (legacy path, kept for compat with older callers.)
  //   2. `professionalEmail` provided + matches signed-in Clerk user →
  //      verified=true. This is the canonical /pro/dashboard path.
  //   3. `professionalEmail` provided + NO Clerk session →
  //      verified=false, accept anyway. Used by the /book external
  //      "Soy un profesional" derivar flow, where the derivador is a
  //      random doctor who isn't (yet) a Clerk-authed Med Connect Pro,
  //      AND by the patient-side recovery POST in /lock-in/[id]
  //      `loadReferral` when the original DB write was lost.
  //
  // Mismatch (Clerk session whose verified emails do NOT include
  // `professionalEmail`) is still rejected — that's identity-theft
  // territory, not a legitimate anon caller. The rate limit (10/h/IP
  // above) caps the cost of unauth spam.
  //
  // Before this change, every patient-side recovery POST 401'd silently
  // (the .catch(() => {}) in /lock-in/[id]/loadReferral swallowed it),
  // which is why REF-VRHK7OOD6 was never persisted to the DB on
  // 2026-05-18 and the patient got stuck on /book.
  let verifiedDerivador = null;
  if (professionalEmail) {
    const auth = await requireProEmail(request, professionalEmail);
    if (auth.ok) {
      verifiedDerivador = true;
    } else {
      const status = auth.response?.status;
      if (status === 401) {
        // No session — anon caller. Accept the POST without verification.
        verifiedDerivador = false;
      } else {
        // 403 (mismatch) or 400 (bad email) — reject.
        return auth.response;
      }
    }
  }

  // Referrals are capped at 30 days out — anything further is a regular
  // booking, not a fast-track referral. The frontend already filters slots,
  // this is the backend defence against stale clients or direct API calls.
  if (slotDate) {
    const slot = new Date(slotDate + 'T00:00:00');
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() + 30);
    if (Number.isFinite(slot.getTime()) && slot > cutoff) {
      return NextResponse.json(
        { error: 'slot_date must be within 30 days from today' },
        { status: 422 },
      );
    }
  }

  try {
    const pool = await getPool();

    // Classify internal vs external at write time so the commissions API
    // can apply the right rule on read without an extra join per row.
    // Internal = derivador's clinic == destination clinic (one clinic does
    // both halves of the trade). NULL when we can't classify because the
    // derivador isn't mapped to a clinic yet — commissions defaults that
    // to external (the smaller payout).
    let isInternal = null;
    if (professionalEmail && providerId) {
      try {
        const lookup = await pool.request()
          .input('email', sql.NVarChar(255), professionalEmail)
          .query(`SELECT TOP 1 clinic_id FROM admin_users WHERE LOWER(username) = LOWER(@email)`);
        const derivadorClinicId = lookup.recordset[0]?.clinic_id;
        if (derivadorClinicId != null) {
          isInternal = Number(derivadorClinicId) === Number(providerId) ? 1 : 0;
        }
      } catch (lookupErr) {
        // Pre-migration admin_users without clinic_id will throw "Invalid
        // column name" — swallow silently and leave is_internal NULL.
        if (!String(lookupErr?.message || '').includes('Invalid column name')) {
          console.error('[POST /api/referrals] is_internal lookup failed', lookupErr?.message);
        }
      }
    }

    // The is_internal write is wrapped in a fallback INSERT (without the
    // column) so the route keeps working against a DB where the migration
    // hasn't run yet — useful in preview environments.
    try {
      await pool.request()
        .input('id', sql.NVarChar(50), id)
        .input('state', sql.NVarChar(30), 'PENDING')
        .input('patient_email', sql.NVarChar(255), patientEmail)
        .input('professional_email', sql.NVarChar(255), professionalEmail || null)
        .input('profession_name', sql.NVarChar(255), professionName || null)
        .input('provider_id', sql.Int, providerId || null)
        .input('provider_name', sql.NVarChar(255), providerName || null)
        .input('slot_date', sql.NVarChar(20), slotDate || null)
        .input('slot_time', sql.NVarChar(10), slotTime || null)
        .input('fee', sql.Decimal(10, 2), fee || null)
        .input('specialty', sql.NVarChar(100), specialty || null)
        .input('lock_in_warning_at', sql.DateTimeOffset, lockInWarningAt ? new Date(lockInWarningAt) : null)
        .input('is_internal', sql.Bit, isInternal)
        .query(`
          INSERT INTO referrals
            (id, state, patient_email, professional_email, profession_name,
             provider_id, provider_name, slot_date, slot_time, fee, specialty, lock_in_warning_at, is_internal)
          VALUES
            (@id, @state, @patient_email, @professional_email, @profession_name,
             @provider_id, @provider_name, @slot_date, @slot_time, @fee, @specialty, @lock_in_warning_at, @is_internal)
        `);
    } catch (insertErr) {
      if (!String(insertErr?.message || '').includes('Invalid column name')) throw insertErr;
      // Fallback: pre-migration DB. Insert without is_internal.
      await pool.request()
        .input('id', sql.NVarChar(50), id)
        .input('state', sql.NVarChar(30), 'PENDING')
        .input('patient_email', sql.NVarChar(255), patientEmail)
        .input('professional_email', sql.NVarChar(255), professionalEmail || null)
        .input('profession_name', sql.NVarChar(255), professionName || null)
        .input('provider_id', sql.Int, providerId || null)
        .input('provider_name', sql.NVarChar(255), providerName || null)
        .input('slot_date', sql.NVarChar(20), slotDate || null)
        .input('slot_time', sql.NVarChar(10), slotTime || null)
        .input('fee', sql.Decimal(10, 2), fee || null)
        .input('specialty', sql.NVarChar(100), specialty || null)
        .input('lock_in_warning_at', sql.DateTimeOffset, lockInWarningAt ? new Date(lockInWarningAt) : null)
        .query(`
          INSERT INTO referrals
            (id, state, patient_email, professional_email, profession_name,
             provider_id, provider_name, slot_date, slot_time, fee, specialty, lock_in_warning_at)
          VALUES
            (@id, @state, @patient_email, @professional_email, @profession_name,
             @provider_id, @provider_name, @slot_date, @slot_time, @fee, @specialty, @lock_in_warning_at)
        `);
    }

    // Stamp the verified_derivador flag. Same graceful-fallback pattern
    // as slot_source below — column may not exist in pre-migration DBs.
    // null = no professionalEmail in body (legacy); true = Clerk match;
    // false = anon POST (external derivar at /book or recovery from
    // /lock-in). Ops uses this to flag potentially fraudulent referrals
    // for review (only matters if a row passes the rate limit AND looks
    // suspicious — the legitimate volume of anon POSTs is real).
    if (verifiedDerivador !== null) {
      try {
        await pool.request()
          .input('id', sql.NVarChar(50), id)
          .input('verified_derivador', sql.Bit, verifiedDerivador ? 1 : 0)
          .query(`UPDATE referrals SET verified_derivador = @verified_derivador WHERE id = @id`);
      } catch (vErr) {
        if (!String(vErr?.message || '').includes('Invalid column name')) {
          console.error('[POST /api/referrals] verified_derivador stamp failed', vErr?.message);
        }
      }
    }

    // Stamp the slot_source column for audit (manual vs list).
    // Best-effort: pre-migration DB without the column silently no-ops
    // so the route keeps working. We do this as a follow-up UPDATE
    // instead of folding into the INSERT so the two INSERT variants
    // above don't have to grow another column each.
    if (slotSource) {
      try {
        await pool.request()
          .input('id', sql.NVarChar(50), id)
          .input('slot_source', sql.NVarChar(20), slotSource)
          .query(`UPDATE referrals SET slot_source = @slot_source WHERE id = @id`);
      } catch (slotSrcErr) {
        if (!String(slotSrcErr?.message || '').includes('Invalid column name')) {
          console.error('[POST /api/referrals] slot_source stamp failed', slotSrcErr?.message);
        }
      }
    }

    // Fetch the inserted row to return it
    const result = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT * FROM referrals WHERE id = @id');

    return NextResponse.json(toReferral(result.recordset[0]), { status: 201 });
  } catch (err) {
    console.error('[POST /api/referrals]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
