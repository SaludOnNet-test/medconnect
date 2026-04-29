/**
 * POST /api/payments
 *
 * Process real Stripe payment.
 * Expects: { amount, paymentMethodId, email, description, name }
 * Returns: { clientSecret, id, status } or { error }
 */

import Stripe from 'stripe';

export async function POST(request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'Payment processing not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
  try {
    const { amount, paymentMethodId, email, description, name } = await request.json();

    if (!amount || !paymentMethodId) {
      return new Response(
        JSON.stringify({ error: 'Missing amount or paymentMethodId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Defensive email validation. The previous client code accidentally sent
    // the cardholder name in this field (e.g. "Juan Pérez"), which made
    // stripe.paymentIntents.create reject the call with email_invalid
    // ("Dirección de correo electrónico no válida"). Client is fixed, but
    // strip anything that doesn't look like an email here too so a stale
    // cached bundle never blows up checkout.
    const safeReceiptEmail =
      typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? email.trim()
        : undefined;

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
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
      },
    });

    // Handle success or failure
    if (paymentIntent.status === 'succeeded') {
      return new Response(
        JSON.stringify({
          success: true,
          clientSecret: paymentIntent.client_secret,
          id: paymentIntent.id,
          status: paymentIntent.status,
          last4: paymentIntent.payment_method_details?.card?.last4 || 'xxxx',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else if (paymentIntent.status === 'requires_action') {
      // 3D Secure or other SCA (Secure Customer Authentication)
      return new Response(
        JSON.stringify({
          success: false,
          clientSecret: paymentIntent.client_secret,
          id: paymentIntent.id,
          status: paymentIntent.status,
          requiresAction: true,
          message: '3D Secure verification required',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          status: paymentIntent.status,
          error: 'Payment processing failed',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Stripe error:', error.message);
    return new Response(
      JSON.stringify({
        error: error.message || 'Payment processing error',
        type: error.type,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
