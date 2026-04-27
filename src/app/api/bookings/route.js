import { NextResponse } from 'next/server';
import crypto from 'crypto';
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
    procedureSlug: row.procedure_slug || null,
    procedureName: row.procedure_name || null,
    servicePrice: row.service_price != null ? Number(row.service_price) : null,
    platformFee: row.platform_fee != null ? Number(row.platform_fee) : null,
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
    procedureSlug,
    procedureName,
    servicePrice,
    platformFee,
  } = body;

  if (!id || !patientEmail) {
    return NextResponse.json({ error: 'id and patientEmail are required' }, { status: 400 });
  }

  // B9 — server-side amount validation. For sin-seguro bookings we re-fetch the
  // SON catalogue price for the (clinic, procedure) pair and verify it matches
  // what the client charged. Prevents query-string price tampering.
  if (hasInsurance === false && procedureSlug && providerId) {
    try {
      const pool = await getPool();
      const priceResult = await pool.request()
        .input('clinic_id', sql.Int, providerId)
        .input('procedure_slug', sql.NVarChar(100), procedureSlug)
        .query(`
          SELECT TOP 1 price FROM clinic_procedures
          WHERE clinic_id = @clinic_id AND procedure_slug = @procedure_slug
        `);
      const dbPrice = priceResult.recordset[0]?.price;
      const expected = Number(dbPrice ?? 0) + Number(platformFee || 0);
      if (dbPrice != null && Math.abs(Number(amount) - expected) > 0.01) {
        console.warn(`[POST /api/bookings] amount mismatch for ${id}: charged=${amount} expected=${expected.toFixed(2)} (procedure=${procedureSlug})`);
        return NextResponse.json(
          { error: 'amount_mismatch', expected, charged: Number(amount) },
          { status: 400 },
        );
      }
    } catch (validErr) {
      console.error('[POST /api/bookings] price validation failed', validErr);
      // Continue — don't block bookings on validation infra failures, but the
      // warn above flags it for ops review.
    }
  }

  // B2 — sin seguro starts at awaiting_voucher (ops must upload SON voucher).
  const finalStatus = status || (hasInsurance === true ? 'confirmed' : 'awaiting_voucher');

  // F2 — generate the patient self-service token at insert time. 32 hex chars
  // (128 bits of entropy), unique-indexed so collisions error out instead of
  // silently sharing tokens between bookings.
  const selfServiceToken = crypto.randomBytes(16).toString('hex');

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
      .input('status', sql.NVarChar(30), finalStatus)
      .input('card_last4', sql.NVarChar(4), cardLast4 || null)
      .input('has_insurance', sql.Bit, hasInsurance ? 1 : 0)
      .input('insurance_company', sql.NVarChar(100), insuranceCompany || null)
      .input('payment_intent_id', sql.NVarChar(80), paymentIntentId || id || null)
      .input('procedure_slug', sql.NVarChar(100), procedureSlug || null)
      .input('procedure_name', sql.NVarChar(255), procedureName || null)
      .input('service_price', sql.Decimal(10, 2), servicePrice != null ? Number(servicePrice) : null)
      .input('platform_fee', sql.Decimal(10, 2), platformFee != null ? Number(platformFee) : null)
      .input('self_service_token', sql.NVarChar(64), selfServiceToken)
      .query(`
        INSERT INTO bookings
          (id, referral_id, patient_name, patient_email, patient_phone, patient_address,
           provider_id, provider_name, specialty, slot_date, slot_time,
           amount, status, card_last4, has_insurance, insurance_company, payment_intent_id,
           procedure_slug, procedure_name, service_price, platform_fee, self_service_token)
        VALUES
          (@id, @referral_id, @patient_name, @patient_email, @patient_phone, @patient_address,
           @provider_id, @provider_name, @specialty, @slot_date, @slot_time,
           @amount, @status, @card_last4, @has_insurance, @insurance_company, @payment_intent_id,
           @procedure_slug, @procedure_name, @service_price, @platform_fee, @self_service_token)
      `);

    // For sin-seguro bookings, open a voucher row in awaiting_voucher state so
    // ops can pick it up from the dashboard.
    if (hasInsurance === false) {
      try {
        await pool.request()
          .input('booking_id', sql.NVarChar(50), id)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM vouchers WHERE booking_id = @booking_id)
            INSERT INTO vouchers (booking_id, status) VALUES (@booking_id, 'awaiting_voucher')
          `);
      } catch (voucherErr) {
        console.error('[POST /api/bookings] voucher row creation failed', voucherErr);
      }
    }

    // Open an operations case for this booking (best-effort, do not break booking creation)
    let opsCase = null;
    try {
      opsCase = await createCaseForBooking({
        id, providerId, providerName, slotDate, slotTime, amount,
        platformFee: platformFee != null ? Number(platformFee) : null,
      });
    } catch (caseErr) {
      console.error('[POST /api/bookings] case creation failed', caseErr);
    }

    const result = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT * FROM bookings WHERE id = @id');

    // F2 — surface the self-service token to the booking flow so the email
    // dispatcher can build the cancel/reschedule link. Returned only on POST
    // (the GET shape stays clean of this implementation detail).
    return NextResponse.json({
      ...toBooking(result.recordset[0]),
      selfServiceToken,
      _case: opsCase,
    }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/bookings]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
