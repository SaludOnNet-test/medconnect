import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { internalError } from '@/lib/errors';
import { requireAuth, hasRole } from '@/lib/adminAuth';
import { requireProEmail } from '@/lib/proAuth';

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
// Authorization tiers.
//
// Legitimate consumers of /api/referrals/[id] found in the codebase:
//   - /admin/ops/internas — admin/ops PATCH via adminFetch (Bearer token).
//   - /pro/dashboard      — Clerk-signed-in derivador PATCH (cancel → EXPIRED).
//   - /lock-in/[id] and /book — ANONYMOUS patient flow. The patient opens
//     the lock-in email link (the referral id acts as an unguessable
//     capability token), completes their data (PATCH DATA_COMPLETED) and
//     pays (PATCH CONFIRMED). This flow cannot carry any session.
//
// So instead of a hard requireRole() (which would break the core patient
// funnel), we tier:
//   'admin' — valid admin/ops session token → full access.
//   'pro'   — Clerk session whose verified emails include the referral's
//             professional_email → full access.
//   'anon'  — capability-URL patient flow → GET allowed, PATCH restricted
//             to the patient-flow fields and states (no arbitrary state
//             injection like PAID, no professional reassignment).
// ---------------------------------------------------------------------------
const ANON_ALLOWED_STATES = new Set(['DATA_COMPLETED', 'CONFIRMED', 'EXPIRED']);

async function resolveTier(request, row) {
  const session = requireAuth(request);
  if (session && hasRole(session, ['admin', 'ops'])) return 'admin';
  if (row?.professional_email) {
    try {
      const pro = await requireProEmail(request, row.professional_email);
      if (pro.ok && !pro.relaxed) return 'pro';
    } catch {
      // fall through to anon
    }
  }
  return 'anon';
}

async function fetchReferralRow(pool, id) {
  const result = await pool.request()
    .input('id', sql.NVarChar(50), id)
    .query('SELECT * FROM referrals WHERE id = @id');
  return result.recordset[0] || null;
}

// ---------------------------------------------------------------------------
// GET /api/referrals/[id]
// ---------------------------------------------------------------------------
export async function GET(request, { params }) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { id } = await params;

  try {
    const pool = await getPool();
    const row = await fetchReferralRow(pool, id);
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // Anonymous GET is intentionally allowed: the referral id is a random
    // capability token delivered to the patient by email, and the lock-in
    // page needs the row to render. Admin/pro tiers also pass.
    return NextResponse.json(toReferral(row));
  } catch (err) {
    return internalError(err, '[GET /api/referrals/[id]]');
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/referrals/[id]
// Accepted fields: state, patientName, patientPhone, patientAddress, completedAt
// ---------------------------------------------------------------------------
export async function PATCH(request, { params }) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { id } = await params;
  const body = await request.json();

  try {
    const pool = await getPool();
    const row = await fetchReferralRow(pool, id);
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const tier = await resolveTier(request, row);
    if (tier === 'anon' && body.state !== undefined && !ANON_ALLOWED_STATES.has(String(body.state))) {
      return NextResponse.json(
        { error: 'state not allowed without authentication' },
        { status: 403 },
      );
    }

    const setClauses = [];
    const req = pool.request().input('id', sql.NVarChar(50), id);

    if (body.state !== undefined) {
      req.input('state', sql.NVarChar(30), body.state);
      setClauses.push('state = @state');
    }
    if (body.patientName !== undefined) {
      req.input('patient_name', sql.NVarChar(255), body.patientName);
      setClauses.push('patient_name = @patient_name');
    }
    if (body.patientPhone !== undefined) {
      req.input('patient_phone', sql.NVarChar(50), body.patientPhone);
      setClauses.push('patient_phone = @patient_phone');
    }
    if (body.patientAddress !== undefined) {
      req.input('patient_address', sql.NVarChar(500), body.patientAddress);
      setClauses.push('patient_address = @patient_address');
    }
    if (body.completedAt !== undefined) {
      req.input('completed_at', sql.DateTimeOffset, body.completedAt ? new Date(body.completedAt) : null);
      setClauses.push('completed_at = @completed_at');
    }

    if (!setClauses.length) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push('updated_at = SYSDATETIMEOFFSET()');

    await req.query(`UPDATE referrals SET ${setClauses.join(', ')} WHERE id = @id`);

    const updated = await fetchReferralRow(pool, id);
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(toReferral(updated));
  } catch (err) {
    return internalError(err, '[PATCH /api/referrals/[id]]');
  }
}
