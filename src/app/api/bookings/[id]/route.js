import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { requireRole } from '@/lib/adminAuth';
import { internalError, clientError } from '@/lib/errors';

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

  // Patient self-service flows must use /api/bookings/by-token/[token],
  // which authenticates with the unguessable token. Direct id lookup is
  // ops-only.
  const auth = requireRole(request, ['admin', 'ops']);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT * FROM bookings WHERE id = @id');

    if (!result.recordset.length) {
      return clientError('Not found', 404);
    }
    return NextResponse.json(toBooking(result.recordset[0]));
  } catch (err) {
    return internalError(err, '[GET /api/bookings/[id]]');
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

  // Status/notes/slot edits are an ops superpower — letting an unauthenticated
  // caller PATCH a booking would let them silently flip a confirmed visit to
  // 'cancelled' or rewrite the slot. Lock it.
  const auth = requireRole(request, ['admin', 'ops']);
  if (auth instanceof Response) return auth;

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
    return clientError('No fields to update', 400);
  }

  setClauses.push('updated_at = SYSDATETIMEOFFSET()');

  try {
    await req.query(`UPDATE bookings SET ${setClauses.join(', ')} WHERE id = @id`);

    const result = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT * FROM bookings WHERE id = @id');

    if (!result.recordset.length) {
      return clientError('Not found', 404);
    }
    return NextResponse.json(toBooking(result.recordset[0]));
  } catch (err) {
    return internalError(err, '[PATCH /api/bookings/[id]]');
  }
}
