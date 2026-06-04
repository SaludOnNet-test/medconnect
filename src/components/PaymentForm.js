'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  CardElement,
  Elements,
  ElementsConsumer,
  PaymentRequestButtonElement,
} from '@stripe/react-stripe-js';
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

function PaymentFormContent({ totalPrice, providerName, slotDate, slotTime, patientName, patientEmail, bookingId, onPaymentSuccess, onBack }) {
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242'); // Mock fallback
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('123');
  const [cardName, setCardName] = useState(patientName || '');
  const [isLoading, setIsLoading] = useState(false);
  const [stripeAvailable, setStripeAvailable] = useState(!!stripePromise);
  const stripe = stripeAvailable ? null : null; // Will be set by ElementsConsumer

  // 2026-06-04 — Stripe step abandonment fix.
  // Replaces the prior `alert(...)` flow on Stripe / 3DS / backend errors.
  // Browser alerts on mobile read as scammy + are non-recoverable. We now
  // surface the failure inline as a state-driven card with copy keyed off
  // Stripe's `code` so the user always gets an actionable recovery hint
  // (e.g. "tarjeta rechazada → prueba con otra"). Set to `null` on retry
  // so the user never sees a stale error after they edit the card.
  const [paymentError, setPaymentError] = useState(null);

  // 2026-06-04 — A1: Apple Pay / Google Pay support.
  // `paymentRequest` is a Stripe-side object that abstracts iOS/Android
  // native wallets. We only render the button when canMakePayment() returns
  // truthy — Stripe handles the detection of whether the device + browser
  // combo has a usable wallet authed. `walletAvailable` is the gate.
  // The single biggest mobile-friction gain in this sprint: bypass the
  // keyboard for cardholders who already auth'd a card with Apple/Google.
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [walletAvailable, setWalletAvailable] = useState(false);

  // Map Stripe error codes → user-facing recovery copy in Spanish.
  // Codes come from https://stripe.com/docs/error-codes; we cover the ones
  // most likely to surface for Madrid retail card traffic. Anything not in
  // the map falls back to Stripe's own message (already localized).
  const buildPaymentError = (error) => {
    const code = error?.code || error?.decline_code || 'unknown';
    const message = error?.message || 'Hubo un problema con el pago.';
    const recoveryByCode = {
      card_declined:
        'Tu banco rechazó la tarjeta. Prueba con otra tarjeta o llama a tu banco para autorizar el cargo.',
      insufficient_funds:
        'Fondos insuficientes en esta tarjeta. Prueba con otra tarjeta.',
      expired_card:
        'La tarjeta ha caducado. Usa una tarjeta con fecha de caducidad válida.',
      incorrect_cvc:
        'El código CVV es incorrecto. Revisa los 3 dígitos del reverso de tu tarjeta.',
      incorrect_number:
        'El número de tarjeta no es correcto. Revísalo y vuelve a intentarlo.',
      processing_error:
        'Error de procesamiento temporal. Vuelve a intentarlo en unos segundos.',
      authentication_required:
        'Tu banco pide verificación adicional. Sigue las instrucciones del SMS o la app de tu banco.',
      email_invalid:
        'El email no es válido. Vuelve al paso anterior y corrígelo.',
      generic_decline:
        'Tu banco rechazó el pago. Prueba con otra tarjeta o contacta a tu banco.',
    };
    return {
      code,
      message,
      recovery: recoveryByCode[code] || 'Revisa los datos de tu tarjeta y vuelve a intentarlo. Si el problema persiste, prueba con otra tarjeta.',
    };
  };

  // 2026-06-04 — A1: build the paymentRequest object once stripe.js loads.
  // We re-create it whenever the amount, provider or slot changes — Stripe's
  // PaymentRequest API is amount-bound, so a stale object would charge the
  // wrong total. The button only mounts once canMakePayment() resolves
  // truthy (most desktops + non-wallet browsers return false). The
  // `paymentmethod` event fires AFTER the user authenticates with Face ID /
  // fingerprint and gives us a Stripe-tokenized paymentMethod we can pass
  // straight to /api/payments — same backend code path as the card form.
  useEffect(() => {
    if (!stripePromise || !totalPrice || totalPrice <= 0) return;
    let cancelled = false;

    stripePromise.then(async (stripe) => {
      if (!stripe || cancelled) return;

      const pr = stripe.paymentRequest({
        country: 'ES',
        currency: 'eur',
        total: {
          label: `Med Connect — ${providerName || 'reserva'}`,
          amount: Math.round(totalPrice * 100),
        },
        requestPayerName: true,
        requestPayerEmail: true,
      });

      const result = await pr.canMakePayment();
      if (cancelled) return;

      if (!result) {
        setWalletAvailable(false);
        setPaymentRequest(null);
        return;
      }

      pr.on('paymentmethod', async (ev) => {
        setIsLoading(true);
        setPaymentError(null);
        try {
          const response = await fetch('/api/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: totalPrice,
              paymentMethodId: ev.paymentMethod.id,
              email: ev.payerEmail || patientEmail || undefined,
              description: `Med Connect - ${providerName} on ${slotDate} at ${slotTime}`,
              name: ev.payerName || patientName || cardName || '',
              ...(bookingId ? { bookingId } : {}),
            }),
          });
          const data = await response.json();

          if (data.error) {
            ev.complete('fail');
            setPaymentError(
              buildPaymentError({
                code: data.code || 'processing_error',
                message: data.error,
              }),
            );
            setIsLoading(false);
            return;
          }

          if (data.requiresAction) {
            // Dismiss the wallet UI before launching the 3DS flow — Stripe
            // requires the wallet to be 'complete'd before confirmCardPayment
            // can take over. The 3DS challenge then shows in the page.
            ev.complete('success');
            const confirmResult = await stripe.confirmCardPayment(data.clientSecret);
            if (confirmResult.error) {
              setPaymentError(
                buildPaymentError({
                  code: confirmResult.error.code || 'authentication_required',
                  message: confirmResult.error.message,
                }),
              );
              setIsLoading(false);
              return;
            }
            if (confirmResult.paymentIntent.status === 'succeeded') {
              const reference = data.id || 'MC-WALLET-' + Date.now().toString(36).toUpperCase();
              onPaymentSuccess({
                last4: data.last4 || 'xxxx',
                reference,
                stripeId: data.id,
                isMock: false,
                paymentMethod: 'wallet',
              });
              return;
            }
          } else if (data.success) {
            ev.complete('success');
            const reference = data.id || 'MC-WALLET-' + Date.now().toString(36).toUpperCase();
            onPaymentSuccess({
              last4: data.last4 || 'xxxx',
              reference,
              stripeId: data.id,
              isMock: false,
              paymentMethod: 'wallet',
            });
            return;
          } else {
            ev.complete('fail');
            setPaymentError(
              buildPaymentError({
                code: data.code || 'processing_error',
                message: data.error || 'Hubo un problema con el pago.',
              }),
            );
            setIsLoading(false);
          }
        } catch (error) {
          ev.complete('fail');
          setPaymentError(
            buildPaymentError({
              code: 'processing_error',
              message: error?.message || 'Error inesperado durante el pago.',
            }),
          );
          setIsLoading(false);
        }
      });

      setPaymentRequest(pr);
      setWalletAvailable(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPrice, providerName, slotDate, slotTime, patientName, patientEmail, bookingId]);

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
    setPaymentError(null); // clear stale errors on each new attempt
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
      //
      // 2026-05-29 Bug 1.4 fix — previously when the email failed the regex
      // we silently dropped it to `undefined`. Stripe would then either fail
      // downstream with "email_invalid" or accept without email — either way
      // the user saw a dead Pay button with no explanation. Now we abort
      // the payment up-front with a clear inline error so the user knows
      // exactly what to fix (typically: go back to the form and correct the
      // email field).
      const trimmedEmail = typeof patientEmail === 'string' ? patientEmail.trim() : '';
      const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
      if (!emailLooksValid) {
        setPaymentError(
          buildPaymentError({
            code: 'email_invalid',
            message: `Email no válido (${trimmedEmail || 'vacío'}).`,
          })
        );
        setIsLoading(false);
        return;
      }
      const safeEmail = trimmedEmail;
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          name: cardName,
          ...(safeEmail ? { email: safeEmail } : {}),
        },
      });

      if (error) {
        setPaymentError(buildPaymentError(error));
        setIsLoading(false);
        return;
      }

      // Call our backend payment endpoint. Same email-vs-name confusion was
      // here too — `email: cardName` was sending the cardholder name as the
      // email. Now passes the validated patient email; falls back to undefined
      // if absent so the server can still create the intent (email is
      // optional on Stripe's side, the breakage was only when we sent a
      // non-email string).
      // F15 — bookingId is passed so the PaymentIntent metadata carries it.
      // The webhook uses metadata.bookingId to finalize the booking row
      // even if the patient closes the tab mid-3DS, preventing orphan
      // Stripe charges. Falls back to undefined for legacy callers; in
      // that case the webhook still works via payment_intent_id matching.
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalPrice,
          paymentMethodId: paymentMethod.id,
          email: safeEmail,
          description: `Med Connect - ${providerName} on ${slotDate} at ${slotTime}`,
          name: cardName,
          ...(bookingId ? { bookingId } : {}),
        }),
      });

      const data = await response.json();

      if (data.error) {
        setPaymentError(
          buildPaymentError({
            code: data.code || 'processing_error',
            message: data.error,
          })
        );
        setIsLoading(false);
        return;
      }

      if (data.requiresAction) {
        // Handle 3D Secure
        const confirmResult = await stripe.confirmCardPayment(data.clientSecret);
        if (confirmResult.error) {
          setPaymentError(
            buildPaymentError({
              code: confirmResult.error.code || 'authentication_required',
              message: confirmResult.error.message,
            })
          );
          setIsLoading(false);
          return;
        }
        data.success = confirmResult.paymentIntent.status === 'succeeded';
      }

      if (data.success) {
        const reference = data.id || 'MC-STRIPE-' + Date.now().toString(36).toUpperCase();
        // Previous middle fallback was `cardElement._lastValue.brand`, which
        // (a) is a private Stripe Elements internal that's `undefined` on
        // recent stripe.js builds (broke the live-mode first charge on
        // 2026-05-18), and (b) confused brand with last4 anyway. The server
        // already populates `last4` from `paymentIntent.payment_method_details.card.last4`
        // (see /api/payments/route.js:99), so `data.last4` is the canonical
        // source and we fall back to the placeholder when it's missing.
        onPaymentSuccess({
          last4: data.last4 || 'xxxx',
          reference,
          stripeId: data.id,
          isMock: false,
        });
      } else {
        setPaymentError(
          buildPaymentError({
            code: data.code || 'processing_error',
            message: data.error || 'Hubo un problema con el pago.',
          })
        );
        setIsLoading(false);
      }
    } catch (error) {
      setPaymentError(
        buildPaymentError({
          code: 'processing_error',
          message: error?.message || 'Error inesperado durante el pago.',
        })
      );
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

          {/* 2026-06-04 — Pre-form reassurance card. Addresses the top three
              bailout reasons measured Mon→Thu (0/4 reserved bookings ever
              attempted payment): unclear who holds the card, 3DS popup
              looking suspicious, and no visible refund safety net. Placed
              above the card field so it is the FIRST thing the patient
              reads at the payment step. */}
          <div className="payment-trust-card" role="note" aria-label="Información de seguridad">
            <div className="payment-trust-title">
              <span aria-hidden="true">🔒</span>
              <span>Pago 100% seguro con Stripe</span>
            </div>
            <ul className="payment-trust-list">
              <li>Tu tarjeta nunca pasa por servidores de Med Connect.</li>
              <li>Tu banco pedirá confirmar el pago por SMS o por la app (~10&nbsp;segundos).</li>
              <li>Si no encontramos hueco con tu seguro, te devolvemos el cargo íntegro en 72&nbsp;h.</li>
            </ul>
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
                  {/* 2026-06-04 — A1: Apple Pay / Google Pay button.
                      Only mounts when stripe.paymentRequest.canMakePayment()
                      resolves truthy (device + browser + paired card). On
                      desktop Chrome the divider line and CardElement are the
                      only thing visible; on iOS/Android Safari/Chrome with a
                      paired wallet, the user sees the wallet button on top
                      and can skip the keyboard entirely. */}
                  {walletAvailable && paymentRequest && (
                    <div className="payment-wallet-section">
                      <PaymentRequestButtonElement
                        options={{
                          paymentRequest,
                          style: {
                            paymentRequestButton: {
                              type: 'default',
                              theme: 'dark',
                              height: '48px',
                            },
                          },
                        }}
                      />
                      <div className="payment-or-divider" aria-hidden="true">
                        <span>o paga con tarjeta</span>
                      </div>
                    </div>
                  )}

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

                  {/* 2026-06-04 — Micro trust signals row. Same brand tokens
                      as the rest of the payment card so it reads as an
                      official block, not a marketing add-on. */}
                  <div className="payment-trust-signals" aria-hidden="true">
                    <span>✓ Cifrado SSL/TLS</span>
                    <span>·</span>
                    <span>✓ Verificado por Stripe</span>
                    <span>·</span>
                    <span>✓ PCI DSS</span>
                    <span>·</span>
                    <span>✓ Reembolsable 72h</span>
                  </div>

                  {paymentError && (
                    <div
                      className="payment-error-card"
                      role="alert"
                      aria-live="assertive"
                    >
                      <div className="payment-error-title">
                        <span aria-hidden="true">⚠️</span>
                        <span>No pudimos completar el pago</span>
                      </div>
                      <div className="payment-error-message">{paymentError.message}</div>
                      <div className="payment-error-recovery">{paymentError.recovery}</div>
                      <div className="payment-error-actions">
                        <button
                          type="button"
                          className="payment-error-link"
                          onClick={() => setPaymentError(null)}
                        >
                          Cerrar y volver a intentar
                        </button>
                        <button
                          type="button"
                          className="payment-error-link payment-error-link-muted"
                          onClick={() => {
                            setPaymentError(null);
                            onBack && onBack();
                          }}
                        >
                          ← Volver al paso anterior
                        </button>
                      </div>
                    </div>
                  )}

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
                      className={`payment-btn payment-btn-primary${isLoading ? ' payment-btn-primary-loading' : ''}`}
                      disabled={isLoading}
                      aria-busy={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <span className="payment-spinner payment-spinner-lg"></span>
                          Procesando pago…
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
                  className={`payment-btn payment-btn-primary${isLoading ? ' payment-btn-primary-loading' : ''}`}
                  disabled={isLoading}
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="payment-spinner payment-spinner-lg"></span>
                      Procesando pago…
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

export default function PaymentForm({ totalPrice, providerName, slotDate, slotTime, patientName, patientEmail, bookingId, onPaymentSuccess, onBack }) {
  return stripePromise ? (
    <Elements stripe={stripePromise}>
      <PaymentFormContent
        totalPrice={totalPrice}
        providerName={providerName}
        slotDate={slotDate}
        slotTime={slotTime}
        patientName={patientName}
        patientEmail={patientEmail}
        bookingId={bookingId}
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
      bookingId={bookingId}
      onPaymentSuccess={onPaymentSuccess}
      onBack={onBack}
    />
  );
}
