'use client';
/**
 * CookieBanner — GDPR/LOPDGDD compliant cookie consent
 *
 * - Shows banner on first visit (no consent stored)
 * - Accept: stores consent + loads GA4 and Clarity dynamically
 * - "Rechazar y crear cuenta": redirects to /sign-up — creating an account implies consent
 * - GA4/Clarity are NEVER loaded without explicit consent
 * - Registered users: cookie consent is auto-accepted (set by /accept-cookies page after sign-up)
 */
import { useState, useEffect } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const CONSENT_KEY = 'mc_cookie_consent';
const GA4_ID      = process.env.NEXT_PUBLIC_GA4_ID;
const CLARITY_ID  = process.env.NEXT_PUBLIC_CLARITY_ID;

function TrackingScripts() {
  return (
    <>
      {GA4_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">{`
            window.dataLayer=window.dataLayer||[];
            function gtag(){dataLayer.push(arguments);}
            gtag('js',new Date());
            gtag('config','${GA4_ID}',{page_path:window.location.pathname});
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
  const [status, setStatus] = useState(null); // null | 'pending' | 'accepted' | 'rejected'
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    setStatus(stored === 'accepted' ? 'accepted' : stored === 'rejected' ? 'rejected' : 'pending');
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setStatus('accepted');
  };

  const rejectAndRegister = () => {
    // Redirect to sign-up — account creation implies consent
    router.push('/sign-up?accept_cookies=1');
  };

  // Load tracking only when accepted
  if (status === 'accepted') return <TrackingScripts />;
  if (status !== 'pending') return null; // null (SSR) or 'rejected'

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: '#1a3c5e', color: '#fff',
      padding: '1rem 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '1rem', flexWrap: 'wrap',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.2)',
      fontSize: '0.875rem', lineHeight: '1.5',
    }}>
      <p style={{ margin: 0, flex: 1, minWidth: '240px' }}>
        Usamos cookies propias y de terceros (Google Analytics, Microsoft Clarity) para analizar el tráfico y mejorar tu experiencia.{' '}
        <Link href="/cookies" style={{ color: '#c9a84c', textDecoration: 'underline' }}>Política de cookies</Link>
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={rejectAndRegister}
          style={{
            padding: '0.5rem 1.25rem', borderRadius: '6px', cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.4)',
            color: '#fff', fontSize: '0.8rem', whiteSpace: 'nowrap',
          }}
        >
          Rechazar y crear cuenta
        </button>
        <button
          onClick={accept}
          style={{
            padding: '0.5rem 1.25rem', borderRadius: '6px', cursor: 'pointer',
            background: '#c9a84c', border: 'none',
            color: '#1a3c5e', fontWeight: '700', fontSize: '0.875rem',
          }}
        >
          Aceptar cookies
        </button>
      </div>
    </div>
  );
}
