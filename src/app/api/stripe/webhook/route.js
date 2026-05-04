// Stripe webhook receiver.
//
// Why this exists:
//   `/api/payments` creates the PaymentIntent and the patient flow
//   subsequently POSTs to `/api/bookings` to persist the row. If the
//   patient closes the tab between confirm() and the booking POST — most
//   often after a 3-D Secure redirect — the charge succeeds without a
//   booking ever being created. The webhook is the only authoritative
//   server-side notification we get from Stripe, so we use it to:
//     • Mark the matching booking row as `confirmed` once the charge
//       actually settles.
//     • Flag bookings whose payment failed for the ops dashboard to
//       chase manually.
//     • Reconcile refunds initiated outside our app (Stripe dashboard,
//       chargebacks).
//
// Configuration:
//   - Add the endpoint in Stripe Dashboard:
//       URL: https://www.medconnect.es/api/stripe/webhook
//       Events: payment_intent.succeeded, payment_intent.payment_failed,
//               charge.refunded
//   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET` in Vercel.
//   - Without that env var the route returns 503 — we'd rather refuse
//     unsigned events than process them.

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getPool, sql, DB_AVAILABLE } from '@/lib/db';
import { internalError } from '@/lib/errors';

// Stripe requires the raw body byte-for-byte to verify the signature, so we
// must NOT call request.json() before constructEvent(). Forcing dynamic
// rendering also stops Next from caching anything route-related.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe webhook] signature verify failed:', err.message);
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  if (!DB_AVAILABLE) {
    console.error('[stripe webhook] DB not configured, ignoring event', event.type);
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await markBookingPaid(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await markBookingPaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
        await markBookingRefunded(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    return internalError(err, `[stripe webhook ${event?.type}]`);
  }

  return NextResponse.json({ received: true });
}

async function markBookingPaid(paymentIntent) {
  const pool = await getPool();
  await pool.request()
    .input('pi', sql.NVarChar(80), paymentIntent.id)
    .input('status', sql.NVarChar(30), 'confirmed')
    .query(`
      UPDATE bookings
      SET status = @status, updated_at = SYSDATETIMEOFFSET()
      WHERE (payment_intent_id = @pi OR id = @pi)
        AND status IN ('pending', 'awaiting_payment', 'requires_action')
    `);
}

async function markBookingPaymentFailed(paymentIntent) {
  const pool = await getPool();
  await pool.request()
    .input('pi', sql.NVarChar(80), paymentIntent.id)
    .input('status', sql.NVarChar(30), 'payment_failed')
    .input('reason', sql.NVarChar(500),
      paymentIntent.last_payment_error?.message?.slice(0, 500) || null)
    .query(`
      UPDATE bookings
      SET status = @status,
          notes = COALESCE(notes + CHAR(10), '') + 'payment_failed: ' + COALESCE(@reason, ''),
          updated_at = SYSDATETIMEOFFSET()
      WHERE (payment_intent_id = @pi OR id = @pi)
        AND status NOT IN ('cancelled_by_patient', 'refunded', 'cancelled')
    `);
}

async function markBookingRefunded(charge) {
  const piId = charge.payment_intent;
  if (!piId) return;
  const pool = await getPool();
  const fullyRefunded = charge.amount_refunded >= charge.amount;
  if (fullyRefunded) {
    await pool.request()
      .input('pi', sql.NVarChar(80), piId)
      .input('status', sql.NVarChar(30), 'refunded')
      .query(`
        UPDATE bookings
        SET status = @status, updated_at = SYSDATETIMEOFFSET()
        WHERE (payment_intent_id = @pi OR id = @pi)
          AND status <> 'refunded'
      `);
  } else {
    await pool.request()
      .input('pi', sql.NVarChar(80), piId)
      .input('amt', sql.Decimal(10, 2), (charge.amount_refunded || 0) / 100)
      .query(`
        UPDATE bookings
        SET notes = COALESCE(notes + CHAR(10), '') + 'partial_refund: ' + CAST(@amt AS NVARCHAR(20)),
            updated_at = SYSDATETIMEOFFSET()
        WHERE payment_intent_id = @pi
      `);
  }
}
