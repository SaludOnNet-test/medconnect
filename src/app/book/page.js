'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PaymentForm from '@/components/PaymentForm';
import { services, insuranceCompanies, createReferral, getConvenienceFee, REFERRAL_STATES } from '@/data/mock';
import { trackEvent } from '@/lib/analytics';
import { formatEUR } from '@/lib/format';
import Icon from '@/components/icons/Icon';
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

  // Procedure (acto médico) — passed from search-v2 modal. Required for everyone.
  // procedurePrice is the SON catalogue price snapshot at booking time; trust
  // this as the price even though /api/bookings re-validates server-side (B9).
  const procedureSlugParam = searchParams.get('procedureSlug') || '';
  const procedureNameParam = searchParams.get('procedureName') || '';
  const procedurePriceParam = Number(searchParams.get('procedurePrice') || 0);

  const service = services.find((s) => s.id === Number(serviceId));
  // Prefer the per-clinic procedure price from the URL; fall back to the legacy
  // mock service basePrice only as a safety net.
  const servicePrice = procedurePriceParam > 0 ? procedurePriceParam : (service?.basePrice || 0);
  const serviceLabel = procedureNameParam || service?.name || '';

  const lockInId = searchParams.get('lockInId') || '';
  const stepParam = searchParams.get('step') || '';

  const [step, setStep] = useState('form'); // 'form' | 'payment' | 'success'
  const [paymentRef, setPaymentRef] = useState('');
  const [lockInData, setLockInData] = useState(null);
  const [hasInsurance, setHasInsurance] = useState(null);

  // Track book_started on mount
  useEffect(() => {
    trackEvent('book_started', { provider: searchParams.get('providerName'), service: serviceId });
  }, []);

  // Handle lock-in redirect: auto-jump to payment step
  useEffect(() => {
    if (stepParam !== 'payment' || !lockInId) return;

    async function loadLockIn() {
      // Try API first
      try {
        const res = await fetch(`/api/referrals/${lockInId}`);
        if (res.ok) {
          const referral = await res.json();
          setLockInData(referral);
          setStep('payment');
          return;
        }
      } catch {}

      // Fallback: localStorage
      try {
        const stored = localStorage.getItem('referrals');
        const referrals = stored ? JSON.parse(stored) : [];
        const referral = referrals.find((r) => r.id === lockInId);
        if (referral) {
          setLockInData(referral);
          setStep('payment');
        }
      } catch {}
    }

    loadLockIn();
  }, [stepParam, lockInId]);
  const [selectedInsurance, setSelectedInsurance] = useState('');
  
  // Referral states
  const [isReferral, setIsReferral] = useState(false);
  const [proData, setProData] = useState({
    clinicName: '',
    medicId: '', // Num colegiado
    email: '',
  });

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

  const activeFee = fee;

  const totalPrice =
    hasInsurance === true
      ? activeFee
      : hasInsurance === false
        ? servicePrice + activeFee
        : 0;

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

      // Email 1: Patient gets lock-in invitation
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

      // Email 2: Derivador gets confirmation that the case was created
      sendEmail('derivadorReferralCreated', {
        to: proData.email,
        patientEmail: form.email,
        clinicName: proData.clinicName,
        specialty: service?.name || 'Consulta médica',
        providerName,
        slotDate: date,
        slotTime: time,
        fee: convenienceFee.amount,
      });

      // Redirect to lock-in completion page
      router.push(`/lock-in/${referral.id}`);
      return;
    }

    // Normal booking flow → go to payment step
    setStep('payment');
  };

  const handlePaymentSuccess = async ({ last4, reference }) => {
    setPaymentRef(reference);

    const patientEmail = lockInData?.patientEmail || form.email;
    const patientName = lockInData?.patientName || `${form.name} ${form.surname}`.trim();
    const slotDateToUse = lockInData?.slotDate || date;
    const slotTimeToUse = lockInData?.slotTime || time;
    const clinicName = lockInData?.providerName || providerName;

    // Persist booking to DB and capture the operations case ID for the ops email
    let opsCaseId = null;
    let paymentToClinic = null;
    let tier = null;
    let selfServiceToken = null;
    try {
      const r = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reference,
          referralId: lockInData?.id || null,
          patientName,
          patientEmail,
          patientPhone: lockInData?.patientPhone || form.phone || null,
          patientAddress: lockInData?.patientAddress || null,
          providerId: Number(providerId) || null,
          providerName: clinicName,
          specialty: service?.name || null,
          slotDate: slotDateToUse,
          slotTime: slotTimeToUse,
          amount: totalPrice,
          // Sin seguro: status starts at awaiting_voucher (ops must upload SON
          // voucher manually). Con seguro: confirmed straight away.
          status: hasInsurance === true ? 'confirmed' : 'awaiting_voucher',
          cardLast4: last4,
          hasInsurance: hasInsurance === true,
          insuranceCompany: selectedInsurance || null,
          paymentIntentId: reference,
          // New: procedure (acto médico) + price split snapshots.
          procedureSlug: procedureSlugParam || null,
          procedureName: serviceLabel || null,
          servicePrice: hasInsurance === false ? Number(servicePrice) || 0 : 0,
          platformFee: Number(activeFee) || 0,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (j._case) {
        opsCaseId = j._case.id ?? null;
        paymentToClinic = j._case.paymentToClinic ?? null;
        tier = j._case.tier ?? null;
      }
      // F2 — capture the self-service token returned by the booking API so
      // we can build the cancel/reschedule link for the confirmation email.
      if (j.selfServiceToken) selfServiceToken = j.selfServiceToken;
    } catch (e) { /* keep going */ }

    // If this was a lock-in referral, mark it CONFIRMED in DB + localStorage
    if (lockInData) {
      fetch(`/api/referrals/${lockInData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: REFERRAL_STATES.CONFIRMED }),
      }).catch(() => {});
      try {
        const stored = localStorage.getItem('referrals');
        const referrals = stored ? JSON.parse(stored) : [];
        const updated = referrals.map((r) =>
          r.id === lockInData.id
            ? { ...r, state: REFERRAL_STATES.CONFIRMED, confirmedAt: new Date().toISOString() }
            : r
        );
        localStorage.setItem('referrals', JSON.stringify(updated));
      } catch {}
    }

    // Build Google Calendar URL
    const start = new Date(`${slotDateToUse}T${slotTimeToUse}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Cita+en+${encodeURIComponent(clinicName)}&dates=${fmt(start)}/${fmt(end)}&details=Referencia+${reference}`;

    // F2 — build the patient self-service URL (cancel / reschedule). Falls back
    // to the production domain when NEXT_PUBLIC_BASE_URL isn't set.
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';
    const selfServiceUrl = selfServiceToken
      ? `${baseUrl.replace(/\/$/, '')}/booking/${selfServiceToken}`
      : null;

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
      hasInsurance,
      feeAmount: activeFee,
      procedureName: serviceLabel || null,
      servicePrice: hasInsurance === false ? Number(servicePrice) || 0 : 0,
      selfServiceUrl,
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
      caseId: opsCaseId,
      clinicId: providerId,
      clinicPhone: provider?.telephone || null,
      patientName,
      patientEmail,
      patientPhone: lockInData?.patientPhone || form.phone || null,
      providerName: clinicName,
      slotDate: slotDateToUse,
      slotTime: slotTimeToUse,
      amount: totalPrice,
      tier,
      paymentToClinic,
      specialty: service?.name || null,
      hasInsurance: hasInsurance === true,
      insuranceCompany: selectedInsurance || null,
      procedureSlug: procedureSlugParam || null,
      procedureName: serviceLabel || null,
      servicePrice: hasInsurance === false ? Number(servicePrice) || 0 : 0,
      platformFee: Number(activeFee) || 0,
    });

    // Email: Derivador gets notified patient confirmed and paid
    if (lockInData?.professionalEmail) {
      sendEmail('derivadorPatientPaid', {
        to: lockInData.professionalEmail,
        patientName,
        providerName: clinicName,
        slotDate: slotDateToUse,
        slotTime: slotTimeToUse,
        totalPrice,
        reference,
      });
    }

    trackEvent('book_completed', { provider: clinicName, amount: totalPrice, service: serviceId });
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
              <h2 className="book-success-title">¡Reserva prioritaria confirmada!</h2>
              <p className="book-success-subtitle">
                {hasInsurance === true
                  ? 'Hemos confirmado tu reserva prioritaria. Acude con tu tarjeta de asegurado — la consulta corre por tu póliza.'
                  : 'Hemos confirmado tu cita y la consulta privada. Llega 10 minutos antes; en recepción ya saben quién eres.'}
              </p>

              <div className="book-summary-card" style={{ textAlign: 'left', marginTop: '1.5rem' }}>
                <div className="book-summary-provider">{clinicName}</div>
                <div className="book-summary-details">
                  <span><Icon name="calendar" size={14} /> <strong>{formattedSuccessDate}</strong></span>
                  <span><Icon name="clock" size={14} /> <strong>{slotTimeToUse}</strong></span>
                </div>
              </div>

              {hasInsurance === true && (
                <div className="book-info-box" style={{ marginTop: '1rem', textAlign: 'left' }}>
                  <strong>Cuando llegues a la clínica</strong>
                  <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>
                    Entrega tu <strong>tarjeta de asegurado</strong> en recepción, como en cualquier cita concertada. La clínica facturará la consulta a tu aseguradora. Tu pago de hoy cubre solo la <strong>tarifa de prioridad</strong> — no se vuelve a cobrar.
                  </p>
                </div>
              )}

              {hasInsurance === false && (
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
              <span><Icon name="calendar" size={14} /> <strong>{formattedDate}</strong></span>
              <span><Icon name="clock" size={14} /> <strong>{time}</strong></span>
              {serviceLabel && <span><Icon name="stethoscope" size={14} /> <strong>{serviceLabel}</strong></span>}
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

              {/* Insurance context + toggle */}
              <div className="form-group" style={{ marginTop: 'var(--space-lg)' }}>
                <div style={{
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  marginBottom: 'var(--space-md)',
                  fontSize: '0.85rem',
                  color: '#0c4a6e',
                  lineHeight: 1.6,
                }}>
                  <strong>Antes de continuar:</strong> el acto médico lo paga tu seguro a la clínica. A nosotros solo nos pagas la <strong>tarifa de prioridad</strong> por gestionarte la reserva prioritaria.
                </div>
                <label className="form-label">¿{isReferral ? 'El paciente tiene' : 'Tienes'} seguro médico privado?</label>
                <div className="book-insurance-toggle">
                  <div
                    className={`book-insurance-option ${hasInsurance === true ? 'active' : ''}`}
                    onClick={() => setHasInsurance(true)}
                  >
                    <strong>Sí, {isReferral ? 'tiene' : 'tengo'} seguro</strong>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px', fontWeight: 400 }}>
                      Pagas solo la tarifa de prioridad. La consulta va por tu póliza.
                    </span>
                  </div>
                  <div
                    className={`book-insurance-option ${hasInsurance === false ? 'active' : ''}`}
                    onClick={() => setHasInsurance(false)}
                  >
                    <strong>No {isReferral ? 'tiene' : 'tengo'} seguro</strong>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px', fontWeight: 400 }}>
                      Pagas la consulta privada + la tarifa de prioridad. Total visible antes del pago.
                    </span>
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
                  * Te hemos reservado este hueco con prioridad. Acude con tu tarjeta de asegurado y la clínica te atenderá bajo tu póliza, como cualquier otra cita concertada.
                </p>
              )}
            </div>

            {/* Price Breakdown */}
            {hasInsurance !== null && (
              <div className="book-price-breakdown animate-fade-in">
                <p className="book-step-label" style={{ marginBottom: 'var(--space-md)' }}>Resumen del pago</p>

                {/* Medical service line — ALWAYS visible to make clear what insurance covers */}
                {serviceLabel && (
                  <div className="book-price-row">
                    <span className="book-price-label"><Icon name="stethoscope" size={14} /> {serviceLabel}</span>
                    <span className="book-price-amount">
                      {hasInsurance === true
                        ? <span style={{ color: '#00805a', fontWeight: 600 }}>Cubierto por tu seguro</span>
                        : formatEUR(servicePrice)}
                    </span>
                  </div>
                )}

                <div className="book-price-row">
                  <span className="book-price-label">
                    🎫 Tarifa de prioridad{feeLabel ? ` (${feeLabel.toLowerCase()})` : ''}
                  </span>
                  <span className="book-price-amount">
                    {activeFee > 0 ? formatEUR(activeFee) : '0 €'}
                  </span>
                </div>

                <div className="book-price-row total">
                  <span>Total que pagas hoy</span>
                  <span className="book-price-amount">
                    {totalPrice > 0 ? formatEUR(totalPrice) : 'Gratis'}
                  </span>
                </div>

                {hasInsurance === true && (
                  <p style={{ marginTop: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                    <Icon name="info" size={14} /> Tu seguro cubre la consulta directamente con la clínica. Tú solo pagas la prioridad por la reserva.
                  </p>
                )}

                {hasInsurance === false && (
                  <>
                    <p style={{ marginTop: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                      <Icon name="info" size={14} /> Sin seguro pagas dos cosas en una: la <strong>consulta privada</strong> (tarifa oficial de la clínica, según el catálogo SaludOnNet) y la <strong>tarifa de prioridad</strong> por conseguirte el hueco urgente. Ese es el total — no se vuelve a cobrar en la clínica.
                    </p>
                    <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                      <Icon name="shield-check" size={14} /> <strong>Cancelación 100% reembolsable:</strong> si la clínica no puede atenderte el día/hora reservados, te devolvemos el importe completo (acto + tarifa).
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Submit */}
            {hasInsurance !== null && (
              <div className="book-actions animate-fade-in">
                <button type="submit" className="btn btn-gold btn-lg" id="pay-btn">
                  {totalPrice > 0 ? `Confirmar y Proceder al Pago (${formatEUR(totalPrice)})` : 'Confirmar reserva gratuita'}
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
