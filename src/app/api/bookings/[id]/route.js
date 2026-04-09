import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';

function toBooking(row) {
  return {
    id: row.id,
    referralId: row.referral_id,
    patientName: row.patient_name,
    patientEmail: row.patient_email,
    patientPhone: row.patient_phone,
    patientAddress: row.patient_address,
    providerId: row.provider_id,
    providerName: row.provider_name,
    specialty: row.specialty,
    slotDate: row.slot_date,
    slotTime: row.slot_time,
    amount: row.amount ? Number(row.amount) : null,
    status: row.status,
    cardLast4: row.card_last4,
    hasInsurance: !!row.has_insurance,
    insuranceCompany: row.insurance_company,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET /api/bookings/[id]
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
      .query('SELECT * FROM bookings WHERE id = @id');

    if (!result.recordset.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(toBooking(result.recordset[0]));
  } catch (err) {
    console.error('[GET /api/bookings/[id]]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/bookings/[id]
// Accepted fields: status, notes, slotDate, slotTime, providerName, amount
// ---------------------------------------------------------------------------
export async function PATCH(request, { params }) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { id } = await params;
  const body = await request.json();
  const pool = await getPool();

  const setClauses = [];
  const req = pool.request().input('id', sql.NVarChar(50), id);

  if (body.status !== undefined) {
    req.input('status', sql.NVarChar(30), body.status);
    setClauses.push('status = @status');
  }
  if (body.notes !== undefined) {
    req.input('notes', sql.NVarChar(sql.MAX), body.notes);
    setClauses.push('notes = @notes');
  }
  if (body.slotDate !== undefined) {
    req.input('slot_date', sql.NVarChar(20), body.slotDate);
    setClauses.push('slot_date = @slot_date');
  }
  if (body.slotTime !== undefined) {
    req.input('slot_time', sql.NVarChar(10), body.slotTime);
    setClauses.push('slot_time = @slot_time');
  }
  if (body.providerName !== undefined) {
    req.input('provider_name', sql.NVarChar(255), body.providerName);
    setClauses.push('provider_name = @provider_name');
  }
  if (body.amount !== undefined) {
    req.input('amount', sql.Decimal(10, 2), body.amount);
    setClauses.push('amount = @amount');
  }

  if (!setClauses.length) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  setClauses.push('updated_at = SYSDATETIMEOFFSET()');

  try {
    await req.query(`UPDATE bookings SET ${setClauses.join(', ')} WHERE id = @id`);

    const result = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT * FROM bookings WHERE id = @id');

    if (!result.recordset.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(toBooking(result.recordset[0]));
  } catch (err) {
    console.error('[PATCH /api/bookings/[id]]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
