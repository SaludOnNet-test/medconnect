'use client';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/icons/Icon';
import { insuranceCompanies } from '@/data/mock';
import { formatEUR } from '@/lib/format';

// 2026-05-29 — PaymentForm is lazy-loaded so Stripe.js (~200 KB) doesn't
// download during the initial /book paint. PaymentForm.js does
// `loadStripe(...)` at module level, so importing it statically meant
// every SEM visitor paid the Stripe.js cost on first paint even when
// they were still on step 1 (the patient form). After this change,
// Stripe.js only hits the wire once the dynamic chunk is requested —
// which the parent gates on `hasInsurance !== null`, i.e. after the
// user has answered the insurance toggle.
//
// `loading` returns the same min-height as the rendered form
// (`min-height: 580px` matches book.css `.book-summary-card[data-loading]`)
// so CLS stays at 0 — the swap is in-place.
//
// `ssr: false` is required because Stripe Elements touches `window`
// and would crash during SSR.
const PaymentForm = dynamic(() => import('@/components/PaymentForm'), {
  ssr: false,
  loading: () => (
    <div
      className="book-summary-card"
      data-loading="lock-in"
      style={{
        textAlign: 'center',
        color: 'var(--fg-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      Cargando formulario de pago seguro…
    </div>
  ),
});

// 2026-07 structural refactor — the /book payment step (loading skeleton,
// lock-in load-failed error screen, insurance toggle, price breakdown,
// policy copy, PaymentForm wrapper) moved here from page.js verbatim.
export default function PaymentStep({
  lockInLoading,
  lockInData,
  lockInId,
  hasInsurance,
  setHasInsurance,
  selectedInsurance,
  setSelectedInsurance,
  handleHasInsuranceClick,
  isVideoBooking,
  servicePrice,
  activeFee,
  feeLabel,
  feePricingDisplay,
  totalPrice,
  serviceLabel,
  reservedBookingId,
  handlePaymentSuccess,
  setStep,
  form,
  date,
  time,
  providerName,
  renderHoldHeader,
  renderExpiredToast,
}) {
    const slotDateToUse = lockInData?.slotDate || date;
    const slotTimeToUse = lockInData?.slotTime || time;
    const clinicName = lockInData?.providerName || providerName;
    const patientName = lockInData?.patientName || `${form.name} ${form.surname}`.trim();
    const patientEmailForPayment = lockInData?.patientEmail || form.email;

    // Loading skeleton while we fetch the referral row from the lock-in
    // redirect. We avoid rendering PaymentForm until lockInData lands so
    // the patient never sees a half-populated payment form (and never
    // sees the empty patient input form briefly flash).
    if (lockInLoading) {
      return (
        <>
          <Header />
          <main className="book-page">
            <div className="book-container">
              <div className="book-header">
                <p className="book-step-label">Paso 2 de 2</p>
                <h1 className="book-title">Pago seguro</h1>
              </div>
              {/* data-loading="lock-in" gives this card the 600 px min-height
                  used by the final PaymentForm so the swap doesn't reflow
                  the page — see book.css `.book-summary-card[data-loading]`. */}
              <div
                className="book-summary-card"
                data-loading="lock-in"
                style={{
                  textAlign: 'center',
                  padding: 'var(--space-7)',
                  color: 'var(--fg-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Cargando los datos de tu reserva…
              </div>
            </div>
          </main>
          <Footer />
        </>
      );
    }

    // Load failed: the API 404'd, localStorage was empty, AND the URL
    // didn't carry the slot data (legacy email links from before the
    // hotfix that added forward-carry). Show an actionable error instead
    // of leaving the skeleton up — the previous behaviour was the page
    // hanging on "Cargando…" forever and the patient assuming the site
    // was broken (REF-VRHK7OOD6 incident, 2026-05-18).
    if (lockInData?._loadFailed) {
      return (
        <>
          <Header />
          <main className="book-page">
            <div className="book-container">
              <div className="book-header">
                <p className="book-step-label">Paso 2 de 2</p>
                <h1 className="book-title">No pudimos cargar tu reserva</h1>
              </div>
              <div
                className="book-summary-card"
                style={{ padding: 'var(--space-7)', color: 'var(--fg-muted)', lineHeight: 1.6 }}
              >
                <p style={{ marginBottom: '1rem' }}>
                  Hemos tenido un problema recuperando los datos de tu reserva. Tu hueco
                  sigue reservado — no te hemos cobrado nada todavía.
                </p>
                <p style={{ marginBottom: '1rem' }}>
                  Por favor escríbenos a{' '}
                  <a href="mailto:info@medconnect.es" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>
                    info@medconnect.es
                  </a>{' '}
                  o llámanos al <strong>91 197 70 52</strong> y te ayudamos a completar
                  el pago en menos de un minuto. Indícales el código:
                </p>
                <p style={{ fontFamily: 'monospace', fontSize: '0.95rem', background: '#f3f4f6', padding: '0.6rem 0.9rem', borderRadius: '6px', display: 'inline-block' }}>
                  {lockInId}
                </p>
              </div>
            </div>
          </main>
          <Footer />
        </>
      );
    }

    return (
      <>
        <Header />
        {renderHoldHeader()}
        {renderExpiredToast()}
        <main className="book-page">
          <div className="book-container">
            <div className="book-header">
              <p className="book-step-label">Paso 2 de 2</p>
              <h1 className="book-title">Pago seguro</h1>
            </div>
            {/* Recap card — when the patient came from /lock-in, surface
                the data they already entered there so they don't wonder
                if they need to type it again. */}
            {lockInData && (
              <div className="book-summary-card book-summary-card--lockin" style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-eyebrow)', color: 'var(--fg-muted)', marginBottom: 4 }}>
                  Reserva a nombre de
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', color: 'var(--fg)', marginBottom: 4 }}>
                  {patientName || lockInData.patientEmail}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
                  {lockInData.patientEmail}
                  {lockInData.patientPhone ? ` · ${lockInData.patientPhone}` : ''}
                </div>
                <div style={{ marginTop: 8, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                  Datos confirmados desde tu enlace de reserva — solo te queda confirmar el seguro y pagar.
                </div>
              </div>
            )}

            {/*
              Lock-in flow: the patient arrives at step=payment without ever
              having chosen insurance type (the lock-in URL doesn't carry
              `insurance` or `isSinSeguro`). Without this block, `hasInsurance`
              stayed null, `totalPrice` resolved to 0, and the Stripe form
              looked broken (showed "Confirmar reserva gratuita" with no card
              inputs of real value). Render the toggle here and gate the
              PaymentForm until the patient picks. The direct flow is
              untouched — there `hasInsurance` is already set from the URL
              params when /book mounts, so this block is bypassed.
            */}
            {hasInsurance === null && (
              <div className="book-form" style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{
                  background: isVideoBooking ? '#ede9fe' : '#f0f9ff',
                  border: `1px solid ${isVideoBooking ? '#c4b5fd' : '#bae6fd'}`,
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  marginBottom: 'var(--space-md)',
                  fontSize: '0.85rem',
                  color: isVideoBooking ? '#4c1d95' : '#0c4a6e',
                  lineHeight: 1.6,
                }}>
                  {isVideoBooking ? (
                    <><strong>Un último paso antes del pago:</strong> en videoconsultas pagas el precio publicado en SaludOnNet (consulta + prioridad, todo incluido). Si tienes seguro, por ahora <strong>solo tramitamos por reembolso</strong> — pagas ahora y solicitas el reembolso a tu seguro adjuntando el voucher que te enviaremos.</>
                  ) : (
                    <><strong>Un último paso antes del pago:</strong> el acto médico lo paga tu seguro a la clínica. A nosotros solo nos pagas la <strong>tarifa de prioridad</strong> por gestionarte la reserva prioritaria.</>
                  )}
                </div>
                <label className="form-label">
                  ¿Tienes seguro médico privado para esta consulta?
                  {isVideoBooking && (
                    <span style={{ display: 'block', fontWeight: 400, fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
                      El precio es el mismo en ambos casos — la respuesta nos ayuda a darte la info correcta para el reembolso.
                    </span>
                  )}
                </label>
                <div className="book-insurance-toggle">
                  <button
                    type="button"
                    aria-pressed={hasInsurance === true}
                    className={`book-insurance-option ${hasInsurance === true ? 'active' : ''}`}
                    style={{ background: hasInsurance === true ? undefined : 'transparent', font: 'inherit', color: 'inherit' }}
                    onClick={() => handleHasInsuranceClick(true)}
                  >
                    <strong>Sí, tengo seguro</strong>
                    {isVideoBooking ? (
                      servicePrice > 0 && (
                        <span style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ink-1000, #0e1a2b)', marginTop: '4px', fontWeight: 700 }}>
                          Pagas {formatEUR(servicePrice)}
                        </span>
                      )
                    ) : (
                      activeFee > 0 && (
                        <span style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ink-1000, #0e1a2b)', marginTop: '4px', fontWeight: 700 }}>
                          Pagas {formatEUR(activeFee)}
                        </span>
                      )
                    )}
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '2px', fontWeight: 400 }}>
                      {isVideoBooking
                        ? 'Pagas ahora y solicitas el reembolso a tu seguro después de la videoconsulta.'
                        : 'Solo la tarifa de prioridad. La consulta va por tu póliza.'}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={hasInsurance === false}
                    className={`book-insurance-option ${hasInsurance === false ? 'active' : ''}`}
                    style={{ background: hasInsurance === false ? undefined : 'transparent', font: 'inherit', color: 'inherit' }}
                    onClick={() => handleHasInsuranceClick(false)}
                  >
                    <strong>No tengo seguro</strong>
                    {isVideoBooking ? (
                      servicePrice > 0 && (
                        <span style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ink-1000, #0e1a2b)', marginTop: '4px', fontWeight: 700 }}>
                          Pagas {formatEUR(servicePrice)}
                        </span>
                      )
                    ) : (
                      (activeFee + servicePrice) > 0 && (
                        <span style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ink-1000, #0e1a2b)', marginTop: '4px', fontWeight: 700 }}>
                          Pagas {formatEUR(activeFee + servicePrice)}
                        </span>
                      )
                    )}
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '2px', fontWeight: 400 }}>
                      {isVideoBooking
                        ? 'Precio publicado en SaludOnNet, todo incluido. Total final, sin sorpresas.'
                        : `Consulta (${formatEUR(servicePrice)}) + prioridad (${formatEUR(activeFee)}). Total final, sin sorpresas.`}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Insurer dropdown — required when "Sí, tengo seguro" was just
                picked here (the direct flow already filled this from the
                URL param so the dropdown shows pre-selected). */}
            {hasInsurance === true && (
              <div className="book-form" style={{ marginBottom: 'var(--space-md)' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="insurance-company-payment">¿Cuál es la aseguradora?</label>
                  <select
                    id="insurance-company-payment"
                    className="form-select"
                    value={selectedInsurance}
                    onChange={(e) => setSelectedInsurance(e.target.value)}
                    required
                  >
                    <option value="">Seleccionar aseguradora</option>
                    {insuranceCompanies.map((ins) => (
                      <option key={ins} value={ins}>{ins}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Price breakdown — only after the patient picks insurance.
                Mirrors the breakdown in step=form so the patient sees the
                same totals before Stripe loads. */}
            {hasInsurance !== null && (
              <div className="book-price-breakdown animate-fade-in" style={{ marginBottom: 'var(--space-md)' }}>
                <p className="book-step-label" style={{ marginBottom: 'var(--space-md)' }}>Resumen del pago</p>

                {/* Video pilot — single all-in-one line. Same rationale
                    as the form-step breakdown above. */}
                {isVideoBooking ? (
                  <div className="book-price-row">
                    <span className="book-price-label"><Icon name="video" size={14} /> {serviceLabel || 'Videoconsulta'} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· incluye prioridad</span></span>
                    <span className="book-price-amount">{formatEUR(servicePrice)}</span>
                  </div>
                ) : (
                  <>
                    {serviceLabel && (
                      <div className="book-price-row">
                        <span className="book-price-label"><Icon name="stethoscope" size={14} /> {serviceLabel}</span>
                        <span className="book-price-amount">
                          {hasInsurance === true
                            ? <span style={{ color: '#00805a', fontWeight: 600 }}>A cubrir por tu seguro</span>
                            : formatEUR(servicePrice)}
                        </span>
                      </div>
                    )}

                    <div className="book-price-row">
                      <span className="book-price-label">
                        🎫 Tarifa de prioridad{feeLabel ? ` (${feeLabel.toLowerCase()})` : ''}
                      </span>
                      <span className="book-price-amount">
                        {/* 2026-06-08 — Strikethrough on the "tarifa habitual"
                            anchor alongside the active fee. The savings line
                            renders below the breakdown. */}
                        {feePricingDisplay.showStrikethrough && activeFee > 0 && (
                          <span style={{ textDecoration: 'line-through', color: 'var(--muted)', fontWeight: 500, fontSize: '0.85em', marginRight: 6 }}>
                            {feePricingDisplay.standardLabel}
                          </span>
                        )}
                        {activeFee > 0 ? formatEUR(activeFee) : '0 €'}
                      </span>
                    </div>
                  </>
                )}

                <div className="book-price-row total">
                  <span>Total que pagas hoy</span>
                  <span className="book-price-amount">
                    {totalPrice > 0 ? formatEUR(totalPrice) : 'Gratis'}
                  </span>
                </div>

                {/* 2026-06-24 — B1 del audit copy. Reemplaza el savings
                    self-referencial ("Ahorras X sobre la tarifa habitual")
                    por anchor EXTERNO: comparación con consulta privada
                    sin seguro (€60-120). Más creíble que un "tarifa
                    habitual" interno. Skipped para video bookings —
                    no aplica la comparación con consulta privada
                    presencial. Partner discount mention también se
                    actualiza al nuevo % (16% en lugar de 30%). */}
                {!isVideoBooking && activeFee > 0 && (
                  <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.78rem', color: '#1b4332', lineHeight: 1.4, fontWeight: 500 }}>
                    💡 Una consulta privada equivalente sin seguro cuesta entre <strong>€60 y €120</strong>. Con tu seguro pagas solo <strong>{feePricingDisplay.activeLabel}</strong> de tarifa de prioridad.
                    {feePricingDisplay.isPartner && (
                      <> Incluye <strong>−{Math.round(feePricingDisplay.partnerDiscountPct * 100)}% de centro destacado</strong>.</>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* 2026-06-04 — Restate the refund + insurance value-prop at the
                moment of highest commitment friction. The same line lives in
                the price-breakdown box on the form step, but by the time the
                patient reaches the Stripe field they have forgotten it. We
                show this above PaymentForm so the trust frame is fresh
                when they reach for their card.
                2026-06-12 — Reworded to (a) break down what the patient is
                paying (tarifa de prioridad alone for insured, consulta +
                prioridad for sin-seguro) and (b) state the real cancellation
                policy: refund íntegro within 72 h for any cancellation up
                to 24 h before the appointment, regardless of reason. */}
            {hasInsurance !== null && (
              <div
                className="book-info-box book-info-box--green"
                style={{ marginBottom: 'var(--space-md)' }}
              >
                Cargo único de <strong>{totalPrice > 0 ? formatEUR(totalPrice) : '0 €'}</strong>
                {isVideoBooking ? (
                  <> — precio publicado en SaludOnNet, incluye la consulta y la prioridad de la cita.</>
                ) : hasInsurance === true ? (
                  <> — nuestra tarifa de prioridad. La consulta la cubre tu póliza.</>
                ) : (
                  <> — consulta ({formatEUR(servicePrice)}) + tarifa de prioridad ({formatEUR(activeFee)}).</>
                )}
                {' '}Si cancelas hasta <strong>24&nbsp;h antes de la cita</strong> por cualquier motivo,
                te devolvemos el importe íntegro en 72&nbsp;h.
              </div>
            )}

            {/* PaymentForm — only mounts once hasInsurance is resolved.
                Until then the patient sees the toggle above. Without this
                gate the Stripe form would mount with totalPrice=0 and look
                broken to the user. */}
            {hasInsurance !== null && (
              <PaymentForm
                totalPrice={totalPrice}
                standardTotalPrice={
                  // 2026-06-08 — Strikethrough anchor in the Stripe bar.
                  // For seguro: standard tier fee. For sin-seguro: standard
                  // tier fee + service price (since servicePrice itself
                  // isn't discounted).
                  hasInsurance === true
                    ? feePricingDisplay.standard
                    : feePricingDisplay.standard + (Number(servicePrice) || 0)
                }
                providerName={clinicName}
                slotDate={slotDateToUse}
                slotTime={slotTimeToUse}
                patientName={patientName}
                patientEmail={patientEmailForPayment}
                bookingId={reservedBookingId}
                onPaymentSuccess={handlePaymentSuccess}
                onBack={() => {
                  // For lock-in patients there is no /form to go back to —
                  // their data is locked in upstream. Reset to the insurance
                  // picker instead. Direct-flow patients (no lockInData) keep
                  // the original behavior of returning to the patient form.
                  if (lockInData) {
                    setHasInsurance(null);
                    setSelectedInsurance('');
                  } else {
                    setStep('form');
                  }
                }}
              />
            )}
          </div>
        </main>
        <Footer />
      </>
    );
}
