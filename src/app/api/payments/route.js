/**
 * POST /api/payments
 *
 * Process real Stripe payment.
 * Expects: { amount, paymentMethodId, email, description, name, bookingId? }
 * Returns: { clientSecret, id, status } or { error }
 *
 * Security notes:
 *  - Rate-limited by IP (limits.payments) — buys time against an attacker
 *    pumping fake PaymentIntents. Backed by Upstash KV when configured,
 *    in-memory fallback otherwise.
 *  - Hard amount cap (MAX_AMOUNT_EUR) — caps blast radius of any client-
 *    side tampering before Stripe validation kicks in.
 *  - Idempotency-Key bound to bookingId (when provided) so a flaky
 *    network or a double-clicking patient doesn't generate two charges.
 *  - zod schema rejects unexpected fields and bad types at the boundary.
 *  - Errors are not echoed verbatim to the client (apart from Stripe's own
 *    user-actionable messages like 'card declined').
 */

import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { limits } from '@/lib/rateLimit';
import { internalError, clientError } from '@/lib/errors';
import { paymentsBodySchema, formatZodError } from '@/lib/schemas';

const MAX_AMOUNT_EUR = 1000;

export async function POST(request) {
  const r = await limits.payments.check(request);
  if (!r.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: r.headers },
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Payment processing not configured' },
      { status: 503 },
    );
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
  try {
    let body;
    try { body = await request.json(); }
    catch { return clientError('Invalid JSON', 400); }

    const parsed = paymentsBodySchema.safeParse(body);
    if (!parsed.success) {
      return clientError(formatZodError(parsed.error), 400);
    }
    const { amount, paymentMethodId, email, description, name, bookingId } = parsed.data;

    if (amount > MAX_AMOUNT_EUR) {
      return clientError(`Amount exceeds maximum (${MAX_AMOUNT_EUR} EUR)`, 400);
    }

    const safeReceiptEmail = email ? email.trim() : undefined;

    // Idempotency key — when the client provides a bookingId, two retries
    // with the same id always return the same PaymentIntent instead of
    // creating duplicates. Falls back to a payment-method-scoped key so a
    // double-click within a few seconds is still de-duped.
    const idempotencyKey = bookingId
      ? `booking_${String(bookingId)}`
      : `pm_${String(paymentMethodId)}_${Math.floor(Date.now() / 5000)}`;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(amount * 100),
        currency: 'eur',
        payment_method: paymentMethodId,
        confirm: true,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        ...(safeReceiptEmail ? { receipt_email: safeReceiptEmail } : {}),
        description: description || `Med Connect Booking - ${name}`,
        metadata: {
          email: safeReceiptEmail || '',
          name: typeof name === 'string' ? name : '',
          type: 'booking',
          ...(bookingId ? { bookingId: String(bookingId) } : {}),
        },
      },
      { idempotencyKey },
    );

    if (paymentIntent.status === 'succeeded') {
      return NextResponse.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        id: paymentIntent.id,
        status: paymentIntent.status,
        last4: paymentIntent.payment_method_details?.card?.last4 || 'xxxx',
      });
    } else if (paymentIntent.status === 'requires_action') {
      return NextResponse.json({
        success: false,
        clientSecret: paymentIntent.client_secret,
        id: paymentIntent.id,
        status: paymentIntent.status,
        requiresAction: true,
        message: '3D Secure verification required',
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          status: paymentIntent.status,
          error: 'Payment processing failed',
        },
        { status: 400 },
      );
    }
  } catch (error) {
    if (error?.type && String(error.type).startsWith('Stripe')) {
      return NextResponse.json(
        { error: error.message || 'Payment processing error', type: error.type },
        { status: 400 },
      );
    }
    return internalError(error, '[POST /api/payments]');
  }
}
