'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithSession } from '@/lib/sessionId';
import { calculateExpirationTime } from '@/data/mock';

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

// 2026-07 structural refactor — the whole 15-minute slot-hold lifecycle
// (banner countdown, pre-flight ownership check, pagehide/beforeunload
// release, payment-step auto-extend, expire redirect) moved here from
// page.js verbatim. Historical comments travel with their code.
export default function useSlotHold({
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
}) {
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
  // build the redirect target when the timer hits zero. For
  // video-pilot providers the id is a string ("video-derma-001") —
  // pass it through unchanged so the slot-holds endpoint (which now
  // accepts both shapes) can address Redis.
  const holdSlotRef = useRef({
    clinicId: isVideoBooking ? providerId : (Number(providerId) || null),
    date,
    time,
  });

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
  // `stepRef` mirrors `step` so the unload handler below always reads the
  // CURRENT step — the old closure captured the mount-time value, so a
  // patient who reached 'success' still released the hold on tab close.
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    if (lockInId) return; // lock-in flow uses its own state machine
    const onPageHide = () => {
      const { clinicId, date: d, time: t } = holdSlotRef.current;
      if (!clinicId || !d || !t) return;
      // Skip release once we've reached the success step — the booking
      // server already cleared the Redis key.
      if (stepRef.current === 'success') return;
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
    // `pagehide` is the reliable signal on mobile Safari / bfcache
    // navigations where `beforeunload` never fires; we keep both and the
    // beacon endpoint is idempotent so a double-fire is harmless.
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
    };
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

  return {
    holdExpiresAt,
    setHoldExpiresAt,
    setIsLastSlot,
    holdSlotRef,
    renderHoldHeader,
    renderExpiredToast,
  };
}
