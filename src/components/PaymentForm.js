'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, ElementsConsumer } from '@stripe/react-stripe-js';
import { formatEUR } from '@/lib/format';

/**
 * Real Stripe payment form using Stripe Elements.
 * Supports both mock (fallback) and real Stripe processing.
 */

// Fallback to mock payment if Stripe keys not available
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      // Stripe Elements need a literal stack; mirror our --font-body fallback
      // chain so the field reads as Inter Tight on systems that already have it
      // and falls back to system sans-serif.
      fontFamily: '"Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      '::placeholder': {
        color: '#aab7c4',
      },
    },
    invalid: {
      color: '#dc3545',
    },
  },
};

function PaymentFormContent({ totalPrice, providerName, slotDate, slotTime, patientName, patientEmail, onPaymentSuccess, onBack }) {
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242'); // Mock fallback
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('123');
  const [cardName, setCardName] = useState(patientName || '');
  const [isLoading, setIsLoading] = useState(false);
  const [stripeAvailable, setStripeAvailable] = useState(!!stripePromise);
  const stripe = stripeAvailable ? null : null; // Will be set by ElementsConsumer

  const formattedDate = slotDate
    ? new Date(slotDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    : slotDate;

  const formatCardNumber = (val) => {
    const digits = val.replace(/\D/g, '').substring(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (val) => {
    const digits = val.replace(/\D/g, '').substring(0, 4);
    if (digits.length >= 3) return digits.substring(0, 2) + '/' + digits.substring(2);
    return digits;
  };

  // Mock payment fallback (when Stripe not available)
  const handleMockPay = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const reference = 'MC-MOCK-' + Date.now().toString(36).toUpperCase();
    const last4 = '4242';
    onPaymentSuccess({ last4, reference, isMock: true });
  };

  // Real Stripe payment
  const handleStripePay = async (stripe, elements) => {
    if (!stripe || !elements) return;

    setIsLoading(true);
    const cardElement = elements.getElement(CardElement);

    try {
      // Create Payment Method.
      // billing_details.email MUST be a real RFC-5321 email, otherwise Stripe
      // returns "email_invalid" with the message "Dirección de correo
      // electrónico no válida". Earlier this code was incorrectly passing
      // `patientName` here (e.g. "Juan Pérez"), which Stripe rejected for
      // every booking attempt. Now we receive the real email from /book
      // (`patientEmail` prop, derived from the lock-in or the form input)
      // and validate it before sending so we never trigger that error.
      const safeEmail =
        typeof patientEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail.trim())
          ? patientEmail.trim()
          : undefined;
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          name: cardName,
          ...(safeEmail ? { email: safeEmail } : {}),
        },
      });

      if (error) {
        alert(`Stripe error: ${error.message}`);
        setIsLoading(false);
        return;
      }

      // Call our backend payment endpoint. Same email-vs-name confusion was
      // here too — `email: cardName` was sending the cardholder name as the
      // email. Now passes the validated patient email; falls back to undefined
      // if absent so the server can still create the intent (email is
      // optional on Stripe's side, the breakage was only when we sent a
      // non-email string).
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalPrice,
          paymentMethodId: paymentMethod.id,
          email: safeEmail,
          description: `Med Connect - ${providerName} on ${slotDate} at ${slotTime}`,
          name: cardName,
        }),
      });

      const data = await response.json();

      if (data.error) {
        alert(`Payment failed: ${data.error}`);
        setIsLoading(false);
        return;
      }

      if (data.requiresAction) {
        // Handle 3D Secure
        const confirmResult = await stripe.confirmCardPayment(data.clientSecret);
        if (confirmResult.error) {
          alert(`3D Secure failed: ${confirmResult.error.message}`);
          setIsLoading(false);
          return;
        }
        data.success = confirmResult.paymentIntent.status === 'succeeded';
      }

      if (data.success) {
        const reference = data.id || 'MC-STRIPE-' + Date.now().toString(36).toUpperCase();
        onPaymentSuccess({
          last4: data.last4 || cardElement._lastValue.brand || 'xxxx',
          reference,
          stripeId: data.id,
          isMock: false,
        });
      } else {
        alert(`Payment failed: ${data.error || 'Unknown error'}`);
        setIsLoading(false);
      }
    } catch (error) {
      alert(`Payment error: ${error.message}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="payment-wrapper">
      {/* Price summary bar */}
      <div className="payment-summary-bar">
        <div className="payment-summary-left">
          <span className="payment-summary-provider">{providerName}</span>
          <span className="payment-summary-slot">{formattedDate} · {slotTime}</span>
        </div>
        <div className="payment-summary-amount">{formatEUR(totalPrice)}</div>
      </div>

      {/* Card form */}
      <div className="payment-card">
        <div className="payment-card-inner">
          <div className="payment-card-brand">
            <span className="payment-lock-icon">🔒</span>
            <span className="payment-secure-label">{stripeAvailable ? 'Stripe Seguro' : 'Pago seguro (test)'}</span>
            <span className="payment-cards-label">VISA · Mastercard · Amex</span>
          </div>

          {/* Stripe Elements or Mock Form */}
          {stripeAvailable ? (
            <ElementsConsumer>
              {({ stripe, elements }) => (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleStripePay(stripe, elements);
                  }}
                >
                  <div className="payment-field">
                    <label className="payment-label">Tarjeta de crédito</label>
                    <div className="payment-stripe-element">
                      <CardElement options={CARD_ELEMENT_OPTIONS} />
                    </div>
                  </div>

                  <div className="payment-field">
                    <label className="payment-label">Titular de la tarjeta</label>
                    <input
                      type="text"
                      className="payment-input"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="Nombre completo"
                      required
                    />
                  </div>

                  <div className="payment-actions">
                    <button
                      type="button"
                      className="payment-btn payment-btn-back"
                      onClick={onBack}
                      disabled={isLoading}
                    >
                      ← Atrás
                    </button>
                    <button
                      type="submit"
                      className="payment-btn payment-btn-primary"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <span className="payment-spinner"></span>
                          Procesando...
                        </>
                      ) : (
                        `Pagar ${formatEUR(totalPrice)}`
                      )}
                    </button>
                  </div>
                </form>
              )}
            </ElementsConsumer>
          ) : (
            // Mock fallback form
            <form onSubmit={(e) => { e.preventDefault(); handleMockPay(); }}>
              <div className="payment-field">
                <label className="payment-label">Número de tarjeta (TEST)</label>
                <input
                  type="text"
                  className="payment-input payment-input-card"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="payment-field-row">
                <div className="payment-field">
                  <label className="payment-label">Caducidad (MM/AA)</label>
                  <input
                    type="text"
                    className="payment-input"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/AA"
                    maxLength={5}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="payment-field">
                  <label className="payment-label">CVV</label>
                  <input
                    type="text"
                    className="payment-input"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substring(0, 4))}
                    placeholder="123"
                    maxLength={4}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="payment-field">
                <label className="payment-label">Titular de la tarjeta</label>
                <input
                  type="text"
                  className="payment-input"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Nombre completo"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="payment-actions">
                <button
                  type="button"
                  className="payment-btn payment-btn-back"
                  onClick={onBack}
                  disabled={isLoading}
                >
                  ← Atrás
                </button>
                <button
                  type="submit"
                  className="payment-btn payment-btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="payment-spinner"></span>
                      Procesando...
                    </>
                  ) : (
                    `Pagar ${formatEUR(totalPrice)}`
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentForm({ totalPrice, providerName, slotDate, slotTime, patientName, patientEmail, onPaymentSuccess, onBack }) {
  return stripePromise ? (
    <Elements stripe={stripePromise}>
      <PaymentFormContent
        totalPrice={totalPrice}
        providerName={providerName}
        slotDate={slotDate}
        slotTime={slotTime}
        patientName={patientName}
        patientEmail={patientEmail}
        onPaymentSuccess={onPaymentSuccess}
        onBack={onBack}
      />
    </Elements>
  ) : (
    <PaymentFormContent
      totalPrice={totalPrice}
      providerName={providerName}
      slotDate={slotDate}
      slotTime={slotTime}
      patientName={patientName}
      patientEmail={patientEmail}
      onPaymentSuccess={onPaymentSuccess}
      onBack={onBack}
    />
  );
}
