import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { createCaseForBooking } from '@/lib/opsCases';
import { requireRole } from '@/lib/adminAuth';
import { internalError, clientError } from '@/lib/errors';
import { bookingsCreateSchema, formatZodError } from '@/lib/schemas';

// Hard cap so a misbehaving admin UI can't pull every row at once. Combined
// with mandatory ops auth this also bounds the data exposure if a token leaks.
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 100;
const SELF_SERVICE_TOKEN_TTL_DAYS = 90;

function clampInt(raw, fallback, max) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

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
// GET /api/bookings?status=...&from=...&to=...&limit=...&offset=...
//
// Admin/ops only. Without auth this endpoint historically dumped every
// booking row in the system, which is a textbook RGPD-class data leak —
// patient names, emails, phones, amounts, specialties, all unfiltered.
// ---------------------------------------------------------------------------
export async function GET(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const auth = requireRole(request, ['admin', 'ops']);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = clampInt(searchParams.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = clampInt(searchParams.get('offset'), 0, 1_000_000);

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
  req.input('limit', sql.Int, limit);
  req.input('offset', sql.Int, offset);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await req.query(
      `SELECT * FROM bookings ${where}
       ORDER BY created_at DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );
    return NextResponse.json(result.recordset.map(toBooking));
  } catch (err) {
    return internalError(err, '[GET /api/bookings]');
  }
}

// ---------------------------------------------------------------------------
// POST /api/bookings — create booking after payment
// ---------------------------------------------------------------------------
export async function POST(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return clientError('Invalid JSON', 400); }

  const parsed = bookingsCreateSchema.safeParse(body);
  if (!parsed.success) {
    return clientError(formatZodError(parsed.error), 400);
  }
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
  } = parsed.data;

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
  // silently sharing tokens between bookings. Tokens expire 90 days after
  // creation so a leaked email doesn't yield an indefinite cancel primitive.
  const selfServiceToken = crypto.randomBytes(16).toString('hex');
  const selfServiceTokenExpiresAt = new Date(
    Date.now() + SELF_SERVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

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
      .input('self_service_token_expires_at', sql.DateTimeOffset, selfServiceTokenExpiresAt)
      .query(`
        INSERT INTO bookings
          (id, referral_id, patient_name, patient_email, patient_phone, patient_address,
           provider_id, provider_name, specialty, slot_date, slot_time,
           amount, status, card_last4, has_insurance, insurance_company, payment_intent_id,
           procedure_slug, procedure_name, service_price, platform_fee,
           self_service_token, self_service_token_expires_at)
        VALUES
          (@id, @referral_id, @patient_name, @patient_email, @patient_phone, @patient_address,
           @provider_id, @provider_name, @specialty, @slot_date, @slot_time,
           @amount, @status, @card_last4, @has_insurance, @insurance_company, @payment_intent_id,
           @procedure_slug, @procedure_name, @service_price, @platform_fee,
           @self_service_token, @self_service_token_expires_at)
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

    // Open an operations case for this booking, with two carve-outs:
    //   1. Internal lock-in (referral.is_internal = 1): no case. The
    //      deriving clinic is also the destination clinic, so they handle
    //      the appointment themselves — Ops adds zero value.
    //   2. External lock-in (referral.is_internal = 0/NULL): create case
    //      AND tag it with referral_id + a starter call-log entry naming
    //      the derivador. From Ops's perspective the case behaves exactly
    //      like a direct booking (call destination clinic, confirm slot or
    //      find alternative, refund if nothing fits) — the chip and banner
    //      just give Raquel context for the call.
    //   3. Direct booking (no referralId): case created as today.
    //
    // Best-effort throughout: a missed lookup, a pre-migration column, or
    // a referrals row that doesn't exist all degrade to "create the case
    // anyway" rather than dropping a paid booking from the Ops queue.
    let opsCase = null;
    let skipCase = false;
    let referralContext = null;
    if (referralId) {
      try {
        const r = await pool.request()
          .input('rid', sql.NVarChar(50), referralId)
          .query(`SELECT TOP 1 is_internal, professional_email, provider_name
                  FROM referrals WHERE id = @rid`);
        const row = r.recordset[0];
        if (row?.is_internal === 1) {
          skipCase = true;
        } else if (row) {
          // Resolve derivador clinic name via admin_users.clinic_id → clinics.name.
          let derivadorClinicName = null;
          try {
            const c = await pool.request()
              .input('email', sql.NVarChar(255), row.professional_email)
              .query(`SELECT TOP 1 cl.name
                      FROM admin_users a
                      LEFT JOIN clinics cl ON cl.id = a.clinic_id
                      WHERE LOWER(a.username) = LOWER(@email)`);
            derivadorClinicName = c.recordset[0]?.name || null;
          } catch (clErr) {
            if (!String(clErr?.message || '').includes('Invalid column name')) {
              console.error('[POST /api/bookings] derivador clinic lookup', clErr.message);
            }
          }
          referralContext = {
            derivadorEmail: row.professional_email,
            derivadorClinicName,
            isInternal: false,
          };
        }
      } catch (refErr) {
        if (!String(refErr?.message || '').includes('Invalid column name')) {
          console.error('[POST /api/bookings] referral lookup', refErr.message);
        }
      }
    }
    if (!skipCase) {
      try {
        opsCase = await createCaseForBooking({
          id, providerId, providerName, slotDate, slotTime, amount,
          platformFee: platformFee != null ? Number(platformFee) : null,
          referralId: referralId || null,
          referralContext,
        });
      } catch (caseErr) {
        console.error('[POST /api/bookings] case creation failed', caseErr);
      }
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
    return internalError(err, '[POST /api/bookings]');
  }
}
