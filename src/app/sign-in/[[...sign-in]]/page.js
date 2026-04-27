'use client';

import { SignIn } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';
import AuthLayout from '@/components/brand/AuthLayout';
import Card from '@/components/brand/Card';
import { brandClerkAppearance } from '@/lib/clerkAppearance';

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// If Clerk's <SignIn /> never paints anything inside the wrapper after a few
// seconds, it usually means the current host is not whitelisted on the Clerk
// instance (typical with `pk_test_` keys on a Vercel preview alias). In that
// case we replace the blank screen with an actionable message.
function SignInWithFallback() {
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
          <strong>Causa probable:</strong> este host no está autorizado en Clerk. Soluciones:
        </p>
        <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-loose)' }}>
          <li>Accede desde <a href="https://www.medconnect.es/sign-in">www.medconnect.es</a> (dominio principal autorizado).</li>
          <li>Si eres administrador: añade <code>{host}</code> a los <em>Allowed origins</em> en el dashboard de Clerk.</li>
        </ul>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
          ¿Necesitas ayuda? Escribe a <a href="mailto:hola@medconnect.es">hola@medconnect.es</a>.
        </p>
      </Card>
    );
  }

  return (
    <div ref={wrapperRef}>
      <SignIn appearance={brandClerkAppearance} />
    </div>
  );
}

export default function SignInPage() {
  if (!hasClerkKeys) {
    return (
      <AuthLayout mode="sign-in">
        <Card surface="50">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', margin: 0 }}>
            Auth no configurada
          </h2>
          <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)' }}>
            Añade <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> y <code>CLERK_SECRET_KEY</code> en <code>.env.local</code> para activar el login.
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
            Demo: usa <a href="/pro/login">/pro/login</a> o <a href="/admin/login">/admin/login</a> con Admin / ADMIN.
          </p>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout mode="sign-in">
      <SignInWithFallback />
    </AuthLayout>
  );
}
