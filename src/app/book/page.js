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
import { calculateExpirationTime } from '@/data/mock';
import './book.css';

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

// Slim sticky countdown for the /book hold. Reuses `calculateExpirationTime`
// from data/mock so the lock-in flow and this share the same math. Renders
// in-line inside the header so we don't get the full LockInTimer card.
function BookHoldBanner({ expiresAt, isLastSlot, onExpire }) {
  const [remaining, setRemaining] = useState(() => calculateExpirationTime(expiresAt));
  useEffect(() => {
    const tick = () => setRemaining(calculateExpirationTime(expiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  useEffect(() => {
    if (remaining?.isExpired && typeof onExpire === 'function') onExpire();
  }, [remaining?.isExpired, onExpire]);
  if (!remaining) return null;
  const mm = String(remaining.displayMinutes ?? 0).padStart(2, '0');
  const ss = String(remaining.displaySeconds ?? 0).padStart(2, '0');
  const critical = !remaining.isExpired && remaining.remainingSeconds <= 60;
  return (
    <div
      className="book-hold-header"
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: critical ? '#fef2f2' : '#fff7ed',
        borderBottom: `1px solid ${critical ? '#fecaca' : '#fed7aa'}`,
        color: critical ? '#991b1b' : '#7c2d12',
        padding: '10px 16px',
        fontSize: '0.9rem',
        lineHeight: 1.45,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        flexWrap: 'wrap',
        fontFamily: 'var(--font-body)',
        textAlign: 'center',
      }}
    >
      {isLastSlot && (
        <span>⏱ <strong>Última cita en este centro en menos de una semana</strong></span>
      )}
      <span>
        Tu hueco está reservado:&nbsp;
        <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: '1rem' }}>
          {remaining.isExpired ? '00:00' : `${mm}:${ss}`}
        </strong>
      </span>
    </div>
  );
}

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

  // 2026-06 — 15-minute slot hold context forwarded from the modal.
  // Empty when the hold layer is offline or the URL is legacy / lock-in.
  const holdExpiresAtParam = searchParams.get('holdExpiresAt') || '';
  const isLastSlotParam = searchParams.get('lastSlot') === '1';
  const tierParam = Number(searchParams.get('tier') || 0);
  const restoredHoldIdParam = searchParams.get('restoredHoldId') || '';

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

  // 15-minute slot hold — countdown + auto-extend + pre-flight + release.
  // `holdExpiresAt` starts from the URL param the modal forwarded and is
  // updated to a fresh ISO when the payment step auto-extends. `null`
  // means we're in fallback mode (legacy URL, lock-in flow, or Redis
  // offline) and no header banner is rendered.
  const [holdExpiresAt, setHoldExpiresAt] = useState(holdExpiresAtParam || null);
  const [isLastSlot, setIsLastSlot] = useState(isLastSlotParam);
  const [holdExpired, setHoldExpired] = useState(false);
  // Capture the (clinicId, date, time) we acquired the hold for. We
  // need this verbatim for PATCH (extend) and DELETE (release), and to
  // build the redirect target when the timer hits zero.
  const holdSlotRef = useRef({
    clinicId: Number(providerId) || null,
    date,
    time,
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

  // ── Pre-flight hold check ────────────────────────────────────────
  // Runs once on mount when the URL has `holdExpiresAt`. Confirms the
  // session still owns the slot in Redis (or that Redis is offline, in
  // which case we trust the URL). If ownership is gone, expire the
  // banner so the LockInTimer fires `onExpire` and we redirect.
  useEffect(() => {
    if (!holdExpiresAtParam || lockInId) return; // lock-in flow has its own timer
    const { clinicId, date: d, time: t } = holdSlotRef.current;
    if (!clinicId || !d || !t) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithSession(
          `/api/slot-holds?clinicId=${encodeURIComponent(clinicId)}&date=${encodeURIComponent(d)}&time=${encodeURIComponent(t)}`,
        );
        if (cancelled || !res.ok) return;
        const j = await res.json();
        if (j?.ok && j?.ownedByThisSession === false) {
          setHoldExpiresAt(null);
          setHoldExpired(true);
        } else if (j?.ok && j?.expiresAt) {
          // Server-derived expiry is more authoritative than the URL.
          setHoldExpiresAt(j.expiresAt);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [holdExpiresAtParam, lockInId]);

  // ── beforeunload release ─────────────────────────────────────────
  // Best-effort: if the patient closes the tab on /book, free the slot
  // for the next visitor instead of waiting 15 minutes. `sendBeacon`
  // because async fetch isn't allowed during unload.
  useEffect(() => {
    if (lockInId) return; // lock-in flow uses its own state machine
    const onBeforeUnload = () => {
      const { clinicId, date: d, time: t } = holdSlotRef.current;
      if (!clinicId || !d || !t) return;
      // Skip release once we've reached the success step — the booking
      // server already cleared the Redis key.
      if (step === 'success') return;
      try {
        const sid = (typeof window !== 'undefined' && window.localStorage)
          ? window.localStorage.getItem('mc_sid') : null;
        const url = `/api/slot-holds?clinicId=${encodeURIComponent(clinicId)}&date=${encodeURIComponent(d)}&time=${encodeURIComponent(t)}`;
        const blob = new Blob(
          [JSON.stringify({ clinicId, date: d, time: t, sessionId: sid })],
          { type: 'application/json' },
        );
        // Most browsers don't expose method override on sendBeacon, so
        // we POST a tiny payload to the DELETE endpoint via a custom
        // URL param. The route accepts both methods.
        navigator.sendBeacon?.(`${url}&_method=DELETE`, blob);
      } catch {}
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockInId]);

  // ── Auto-extend on payment step ──────────────────────────────────
  // Stripe round-trips can take 10-30 s. We extend the hold to a fresh
  // 15-min window the moment the user enters the payment step.
  const [didExtendForPayment, setDidExtendForPayment] = useState(false);
  // Toast surfaced when the hold expires — drives the auto-redirect.
  const [expiredToast, setExpiredToast] = useState('');

  const handleHoldExpire = useCallback(() => {
    setHoldExpired(true);
    setExpiredToast('Tu reserva expiró. Te llevamos de vuelta a la búsqueda.');
    // Small grace period so the toast is visible.
    setTimeout(() => {
      const params = new URLSearchParams();
      if (searchParams.get('city'))         params.set('city', searchParams.get('city'));
      if (searchParams.get('specialtySlug')) params.set('specialtySlug', searchParams.get('specialtySlug'));
      router.push(`/search-v2${params.toString() ? `?${params.toString()}` : ''}`);
    }, 1800);
  }, [router, searchParams]);

  // ── Sticky header banner — countdown + "última cita" ──────────────
  // Rendered above every /book step (form + payment) when the patient
  // arrived from the modal with a Redis-backed hold. Skips render in
  // the lock-in flow (that has its own 60-min timer) and in the
  // legacy-URL fallback (no holdExpiresAt → nothing to count down).
  const renderHoldHeader = () => {
    if (!holdExpiresAt || holdExpired || lockInId) return null;
    return <BookHoldBanner expiresAt={holdExpiresAt} isLastSlot={isLastSlot} onExpire={handleHoldExpire} />;
  };

  // Toast for the post-expiration redirect grace window.
  const renderExpiredToast = () => {
    if (!expiredToast) return null;
    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          padding: '10px 16px',
          borderRadius: 8,
          fontSize: '0.9rem',
          maxWidth: 360,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}
      >
        {expiredToast}
      </div>
    );
  };

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

  // ── Payment-step auto-extend ──────────────────────────────────────
  // The first time the patient reaches the payment step we PATCH the
  // hold with extendMinutes=15 so a slow Stripe round-trip doesn't kill
  // it mid-card. Idempotent at the route level — repeat calls just
  // refresh the TTL, capped at 30 min total by the server.
  useEffect(() => {
    if (step !== 'payment' || didExtendForPayment || !holdExpiresAt || lockInId) return;
    const { clinicId, date: d, time: t } = holdSlotRef.current;
    if (!clinicId || !d || !t) return;
    setDidExtendForPayment(true);
    fetchWithSession('/api/slot-holds', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicId, date: d, time: t, extendMinutes: 15 }),
    })
      .then((res) => res.ok ? res.json() : null)
      .then((j) => { if (j?.expiresAt) setHoldExpiresAt(j.expiresAt); })
      .catch(() => {});
  }, [step, didExtendForPayment, holdExpiresAt, lockInId]);

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

  const sendEmail = (templateName, data) => {
    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateName, data }),
    }).catch(() => {});
  };

  const handlePay = async (e) => {
    e.preventDefault();

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
      return;
    }
    // Bug 1.3 corollary — even if the form has no `<input required>` missing,
    // we still gate on the insurance toggle (no `required` on the divs).
    if (hasInsurance === null) {
      setFormErrorHint('Indica si tienes seguro médico para continuar.');
      const insuranceEl = document.querySelector('.book-insurance-toggle');
      if (insuranceEl) insuranceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (hasInsurance === true && !selectedInsurance) {
      setFormErrorHint('Selecciona tu aseguradora antes de continuar.');
      const sel = document.querySelector('#insurance-company') || document.querySelector('#insurance-company-payment');
      if (sel) {
        sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sel.focus({ preventScroll: true });
      }
      return;
    }
    setFormErrorHint('');

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
        providerId: Number(providerId) || null,
        providerName: lockInData?.providerName || providerName,
        specialty: service?.name || null,
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
          // The Stripe `reference` (`pi_xxx`) is what we want to record as
          // the payment_intent_id — keep this distinct from the booking id
          // (`bookingRef`) which may be the reserved `mc_xxx` id.
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
                    onClick={() => handleHasInsuranceClick(true)}
                  >
                    <strong>Sí, tengo seguro</strong>
                    {activeFee > 0 && (
                      <span style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ink-1000, #0e1a2b)', marginTop: '4px', fontWeight: 700 }}>
                        Pagas {formatEUR(activeFee)}
                      </span>
                    )}
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '2px', fontWeight: 400 }}>
                      Solo la tarifa de prioridad. La consulta va por tu póliza.
                    </span>
                  </div>
                  <div
                    className={`book-insurance-option ${hasInsurance === false ? 'active' : ''}`}
                    onClick={() => handleHasInsuranceClick(false)}
                  >
                    <strong>No tengo seguro</strong>
                    {(activeFee + servicePrice) > 0 && (
                      <span style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ink-1000, #0e1a2b)', marginTop: '4px', fontWeight: 700 }}>
                        Pagas {formatEUR(activeFee + servicePrice)}
                      </span>
                    )}
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '2px', fontWeight: 400 }}>
                      Consulta ({formatEUR(servicePrice)}) + prioridad ({formatEUR(activeFee)}). Total final, sin sorpresas.
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

                <div className="book-price-row total">
                  <span>Total que pagas hoy</span>
                  <span className="book-price-amount">
                    {totalPrice > 0 ? formatEUR(totalPrice) : 'Gratis'}
                  </span>
                </div>

                {/* 2026-06-08 — Single savings line. Combines the
                    universal launch-offer + the partner extra (when
                    applicable) into one positive frame. No external
                    €60-120 comparison — replaced by self-referential
                    strikethrough above. */}
                {feePricingDisplay.savings > 0 && activeFee > 0 && (
                  <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.78rem', color: '#1b4332', lineHeight: 1.4, fontWeight: 500 }}>
                    💸 <strong>Ahorras {feePricingDisplay.savingsLabel}</strong> sobre la tarifa habitual.
                    {feePricingDisplay.isPartner && (
                      <> Incluye <strong>−30% de centro destacado</strong>.</>
                    )}{' '}
                    <a href="/tarifas" style={{ color: 'inherit', textDecoration: 'underline' }}>Ver tarifas</a>.
                  </p>
                )}
              </div>
            )}

            {/* 2026-06-04 — Restate the refund + insurance value-prop at the
                moment of highest commitment friction. The same line lives in
                the price-breakdown box on the form step, but by the time the
                patient reaches the Stripe field they have forgotten it. We
                show this above PaymentForm so the trust frame is fresh
                when they reach for their card. */}
            {hasInsurance !== null && (
              <div
                className="book-info-box book-info-box--green"
                style={{ marginBottom: 'var(--space-md)' }}
              >
                Cargo único de <strong>{totalPrice > 0 ? formatEUR(totalPrice) : '0 €'}</strong>.
                Reembolso íntegro en 72&nbsp;h si no encontramos hueco con tu
                seguro. La consulta sigue cubierta por tu póliza — solo pagas
                nuestra tarifa de prioridad.
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
              chips already on landing + modal + Stripe step. Stacked variant
              here because the form column is narrower; sits between the
              slot summary and the form fields so it is read before the
              patient starts typing. */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <TrustStrip variant="stacked" />
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
                    under "Datos para la clínica". Rationale: 4 of the 5
                    sessions that reached /book between 28-may and 1-jun
                    abandoned at the form step; reducing required fields
                    pre-payment cuts friction. The clinic-identification
                    data is still collected, just after the user has
                    committed financially — when drop-off cost is zero. */}
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
                  {/* 2026-06-08 — Compressed from 4 lines to 2.
                      The previous wording ("acto médico", "gestionarte la
                      reserva prioritaria") read as legalese on first
                      contact; a Clarity session bailed in 9 s after
                      reading it. Same idea, half the words, one bold to
                      anchor the value. */}
                  Tu seguro paga la consulta a la clínica.
                  {' '}<strong>Tú solo pagas la tarifa de prioridad</strong> por la cita urgente.
                </div>
                <label className="form-label">¿{isReferral ? 'El paciente tiene' : 'Tienes'} seguro médico privado?</label>
                <div className="book-insurance-toggle">
                  <div
                    className={`book-insurance-option ${hasInsurance === true ? 'active' : ''}`}
                    onClick={() => handleHasInsuranceClick(true)}
                  >
                    <strong>Sí, {isReferral ? 'tiene' : 'tengo'} seguro</strong>
                    {/* 2026-06-01 — show concrete € upfront so the user makes
                        an informed choice between the two options instead
                        of being surprised by a price jump after clicking. */}
                    {activeFee > 0 && (
                      <span style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ink-1000, #0e1a2b)', marginTop: '4px', fontWeight: 700 }}>
                        Pagas {formatEUR(activeFee)}
                      </span>
                    )}
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '2px', fontWeight: 400 }}>
                      Solo la tarifa de prioridad. La consulta va por tu póliza.
                    </span>
                  </div>
                  <div
                    className={`book-insurance-option ${hasInsurance === false ? 'active' : ''}`}
                    onClick={() => handleHasInsuranceClick(false)}
                  >
                    <strong>No {isReferral ? 'tiene' : 'tengo'} seguro</strong>
                    {(activeFee + servicePrice) > 0 && (
                      <span style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ink-1000, #0e1a2b)', marginTop: '4px', fontWeight: 700 }}>
                        Pagas {formatEUR(activeFee + servicePrice)}
                      </span>
                    )}
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '2px', fontWeight: 400 }}>
                      Consulta ({formatEUR(servicePrice)}) + prioridad ({formatEUR(activeFee)}). Total final, sin sorpresas.
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

              {/* 2026-06-04 — A7: insurance coverage clarifier.
                  Mitigates the "I have insurance but I'm not sure my plan
                  covers this specialty" bailout. We never claim
                  "not covered" — only "usually covered" (green) or
                  "we'll confirm before charging" (grey). Ops always
                  verifies regardless. */}
              {hasInsurance === true && selectedInsurance && (() => {
                const specialtyForLookup =
                  service?.id ||
                  searchParams.get('specialty') ||
                  searchParams.get('specialtySlug') ||
                  '';
                if (!specialtyForLookup) return null;
                const covered = isLikelyCovered(selectedInsurance, specialtyForLookup);
                if (covered) {
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
                }
                return (
                  <div
                    role="status"
                    style={{
                      marginTop: 'var(--space-md)',
                      padding: '10px 14px',
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      color: '#374151',
                      borderRadius: 8,
                      fontSize: '0.88rem',
                      lineHeight: 1.45,
                    }}
                  >
                    <strong>ℹ️ Confirmamos la cobertura antes de cobrar.</strong>{' '}
                    No tenemos confirmado al 100% si tu {selectedInsurance} cubre esta
                    consulta. Te avisamos en 24 h — si no hay cobertura, devolución
                    íntegra en 72 h.
                  </div>
                );
              })()}

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

                {/* 2026-06-08 — A3 anchor REMOVED from /book.
                    Clarity Session 3 (Jun 5 09:19) read this twice, then
                    abandoned. The anchor works as a gancho on the
                    /especialistas hero (entry-point persuasion) but at
                    the price-review moment it triggers a comparison
                    loop ("¿por qué tan barato? ¿qué hay raro?") instead
                    of confidence. The hero anchor stays — that's where
                    it earns its keep — and /book stays focused on the
                    transactional summary. */}

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
                disabled={hasInsurance === null}
                style={hasInsurance === null ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
              >
                {totalPrice > 0 ? `Confirmar y Proceder al Pago (${formatEUR(totalPrice)})` : 'Confirmar reserva gratuita'}
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
