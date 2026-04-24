'use client';
/**
 * /accept-cookies
 *
 * Intermediate page reached after sign-up when coming from
 * the "Rechazar y crear cuenta" cookie banner button.
 *
 * Sets mc_cookie_consent = 'accepted' in localStorage, then
 * redirects the user to the home page.
 * The CookieBanner will now detect 'accepted' and load tracking scripts.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AcceptCookiesPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      localStorage.setItem('mc_cookie_consent', 'accepted');
    } catch {}
    // Short delay so the write completes before navigation
    const t = setTimeout(() => router.replace('/'), 100);
    return () => clearTimeout(t);
  }, [router]);

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
