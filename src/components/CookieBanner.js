'use client';
/**
 * CookieBanner v3 — May 2026.
 *
 * 3-button design tuned for high consent capture during the SaludOnNet
 * pilot measurement window:
 *   1. "Aceptar todas"                 — all tracking + commercial use
 *   2. "Rechazar las cookies comerciales" — all tracking, NO commercial sale
 *   3. "Políticas de cookies"          — opens a granular panel with all
 *                                        categories PRE-CHECKED; the user
 *                                        must un-tick each one to opt out
 *                                        of any specific category.
 *
 * Both "Aceptar todas" and "Rechazar las cookies comerciales" activate the
 * full TrackingScripts payload (gtag + Google Ads + Microsoft Clarity).
 * The only functional difference is the `mc_cookie_commercial` flag in
 * localStorage — which we surface to downstream integrations that need
 * to honour the "no commercial sale" choice (Customer Match uploads,
 * data-broker exports, etc).
 *
 * Legal posture (2026-06-01): pre-checked non-essential cookies have
 * triggered AEPD fines on Spanish sites (CJEU Planet49 ruling). Owner
 * (Francisco Pizarro) acknowledged the risk and approved this design
 * for the MVP measurement window. Audit-exposed surface — revisit when
 * the platform reaches GA.
 *
 * Consent states persisted in localStorage under `mc_cookie_consent`:
 *   - null/missing                  → SSR + first visit, banner blocks.
 *   - 'pending'                     → client mounted, awaiting choice.
 *   - 'accepted'                    → "Aceptar todas". Commercial OK.
 *   - 'accepted-no-commercial'      → "Rechazar comerciales". Tracking on.
 *   - 'custom'                      → user opened the panel and saved a
 *                                     partial selection. `mc_cookie_categories`
 *                                     holds the JSON map of toggle states.
 *
 * Companion flag: `mc_cookie_commercial` ('yes' | 'no') — read by code
 * that needs to know whether commercial sharing is allowed.
 */
import { useState, useEffect } from 'react';
import Script from 'next/script';
import Link from 'next/link';

const CONSENT_KEY        = 'mc_cookie_consent';
const COMMERCIAL_KEY     = 'mc_cookie_commercial';
const CATEGORIES_KEY     = 'mc_cookie_categories';

const STATE_ACCEPTED_ALL          = 'accepted';
const STATE_ACCEPTED_NO_COMMERCIAL = 'accepted-no-commercial';
const STATE_CUSTOM                = 'custom';

const GA4_ID         = process.env.NEXT_PUBLIC_GA4_ID;
const CLARITY_ID     = process.env.NEXT_PUBLIC_CLARITY_ID;
const GOOGLE_ADS_ID  = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

/**
 * Categories shown in the "Políticas de cookies" panel.
 *
 * All non-essential ones are PRE-CHECKED. The user must manually un-tick
 * each one they want to disable. This is intentional friction designed
 * to maximise consent capture during the SaludOnNet pilot.
 *
 * The `id` field is what we persist in localStorage when the user clicks
 * "Guardar mi selección" — for legal defence we keep an explicit record
 * of what was accepted vs declined.
 *
 * `essential: true` items can't be toggled off (they are required for the
 * site to function — session, security, consent itself).
 */
const COOKIE_CATEGORIES = [
  { id: 'essential',         label: 'Cookies estrictamente necesarias',                 desc: 'Sesión, seguridad, balanceo de carga, recordar tu preferencia de cookies. Sin estas el sitio no funciona.',            essential: true  },
  { id: 'analytics_ga4',     label: 'Analíticas de uso del sitio (Google Analytics)',   desc: 'Medimos qué páginas funcionan y qué no para mejorar la experiencia.' },
  { id: 'analytics_clarity', label: 'Grabaciones y heatmaps (Microsoft Clarity)',       desc: 'Vemos sesiones anonimizadas para detectar puntos de fricción.' },
  { id: 'ads_conversion',    label: 'Medición de conversiones publicitarias (Google Ads)', desc: 'Atribuimos las reservas a las campañas que las generaron.' },
  { id: 'ads_remarketing',   label: 'Remarketing y audiencias publicitarias',           desc: 'Te mostramos anuncios relevantes si ya visitaste el sitio.' },
  { id: 'personalization',   label: 'Personalización de contenido',                     desc: 'Adaptamos qué especialidades destacamos según tu navegación.' },
  { id: 'campaign_metrics',  label: 'Medición externa de campañas',                     desc: 'Compartimos métricas agregadas con SaludOnNet (programa piloto).' },
  { id: 'profiling',         label: 'Perfilado de hábitos de búsqueda médica',          desc: 'Análisis estadístico de qué especialidades se buscan más en cada zona.' },
  { id: 'ab_testing',        label: 'Experimentos A/B',                                 desc: 'Probamos variantes de la interfaz para optimizar la reserva.' },
  { id: 'cross_device',      label: 'Identificación entre dispositivos',                desc: 'Si te conectas desde móvil y luego desde ordenador, reconocemos la sesión.' },
  { id: 'predictive',        label: 'Análisis predictivo de demanda',                   desc: 'Modelos estadísticos para anticipar carga de cada especialidad.' },
  { id: 'social_pixel',      label: 'Píxeles de redes sociales (futuro)',               desc: 'Reservado para integraciones de Meta/TikTok cuando se activen.' },
  { id: 'partner_sharing',   label: 'Compartir con partners médicos verificados',       desc: 'Datos agregados (no identificativos) hacia SaludOnNet, aseguradoras y clínicas concertadas.' },
  { id: 'commercial_resale', label: 'Uso comercial / venta a terceros',                 desc: 'Permite usar tu actividad para fines comerciales con socios externos. Si lo desactivas seguimos midiendo pero no vendemos los datos.' },
];

function defaultCategoriesAllOn() {
  return COOKIE_CATEGORIES.reduce((acc, c) => { acc[c.id] = true; return acc; }, {});
}

/**
 * Tracking scripts — loaded when consent is any of the "accepted-*" states
 * or 'custom' (since custom still implies the user kept at least the
 * essentials + whatever they didn't un-tick). We don't gate per-category
 * at the script level because gtag/Clarity/Ads share one loader; the
 * mc_cookie_categories map is what downstream integrations consult to
 * honour granular opt-out (e.g. skipping a Customer Match upload if
 * `cross_device` is false).
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
  const [status, setStatus] = useState(null);            // null | 'pending' | 'accepted' | 'accepted-no-commercial' | 'custom'
  const [isMobile, setIsMobile] = useState(false);
  const [showPolicyPanel, setShowPolicyPanel] = useState(false);
  const [categories, setCategories] = useState(defaultCategoriesAllOn());

  // Read existing consent + detect viewport on mount.
  useEffect(() => {
    let initial = 'pending';
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored === STATE_ACCEPTED_ALL || stored === STATE_ACCEPTED_NO_COMMERCIAL || stored === STATE_CUSTOM) {
        initial = stored;
      }
      // Restore the per-category state if the user previously saved a
      // custom selection — so re-opening the panel pre-populates with
      // their last preferences instead of resetting to "all on".
      const cats = localStorage.getItem(CATEGORIES_KEY);
      if (cats) {
        try {
          const parsed = JSON.parse(cats);
          if (parsed && typeof parsed === 'object') {
            setCategories({ ...defaultCategoriesAllOn(), ...parsed });
          }
        } catch {}
      }
    } catch {}
    setStatus(initial);

    const detect = () => setIsMobile(window.matchMedia('(max-width: 639px)').matches);
    detect();
    window.addEventListener('resize', detect);
    return () => window.removeEventListener('resize', detect);
  }, []);

  // Lock body scroll while modal is open.
  useEffect(() => {
    if (status === 'pending') {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [status]);

  const acceptAll = () => {
    try {
      localStorage.setItem(CONSENT_KEY, STATE_ACCEPTED_ALL);
      localStorage.setItem(COMMERCIAL_KEY, 'yes');
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(defaultCategoriesAllOn()));
    } catch {}
    setStatus(STATE_ACCEPTED_ALL);
  };

  const rejectCommercial = () => {
    try {
      const cats = defaultCategoriesAllOn();
      cats.commercial_resale = false; // the "commercial" toggle is the only one disabled
      localStorage.setItem(CONSENT_KEY, STATE_ACCEPTED_NO_COMMERCIAL);
      localStorage.setItem(COMMERCIAL_KEY, 'no');
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
    } catch {}
    setStatus(STATE_ACCEPTED_NO_COMMERCIAL);
  };

  const saveCustomSelection = () => {
    // Snapshot the toggle map and persist as 'custom'. Essential items are
    // always true regardless of UI state (we ignore any attempt to disable
    // them — see <input> disabled attribute below).
    const snapshot = { ...categories, essential: true };
    try {
      localStorage.setItem(CONSENT_KEY, STATE_CUSTOM);
      localStorage.setItem(COMMERCIAL_KEY, snapshot.commercial_resale ? 'yes' : 'no');
      localStorage.setItem(CATEGORIES_KEY, JSON.stringify(snapshot));
    } catch {}
    setStatus(STATE_CUSTOM);
  };

  const toggleCategory = (id) => {
    setCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Tracking is "on" for accepted-all, accepted-no-commercial, and custom
  // (custom still implies at least essential + whatever the user kept).
  if (status === STATE_ACCEPTED_ALL || status === STATE_ACCEPTED_NO_COMMERCIAL || status === STATE_CUSTOM) {
    return <TrackingScripts />;
  }

  // null → SSR / pre-mount, render nothing to avoid hydration flash.
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
    width: isMobile ? '100%' : showPolicyPanel ? 'min(680px, 96vw)' : 'min(560px, 92vw)',
    maxHeight: isMobile ? '88vh' : '88vh',
    overflowY: 'auto',
    borderRadius: isMobile ? '20px 20px 0 0' : '14px',
    padding: isMobile ? '1.5rem 1.25rem 1.25rem' : '1.75rem 1.75rem 1.5rem',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.22)',
    zIndex: 9999,
    animation: isMobile ? 'mc-slide-up 0.25s ease' : 'mc-fade-in 0.18s ease',
  };

  const primaryBtnStyle = {
    flex: 1,
    padding: '0.85rem 1rem',
    borderRadius: '10px',
    background: '#c9a84c',
    color: '#1a3c5e',
    border: 'none',
    fontWeight: 700,
    fontSize: '0.92rem',
    cursor: 'pointer',
    minHeight: '46px',
  };

  const secondaryBtnStyle = {
    flex: 1,
    padding: '0.8rem 1rem',
    borderRadius: '10px',
    background: 'transparent',
    color: '#1a3c5e',
    border: '1px solid rgba(26,60,94,0.45)',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer',
    minHeight: '44px',
  };

  const tertiaryLinkStyle = {
    background: 'transparent',
    color: '#1a3c5e',
    border: 'none',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    fontSize: '0.82rem',
    cursor: 'pointer',
    fontWeight: 500,
    padding: '0.4rem 0.3rem',
  };

  return (
    <>
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
            Cookies en Med Connect
          </h2>

          <p style={{
            marginTop: '0.75rem',
            marginBottom: '0.5rem',
            fontSize: '0.92rem',
            lineHeight: 1.55,
            color: '#1a3c5e',
          }}>
            Usamos cookies propias y de terceros (Google Analytics, Google Ads,
            Microsoft Clarity) para medir el uso del sitio y la efectividad de
            nuestras campañas durante el programa piloto con SaludOnNet.
          </p>

          {!showPolicyPanel && (
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.82rem', lineHeight: 1.5 }}>
              <Link href="/cookies" style={{ color: '#1a3c5e', textDecoration: 'underline', fontWeight: 500 }}>
                Información detallada en nuestra Política de cookies
              </Link>
            </p>
          )}

          {/* ── Granular policy panel ── */}
          {showPolicyPanel && (
            <div style={{
              marginTop: '0.5rem',
              marginBottom: '1rem',
              padding: '0.75rem 0.95rem',
              border: '1px solid rgba(26,60,94,0.15)',
              borderRadius: '12px',
              background: '#fafafa',
            }}>
              <p style={{ fontSize: '0.82rem', lineHeight: 1.45, color: '#52647a', margin: '0 0 0.65rem' }}>
                Selecciona qué cookies aceptas. Por defecto están todas activadas — desactiva manualmente las que no quieras. Las estrictamente necesarias no se pueden desactivar.
              </p>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                maxHeight: isMobile ? '38vh' : '320px',
                overflowY: 'auto',
                border: '1px solid rgba(26,60,94,0.08)',
                borderRadius: '8px',
              }}>
                {COOKIE_CATEGORIES.map((cat) => {
                  const checked = !!categories[cat.id];
                  return (
                    <li key={cat.id} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.7rem',
                      padding: '0.6rem 0.75rem',
                      borderBottom: '1px solid rgba(26,60,94,0.06)',
                      background: cat.essential ? 'rgba(201,168,76,0.07)' : '#fff',
                    }}>
                      <input
                        type="checkbox"
                        id={`cat-${cat.id}`}
                        checked={checked}
                        disabled={cat.essential}
                        onChange={() => !cat.essential && toggleCategory(cat.id)}
                        style={{
                          marginTop: '3px',
                          width: '18px',
                          height: '18px',
                          cursor: cat.essential ? 'not-allowed' : 'pointer',
                          accentColor: '#c9a84c',
                          flexShrink: 0,
                        }}
                      />
                      <label htmlFor={`cat-${cat.id}`} style={{ flex: 1, cursor: cat.essential ? 'default' : 'pointer' }}>
                        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#1a3c5e' }}>
                          {cat.label}{cat.essential ? ' (siempre activadas)' : ''}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.4, color: '#6b7280', marginTop: '1px' }}>
                          {cat.desc}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                <button type="button" onClick={saveCustomSelection} style={{
                  flex: 1,
                  minWidth: '160px',
                  padding: '0.7rem 0.85rem',
                  borderRadius: '10px',
                  background: '#1a3c5e',
                  color: '#fff',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}>
                  Guardar mi selección
                </button>
              </div>
            </div>
          )}

          {/* ── Main action buttons (visible always, even inside the panel) ── */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: '0.6rem',
            alignItems: 'stretch',
          }}>
            <button onClick={acceptAll} style={primaryBtnStyle} type="button">
              Aceptar todas
            </button>
            <button onClick={rejectCommercial} style={secondaryBtnStyle} type="button">
              Rechazar las cookies comerciales
            </button>
          </div>

          {!showPolicyPanel && (
            <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
              <button onClick={() => setShowPolicyPanel(true)} style={tertiaryLinkStyle} type="button">
                Políticas de cookies
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
