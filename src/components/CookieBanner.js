'use client';
/**
 * CookieBanner — GDPR/LOPDGDD compliant cookie consent (May 2026 redesign).
 *
 * Layout
 *   - Desktop (>=640px): centered modal with backdrop.
 *   - Mobile (<640px): full-width bottom-sheet sliding up from the bottom.
 *
 * Consent states (persisted in localStorage under `mc_cookie_consent`):
 *   - null/missing       → SSR + first visit, banner pending decision.
 *   - 'pending'          → client mounted, awaiting choice. Banner visible.
 *   - 'accepted'         → user pressed "Aceptar todas". Tracking loads.
 *   - 'rejected-pending-purchase'
 *                        → user pressed "Solo necesarias". No tracking yet.
 *                          If the user later completes a booking, /book/page.js
 *                          auto-upgrades this state to 'accepted' (GDPR Art.
 *                          6(1)(b) — necessary for contract performance) and
 *                          fires the conversion event the user already opted
 *                          out of pre-purchase. Communicated transparently
 *                          in the banner copy.
 *
 * Upgrade flow
 *   When /book/page.js fires `book_completed` and finds consent ===
 *   'rejected-pending-purchase', it:
 *     1. Stashes the conversion payload in `window._mcPendingConversion`.
 *     2. Sets consent → 'accepted'.
 *     3. Dispatches a `mc-consent-upgraded` window event.
 *   This component listens, re-renders `<TrackingScripts />`, and the gtag.js
 *   <Script onLoad> replays the stashed conversion once the library is live.
 *
 * Registered Clerk users auto-accept via /accept-cookies (set by sign-up flow).
 */
import { useState, useEffect } from 'react';
import Script from 'next/script';
import Link from 'next/link';

const CONSENT_KEY     = 'mc_cookie_consent';
const STATE_ACCEPTED  = 'accepted';
const STATE_PENDING_PURCHASE = 'rejected-pending-purchase';

const GA4_ID         = process.env.NEXT_PUBLIC_GA4_ID;
const CLARITY_ID     = process.env.NEXT_PUBLIC_CLARITY_ID;
const GOOGLE_ADS_ID  = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

/**
 * The actual <script> tags. Rendered ONLY when consent === 'accepted'.
 * `replayPendingConversion` fires the conversion event the user "owed" from
 * before they upgraded their consent at purchase time.
 */
function TrackingScripts() {
  const gtagBootstrapId = GA4_ID || GOOGLE_ADS_ID;
  return (
    <>
      {gtagBootstrapId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gtagBootstrapId}`}
            strategy="afterInteractive"
            onLoad={() => {
              // Give the inline gtag-init script a tick to also have run so
              // that `window.gtag` and `dataLayer` are set up before we try
              // to fire the stashed conversion.
              setTimeout(async () => {
                if (typeof window === 'undefined') return;
                if (!window._mcPendingConversion) return;
                try {
                  const mod = await import('@/lib/analytics');
                  if (typeof mod.trackConversion === 'function') {
                    await mod.trackConversion(window._mcPendingConversion);
                  }
                } catch {
                  // silent — the conversion is a fire-and-forget signal
                } finally {
                  delete window._mcPendingConversion;
                }
              }, 250);
            }}
          />
          <Script id="gtag-init" strategy="afterInteractive">{`
            window.dataLayer=window.dataLayer||[];
            function gtag(){dataLayer.push(arguments);}
            window.gtag=gtag;
            gtag('js',new Date());
            ${GA4_ID ? `gtag('config','${GA4_ID}',{page_path:window.location.pathname});` : ''}
            ${GOOGLE_ADS_ID ? `gtag('config','${GOOGLE_ADS_ID}');` : ''}
          `}</Script>
        </>
      )}
      {CLARITY_ID && (
        <Script id="clarity-init" strategy="afterInteractive">{`
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window,document,"clarity","script","${CLARITY_ID}");
        `}</Script>
      )}
    </>
  );
}

export default function CookieBanner() {
  const [status, setStatus] = useState(null);   // null | 'pending' | 'accepted' | 'rejected-pending-purchase'
  const [isMobile, setIsMobile] = useState(false);
  const [showUpgradeToast, setShowUpgradeToast] = useState(false);

  // Load existing consent + detect viewport on mount.
  useEffect(() => {
    let initial = 'pending';
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored === STATE_ACCEPTED) initial = STATE_ACCEPTED;
      else if (stored === STATE_PENDING_PURCHASE) initial = STATE_PENDING_PURCHASE;
      else if (stored === 'rejected') initial = STATE_PENDING_PURCHASE; // migrate legacy 'rejected' bucket forward
    } catch {}
    setStatus(initial);

    const detect = () => setIsMobile(window.matchMedia('(max-width: 639px)').matches);
    detect();
    window.addEventListener('resize', detect);

    // Listen for the consent-upgrade signal fired by /book/page.js when a
    // user who'd previously chosen "Solo necesarias" completes a purchase.
    const onUpgrade = () => {
      setStatus(STATE_ACCEPTED);
      setShowUpgradeToast(true);
      window.setTimeout(() => setShowUpgradeToast(false), 5000);
    };
    window.addEventListener('mc-consent-upgraded', onUpgrade);

    return () => {
      window.removeEventListener('resize', detect);
      window.removeEventListener('mc-consent-upgraded', onUpgrade);
    };
  }, []);

  // Lock body scroll while the modal is open (pending state only).
  useEffect(() => {
    if (status === 'pending') {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [status]);

  const acceptAll = () => {
    try { localStorage.setItem(CONSENT_KEY, STATE_ACCEPTED); } catch {}
    setStatus(STATE_ACCEPTED);
  };

  const acceptNecessaryOnly = () => {
    try { localStorage.setItem(CONSENT_KEY, STATE_PENDING_PURCHASE); } catch {}
    setStatus(STATE_PENDING_PURCHASE);
  };

  // Tracking is on. Render scripts + (optionally) the upgrade toast.
  if (status === STATE_ACCEPTED) {
    return (
      <>
        <TrackingScripts />
        {showUpgradeToast && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'fixed',
              bottom: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#1a3c5e',
              color: '#fff',
              padding: '0.75rem 1.25rem',
              borderRadius: '999px',
              boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
              fontSize: '0.875rem',
              zIndex: 10000,
              maxWidth: '90vw',
              textAlign: 'center',
            }}
          >
            Cookies activadas para confirmar tu reserva.
          </div>
        )}
      </>
    );
  }

  // User rejected: don't render banner, don't load tracking. Page stays usable.
  if (status === STATE_PENDING_PURCHASE) return null;

  // null → SSR or first mount → nothing yet (avoid hydration flash).
  if (status !== 'pending') return null;

  // ── pending — show the modal / bottom-sheet ──
  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(14, 26, 43, 0.55)',
    zIndex: 9998,
    display: 'flex',
    alignItems: isMobile ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: isMobile ? 0 : '1rem',
  };

  const cardStyle = {
    background: '#fff',
    color: '#1a3c5e',
    width: isMobile ? '100%' : 'min(560px, 92vw)',
    maxHeight: isMobile ? '80vh' : '85vh',
    overflowY: 'auto',
    borderRadius: isMobile ? '20px 20px 0 0' : '14px',
    padding: isMobile ? '1.5rem 1.25rem 1.25rem' : '1.75rem 1.75rem 1.5rem',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.22)',
    zIndex: 9999,
    animation: isMobile ? 'mc-slide-up 0.25s ease' : 'mc-fade-in 0.18s ease',
  };

  const primaryBtnStyle = {
    flex: isMobile ? '0 0 auto' : 1,
    padding: '0.85rem 1.25rem',
    borderRadius: '10px',
    background: '#c9a84c',
    color: '#1a3c5e',
    border: 'none',
    fontWeight: 700,
    fontSize: '0.95rem',
    cursor: 'pointer',
    minHeight: '48px',
  };

  const secondaryBtnStyle = {
    flex: isMobile ? '0 0 auto' : 0.9,
    padding: '0.7rem 1.1rem',
    borderRadius: '10px',
    background: 'transparent',
    color: '#1a3c5e',
    border: '1px solid rgba(26,60,94,0.45)',
    fontWeight: 600,
    fontSize: '0.88rem',
    cursor: 'pointer',
    minHeight: '44px',
  };

  return (
    <>
      {/* Inline keyframes — avoids polluting global CSS with one-off anims. */}
      <style>{`
        @keyframes mc-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes mc-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
      <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="cookie-modal-title">
        <div style={cardStyle}>
          <h2 id="cookie-modal-title" style={{
            margin: 0,
            fontSize: '1.15rem',
            lineHeight: 1.35,
            color: '#1a3c5e',
            fontWeight: 700,
          }}>
            Cookies necesarias para mejorar Med Connect
          </h2>

          <p style={{
            marginTop: '0.75rem',
            marginBottom: '0.5rem',
            fontSize: '0.92rem',
            lineHeight: 1.55,
            color: '#1a3c5e',
          }}>
            Usamos cookies propias y de terceros (Google Analytics, Google Ads,
            Microsoft Clarity) para medir las reservas que vienen de nuestra
            publicidad. Esta medición es necesaria para evaluar el servicio
            durante nuestro programa piloto con SaludOnNet.
          </p>

          <p style={{
            marginTop: '0.5rem',
            marginBottom: '1rem',
            fontSize: '0.82rem',
            lineHeight: 1.55,
            color: '#52647a',
          }}>
            Si eliges <strong>"Solo necesarias"</strong>, no activamos
            seguimiento publicitario mientras navegas. Si más adelante
            reservas y pagas una cita, las activaremos automáticamente en ese
            momento para confirmar tu reserva y el pago (es técnicamente
            necesario para completar la compra).
          </p>

          <p style={{
            margin: '0 0 1.25rem',
            fontSize: '0.8rem',
            lineHeight: 1.5,
          }}>
            <Link href="/cookies" style={{ color: '#1a3c5e', textDecoration: 'underline', fontWeight: 500 }}>
              Política de cookies
            </Link>
          </p>

          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? '0.6rem' : '0.75rem',
            alignItems: 'stretch',
          }}>
            <button onClick={acceptAll} style={primaryBtnStyle} type="button">
              Aceptar todas
            </button>
            <button onClick={acceptNecessaryOnly} style={secondaryBtnStyle} type="button">
              Solo necesarias
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
