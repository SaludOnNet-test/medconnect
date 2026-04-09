'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PaymentForm from '@/components/PaymentForm';
import { services, insuranceCompanies, createReferral, getConvenienceFee, REFERRAL_STATES } from '@/data/mock';
import './book.css';

function BookContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerName = searchParams.get('providerName') || 'Centro Médico';
  const providerId = searchParams.get('providerId') || '1';
  const date = searchParams.get('date') || '';
  const time = searchParams.get('time') || '';
  const fee = Number(searchParams.get('fee') || 0);
  const feeLabel = searchParams.get('feeLabel') || '';
  const serviceId = searchParams.get('service') || '';

  const service = services.find((s) => s.id === Number(serviceId));
  const servicePrice = service?.basePrice || 0;

  const lockInId = searchParams.get('lockInId') || '';
  const stepParam = searchParams.get('step') || '';

  const [step, setStep] = useState('form'); // 'form' | 'payment' | 'success'
  const [paymentRef, setPaymentRef] = useState('');
  const [lockInData, setLockInData] = useState(null);
  const [hasInsurance, setHasInsurance] = useState(null);

  // Handle lock-in redirect: auto-jump to payment step
  useEffect(() => {
    if (stepParam === 'payment' && lockInId) {
      try {
        const stored = localStorage.getItem('referrals');
        const referrals = stored ? JSON.parse(stored) : [];
        const referral = referrals.find((r) => r.id === lockInId);
        if (referral) {
          setLockInData(referral);
          setStep('payment');
        }
      } catch {/* ignore */}
    }
  }, [stepParam, lockInId]);
  const [selectedInsurance, setSelectedInsurance] = useState('');
  
  // Referral states
  const [isReferral, setIsReferral] = useState(false);
  const [proData, setProData] = useState({
    clinicName: '',
    medicId: '', // Num colegiado
    email: '',
  });

  // Subscription states
  const [isPlusSubscribed, setIsPlusSubscribed] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState('monthly'); // 'monthly' | 'annual'

  const [form, setForm] = useState({
    name: '',
    surname: '',
    email: '',
    age: '',
    gender: '',
  });

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleProChange = (field, value) => {
    setProData((prev) => ({ ...prev, [field]: value }));
  };

  const activeFee = isPlusSubscribed ? 0 : fee;
  const subCost = isPlusSubscribed ? (subscriptionPlan === 'monthly' ? 7.99 : 71.88) : 0;

  const totalPrice =
    (hasInsurance === true
      ? activeFee
      : hasInsurance === false
        ? servicePrice + activeFee
        : 0) + subCost;

  const sendEmail = (templateName, data) => {
    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateName, data }),
    }).catch(() => {});
  };

  const handlePay = (e) => {
    e.preventDefault();

    // If it's a professional referral, create referral and redirect to lock-in page
    if (isReferral) {
      const convenienceFee = getConvenienceFee(date);
      const referral = createReferral({
        type: 'externa',
        professionalEmail: proData.email,
        professionName: proData.clinicName,
        patientEmail: form.email,
        providerId: Number(providerId),
        serviceId: Number(serviceId),
        slotDate: date,
        slotTime: time,
        providerName,
        fee: convenienceFee.amount,
      });

      // Store referral in localStorage
      const stored = localStorage.getItem('referrals');
      const referrals = stored ? JSON.parse(stored) : [];
      referrals.push(referral);
      localStorage.setItem('referrals', JSON.stringify(referrals));

      // Send lock-in invitation email to patient
      sendEmail('lockInInvitation', {
        patientEmail: form.email,
        professionalEmail: proData.email,
        clinicName: proData.clinicName,
        specialty: service?.name || 'Consulta médica',
        providerName,
        slotDate: date,
        slotTime: time,
        fee: convenienceFee.amount,
        lockInId: referral.id,
      });

      // Redirect to lock-in completion page
      router.push(`/lock-in/${referral.id}`);
      return;
    }

    // Normal booking flow → go to payment step
    setStep('payment');
  };

  const handlePaymentSuccess = ({ last4, reference }) => {
    setPaymentRef(reference);

    // If this was a lock-in referral, mark it CONFIRMED in localStorage
    if (lockInData) {
      try {
        const stored = localStorage.getItem('referrals');
        const referrals = stored ? JSON.parse(stored) : [];
        const updated = referrals.map((r) =>
          r.id === lockInData.id
            ? { ...r, state: REFERRAL_STATES.CONFIRMED, confirmedAt: new Date().toISOString() }
            : r
        );
        localStorage.setItem('referrals', JSON.stringify(updated));
      } catch {/* ignore */}
    }

    const patientEmail = lockInData?.patientEmail || form.email;
    const patientName = lockInData?.patientName || `${form.name} ${form.surname}`.trim();
    const slotDateToUse = lockInData?.slotDate || date;
    const slotTimeToUse = lockInData?.slotTime || time;
    const clinicName = lockInData?.providerName || providerName;

    // Build Google Calendar URL
    const start = new Date(`${slotDateToUse}T${slotTimeToUse}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Cita+en+${encodeURIComponent(clinicName)}&dates=${fmt(start)}/${fmt(end)}&details=Referencia+${reference}`;

    // Send confirmation emails
    sendEmail('bookingConfirmation', {
      patientEmail,
      patientName,
      providerName: clinicName,
      slotDate: slotDateToUse,
      slotTime: slotTimeToUse,
      totalPrice,
      reference,
      calendarUrl,
    });
    sendEmail('paymentReceipt', {
      patientEmail,
      patientName,
      reference,
      servicePrice: hasInsurance === false ? servicePrice : 0,
      feeAmount: activeFee,
      feeLabel,
      totalPrice,
      last4,
    });
    sendEmail('operationsBookingAlert', {
      bookingId: reference,
      clinicId: providerId,
      slotType: 'real',
      patientName,
      providerName: clinicName,
      slotDate: slotDateToUse,
      slotTime: slotTimeToUse,
      amount: totalPrice,
    });

    setStep('success');
    // Store calendarUrl for the success screen
    window._mcCalendarUrl = calendarUrl;
  };

  const formattedDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  // ── Payment step ──
  if (step === 'payment') {
    const slotDateToUse = lockInData?.slotDate || date;
    const slotTimeToUse = lockInData?.slotTime || time;
    const clinicName = lockInData?.providerName || providerName;
    const patientName = lockInData?.patientName || `${form.name} ${form.surname}`.trim();

    return (
      <>
        <Header />
        <main className="book-page">
          <div className="book-container">
            <div className="book-header">
              <p className="book-step-label">Paso 2 de 2</p>
              <h1 className="book-title">Pago seguro</h1>
            </div>
            <PaymentForm
              totalPrice={totalPrice}
              providerName={clinicName}
              slotDate={slotDateToUse}
              slotTime={slotTimeToUse}
              patientName={patientName}
              onPaymentSuccess={handlePaymentSuccess}
              onBack={() => setStep('form')}
            />
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // ── Success step ──
  if (step === 'success') {
    const calendarUrl = typeof window !== 'undefined' ? window._mcCalendarUrl : null;
    const slotDateToUse = lockInData?.slotDate || date;
    const slotTimeToUse = lockInData?.slotTime || time;
    const clinicName = lockInData?.providerName || providerName;
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
              <h2 className="book-success-title">¡Cita confirmada!</h2>
              <p className="book-success-subtitle">
                Tu pago ha sido procesado correctamente. Te hemos enviado un correo de confirmación.
              </p>

              <div className="book-summary-card" style={{ textAlign: 'left', marginTop: '1.5rem' }}>
                <div className="book-summary-provider">{clinicName}</div>
                <div className="book-summary-details">
                  <span>📅 <strong>{formattedSuccessDate}</strong></span>
                  <span>🕐 <strong>{slotTimeToUse}</strong></span>
                </div>
              </div>

              {hasInsurance === true && (
                <div className="book-info-box" style={{ marginTop: '1rem' }}>
                  <strong>ℹ️ Información Importante</strong><br />
                  Recuerda presentar tu <strong>tarjeta de asegurado</strong> al llegar a la clínica.
                </div>
              )}

              {isPlusSubscribed && (
                <div className="book-info-box book-info-box--green" style={{ marginTop: '1rem' }}>
                  <strong>✨ ¡Bienvenido a Med Connect Plus!</strong><br />
                  Tu suscripción {subscriptionPlan === 'monthly' ? 'mensual' : 'anual'} está activa.
                  A partir de ahora, tienes acceso prioritario ilimitado.
                </div>
              )}

              <div className="book-confirmation-ref" style={{ marginTop: '1.5rem' }}>
                {paymentRef}
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2rem' }}>
                {calendarUrl && (
                  <a href={calendarUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-lg book-success-calendar-btn">
                    📅 Añadir al calendario
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

  return (
    <>
      <Header />
      <main className="book-page">
        <div className="book-container">
          <div className="book-header">
            <p className="book-step-label">Paso 1 de 2</p>
            <h1 className="book-title">Completa la reserva</h1>
          </div>

          <div className="book-summary-card">
            <div className="book-summary-provider">{providerName}</div>
            <div className="book-summary-details">
              <span>📅 <strong>{formattedDate}</strong></span>
              <span>🕐 <strong>{time}</strong></span>
              {service && <span>🩺 <strong>{service.name}</strong></span>}
            </div>
          </div>

          <form onSubmit={handlePay}>
            
            {/* Professional Referral Toggle */}
            <div className="book-form" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md) var(--space-xl)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--navy)' }}>
                <input 
                  type="checkbox" 
                  checked={isReferral}
                  onChange={(e) => setIsReferral(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--gold)' }}
                />
                Soy un profesional médico y estoy derivando a este paciente
              </label>

              {isReferral && (
                <div className="book-form-grid" style={{ marginTop: 'var(--space-md)', animation: 'slideDown 0.3s ease' }}>
                  <div className="form-group book-form-full">
                    <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '4px' }}>
                      Identifícate para asociar esta reserva a tu cuenta Med Connect Pro y acumular comisiones. Si no tienes cuenta, <Link href="/pro/login" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>regístrate aquí</Link>.
                    </p>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="clinicName">Clínica / Tu Nombre</label>
                    <input
                      id="clinicName"
                      className="form-input"
                      type="text"
                      placeholder="Ej. Clínica San José"
                      value={proData.clinicName}
                      onChange={(e) => handleProChange('clinicName', e.target.value)}
                      required={isReferral}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="proEmail">Email Profesional</label>
                    <input
                      id="proEmail"
                      className="form-input"
                      type="email"
                      placeholder="email@clinica.com"
                      value={proData.email}
                      onChange={(e) => handleProChange('email', e.target.value)}
                      required={isReferral}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* User details form */}
            <div className="book-form">
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: 'var(--space-md)' }}>
                {isReferral ? 'Datos del Paciente' : 'Tus Datos'}
              </h3>
              <div className="book-form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="name">Nombre</label>
                  <input
                    id="name"
                    className="form-input"
                    type="text"
                    placeholder="Nombre"
                    value={form.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="surname">Apellidos</label>
                  <input
                    id="surname"
                    className="form-input"
                    type="text"
                    placeholder="Apellidos"
                    value={form.surname}
                    onChange={(e) => handleFormChange('surname', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group book-form-full">
                  <label className="form-label" htmlFor="email">Email {isReferral ? 'del Paciente' : ''}</label>
                  <input
                    id="email"
                    className="form-input"
                    type="email"
                    placeholder="paciente@email.com"
                    value={form.email}
                    onChange={(e) => handleFormChange('email', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="age">Edad</label>
                  <input
                    id="age"
                    className="form-input"
                    type="number"
                    placeholder="Edad"
                    value={form.age}
                    onChange={(e) => handleFormChange('age', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="gender">Sexo</label>
                  <select
                    id="gender"
                    className="form-select"
                    value={form.gender}
                    onChange={(e) => handleFormChange('gender', e.target.value)}
                    required
                  >
                    <option value="">Seleccionar</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="O">Otro</option>
                  </select>
                </div>
              </div>

              {/* Insurance toggle */}
              <div className="form-group" style={{ marginTop: 'var(--space-lg)' }}>
                <label className="form-label">¿{isReferral ? 'El paciente tiene' : 'Tienes'} seguro médico privado?</label>
                <div className="book-insurance-toggle">
                  <div
                    className={`book-insurance-option ${hasInsurance === true ? 'active' : ''}`}
                    onClick={() => setHasInsurance(true)}
                  >
                    Sí, {isReferral ? 'tiene' : 'tengo'} seguro
                  </div>
                  <div
                    className={`book-insurance-option ${hasInsurance === false ? 'active' : ''}`}
                    onClick={() => setHasInsurance(false)}
                  >
                    No {isReferral ? 'tiene' : 'tengo'} seguro
                  </div>
                </div>
              </div>

              {/* If insured, ask which company */}
              {hasInsurance === true && (
                <div className="form-group" style={{ marginTop: 'var(--space-md)' }}>
                  <label className="form-label" htmlFor="insurance-company">¿Cuál es la aseguradora?</label>
                  <select
                    id="insurance-company"
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
              )}

              {hasInsurance === true && (
                <p style={{ marginTop: 'var(--space-md)', fontSize: '0.85rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                  * Recuerda que deberás mostrar tu tarjeta de asegurado en la clínica. Nosotros gestionaremos tu acceso de forma preferente.
                </p>
              )}
            </div>

            {/* MedConnect Plus Upsell */}
            {hasInsurance !== null && !isReferral && (
              <div className="book-upsell-card animate-fade-in">
                <div className="book-upsell-header">
                  <span className="book-upsell-badge">RECOMENDADO</span>
                  <h3>Hazte Med Connect Plus</h3>
                </div>
                <p>Prioridad máxima en tus citas presenciales y servicios digitales ilimitados (Chat y Video con Médico de Familia).</p>
                
                <div className="book-upsell-options">
                  <label className={`book-upsell-option ${isPlusSubscribed && subscriptionPlan === 'monthly' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="subPlan" 
                      checked={isPlusSubscribed && subscriptionPlan === 'monthly'} 
                      onChange={() => {
                        setIsPlusSubscribed(true);
                        setSubscriptionPlan('monthly');
                      }} 
                    />
                    <div className="upsell-option-info">
                      <strong>Plan Mensual</strong>
                      <span>7.99€/mes</span>
                    </div>
                  </label>
                  <label className={`book-upsell-option ${isPlusSubscribed && subscriptionPlan === 'annual' ? 'active' : ''}`}>
                    <input 
                      type="radio" 
                      name="subPlan" 
                      checked={isPlusSubscribed && subscriptionPlan === 'annual'} 
                      onChange={() => {
                        setIsPlusSubscribed(true);
                        setSubscriptionPlan('annual');
                      }} 
                    />
                    <div className="upsell-option-info">
                      <strong>Plan Anual</strong>
                      <span>71.88€/año (paga 5.99€/mes)</span>
                    </div>
                  </label>
                </div>

                {isPlusSubscribed && (
                  <button 
                    type="button" 
                    className="book-upsell-remove"
                    onClick={() => setIsPlusSubscribed(false)}
                  >
                    No añadir suscripción por ahora
                  </button>
                )}
              </div>
            )}

            {/* Price Breakdown */}
            {hasInsurance !== null && (
              <div className="book-price-breakdown animate-fade-in">
                <p className="book-step-label" style={{ marginBottom: 'var(--space-md)' }}>Resumen del pago</p>

                {hasInsurance === false && service && (
                  <div className="book-price-row">
                    <span className="book-price-label">🩺 {service.name}</span>
                    <span className="book-price-amount">{Number(servicePrice).toFixed(2)}€</span>
                  </div>
                )}

                <div className="book-price-row">
                  <span className="book-price-label">
                    🎫 {feeLabel || 'Fee de reserva'}
                  </span>
                  <span className={`book-price-amount ${activeFee === 0 && isPlusSubscribed ? 'book-price-struck' : activeFee === 0 ? 'book-price-free' : ''}`}>
                    {isPlusSubscribed && <span className="struck-price">{Number(fee).toFixed(2)}€</span>}
                    {activeFee > 0 ? `${Number(activeFee).toFixed(2)}€` : '0€'}
                  </span>
                </div>

                {isPlusSubscribed && (
                  <div className="book-price-row" style={{ color: 'var(--gold)', fontWeight: 600 }}>
                    <span className="book-price-label">✨ Suscripción Med Connect Plus ({subscriptionPlan === 'monthly' ? 'Mensual' : 'Anual'})</span>
                    <span className="book-price-amount">{subscriptionPlan === 'monthly' ? '7.99' : '71.88'}€</span>
                  </div>
                )}

                <div className="book-price-row total">
                  <span>Total a pagar hoy</span>
                  <span className="book-price-amount">
                    {totalPrice > 0 ? `${Number(totalPrice).toFixed(2)}€` : 'Gratis'}
                  </span>
                </div>
              </div>
            )}

            {/* Submit */}
            {hasInsurance !== null && (
              <div className="book-actions animate-fade-in">
                <button type="submit" className="btn btn-gold btn-lg" id="pay-btn">
                  {totalPrice > 0 ? `Confirmar y Proceder al Pago (${Number(totalPrice).toFixed(2)}€)` : 'Confirmar reserva gratuita'}
                </button>
              </div>
            )}
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--muted)' }}>
        Cargando...
      </div>
    }>
      <BookContent />
    </Suspense>
  );
}
