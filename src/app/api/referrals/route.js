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
  } = body;

  if (!id || !patientEmail) {
    return NextResponse.json({ error: 'id and patientEmail are required' }, { status: 400 });
  }

  // Auth: when a `professionalEmail` is supplied (the normal path from
  // /pro/dashboard's ReferralModal), it must match the signed-in Clerk
  // user. Without this anyone could create referrals attributed to any
  // other pro — fraud + commission attribution abuse. We accept missing
  // professionalEmail (legacy callers) but in that case we still require
  // a signed-in pro and stamp their email on the row.
  if (professionalEmail) {
    const auth = await requireProEmail(request, professionalEmail);
    if (!auth.ok) return auth.response;
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
