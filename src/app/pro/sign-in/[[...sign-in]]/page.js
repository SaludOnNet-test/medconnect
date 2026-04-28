'use client';

import { SignIn } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';
import AuthLayout from '@/components/brand/AuthLayout';
import Card from '@/components/brand/Card';
import { brandClerkAppearance } from '@/lib/clerkAppearance';

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * /pro/sign-in — pro-only sign-in flow.
 *
 * Lands on /pro/dashboard after sign-in, vs the patient flow which
 * lands on `/`. Mirrors the SignInWithFallback fallback the patient
 * page uses so an un-whitelisted host doesn't show a blank widget.
 */
function ProSignInWithFallback() {
  const wrapperRef = useRef(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (wrapperRef.current && wrapperRef.current.childElementCount === 0) {
        setStuck(true);
      }
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  if (stuck) {
    const host = typeof window !== 'undefined' ? window.location.host : '';
    return (
      <Card surface="50">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', margin: 0 }}>
          El login no se pudo cargar
        </h2>
        <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)' }}>
          El proveedor de autenticación (Clerk) no respondió en este dominio (<code>{host}</code>).
        </p>
        <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)' }}>
          Recarga la página o contacta al equipo si persiste.
        </p>
      </Card>
    );
  }

  return (
    <div ref={wrapperRef}>
      <SignIn
        path="/pro/sign-in"
        signUpUrl="/pro/sign-up"
        appearance={brandClerkAppearance}
        forceRedirectUrl="/pro/dashboard"
      />
    </div>
  );
}

export default function ProSignInPage() {
  if (!hasClerkKeys) {
    return (
      <AuthLayout mode="sign-in" audience="pro">
        <Card surface="50">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', margin: 0 }}>
            Auth no configurada
          </h2>
          <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)' }}>
            Añade las claves de Clerk en <code>.env.local</code> para activar el login.
          </p>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout mode="sign-in" audience="pro">
      <ProSignInWithFallback />
    </AuthLayout>
  );
}
