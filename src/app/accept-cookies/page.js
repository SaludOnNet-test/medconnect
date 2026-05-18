'use client';
/**
 * /accept-cookies
 *
 * Intermediate page reached after sign-up when coming from
 * the "Rechazar y crear cuenta" cookie banner button.
 *
 * Sets mc_cookie_consent = 'accepted' in localStorage, then
 * redirects the user to the home page (or `?next=` if provided —
 * /sign-up uses `next=/mi-cuenta` so the patient sees their bookings
 * immediately after accepting cookies).
 * The CookieBanner will now detect 'accepted' and load tracking scripts.
 */
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AcceptCookiesInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    try {
      localStorage.setItem('mc_cookie_consent', 'accepted');
    } catch {}
    // Only honour `?next=` when it's a same-site relative path. Hard guard
    // against open redirects — a hostile sign-up link could otherwise carry
    // `next=https://evil.example` and land the freshly-authed user there.
    const rawNext = params.get('next') || '';
    const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
    // Short delay so the write completes before navigation
    const t = setTimeout(() => router.replace(safeNext), 100);
    return () => clearTimeout(t);
  }, [router, params]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'sans-serif',
      color: '#6b7280',
      fontSize: '0.9rem',
    }}>
      Configurando preferencias…
    </div>
  );
}

// useSearchParams() requires a Suspense boundary in Next 16 to avoid
// bailing out of static rendering for the rest of the tree.
export default function AcceptCookiesPage() {
  return (
    <Suspense fallback={null}>
      <AcceptCookiesInner />
    </Suspense>
  );
}
