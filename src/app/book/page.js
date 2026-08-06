'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import TrustStrip from '@/components/TrustStrip';
import { services, insuranceCompanies, createReferral, getConvenienceFee, REFERRAL_STATES } from '@/data/mock';
import { isLikelyCovered } from '@/data/insuranceCoverage';
import { getPricingDisplay, STANDARD_TIERS } from '@/lib/pricing';
import { isPartnerClinic } from '@/lib/partnerClinics';
import { trackEvent, trackConversion } from '@/lib/analytics';
import { formatEUR } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import { fetchWithSession } from '@/lib/sessionId';
import './book.css';
import { sendEmail, buildCalendarUrl } from './bookingHelpers';
import useSlotHold from './useSlotHold';
import PaymentStep from './PaymentStep';
import SuccessStep from './SuccessStep';

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
  // 2026-06-09 — INCIDENT FIX. The previous `|| '1'` fallback was a
  // foot-gun: when a caller forgot to pass providerId, EVERY booking
  // landed as Cea Bermúdez (id=1). That triggered the wrong
  // notification email (Jacques Blehaut → araceli@ceasalud.com despite
  // booking elsewhere) and applied the partner discount silently.
  // We now leave providerId blank when the URL doesn't provide one;
  // downstream code that needs a numeric id Number()-s this into NaN
  // → null in /api/bookings, instead of silently routing to clinic 1.
  const providerId = searchParams.get('providerId') || '';
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

  // SaludOnNet video-consultation pilot — the modal forwards
  // deliveryMode=video + servicePrice + specialtyDisplay. When set,
  // the page collapses the insurance question (always sin-seguro),
  // charges only the service price (priorityFee=0), and the bookings
  // POST routes the row through the Ops-handoff path
  // (status=awaiting_voucher, ops notification email). Cleanup of the
  // pilot: drop the next 3 lines and the `isVideoBooking` branches
  // below — search for it in this file.
  const deliveryModeParam   = searchParams.get('deliveryMode') || '';
  const isVideoBooking      = deliveryModeParam === 'video' || String(providerId).startsWith('video-');
  const specialtyDisplayParam = searchParams.get('specialtyDisplay') || '';
  const servicePriceParam   = Number(searchParams.get('servicePrice') || 0);

  const service = services.find((s) => s.id === Number(serviceId));
  // Prefer the per-clinic procedure price from the URL; fall back to the legacy
  // mock service basePrice only as a safety net.
  const servicePrice = procedurePriceParam > 0 ? procedurePriceParam : (service?.basePrice || 0);
  const serviceLabel = procedureNameParam || service?.name || '';

  const lockInId = searchParams.get('lockInId') || '';
  const stepParam = searchParams.get('step') || '';
  // 2026-07 — post-payment persistence. After a successful charge we
  // router.replace() the current URL adding `step=success&ref=<bookingRef>`
  // so a reload NEVER lands the patient back on the payment form (double
  // charge risk). On mount with those params we restore the success view.
  const successRefParam = searchParams.get('ref') || '';

  // 2026-06 — 15-minute slot hold context forwarded from the modal.
  // Empty when the hold layer is offline or the URL is legacy / lock-in.
  const holdExpiresAtParam = searchParams.get('holdExpiresAt') || '';
  const isLastSlotParam = searchParams.get('lastSlot') === '1';
  const tierParam = Number(searchParams.get('tier') || 0);
  const restoredHoldIdParam = searchParams.get('restoredHoldId') || '';
  // 2026-06-22 — Empty-state redirect.
  // /book sin providerId / lockInId / restoredHoldId no tiene sentido —
  // es la página de reservar, necesita saber QUÉ reservar. El audit
  // SEO 15-22 jun mostró 3 sesiones organic aterrizando acá sin params
  // (Google la había indexado a pesar del noindex actual, posible cache
  // viejo). Redirect a /search-v2 con un flag UTM para medir cuántas
  // sesiones rescatamos. El layout YA es noindex (desde mayo), así que
  // a mediano plazo Google la sacará del índice y este caso se reduce.
  useEffect(() => {
    if (!providerId && !lockInId && !restoredHoldIdParam) {
      router.replace('/search-v2?from=book-empty&utm_source=internal&utm_medium=empty-redirect');
    }
  }, [providerId, lockInId, restoredHoldIdParam, router]);
  const isEmptyBookPage = !providerId && !lockInId && !restoredHoldIdParam;

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
    stepParam === 'success' && successRefParam
      ? 'success'
      : stepParam === 'payment' && lockInId ? 'payment' : 'form',
  );
  const [paymentRef, setPaymentRef] = useState(
    stepParam === 'success' && successRefParam ? successRefParam : '',
  );
  const [lockInData, setLockInData] = useState(null);

  // F15 — booking pre-creation. We reserve a `pending_payment` booking row
  // BEFORE the patient submits the payment form, then hand the id to
  // PaymentForm so it lands in the Stripe PaymentIntent metadata. If the
  // patient closes the tab during 3-D Secure, the webhook still finalizes
  // the booking row (no orphan charges). Lives once per /book session in
  // a useRef so toggling hasInsurance back and forth doesn't reserve a
  // second row. Race-condition safe because reserveBookingId stabilizes
  // before PaymentForm mounts.
  const [reservedBookingId, setReservedBookingId] = useState(null);
  const reservedBookingPromise = useRef(null);
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
    // Empty /book (no provider/lock-in/restored hold) redirects away —
    // don't pollute the funnel with a book_started for those sessions.
    if (isEmptyBookPage) return;
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

  // 2026-05-29 — form validation feedback. Clarity AI detected dead clicks on
  // "Confirmar y Proceder al Pago" because HTML5 required-field validation
  // shows a small tooltip that's hard to see on mobile. `formErrorHint`
  // surfaces a visible error message above the submit button when validation
  // fails. `submitAttempted` toggles a CSS class on the form so we can style
  // invalid fields red post-attempt without nagging the user before they try.
  const [formErrorHint, setFormErrorHint] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // 2026-07 — double-submit guard on the step-1 form. `submitting` is true
  // while handlePay runs (the referral branch awaits a POST + emails, long
  // enough for an impatient double-click to create two referrals).
  const [submitting, setSubmitting] = useState(false);
  // 2026-07 — set when the post-charge /api/bookings POST failed AND no
  // pre-reserved booking row exists (payment charged, booking not
  // persisted). The success screen surfaces a warning banner instead of
  // faking a clean confirmation.
  const [bookingPersistFailed, setBookingPersistFailed] = useState(false);

  // 15-minute slot hold — countdown + auto-extend + pre-flight + release.
  // 2026-07 structural refactor: the whole lifecycle moved verbatim to
  // useSlotHold.js (historical comments live there with their code).
  const {
    holdExpiresAt,
    setHoldExpiresAt,
    setIsLastSlot,
    holdSlotRef,
    renderHoldHeader,
    renderExpiredToast,
  } = useSlotHold({
    holdExpiresAtParam,
    isLastSlotParam,
    lockInId,
    providerId,
    isVideoBooking,
    date,
    time,
    step,
    searchParams,
    router,
  });

  // ── Recovery-email restoration ───────────────────────────────────
  // When the patient clicks the "Recupera tu hueco" CTA in an
  // abandoned-cart email we land on /book with `?restoredHoldId=`.
  // Pull the persisted form snapshot, pre-fill the fields, and
  // re-acquire a fresh 15-min hold for the same (clinic, date, time)
  // so the patient picks up exactly where they left off.
  useEffect(() => {
    if (!restoredHoldIdParam || lockInId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithSession(`/api/slot-holds/state/${encodeURIComponent(restoredHoldIdParam)}`);
        if (cancelled) return;
        if (!res.ok) return; // 404 / 410 / 503 — silently skip pre-fill
        const j = await res.json();
        if (!j?.ok || !j?.slot) return;
        const slot = j.slot;
        // Hydrate the form fields from the snapshot.
        if (j.snapshot && typeof j.snapshot === 'object') {
          setForm((prev) => ({
            ...prev,
            name:        j.snapshot.name        || prev.name,
            surname:     j.snapshot.surname     || prev.surname,
            email:       j.snapshot.email       || prev.email,
            age:         j.snapshot.age         || prev.age,
            gender:      j.snapshot.gender      || prev.gender,
            dateOfBirth: j.snapshot.dateOfBirth || prev.dateOfBirth,
            nationalId:  j.snapshot.nationalId  || prev.nationalId,
            phone:       j.snapshot.phone       || prev.phone,
          }));
          if (typeof j.snapshot.hasInsurance === 'boolean') setHasInsurance(j.snapshot.hasInsurance);
          if (typeof j.snapshot.insuranceCompany === 'string') setSelectedInsurance(j.snapshot.insuranceCompany);
        }
        // Acquire a fresh 15-min hold for the same slot. If the slot
        // is now taken (409) we fall back to no-banner mode — the
        // pre-fill stays useful even without the timer.
        try {
          const ho = await fetchWithSession('/api/slot-holds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clinicId: slot.clinicId,
              providerName: slot.clinicName,
              date: slot.date,
              time: slot.time,
              procedureSlug: slot.procedureSlug,
              procedureName: slot.procedureName,
              procedurePrice: slot.procedurePrice,
              tier: slot.tier,
              fee: slot.fee,
              feeLabel: slot.feeLabel,
              hasInsurance: slot.hasInsurance,
              insuranceCompany: slot.insuranceCompany,
            }),
          });
          if (ho.ok) {
            const data = await ho.json();
            if (data?.expiresAt) setHoldExpiresAt(data.expiresAt);
            if (data?.isLastSlotThisWeek) setIsLastSlot(true);
          }
        } catch {}
      } catch (err) {
        console.error('[book] restored-hold hydrate failed', err?.message);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredHoldIdParam, lockInId]);

  // Bug 1.1 fix — when the user toggles "Sí, tengo seguro" but didn't arrive
  // with an `?insurance=` URL param, the dropdown was empty and the form
  // silently failed at submit. Pre-select the first available insurer if
  // none was set yet. The user can still change it; this just avoids the
  // dead-end state.
  const handleHasInsuranceClick = (val) => {
    setHasInsurance(val);
    if (val === true && !selectedInsurance && insuranceCompanies.length > 0) {
      setSelectedInsurance(insuranceCompanies[0]);
    }
    // 2026-08-06 — Book-step drop-off instrumentation.
    // Stripe audit revealed 6 sessions reached `book_started` since Jul 1
    // but ZERO advanced to `wallet_check` (the event PaymentForm emits when
    // it mounts). We need visibility into the form → payment transition:
    // this event tells us how many users even engage with the insurance
    // toggle (which is the gating field before the "Continuar al pago"
    // button becomes enabled).
    try { trackEvent('book_insurance_toggled', { has_insurance: val === true }); }
    catch { /* analytics fire-and-forget */ }
  };

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

  // ── Form snapshot patcher ─────────────────────────────────────────
  // Every time the patient changes a field we debounce-PATCH the slot
  // hold row with the latest snapshot. The abandoned-cart cron reads
  // `form_snapshot` + `patient_email` to send a recovery email if the
  // hold expires without conversion. No-op when no Redis-backed hold
  // is active (lock-in flow, legacy URL).
  useEffect(() => {
    if (!holdExpiresAt || lockInId) return;
    const { clinicId, date: d, time: t } = holdSlotRef.current;
    if (!clinicId || !d || !t) return;
    const handle = setTimeout(() => {
      fetchWithSession('/api/slot-holds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId, date: d, time: t,
          formSnapshot: {
            ...form,
            hasInsurance,
            insuranceCompany: selectedInsurance || null,
            isReferral,
          },
        }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, hasInsurance, selectedInsurance, isReferral]);

  const activeFee = fee;

  // 2026-06-08 — Strikethrough display.
  // The `fee` URL param already reflects any partner discount (applied
  // upstream in the modal). We compute the matching `getPricingDisplay`
  // to know the strikethrough "tarifa habitual" anchor for the same
  // tier. Falls back to tier 1 if tierParam is 0 (e.g. /book reached
  // via lock-in with no explicit tier).
  const effectiveTier = tierParam || 1;
  const isPartnerProvider = isPartnerClinic(Number(providerId) || 0);
  const feePricingDisplay = getPricingDisplay(
    { tier: effectiveTier, price: activeFee / (isPartnerProvider ? 0.7 : 1) },
    Number(providerId) || 0,
  );

  const totalPrice =
    hasInsurance === true
      ? activeFee
      : hasInsurance === false
        ? servicePrice + activeFee
        : 0;

  const handlePay = async (e) => {
    e.preventDefault();
    if (submitting) return; // double-submit guard

    // 2026-08-06 — Book-step drop-off instrumentation (Stripe audit).
    // Fires on EVERY submit attempt, before any validation. Divide the
    // count of this event by `book_started` in analytics_events to know
    // what fraction of /book-arrivals ever click the CTA. The 6 sessions
    // that reached book_started since Jul 1 → 0 wallet_check tells us
    // less about which stage killed them than a per-branch event does.
    try { trackEvent('book_form_submit_attempted', {}); }
    catch { /* analytics fire-and-forget */ }

    // Bug 1.2 fix — validate before submitting. HTML5 `required` still fires
    // first because <input required> is on each field, but on mobile the
    // browser-native bubble is tiny and easy to miss → users perceive a
    // dead click. We complement it with a visible message + smooth scroll
    // to the first invalid field so the failure mode is obvious.
    setSubmitAttempted(true);
    const formEl = e.currentTarget;
    if (formEl && typeof formEl.checkValidity === 'function' && !formEl.checkValidity()) {
      const firstInvalid = formEl.querySelector(':invalid');
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalid.focus({ preventScroll: true });
      }
      setFormErrorHint('Por favor completa los campos marcados antes de continuar.');
      // 2026-08-06 — Which field was invalid? Report the tag+name+id so
      // the audit can rank the top offenders instead of guessing.
      try {
        trackEvent('book_form_validation_failed', {
          reason: 'html5_required',
          field_name: firstInvalid?.name || firstInvalid?.id || firstInvalid?.tagName || 'unknown',
          field_type: firstInvalid?.type || 'unknown',
        });
      } catch { /* */ }
      return;
    }
    // Bug 1.3 corollary — even if the form has no `<input required>` missing,
    // we still gate on the insurance toggle (no `required` on the divs).
    if (hasInsurance === null) {
      setFormErrorHint('Indica si tienes seguro médico para continuar.');
      const insuranceEl = document.querySelector('.book-insurance-toggle');
      if (insuranceEl) insuranceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { trackEvent('book_form_validation_failed', { reason: 'insurance_toggle_missing' }); }
      catch { /* */ }
      return;
    }
    if (hasInsurance === true && !selectedInsurance) {
      setFormErrorHint('Selecciona tu aseguradora antes de continuar.');
      const sel = document.querySelector('#insurance-company') || document.querySelector('#insurance-company-payment');
      if (sel) {
        sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sel.focus({ preventScroll: true });
      }
      try { trackEvent('book_form_validation_failed', { reason: 'insurer_dropdown_missing' }); }
      catch { /* */ }
      return;
    }
    setFormErrorHint('');
    setSubmitting(true);
    // 2026-08-06 — Form passed all validation, about to transition to
    // payment step (or lock-in redirect). If we see this event but no
    // subsequent wallet_check, the bug is between form submit + PaymentForm
    // mount (e.g. reserve endpoint failing, setStep never firing).
    try {
      trackEvent('book_form_validation_passed', {
        has_insurance: hasInsurance === true,
        is_referral: isReferral === true,
        total_price: totalPrice,
      });
    } catch { /* */ }
    try {

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
    } finally {
      // Release the guard on failure AND after navigation kicks off —
      // if the user comes back to the form (onBack), the button must work.
      setSubmitting(false);
    }
  };

  // F15 — reserve booking row before the patient hits the Stripe form so
  // the webhook always has something to UPDATE if 3-D Secure / tab close
  // interrupts the round-trip. Only fires once per /book session
  // (reservedBookingPromise.current guards against re-runs from
  // hasInsurance toggling).
  useEffect(() => {
    if (step !== 'payment') return;
    if (hasInsurance === null) return;
    if (reservedBookingPromise.current) return;

    // Required fields for the reserve — bail if anything is missing
    // (lock-in fallback path may still be hydrating, or the patient form
    // isn't fully filled).
    const pEmail = lockInData?.patientEmail || form.email;
    const pName = lockInData?.patientName || `${form.name} ${form.surname}`.trim();
    const sDate = lockInData?.slotDate || date;
    const sTime = lockInData?.slotTime || time;
    if (!pEmail || !sDate || !sTime) return;

    // Stable ID generated once. Format: `mc_<24-hex>` keeps it short enough
    // for the NVARCHAR(50) PK and recognizable in Stripe metadata.
    const id = `mc_${Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('')}`;

    reservedBookingPromise.current = fetch('/api/bookings/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        patientEmail: pEmail,
        patientName: pName,
        // Video providers have string ids that don't fit the bookings
        // INT column — reserve a row with provider_id=null and rely on
        // procedure_slug (videoconsulta-…) + specialty + provider_name
        // to identify the booking server-side.
        providerId: isVideoBooking ? null : (Number(providerId) || null),
        providerName: lockInData?.providerName || providerName,
        specialty: isVideoBooking ? (specialtyDisplayParam || null) : (service?.name || null),
        slotDate: sDate,
        slotTime: sTime,
        amount: totalPrice,
        hasInsurance: hasInsurance === true,
        insuranceCompany: selectedInsurance || null,
      }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j && j.id) setReservedBookingId(j.id);
      })
      .catch((err) => {
        // Reserve failed (DB hiccup, rate limit, etc.). Don't block the
        // payment flow — fall back to the legacy "INSERT on finalize" path.
        // The orphan-charge risk reappears for this one booking but the
        // flow still completes for the patient.
        console.error('[F15 reserve failed]', err?.message);
        reservedBookingPromise.current = null;
      });
  }, [step, hasInsurance, lockInData, form.email, form.name, form.surname, date, time,
      providerId, providerName, service, totalPrice, selectedInsurance]);

  const handlePaymentSuccess = async ({ last4, reference }) => {
    // F15 — prefer the booking id we reserved BEFORE the charge over the
    // Stripe PaymentIntent id. This ensures the /api/bookings POST hits
    // the UPSERT path (UPDATE existing pending_payment row) instead of
    // attempting a fresh INSERT that would PK-collide with the row the
    // webhook may have already finalized. Falls back to the Stripe ref
    // if reserve was skipped or failed.
    const bookingRef = reservedBookingId || reference;
    setPaymentRef(bookingRef);

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
      // 2026-06 — fetchWithSession attaches `x-mc-session` so the
      // server can release the matching slot hold on successful insert
      // (see slotHolds.releaseHold + markHoldConverted at the end of
      // /api/bookings POST).
      const r = await fetchWithSession('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // F15 — use the reserved id so the POST hits the UPSERT path
          // (UPDATE existing pending_payment row instead of fresh INSERT).
          id: bookingRef,
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
          // For video providers the id is a string ("video-derma-001")
          // not a DB row — pass it through under videoProviderId, and
          // leave providerId null so the existing INT column stays
          // happy. /api/bookings POST branches on videoProviderId.
          providerId: isVideoBooking ? null : (Number(providerId) || null),
          videoProviderId: isVideoBooking ? String(providerId) : null,
          providerName: clinicName,
          specialty: isVideoBooking ? (specialtyDisplayParam || null) : (service?.name || null),
          deliveryMode: isVideoBooking ? 'video' : 'in_person',
          slotDate: slotDateToUse,
          slotTime: slotTimeToUse,
          amount: totalPrice,
          // Sin seguro: status starts at awaiting_voucher (ops must upload SON
          // voucher manually). Con seguro: confirmed straight away.
          // Video bookings also land in awaiting_voucher — Ops books the
          // SaludOnNet appointment manually and emails the patient the
          // link + voucher (no Stripe webhook auto-confirms them).
          status: (isVideoBooking || hasInsurance !== true) ? 'awaiting_voucher' : 'confirmed',
          cardLast4: last4,
          hasInsurance: hasInsurance === true,
          insuranceCompany: selectedInsurance || null,
          // The Stripe `reference` (`pi_xxx`) is what we want to record as
          // the payment_intent_id — keep this distinct from the booking id
          // (`bookingRef`) which may be the reserved `mc_xxx` id.
          paymentIntentId: reference,
          // New: procedure (acto médico) + price split snapshots.
          procedureSlug: procedureSlugParam || null,
          procedureName: serviceLabel || null,
          // For video bookings the full charge is the SaludOnNet
          // service price; for in-person sin-seguro it's the same
          // shape (service + priority). Asegurados pay only the
          // priority fee — service column stays 0 because the
          // insurance carrier covers it.
          servicePrice: (isVideoBooking || hasInsurance === false) ? Number(servicePrice) || 0 : 0,
          platformFee: Number(activeFee) || 0,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error('[/book bookings POST] non-OK response', r.status, j?.error || '');
        // Payment already charged. If there's no pre-reserved booking row
        // (F15 reserve failed/skipped), the charge has NO backing booking —
        // the webhook has nothing to finalize. Surface it to the patient
        // instead of faking a clean confirmation.
        if (!reservedBookingId) setBookingPersistFailed(true);
      }
      if (j._case) {
        opsCaseId = j._case.id ?? null;
        paymentToClinic = j._case.paymentToClinic ?? null;
        tier = j._case.tier ?? null;
      }
      // F2 — capture the self-service token returned by the booking API so
      // we can build the cancel/reschedule link for the confirmation email.
      if (j.selfServiceToken) selfServiceToken = j.selfServiceToken;
    } catch (e) {
      // Network-level failure AFTER the charge. Same logic as the !r.ok
      // branch above — keep the flow going (emails, tracking, success
      // screen) but flag the missing booking when nothing was pre-reserved.
      console.error('[/book bookings POST] failed after charge', e?.message);
      if (!reservedBookingId) setBookingPersistFailed(true);
    }

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
    const calendarUrl = buildCalendarUrl(clinicName, slotDateToUse, slotTimeToUse, reference);

    // F2 — build the patient self-service URL (cancel / reschedule). Falls back
    // to the production domain when NEXT_PUBLIC_BASE_URL isn't set.
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';
    const selfServiceUrl = selfServiceToken
      ? `${baseUrl.replace(/\/$/, '')}/booking/${selfServiceToken}`
      : null;

    // Send confirmation emails. Video bookings go through the
    // pilot-specific templates: the patient gets a "we're confirming
    // your video appointment" pending email (instead of the standard
    // "voucher coming in 24h" one), and Ops gets a clearer "ACCIÓN
    // REQUERIDA — book this manually on SaludOnNet" alert addressed
    // to info@medconnect.es + francisco.
    if (isVideoBooking) {
      sendEmail('videoBookingPending', {
        patientEmail,
        patientName,
        providerName: clinicName,
        procedureName: serviceLabel || null,
        slotDate: slotDateToUse,
        slotTime: slotTimeToUse,
        totalPrice,
        reference,
        selfServiceUrl,
        hasInsurance: hasInsurance === true,
        insuranceCompany: selectedInsurance || null,
      });
    } else {
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
    }
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
    if (isVideoBooking) {
      sendEmail('videoBookingOpsAlert', {
        bookingId: reference,
        patientName,
        patientEmail,
        patientPhone: lockInData?.patientPhone || form.phone || null,
        patientDateOfBirth: form.dateOfBirth || null,
        patientNationalId: form.nationalId ? form.nationalId.trim() : null,
        providerName: clinicName,
        providerSpecialty: specialtyDisplayParam || null,
        videoProviderId: String(providerId),
        externalBookingUrl: searchParams.get('externalBookingUrl') || null,
        slotDate: slotDateToUse,
        slotTime: slotTimeToUse,
        procedureName: serviceLabel || null,
        amount: totalPrice,
        hasInsurance: hasInsurance === true,
        insuranceCompany: selectedInsurance || null,
      });
    } else {
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
    }

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
    const conversionPayload = {
      transactionId: reference,
      value: Number(activeFee) || 0,
      currency: 'EUR',
      userData: {
        email: patientEmail,
        phone: lockInData?.patientPhone || form.phone || null,
      },
    };

    // 2026-05-29 — cookie consent auto-upgrade on purchase ("acepta solo si
    // hay compra"). The CookieBanner exposes a third consent state,
    // `rejected-pending-purchase`, that lets the user navigate freely without
    // tracking BUT auto-promotes to `accepted` the moment they complete a
    // paid booking. Legal basis: GDPR Art. 6(1)(b) — processing necessary for
    // performance of a contract. At point of paid booking, measurement of
    // the conversion + payment confirmation is contractually necessary
    // (SaludOnNet test-program measurement obligation + Stripe receipt
    // tracking). The CookieBanner subscribes to `mc-consent-upgraded` and
    // mounts TrackingScripts on receipt; the gtag <Script onLoad> replays
    // the stashed conversion below once the gtag library is ready.
    try {
      const consent = typeof window !== 'undefined' ? localStorage.getItem('mc_cookie_consent') : null;
      if (consent === 'rejected-pending-purchase') {
        window._mcPendingConversion = conversionPayload;
        localStorage.setItem('mc_cookie_consent', 'accepted');
        window.dispatchEvent(new CustomEvent('mc-consent-upgraded'));
        // Skip the immediate trackConversion — TrackingScripts won't be
        // mounted yet, so window.gtag is undefined. The onLoad replay path
        // in CookieBanner will fire it once gtag.js has loaded.
      } else {
        trackConversion(conversionPayload);
      }
    } catch {
      // localStorage unavailable (SSR/private mode) — fall back to direct fire
      trackConversion(conversionPayload);
    }

    setStep('success');
    // Store calendarUrl for the success screen (same-session fast path;
    // the success render recomputes it from URL params after a reload).
    window._mcCalendarUrl = calendarUrl;

    // 2026-07 — persist the success state in the URL. A reload used to
    // re-mount at the payment step (step lived only in React state) →
    // double-charge risk. `router.replace` keeps history clean (Back
    // doesn't return to the payment form) and the mount-time useState
    // above restores 'success' + paymentRef from `step`/`ref`.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('step', 'success');
      url.searchParams.set('ref', bookingRef);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    } catch {}
  };

  const formattedDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  // 2026-06-22 — Empty state (moved above the payment/success steps
  // 2026-07 so it renders FIRST, all hooks having already run — no
  // rules-of-hooks issue since this is plain JSX ordering).
  // El useEffect arriba dispara router.replace, pero React puede renderizar
  // un frame antes de que la nav termine. Mostramos un mini-render de
  // "redirigiendo..." en lugar del form vacío para que ningún user vea
  // el formulario sin contexto. Si el redirect falla (ej. router no
  // disponible en SSR), igual hay un link manual a /search-v2.
  if (isEmptyBookPage) {
    return (
      <>
        <Header />
        <main className="book-page">
          <div className="book-container" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
              Te llevamos a la búsqueda…
            </h1>
            <p style={{ color: 'var(--fg-muted)', marginBottom: '1.5rem' }}>
              Para reservar primero hay que elegir clínica + horario.
            </p>
            <Link
              href="/search-v2"
              className="btn btn-gold"
              style={{ display: 'inline-block' }}
            >
              Ir a la búsqueda →
            </Link>
          </div>
        </main>
      </>
    );
  }

  // ── Payment step ── (JSX moved verbatim to PaymentStep.js, 2026-07)
  if (step === 'payment') {
    return (
      <PaymentStep
        lockInLoading={lockInLoading}
        lockInData={lockInData}
        lockInId={lockInId}
        hasInsurance={hasInsurance}
        setHasInsurance={setHasInsurance}
        selectedInsurance={selectedInsurance}
        setSelectedInsurance={setSelectedInsurance}
        handleHasInsuranceClick={handleHasInsuranceClick}
        isVideoBooking={isVideoBooking}
        servicePrice={servicePrice}
        activeFee={activeFee}
        feeLabel={feeLabel}
        feePricingDisplay={feePricingDisplay}
        totalPrice={totalPrice}
        serviceLabel={serviceLabel}
        reservedBookingId={reservedBookingId}
        handlePaymentSuccess={handlePaymentSuccess}
        setStep={setStep}
        form={form}
        date={date}
        time={time}
        providerName={providerName}
        renderHoldHeader={renderHoldHeader}
        renderExpiredToast={renderExpiredToast}
      />
    );
  }

  // ── Success step ── (JSX + identity capture moved verbatim to SuccessStep.js, 2026-07)
  if (step === 'success') {
    return (
      <SuccessStep
        paymentRef={paymentRef}
        bookingPersistFailed={bookingPersistFailed}
        isVideoBooking={isVideoBooking}
        hasInsurance={hasInsurance}
        selectedInsurance={selectedInsurance}
        lockInData={lockInData}
        form={form}
        date={date}
        time={time}
        providerName={providerName}
      />
    );
  }

  return (
    <>
      <Header />
      {renderHoldHeader()}
      {renderExpiredToast()}
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

          {/* 2026-06-04 — A2: trust strip on /book form step. The same 3
              chips already on landing + modal + Stripe step.
              2026-06-12 — Switched stacked → inline (Jacques feedback): the
              stacked variant added ~120 px of vertical real estate above
              the form and pushed the toggle of seguro below the fold on
              mobile. Inline keeps the same 3 claims at ~22 px tall, same
              swap already done in landing + modal (see TrustStrip.js
              header comment). */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <TrustStrip variant="inline" />
          </div>

          <form onSubmit={handlePay} className={submitAttempted ? 'book-form-submitted' : ''}>
            
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

            {/* Insurance block — moved ABOVE patient details on 2026-06-12
                per Jacques feedback. Old order asked for name/email/phone
                first and revealed the seguro toggle (+ side-without-seguro
                price) only afterwards, so patients who didn't have the
                insurer or didn't like the sin-seguro total had already
                invested 4 form fields by the time they bailed. New order
                lets them resolve the seguro decision (and see "Pagas €XX"
                in the toggle option) BEFORE they type a single character. */}
            <div className="book-form">
              <div className="form-group">
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
                    <>Para las videoconsultas pagas el <strong>precio publicado en SaludOnNet</strong> (incluye consulta + prioridad de la cita). Si tienes seguro privado, por ahora <strong>solo tramitamos por reembolso</strong>: pagas ahora y solicitas el reembolso a tu seguro adjuntando el voucher que te enviaremos por email.</>
                  ) : (
                    <>Tu seguro paga la consulta a la clínica.
                    {' '}<strong>Tú solo pagas la tarifa de prioridad</strong> por la cita urgente.</>
                  )}
                </div>
                <label className="form-label">
                  ¿{isReferral ? 'El paciente tiene' : 'Tienes'} seguro médico privado?
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
                    <strong>Sí, {isReferral ? 'tiene' : 'tengo'} seguro</strong>
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
                    <strong>No {isReferral ? 'tiene' : 'tengo'} seguro</strong>
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

              {/* Coverage clarifier — see top-of-block comment for the
                  2026-06-12 removal of the "Te avisamos en 24 h" branch.
                  Only the positive "suele cubrir esta especialidad" box
                  remains. For video bookings we never check coverage —
                  we only do reimbursement — so we render a different
                  message that explains the reimbursement path. */}
              {hasInsurance === true && selectedInsurance && isVideoBooking && (
                <div
                  role="status"
                  style={{
                    marginTop: 'var(--space-md)',
                    padding: '10px 14px',
                    background: '#f5f3ff',
                    border: '1px solid #ddd6fe',
                    color: '#4c1d95',
                    borderRadius: 8,
                    fontSize: '0.88rem',
                    lineHeight: 1.45,
                  }}
                >
                  <strong>💳 Cómo funciona el reembolso con {selectedInsurance}:</strong>{' '}
                  pagas la videoconsulta ahora. Después de la cita te enviamos por email
                  un voucher con el detalle del servicio que puedes adjuntar al solicitar
                  el reembolso a {selectedInsurance}.
                </div>
              )}
              {hasInsurance === true && selectedInsurance && !isVideoBooking && (() => {
                const specialtyForLookup =
                  service?.id ||
                  searchParams.get('specialty') ||
                  searchParams.get('specialtySlug') ||
                  '';
                if (!specialtyForLookup) return null;
                const covered = isLikelyCovered(selectedInsurance, specialtyForLookup);
                if (!covered) return null;
                return (
                  <div
                    role="status"
                    style={{
                      marginTop: 'var(--space-md)',
                      padding: '10px 14px',
                      background: '#eef6f0',
                      border: '1px solid #c7e8d0',
                      color: '#1b4332',
                      borderRadius: 8,
                      fontSize: '0.88rem',
                      lineHeight: 1.45,
                    }}
                  >
                    <strong>✅ {selectedInsurance} suele cubrir esta especialidad.</strong>{' '}
                    Confirmaremos la cobertura con la clínica antes de cobrarte. Si no
                    hay cobertura, te devolvemos el cargo íntegro en 72 h.
                  </div>
                );
              })()}

              {hasInsurance === true && (
                <p style={{ marginTop: 'var(--space-md)', fontSize: '0.85rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                  {isVideoBooking
                    ? '* Recibirás por email el enlace de la videoconsulta + el voucher de SaludOnNet antes de la cita. Adjunta el voucher al solicitar el reembolso a tu seguro.'
                    : '* Te hemos reservado este hueco con prioridad. Acude con tu tarjeta de asegurado y la clínica te atenderá bajo tu póliza, como cualquier otra cita concertada.'}
                </p>
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
                {/* 2026-06-01 — pre-payment form reduced from 8 → 4 fields
                    (name, surname, email, phone). Edad / Sexo / Fecha de
                    nacimiento / DNI moved AFTER payment to the success step
                    under "Datos para la clínica". */}
                <div className="form-group">
                  <label className="form-label" htmlFor="phone">Teléfono de contacto</label>
                  <input
                    id="phone"
                    className="form-input"
                    type="tel"
                    placeholder="Ej. +34 612 345 678"
                    value={form.phone}
                    onChange={(e) => handleFormChange('phone', e.target.value)}
                    pattern="[\+0-9 \-\(\)]{6,25}"
                    title="Introduce un teléfono válido"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Price Breakdown */}
            {hasInsurance !== null && (
              <div className="book-price-breakdown animate-fade-in">
                <p className="book-step-label" style={{ marginBottom: 'var(--space-md)' }}>Resumen del pago</p>

                {/* SaludOnNet video pilot — for video bookings the
                    SaludOnNet published price is the all-in-one
                    number (consulta + prioridad bundled). We render a
                    single line so the patient doesn't read a "service
                    0 € + priority 0 €" split that doesn't match the
                    invoice. Cleanup of the pilot: drop this branch. */}
                {isVideoBooking ? (
                  <div className="book-price-row">
                    <span className="book-price-label"><Icon name="video" size={14} /> {serviceLabel || 'Videoconsulta'} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· incluye prioridad</span></span>
                    <span className="book-price-amount">{formatEUR(servicePrice)}</span>
                  </div>
                ) : (
                  <>
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
                  </>
                )}

                <div className="book-price-row total">
                  <span>Total que pagas hoy</span>
                  <span className="book-price-amount">
                    {totalPrice > 0 ? formatEUR(totalPrice) : 'Gratis'}
                  </span>
                </div>

                {/* 2026-06-08 — A3 anchor REMOVED from /book.
                    Clarity Session 3 (Jun 5 09:19) read this twice, then
                    abandoned. The anchor works as a gancho on the
                    /especialistas hero (entry-point persuasion) but at
                    the price-review moment it triggers a comparison
                    loop ("¿por qué tan barato? ¿qué hay raro?") instead
                    of confidence. The hero anchor stays — that's where
                    it earns its keep — and /book stays focused on the
                    transactional summary. */}

                {isVideoBooking ? (
                  <>
                    <p style={{ marginTop: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                      <Icon name="info" size={14} /> Pagas el precio publicado en SaludOnNet para esta videoconsulta. <strong>Incluye la consulta y la prioridad de la cita</strong> en un único importe — no se cobra nada adicional al iniciar la videollamada.
                    </p>
                    <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                      <Icon name="shield-check" size={14} /> <strong>Cancelación gratuita hasta 24 h antes de la cita:</strong> reembolso íntegro en 72 h por cualquier motivo. Dentro de las 24 h o no show, el importe no es reembolsable.
                    </p>
                  </>
                ) : hasInsurance === true ? (
                  <>
                    <p style={{ marginTop: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                      <Icon name="info" size={14} /> Tu seguro cubre la consulta directamente con la clínica. Tú solo pagas la prioridad por la reserva.
                    </p>
                    <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                      <Icon name="shield-check" size={14} /> <strong>Cancelación gratuita hasta 24 h antes de la cita:</strong> reembolso íntegro de la prioridad en 72 h por cualquier motivo. Dentro de las 24 h o no show: la prioridad no es reembolsable.
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ marginTop: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                      <Icon name="info" size={14} /> Sin seguro pagas dos cosas en una: la <strong>consulta privada</strong> (tarifa oficial de la clínica, según el catálogo SaludOnNet) y la <strong>tarifa de prioridad</strong> por conseguirte el hueco urgente. Ese es el total — no se vuelve a cobrar en la clínica.
                    </p>
                    <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                      <Icon name="shield-check" size={14} /> <strong>Cancelación gratuita hasta 24 h antes de la cita:</strong> reembolso íntegro en 72 h por cualquier motivo. Dentro de las 24 h o no show: te devolvemos solo el valor del servicio (la prioridad no es reembolsable).
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Submit — Bug 1.3 fix: always render the button so users never
                see it just "disappear". When the insurance toggle hasn't been
                decided yet, the button is visibly disabled and a hint
                explains what's missing. When validation fails on submit,
                `formErrorHint` surfaces a visible message instead of relying
                only on the browser-native required-tooltip (which is hard
                to see on mobile). */}
            <div className="book-actions animate-fade-in">
              {hasInsurance === null && (
                <p style={{
                  color: 'var(--muted)',
                  fontSize: '0.85rem',
                  marginBottom: '0.6rem',
                  textAlign: 'center',
                }}>
                  Indica arriba si tienes seguro médico para continuar.
                </p>
              )}
              {formErrorHint && (
                <p role="alert" style={{
                  color: '#dc2626',
                  fontSize: '0.9rem',
                  marginBottom: '0.6rem',
                  textAlign: 'center',
                  fontWeight: 500,
                }}>
                  {formErrorHint}
                </p>
              )}
              <button
                type="submit"
                className="btn btn-gold btn-lg"
                id="pay-btn"
                disabled={submitting || hasInsurance === null}
                style={(submitting || hasInsurance === null) ? { opacity: 0.55, cursor: submitting ? 'wait' : 'not-allowed' } : undefined}
              >
                {submitting
                  ? 'Procesando…'
                  : totalPrice > 0 ? `Continuar al pago (${formatEUR(totalPrice)})` : 'Continuar'}
              </button>
            </div>
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
