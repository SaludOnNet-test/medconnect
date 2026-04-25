import { NextResponse } from 'next/server';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { createCaseForBooking } from '@/lib/opsCases';

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
// GET /api/bookings?status=...&from=...&to=...
// ---------------------------------------------------------------------------
export async function GET(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const conditions = [];
  const pool = await getPool();
  const req = pool.request();

  if (status) {
    req.input('status', sql.NVarChar(30), status);
    conditions.push('status = @status');
  }
  if (from) {
    req.input('from', sql.NVarChar(20), from);
    conditions.push('slot_date >= @from');
  }
  if (to) {
    req.input('to', sql.NVarChar(20), to);
    conditions.push('slot_date <= @to');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await req.query(`SELECT * FROM bookings ${where} ORDER BY created_at DESC`);
    return NextResponse.json(result.recordset.map(toBooking));
  } catch (err) {
    console.error('[GET /api/bookings]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/bookings — create booking after payment
// ---------------------------------------------------------------------------
export async function POST(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const body = await request.json();
  const {
    id,
    referralId,
    patientName,
    patientEmail,
    patientPhone,
    patientAddress,
    providerId,
    providerName,
    specialty,
    slotDate,
    slotTime,
    amount,
    status,
    cardLast4,
    hasInsurance,
    insuranceCompany,
    paymentIntentId,
  } = body;

  if (!id || !patientEmail) {
    return NextResponse.json({ error: 'id and patientEmail are required' }, { status: 400 });
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar(50), id)
      .input('referral_id', sql.NVarChar(50), referralId || null)
      .input('patient_name', sql.NVarChar(255), patientName || null)
      .input('patient_email', sql.NVarChar(255), patientEmail)
      .input('patient_phone', sql.NVarChar(50), patientPhone || null)
      .input('patient_address', sql.NVarChar(500), patientAddress || null)
      .input('provider_id', sql.Int, providerId || null)
      .input('provider_name', sql.NVarChar(255), providerName || null)
      .input('specialty', sql.NVarChar(100), specialty || null)
      .input('slot_date', sql.NVarChar(20), slotDate || null)
      .input('slot_time', sql.NVarChar(10), slotTime || null)
      .input('amount', sql.Decimal(10, 2), amount || null)
      .input('status', sql.NVarChar(30), status || 'confirmed')
      .input('card_last4', sql.NVarChar(4), cardLast4 || null)
      .input('has_insurance', sql.Bit, hasInsurance ? 1 : 0)
      .input('insurance_company', sql.NVarChar(100), insuranceCompany || null)
      .input('payment_intent_id', sql.NVarChar(80), paymentIntentId || id || null)
      .query(`
        INSERT INTO bookings
          (id, referral_id, patient_name, patient_email, patient_phone, patient_address,
           provider_id, provider_name, specialty, slot_date, slot_time,
           amount, status, card_last4, has_insurance, insurance_company, payment_intent_id)
        VALUES
          (@id, @referral_id, @patient_name, @patient_email, @patient_phone, @patient_address,
           @provider_id, @provider_name, @specialty, @slot_date, @slot_time,
           @amount, @status, @card_last4, @has_insurance, @insurance_company, @payment_intent_id)
      `);

    // Open an operations case for this booking (best-effort, do not break booking creation)
    let opsCase = null;
    try {
      opsCase = await createCaseForBooking({
        id, providerId, providerName, slotDate, slotTime, amount,
      });
    } catch (caseErr) {
      console.error('[POST /api/bookings] case creation failed', caseErr);
    }

    const result = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT * FROM bookings WHERE id = @id');

    return NextResponse.json({
      ...toBooking(result.recordset[0]),
      _case: opsCase,
    }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/bookings]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
