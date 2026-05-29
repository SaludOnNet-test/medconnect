import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { internalError, clientError } from '@/lib/errors';
import { bookingsReserveSchema, formatZodError } from '@/lib/schemas';

const SELF_SERVICE_TOKEN_TTL_DAYS = 90;

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/reserve
 *
 * Pre-creates a booking row with status `pending_payment` BEFORE the
 * client hits /api/payments. Returns the booking `id` which the client
 * then passes to /api/payments as `bookingId` — Stripe stores it in
 * PaymentIntent metadata, and the webhook can authoritatively finalize
 * the booking even if the patient closes the tab during 3DS.
 *
 * No ops case is created at this stage. No emails are sent. Those side
 * effects fire only when the booking is finalized (either via the
 * /api/bookings POST happy path, or by the webhook fallback).
 *
 * This endpoint is idempotent on `id`: if the row already exists it
 * returns 200 with the existing row's selfServiceToken so the client
 * can recover from a retry / network blip without losing flow state.
 *
 * Why a separate endpoint (vs adding a `reserve` mode to /api/bookings):
 * the regular POST has 250+ lines of finalization side effects (ops
 * case, clinic notification, internal watcher, voucher row, etc.) —
 * folding "reserve" into that path adds another conditional branch
 * inside a payment-critical function. A separate endpoint keeps the
 * blast radius small and the reserve-vs-finalize contract explicit.
 */
export async function POST(request) {
  if (!DB_AVAILABLE) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return clientError('Invalid JSON', 400); }

  const parsed = bookingsReserveSchema.safeParse(body);
  if (!parsed.success) {
    return clientError(formatZodError(parsed.error), 400);
  }
  const {
    id, patientEmail, patientName,
    providerId, providerName, specialty,
    slotDate, slotTime, amount,
    hasInsurance, insuranceCompany,
  } = parsed.data;

  try {
    const pool = await getPool();

    // Idempotency — if the row exists already, return its token. Patients
    // who get rate-limited / retry will reach this branch.
    const existing = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query(`SELECT TOP 1 id, status, self_service_token FROM bookings WHERE id = @id`);
    if (existing.recordset[0]) {
      return NextResponse.json({
        id,
        selfServiceToken: existing.recordset[0].self_service_token,
        status: existing.recordset[0].status,
        existed: true,
      }, { status: 200 });
    }

    // F2 — same self-service token generation as the finalize path so the
    // token is stable for the patient regardless of which path "wins".
    const selfServiceToken = crypto.randomBytes(16).toString('hex');
    const selfServiceTokenExpiresAt = new Date(
      Date.now() + SELF_SERVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    // Reserve minimal fields. payment_intent_id = id by convention so the
    // webhook can match either by metadata.bookingId OR by the legacy
    // `WHERE payment_intent_id = pi_id` lookup (the booking id and the PI
    // id are the same string in the rest of the codebase — see how
    // /book/page.js passes `reference` as both).
    await pool.request()
      .input('id', sql.NVarChar(50), id)
      .input('patient_name', sql.NVarChar(255), patientName || null)
      .input('patient_email', sql.NVarChar(255), patientEmail)
      .input('provider_id', sql.Int, providerId || null)
      .input('provider_name', sql.NVarChar(255), providerName || null)
      .input('specialty', sql.NVarChar(100), specialty || null)
      .input('slot_date', sql.NVarChar(20), slotDate || null)
      .input('slot_time', sql.NVarChar(10), slotTime || null)
      .input('amount', sql.Decimal(10, 2), amount || null)
      .input('status', sql.NVarChar(30), 'pending_payment')
      .input('has_insurance', sql.Bit, hasInsurance ? 1 : 0)
      .input('insurance_company', sql.NVarChar(100), insuranceCompany || null)
      .input('payment_intent_id', sql.NVarChar(80), id)
      .input('self_service_token', sql.NVarChar(64), selfServiceToken)
      .input('self_service_token_expires_at', sql.DateTimeOffset, selfServiceTokenExpiresAt)
      .query(`
        INSERT INTO bookings
          (id, patient_name, patient_email, provider_id, provider_name,
           specialty, slot_date, slot_time, amount, status,
           has_insurance, insurance_company, payment_intent_id,
           self_service_token, self_service_token_expires_at)
        VALUES
          (@id, @patient_name, @patient_email, @provider_id, @provider_name,
           @specialty, @slot_date, @slot_time, @amount, @status,
           @has_insurance, @insurance_company, @payment_intent_id,
           @self_service_token, @self_service_token_expires_at)
      `);

    return NextResponse.json({
      id,
      selfServiceToken,
      status: 'pending_payment',
      existed: false,
    }, { status: 201 });
  } catch (err) {
    return internalError(err, '[POST /api/bookings/reserve]');
  }
}
