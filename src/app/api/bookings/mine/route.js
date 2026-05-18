import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

// Reads Clerk session cookies — cannot be statically rendered.
export const dynamic = 'force-dynamic';

const HAS_CLERK = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
);

function toBooking(row) {
  // Patient-facing shape: scoped to what /mi-cuenta needs. We deliberately
  // leave out admin/internal fields (notes, referral_id, self_service_token
  // expiry, etc.) to avoid future leaks. selfServiceToken is included
  // because the patient needs it for the cancel/reschedule link.
  return {
    id: row.id,
    patientName: row.patient_name,
    patientEmail: row.patient_email,
    providerName: row.provider_name,
    specialty: row.specialty,
    procedureName: row.procedure_name || null,
    slotDate: row.slot_date,
    slotTime: row.slot_time,
    amount: row.amount != null ? Number(row.amount) : null,
    status: row.status,
    hasInsurance: !!row.has_insurance,
    insuranceCompany: row.insurance_company,
    servicePrice: row.service_price != null ? Number(row.service_price) : null,
    platformFee: row.platform_fee != null ? Number(row.platform_fee) : null,
    selfServiceToken: row.self_service_token || null,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// GET /api/bookings/mine
//
// Returns the bookings linked to the calling Clerk user. The link can come
// from either:
//
//   1. `clerk_user_id` column — stamped at insert (booker logged in) OR
//      backfilled by the user.created webhook when a new account is
//      created whose email matches an existing booking.
//   2. `patient_email` matching one of the Clerk user's *verified* emails
//      (defensive — covers the window between sign-up and the webhook
//      firing, and also legacy rows where the backfill UPDATE missed for
//      any reason).
//
// We return them both in a single query (clerk_user_id OR email match)
// because the union is the right answer: "every booking that belongs to
// this human" — same answer regardless of how the link was made.
//
// Patient-only endpoint. No admin/ops bypass. The data shape is
// `toBooking` here, NOT the admin shape from `../route.js`.
// ---------------------------------------------------------------------------
export async function GET(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  // No Clerk configured (preview / local without keys) → empty list,
  // not 503. The /mi-cuenta page renders cleanly in that case.
  if (!HAS_CLERK) {
    return NextResponse.json({ bookings: [], _relaxed: true });
  }

  let userId;
  let verifiedEmails = [];
  try {
    const { auth, clerkClient } = await import('@clerk/nextjs/server');
    const session = await auth();
    userId = session?.userId;
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    verifiedEmails = (user?.emailAddresses || [])
      .filter((e) => e?.verification?.status === 'verified')
      .map((e) => String(e?.emailAddress || '').toLowerCase())
      .filter(Boolean);
  } catch (err) {
    console.error('[GET /api/bookings/mine] Clerk lookup failed', err);
    return NextResponse.json({ error: 'auth_failed' }, { status: 500 });
  }

  try {
    const pool = await getPool();
    const req = pool.request().input('userId', sql.NVarChar(255), userId);

    // Build the email-IN clause defensively (parameterized — never inline
    // the strings). If the user has no verified emails (rare but possible
    // mid-signup), the IN list collapses and the query reduces to the
    // clerk_user_id match.
    const emailParams = verifiedEmails.map((e, i) => {
      const name = `e${i}`;
      req.input(name, sql.NVarChar(255), e);
      return `@${name}`;
    });
    const emailClause = emailParams.length
      ? `OR LOWER(patient_email) IN (${emailParams.join(', ')})`
      : '';

    const result = await req.query(`
      SELECT * FROM bookings
      WHERE clerk_user_id = @userId ${emailClause}
      ORDER BY slot_date DESC, slot_time DESC
    `);

    // De-dupe by id (a booking matching BOTH clerk_user_id AND email would
    // appear once in SQL Server, but defensive anyway).
    const seen = new Set();
    const bookings = [];
    for (const row of result.recordset) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      bookings.push(toBooking(row));
    }

    return NextResponse.json({ bookings });
  } catch (err) {
    // If the clerk_user_id column doesn't exist yet (pre-migration DB),
    // fall back to email-only matching so the endpoint still returns
    // something useful until the migration runs.
    if (String(err?.message || '').includes('Invalid column name')) {
      try {
        const pool = await getPool();
        if (!verifiedEmails.length) {
          return NextResponse.json({ bookings: [], _fallback: 'pre-migration' });
        }
        const req2 = pool.request();
        const emailParams2 = verifiedEmails.map((e, i) => {
          const name = `e${i}`;
          req2.input(name, sql.NVarChar(255), e);
          return `@${name}`;
        });
        const r2 = await req2.query(`
          SELECT * FROM bookings
          WHERE LOWER(patient_email) IN (${emailParams2.join(', ')})
          ORDER BY slot_date DESC, slot_time DESC
        `);
        return NextResponse.json({
          bookings: r2.recordset.map(toBooking),
          _fallback: 'pre-migration',
        });
      } catch (err2) {
        console.error('[GET /api/bookings/mine] fallback also failed', err2);
        return NextResponse.json({ error: err2.message }, { status: 500 });
      }
    }
    console.error('[GET /api/bookings/mine]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
