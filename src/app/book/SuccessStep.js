'use client';
import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/icons/Icon';
import { buildCalendarUrl } from './bookingHelpers';

// 2026-07 structural refactor — the /book success screen (persist-failed
// banner, post-payment identity capture, voucher/insurance info boxes,
// calendar link, account prompt) moved here from page.js verbatim.
export default function SuccessStep({
  paymentRef,
  bookingPersistFailed,
  isVideoBooking,
  hasInsurance,
  selectedInsurance,
  lockInData,
  form,
  date,
  time,
  providerName,
}) {
  // 2026-06-01 — patient identity data collected AFTER payment.
  // The pre-payment form was reduced to 4 fields to cut abandonment; DOB
  // and DNI are now collected on the success page. `identityForm` holds
  // the post-payment data, `identityStatus` tracks the submit lifecycle.
  const [identityForm, setIdentityForm] = useState({ dateOfBirth: '', nationalId: '' });
  const [identityStatus, setIdentityStatus] = useState('idle'); // idle | submitting | saved | error
  const [identityError, setIdentityError] = useState('');

  const submitIdentityData = async () => {
    if (!paymentRef) return; // safety: we need a booking id
    // Require at least one of the two — endpoint enforces this too, but
    // we surface the message faster client-side.
    if (!identityForm.dateOfBirth && !identityForm.nationalId.trim()) {
      setIdentityError('Rellena al menos la fecha de nacimiento o el DNI.');
      return;
    }
    setIdentityStatus('submitting');
    setIdentityError('');
    try {
      const patientEmail = lockInData?.patientEmail || form.email;
      const r = await fetch(`/api/bookings/${encodeURIComponent(paymentRef)}/patient-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientEmail,
          dateOfBirth: identityForm.dateOfBirth || undefined,
          nationalId: identityForm.nationalId?.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setIdentityError(data.error || 'No pudimos guardar los datos. Inténtalo de nuevo.');
        setIdentityStatus('error');
        return;
      }
      setIdentityStatus('saved');
    } catch {
      setIdentityError('Error de red. Inténtalo de nuevo.');
      setIdentityStatus('error');
    }
  };

    const slotDateToUse = lockInData?.slotDate || date;
    const slotTimeToUse = lockInData?.slotTime || time;
    const clinicName = lockInData?.providerName || providerName;
    // Prefer the calendarUrl computed at payment time; after a reload
    // (URL-restored success) recompute it from the URL params instead.
    let calendarUrl = typeof window !== 'undefined' ? window._mcCalendarUrl : null;
    if (!calendarUrl && slotDateToUse && slotTimeToUse) {
      try {
        calendarUrl = buildCalendarUrl(clinicName, slotDateToUse, slotTimeToUse, paymentRef);
      } catch {}
    }
    const formattedSuccessDate = slotDateToUse
      ? new Date(slotDateToUse + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
      : '';

    return (
      <>
        <Header />
        <main className="book-page">
          <div className="book-container">
            <div className="book-success">
              <div className="book-success-icon">✓</div>
              <h2 className="book-success-title">
                {isVideoBooking ? '¡Reserva de videoconsulta confirmada!' : '¡Reserva prioritaria confirmada!'}
              </h2>
              <p className="book-success-subtitle">
                {isVideoBooking
                  ? 'Hemos recibido tu pago. Nuestro equipo está confirmando la cita con SaludOnNet y te enviaremos por email el enlace de la videollamada + el voucher antes de la fecha.'
                  : hasInsurance === true
                    ? 'Hemos confirmado tu reserva prioritaria. Acude con tu tarjeta de asegurado — la consulta corre por tu póliza.'
                    : 'Hemos confirmado tu cita y la consulta privada. Llega 10 minutos antes; en recepción ya saben quién eres.'}
              </p>

              {bookingPersistFailed && (
                <div
                  role="alert"
                  style={{
                    marginTop: '1.25rem',
                    textAlign: 'left',
                    background: '#fffbeb',
                    border: '1px solid #fcd34d',
                    borderRadius: '10px',
                    padding: '0.9rem 1.1rem',
                    color: '#78350f',
                    fontSize: '0.9rem',
                    lineHeight: 1.6,
                  }}
                >
                  ✅ <strong>Pago recibido</strong> (ref {paymentRef}). Estamos terminando de
                  confirmar tu cita — recibirás el email de confirmación en unos minutos.
                  Si no llega en 15 min, escríbenos a{' '}
                  <a href="mailto:info@medconnect.es" style={{ color: '#92400e', textDecoration: 'underline' }}>
                    info@medconnect.es
                  </a>{' '}
                  indicando la referencia.
                </div>
              )}

              <div className="book-summary-card" style={{ textAlign: 'left', marginTop: '1.5rem' }}>
                <div className="book-summary-provider">{clinicName}</div>
                <div className="book-summary-details">
                  <span><Icon name="calendar" size={14} /> <strong>{formattedSuccessDate}</strong></span>
                  <span><Icon name="clock" size={14} /> <strong>{slotTimeToUse}</strong></span>
                </div>
              </div>

              {/* 2026-06-01 — Post-payment identity capture.
                  These fields used to be in the pre-payment form; we moved
                  them here to reduce form-step abandonment. The user has
                  already paid, so they have zero incentive to drop off at
                  this point. Both fields are individually optional (the
                  endpoint accepts either one) but at least one is required
                  for the clinic to identify the patient on arrival. */}
              {identityStatus !== 'saved' ? (
                <div className="book-info-box" style={{ marginTop: '1.5rem', textAlign: 'left', background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <strong><Icon name="user" size={16} /> Datos para identificarte en tu cita</strong>
                  <p style={{ marginTop: '0.4rem', fontSize: '0.88rem', lineHeight: 1.55, color: '#78350f' }}>
                    Danos estos datos para que la clínica te identifique al llegar. Si los rellenas ahora ahorras tiempo el día de la cita.
                  </p>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.75rem',
                    marginTop: '0.75rem',
                  }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" htmlFor="identity-dob" style={{ fontSize: '0.8rem' }}>Fecha de nacimiento</label>
                      <input
                        id="identity-dob"
                        className="form-input"
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        value={identityForm.dateOfBirth}
                        onChange={(e) => setIdentityForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                        disabled={identityStatus === 'submitting'}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" htmlFor="identity-nid" style={{ fontSize: '0.8rem' }}>DNI / NIE / Pasaporte</label>
                      <input
                        id="identity-nid"
                        className="form-input"
                        type="text"
                        placeholder="Ej. 12345678A"
                        pattern="[A-Za-z0-9 \-\.]{5,20}"
                        autoComplete="off"
                        value={identityForm.nationalId}
                        onChange={(e) => setIdentityForm((f) => ({ ...f, nationalId: e.target.value }))}
                        disabled={identityStatus === 'submitting'}
                      />
                    </div>
                  </div>
                  {identityError && (
                    <p role="alert" style={{ marginTop: '0.6rem', color: '#dc2626', fontSize: '0.85rem' }}>
                      {identityError}
                    </p>
                  )}
                  <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-navy"
                      onClick={submitIdentityData}
                      disabled={identityStatus === 'submitting'}
                      style={identityStatus === 'submitting' ? { opacity: 0.6, cursor: 'wait' } : undefined}
                    >
                      {identityStatus === 'submitting' ? 'Guardando…' : 'Guardar para mi cita'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-link"
                      style={{ background: 'transparent', border: 'none', color: 'var(--muted)', textDecoration: 'underline', fontSize: '0.85rem', cursor: 'pointer' }}
                      onClick={() => setIdentityStatus('saved')}
                    >
                      Lo haré en la clínica
                    </button>
                  </div>
                </div>
              ) : (
                <div className="book-info-box book-info-box--green" style={{ marginTop: '1.5rem', textAlign: 'left' }}>
                  <strong>✓ Datos guardados</strong>
                  <p style={{ marginTop: '0.3rem', fontSize: '0.88rem', lineHeight: 1.55 }}>
                    La clínica ya tiene tu identificación. Solo trae tu DNI físico el día de la cita.
                  </p>
                </div>
              )}

              {isVideoBooking ? (
                <>
                  <div className="book-info-box book-info-box--green" style={{ marginTop: '1rem', textAlign: 'left' }}>
                    <strong><Icon name="mail" size={16} /> Enlace + voucher en camino</strong>
                    <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                      Nuestro equipo está reservando la cita en <strong>SaludOnNet</strong>. Te
                      enviaremos por email el enlace de la videollamada y el voucher de SaludOnNet antes
                      de la fecha — atento a tu bandeja de entrada (y a la carpeta de spam).
                    </p>
                  </div>
                  <div className="book-info-box" style={{ marginTop: '1rem', textAlign: 'left' }}>
                    <strong>Antes de la videoconsulta</strong>
                    <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                      Conéctate al enlace unos minutos antes de la hora, con DNI a mano. La consulta
                      ya está pagada — no se vuelve a cobrar nada al iniciar la videollamada.
                    </p>
                  </div>
                  {hasInsurance === true && (
                    <div className="book-info-box" style={{ marginTop: '1rem', textAlign: 'left', background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                      <strong>💳 Reembolso con tu seguro</strong>
                      <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                        Para videoconsultas tu seguro tramita por reembolso. Adjunta el voucher que te
                        enviamos por email al solicitar el reembolso a {selectedInsurance || 'tu aseguradora'}{' '}
                        — incluye el detalle del servicio y el importe.
                      </p>
                    </div>
                  )}
                </>
              ) : hasInsurance === true ? (
                <div className="book-info-box" style={{ marginTop: '1rem', textAlign: 'left' }}>
                  <strong>Cuando llegues a la clínica</strong>
                  <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Entrega tu <strong>tarjeta de asegurado</strong> en recepción, como en cualquier cita concertada. La clínica facturará la consulta a tu aseguradora. Tu pago de hoy cubre solo la <strong>tarifa de prioridad</strong> — no se vuelve a cobrar.
                  </p>
                </div>
              ) : (
                <>
                  <div className="book-info-box book-info-box--green" style={{ marginTop: '1rem', textAlign: 'left' }}>
                    <strong><Icon name="mail" size={16} /> Voucher en camino (en menos de 24 h)</strong>
                    <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                      Te enviaremos un email separado de <strong>SaludOnNet</strong> con el voucher
                      que cubre el coste del acto médico. Llévalo en el móvil o impreso a la clínica
                      junto a tu DNI — la clínica cobrará el acto a SaludOnNet con ese voucher.
                    </p>
                  </div>
                  <div className="book-info-box" style={{ marginTop: '1rem', textAlign: 'left' }}>
                    <strong>Cuando llegues a la clínica</strong>
                    <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                      Presenta tu DNI + el voucher de SaludOnNet. La consulta y la tarifa de prioridad
                      ya están pagadas — no se vuelve a cobrar nada en recepción.
                    </p>
                  </div>
                </>
              )}

              <div className="book-confirmation-ref" style={{ marginTop: '1.5rem' }}>
                {paymentRef}
              </div>

              {/* Account creation prompt — shown to guests so they can save their booking history */}
              <div style={{ marginTop: '1.75rem', padding: '1.25rem 1.5rem', background: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd', textAlign: 'center' }}>
                <p style={{ fontWeight: '700', color: '#0369a1', marginBottom: '0.4rem', fontSize: '0.95rem' }}>💡 Guarda tu historial de citas</p>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                  Crea una cuenta gratuita con este email y accede a todas tus reservas en cualquier momento.
                </p>
                <Link
                  href={`/sign-up?email=${encodeURIComponent(lockInData?.patientEmail || form.email)}`}
                  className="btn btn-gold"
                  style={{ display: 'inline-block' }}
                >
                  Crear mi cuenta
                </Link>
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.6rem' }}>¿Ya tienes cuenta? <Link href="/sign-in" style={{ color: '#0369a1' }}>Iniciar sesión</Link></p>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                {calendarUrl && (
                  <a href={calendarUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-lg book-success-calendar-btn">
                    <Icon name="calendar" size={16} /> Añadir al calendario
                  </a>
                )}
                <Link href="/" className="btn btn-gold btn-lg">
                  Volver al inicio
                </Link>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
}
