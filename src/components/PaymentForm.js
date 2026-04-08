'use client';

import { useState } from 'react';

/**
 * Mock Stripe-style payment form.
 * Pre-fills with test card data. 2-second mock processing delay.
 */
export default function PaymentForm({ totalPrice, providerName, slotDate, slotTime, patientName, onPaymentSuccess, onBack }) {
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('123');
  const [cardName, setCardName] = useState(patientName || '');
  const [isLoading, setIsLoading] = useState(false);

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

  const handlePay = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    // Mock 2-second processing delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const reference = 'MC-' + Date.now().toString(36).toUpperCase();
    const last4 = cardNumber.replace(/\s/g, '').slice(-4);
    onPaymentSuccess({ last4, reference });
  };

  return (
    <div className="payment-wrapper">
      {/* Price summary bar */}
      <div className="payment-summary-bar">
        <div className="payment-summary-left">
          <span className="payment-summary-provider">{providerName}</span>
          <span className="payment-summary-slot">{formattedDate} · {slotTime}</span>
        </div>
        <div className="payment-summary-amount">€{Number(totalPrice).toFixed(2)}</div>
      </div>

      {/* Card form */}
      <div className="payment-card">
        <div className="payment-card-inner">
          <div className="payment-card-brand">
            <span className="payment-lock-icon">🔒</span>
            <span className="payment-secure-label">Pago seguro</span>
            <span className="payment-cards-label">VISA · Mastercard · Amex</span>
          </div>

          <form onSubmit={handlePay}>
            {/* Card number */}
            <div className="payment-field">
              <label className="payment-label">Número de tarjeta</label>
              <input
                type="text"
                className="payment-input payment-input-card"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="0000 0000 0000 0000"
                maxLength={19}
                required
              />
            </div>

            {/* Expiry + CVV */}
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
                />
              </div>
            </div>

            {/* Card name */}
            <div className="payment-field">
              <label className="payment-label">Nombre en la tarjeta</label>
              <input
                type="text"
                className="payment-input"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                placeholder="Como aparece en la tarjeta"
                required
              />
            </div>

            {/* Submit */}
            <button type="submit" className="payment-submit-btn" disabled={isLoading}>
              {isLoading ? (
                <span className="payment-loading">
                  <span className="payment-spinner"></span>
                  Procesando pago...
                </span>
              ) : (
                `Pagar €${Number(totalPrice).toFixed(2)}`
              )}
            </button>
          </form>

          <p className="payment-legal">
            🔒 Tu pago está cifrado con SSL. No almacenamos datos de tu tarjeta.
          </p>

          <button className="payment-back-link" onClick={onBack} type="button">
            ← Volver al formulario
          </button>
        </div>
      </div>
    </div>
  );
}
