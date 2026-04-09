import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

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
// GET /api/referrals/[id]
// ---------------------------------------------------------------------------
export async function GET(request, { params }) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { id } = await params;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT * FROM referrals WHERE id = @id');

    if (!result.recordset.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(toReferral(result.recordset[0]));
  } catch (err) {
    console.error('[GET /api/referrals/[id]]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
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

  const setClauses = [];
  const req = (await getPool()).request().input('id', sql.NVarChar(50), id);

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

  try {
    await req.query(`UPDATE referrals SET ${setClauses.join(', ')} WHERE id = @id`);

    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT * FROM referrals WHERE id = @id');

    if (!result.recordset.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(toReferral(result.recordset[0]));
  } catch (err) {
    console.error('[PATCH /api/referrals/[id]]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
