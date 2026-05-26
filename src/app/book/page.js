'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PaymentForm from '@/components/PaymentForm';
import { services, insuranceCompanies, createReferral, getConvenienceFee, REFERRAL_STATES } from '@/data/mock';
import { trackEvent, trackConversion } from '@/lib/analytics';
import { formatEUR } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import './book.css';

// 2026-04-29 — Clerk auto-detection restored via `ClerkProBridge`.
// The earlier inline `require('@clerk/nextjs')` bridge broke production
// hydration after the live-keys swap (commented out 2026-04-28). Now we
// load the bridge with `next/dynamic({ ssr: false })`, which keeps Clerk's
// hooks fully out of the SSR pass — no server-vs-client mismatch is even
// possible. The `?asProfessional=true` deep-link path still works in
// addition to this for callers that don't depend on a Clerk session.
const HAS_CLERK_KEYS = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const ClerkProBridge = HAS_CLERK_KEYS
  ? dynamic(() => import('@/components/ClerkProBridge'), { ssr: false })
  : null;

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

  // Forwarded from search-v2 → ClinicBookingModal: the user already declared
  // their coverage situation by picking a filter, so pre-select the toggle
  // and (if they chose an insurer) the dropdown — saves a redundant click.
  const isSinSeguroParam = searchParams.get('isSinSeguro') === 'true';
  const insuranceParam = searchParams.get('insurance') || '';
  // ?asProfessional=true — set when search-v2 detected a logged-in pro user
  // OR when an external "derivar un paciente" entry-point deep-linked here.
  // Pre-checks the "I'm a doctor" toggle so the pro doesn't have to do it.
  const asProfessionalParam = searchParams.get('asProfessional') === 'true';

  // When the patient lands here from a /lock-in redirect we already have
  // their name + email + phone + address (collected in /lock-in/[id] and
  // PATCHed onto the referral row). Default the step to 'payment' in that
  // case so the patient form never flashes — the old default 'form'
  // briefly rendered the empty patient inputs while we fetched the
  // referral, which the audit caught as a "double entry" UX bug.
  const [step, setStep] = useState(
    stepParam === 'payment' && lockInId ? 'payment' : 'form',
  );
  const [paymentRef, setPaymentRef] = useState('');
  const [lockInData, setLockInData] = useState(null);
  // True while we're fetching the referral row that backs the payment
  // step. PaymentForm shows a skeleton instead of trying to render with
  // missing data.
  const lockInLoading = stepParam === 'payment' && lockInId && !lockInData;
  // Pre-select hasInsurance: false when sin-seguro filter was used,
  // true when an insurer was picked, null otherwise (user still chooses).
  const [hasInsurance, setHasInsurance] = useState(
    isSinSeguroParam ? false : (insuranceParam ? true : null)
  );

  // Track book_started on mount.
  //
  // Two paths land on /book:
  //   - 'direct'  : patient picked the slot themselves via ClinicBookingModal,
  //                 went through search → clinic_viewed → slot_selected.
  //   - 'lock-in' : professional referred a patient and pre-selected the slot;
  //                 the patient confirms identity in /lock-in/[id] and lands
  //                 here at ?step=payment. There is NO slot_selected for this
  //                 flow because the patient never picks a time.
  //
  // We tag the event with `source` so the marketing agent can split the
  // funnel correctly. Before this field existed, the agent saw
  // `slot_selected << book_started` and flagged it as a bug.
  //
  // The useRef guard prevents a duplicate fire if React re-mounts the
  // component (StrictMode, fast-refresh in dev, RSC re-hydration in prod).
  // Without it, the same booking session could inflate book_started counts.
  const bookStartedFired = useRef(false);
  useEffect(() => {
    if (bookStartedFired.current) return;
    bookStartedFired.current = true;
    const source = searchParams.get('lockInId') ? 'lock-in' : 'direct';
    trackEvent('book_started', {
      provider: searchParams.get('providerName'),
      service: serviceId,
      source,
    });
  }, []);

  // Handle lock-in redirect: auto-jump to payment step.
  //
  // The lock-in page redirects here after the patient confirms their data.
  // We try (in order):
  //   1. The DB via /api/referrals/[id] — works in the normal case.
  //   2. localStorage — same-browser fallback for legacy testing flows.
  //   3. The URL params themselves — works when (1) and (2) both miss,
  //      which happens when the referral row was never persisted to the
  //      DB (POST silently failed at creation time, fire-and-forget chain
  //      in /lock-in/[id] swallowed the error, etc.).
  //
  // Before this third path existed, a missing row left `lockInData` null
  // forever and the page hung on the "Cargando los datos de tu reserva…"
  // skeleton with no escape — a paying patient got stuck on production
  // (REF-VRHK7OOD6, 2026-05-18). The redirect from /lock-in/[id] now
  // forwards slotDate, slotTime, providerName, fee, specialty,
  // professionalEmail and patientPhone as URL params so this fallback has
  // everything it needs to render the page and charge the card.
  useEffect(() => {
    if (stepParam !== 'payment' || !lockInId) return;

    async function loadLockIn() {
      // 1. Try API first.
      try {
        const res = await fetch(`/api/referrals/${lockInId}`);
        if (res.ok) {
          const referral = await res.json();
          setLockInData(referral);
          setStep('payment');
          return;
        }
        // res.ok === false (404, 500, etc.) — fall through to fallbacks.
      } catch {}

      // 2. Same-browser localStorage fallback.
      try {
        const stored = localStorage.getItem('referrals');
        const referrals = stored ? JSON.parse(stored) : [];
        const referral = referrals.find((r) => r.id === lockInId);
        if (referral) {
          setLockInData(referral);
          setStep('payment');
          return;
        }
      } catch {}

      // 3. Synthesize from URL params. This is the "DB row never existed"
      //    recovery path. We need at minimum slotDate + slotTime +
      //    providerName + patientEmail to render the page meaningfully;
      //    without them we can't even build the calendar URL or Stripe
      //    metadata after payment, so we bail to a friendly error.
      const urlSlotDate = searchParams.get('slotDate');
      const urlSlotTime = searchParams.get('slotTime');
      const urlProviderName = searchParams.get('providerName');
      const urlPatientEmail = searchParams.get('patientEmail');
      const urlPatientName = searchParams.get('patientName');
      const urlFee = searchParams.get('fee');

      if (urlSlotDate && urlSlotTime && urlProviderName && urlPatientEmail) {
        setLockInData({
          id: lockInId,
          patientEmail: urlPatientEmail,
          patientName: urlPatientName || '',
          patientPhone: searchParams.get('patientPhone') || null,
          providerName: urlProviderName,
          providerId: Number(searchParams.get('providerId')) || null,
          slotDate: urlSlotDate,
          slotTime: urlSlotTime,
          fee: urlFee ? Number(urlFee) : null,
          specialty: searchParams.get('specialty') || null,
          professionalEmail: searchParams.get('professionalEmail') || null,
          state: 'PENDING',
          _recoveredFromUrl: true, // marker for debugging in DevTools
        });
        setStep('payment');
        return;
      }

      // 4. We tried everything. Surface a clear error state instead of
      //    leaving the skeleton on forever. The patient gets an actionable
      //    message + a contact email. The page sets lockInData to a
      //    sentinel object so `lockInLoading` becomes false and the error
      //    branch (below) renders.
      setLockInData({ _loadFailed: true });
    }

    loadLockIn();
  }, [stepParam, lockInId, searchParams]);
  const [selectedInsurance, setSelectedInsurance] = useState(insuranceParam || '');

  // Referral states. Initial value comes from ?asProfessional=true (the
  // explicit deep-link case); the Clerk bridge below also flips it on
  // when a signed-in user has a `professional`/`admin` role but didn't
  // deep-link with the URL param.
  const [isReferral, setIsReferral] = useState(asProfessionalParam);
  const [proData, setProData] = useState({
    clinicName: '',
    medicId: '', // Num colegiado
    email: '',
  });

  // Clerk-driven auto-fill: only fires for signed-in pros (the bridge
  // doesn't call us back for patients or signed-out users). Deliberately
  // additive — never overrides a value the user has already typed, so a
  // pro who manually unchecks the toggle stays unchecked and a pre-typed
  // email isn't clobbered.
  const handleClerkPro = useCallback(({ email, name }) => {
    setIsReferral(true);
    setProData((prev) => ({
      clinicName: prev.clinicName || name || '',
      medicId: prev.medicId,
      email: prev.email || email || '',
    }));
  }, []);

  const [form, setForm] = useState({
    name: '',
    surname: '',
    email: '',
    age: '',
    gender: '',
    // 2026-05 — collect identity + contact required by the clinic for
    // every booking. DNI/NIE/Pasaporte is requested in the same field so
    // foreign patients aren't forced to fake a Spanish doc.
    dateOfBirth: '',
    nationalId: '',
    phone: '',
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

  const handlePay = async (e) => {
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

      // Persist to DB via /api/referrals so the patient can recover the
      // row when they open the email link in a different browser. The POST
      // used to be missing entirely here, which meant the external derivar
      // path only created localStorage entries — patients on a different
      // device hit a 404 on the /book lock-in loader and got stuck on the
      // skeleton (REF-VRHK7OOD6 incident, 2026-05-18). The POST is async
      // and best-effort: we still fall back to localStorage + URL ?data=
      // recovery if the DB is unreachable. The route accepts unauth POSTs
      // and tags them with verified_derivador=false; the rate limit
      // (10/h/IP) caps the cost of spam.
      try {
        await fetch('/api/referrals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: referral.id,
            patientEmail: form.email,
            professionalEmail: proData.email,
            professionName: proData.clinicName,
            providerId: Number(providerId),
            providerName,
            slotDate: date,
            slotTime: time,
            fee: convenienceFee.amount,
            specialty: service?.name || 'Consulta médica',
            lockInWarningAt: referral.lockInWarningAt,
          }),
        }).then((r) => {
          if (!r.ok) {
            // Log so we have visibility when this fails — the previous
            // silent catch is what hid the REF-VRHK7OOD6 bug for hours.
            console.error('[/book referral POST]', r.status, r.statusText);
          }
        });
      } catch (err) {
        console.error('[/book referral POST] network error', err?.message);
      }

      // Also store in localStorage as a same-browser fallback. /lock-in/[id]
      // and /book both check the DB first; this is just a backup channel.
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
          // 2026-05 — captured from the booking form. DB columns are added
          // via /api/db/setup; the bookings POST does a graceful UPDATE so
          // pre-migration deploys don't drop the booking.
          patientDateOfBirth: form.dateOfBirth || null,
          patientNationalId: form.nationalId ? form.nationalId.trim() : null,
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
      // The clinic phone isn't on this client (only providerName comes
      // through the URL); ops can resolve it from `clinicId` server-side.
      // Previously this read `provider?.telephone`, but `provider` was
      // never declared in this scope — optional chaining doesn't shield
      // against a ReferenceError on an undeclared identifier, so the whole
      // handler threw before reaching `setStep('success')` and the patient
      // got stuck on "Procesando…". Caught in 2026-05 review.
      clinicPhone: null,
      patientName,
      patientEmail,
      patientPhone: lockInData?.patientPhone || form.phone || null,
      patientDateOfBirth: form.dateOfBirth || null,
      patientNationalId: form.nationalId ? form.nationalId.trim() : null,
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

    // Google Ads conversion. Value is the platform_fee (priority fee) — the
    // actual MedConnect revenue per booking — NOT totalPrice, which for
    // sin-seguro patients also includes the clinic's service fee that is
    // passed through. transaction_id = reference dedupes if the user
    // reloads the success page. Enhanced Conversions: email + phone are
    // SHA-256 hashed inside trackConversion() before being sent.
    // Fire-and-forget; never await — booking UX must not depend on the ad
    // network being reachable.
    trackConversion({
      transactionId: reference,
      value: Number(activeFee) || 0,
      currency: 'EUR',
      userData: {
        email: patientEmail,
        phone: lockInData?.patientPhone || form.phone || null,
      },
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
              <div
                className="book-summary-card"
                style={{ textAlign: 'center', padding: 'var(--space-7)', color: 'var(--fg-muted)' }}
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
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  marginBottom: 'var(--space-md)',
                  fontSize: '0.85rem',
                  color: '#0c4a6e',
                  lineHeight: 1.6,
                }}>
                  <strong>Un último paso antes del pago:</strong> el acto médico lo paga tu seguro a la clínica. A nosotros solo nos pagas la <strong>tarifa de prioridad</strong> por gestionarte la reserva prioritaria.
                </div>
                <label className="form-label">¿Tienes seguro médico privado para esta consulta?</label>
                <div className="book-insurance-toggle">
                  <div
                    className={`book-insurance-option ${hasInsurance === true ? 'active' : ''}`}
                    onClick={() => setHasInsurance(true)}
                  >
                    <strong>Sí, tengo seguro</strong>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px', fontWeight: 400 }}>
                      Pagas solo la tarifa de prioridad. La consulta va por tu póliza.
                    </span>
                  </div>
                  <div
                    className={`book-insurance-option ${hasInsurance === false ? 'active' : ''}`}
                    onClick={() => setHasInsurance(false)}
                  >
                    <strong>No tengo seguro</strong>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px', fontWeight: 400 }}>
                      Pagas la consulta privada + la tarifa de prioridad. Total visible antes del pago.
                    </span>
                  </div>
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
                    {activeFee > 0 ? formatEUR(activeFee) : '0 €'}
                  </span>
                </div>

                <div className="book-price-row total">
                  <span>Total que pagas hoy</span>
                  <span className="book-price-amount">
                    {totalPrice > 0 ? formatEUR(totalPrice) : 'Gratis'}
                  </span>
                </div>
              </div>
            )}

            {/* PaymentForm — only mounts once hasInsurance is resolved.
                Until then the patient sees the toggle above. Without this
                gate the Stripe form would mount with totalPrice=0 and look
                broken to the user. */}
            {hasInsurance !== null && (
              <PaymentForm
                totalPrice={totalPrice}
                providerName={clinicName}
                slotDate={slotDateToUse}
                slotTime={slotTimeToUse}
                patientName={patientName}
                patientEmail={patientEmailForPayment}
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
      {ClerkProBridge && <ClerkProBridge onSignedInPro={handleClerkPro} />}
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
                <div className="form-group">
                  <label className="form-label" htmlFor="dateOfBirth">Fecha de nacimiento</label>
                  <input
                    id="dateOfBirth"
                    className="form-input"
                    type="date"
                    /* Cap at today — patients can't be born in the future.
                       Allow up to 120 years back (loose check; the API
                       enforces a stricter ISO-date format). */
                    max={new Date().toISOString().slice(0, 10)}
                    value={form.dateOfBirth}
                    onChange={(e) => handleFormChange('dateOfBirth', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="nationalId">DNI / NIE / Pasaporte</label>
                  <input
                    id="nationalId"
                    className="form-input"
                    type="text"
                    placeholder="Ej. 12345678A · X1234567L · AB123456"
                    value={form.nationalId}
                    onChange={(e) => handleFormChange('nationalId', e.target.value)}
                    /* Loose accepts: 5-20 alphanumerics + a few separators.
                       Tightening to per-country regex would block legitimate
                       passport formats; the clinic verifies the doc on
                       arrival, so we keep this permissive. */
                    pattern="[A-Za-z0-9 \-\.]{5,20}"
                    title="Introduce un DNI, NIE o número de pasaporte válido"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="phone">Teléfono de contacto</label>
                  <input
                    id="phone"
                    className="form-input"
                    type="tel"
                    placeholder="Ej. +34 612 345 678"
                    value={form.phone}
                    onChange={(e) => handleFormChange('phone', e.target.value)}
                    /* Loose accepts: country-code prefix + 6-20 digits/separators.
                       The clinic will reach out on this number if there's a
                       schedule change — better to accept all formats and
                       validate at-call than to block valid international
                       formats. */
                    pattern="[\+0-9 \-\(\)]{6,25}"
                    title="Introduce un teléfono válido"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                  />
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
                      <Icon name="shield-check" size={14} /> <strong>Cancelación con más de 72 h:</strong> reembolso completo. Dentro de las 72 h o no show: te devolvemos solo el valor del servicio (la prioridad no es reembolsable).
                    </p>
                  </>
                )}
                {hasInsurance === true && (
                  <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                    <Icon name="shield-check" size={14} /> <strong>Cancelación con más de 72 h:</strong> reembolso completo de la prioridad. Dentro de las 72 h o no show: la prioridad no es reembolsable.
                  </p>
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
