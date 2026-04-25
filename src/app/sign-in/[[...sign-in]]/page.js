'use client';

import { SignIn } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';

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
      <div style={{ padding: '2rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', maxWidth: '520px', margin: '4rem auto', textAlign: 'left' }}>
        <h2 style={{ margin: '0 0 0.75rem', color: '#856404' }}>El login no se pudo cargar</h2>
        <p style={{ margin: '0 0 0.75rem', color: '#856404', fontSize: '0.95rem', lineHeight: 1.6 }}>
          El proveedor de autenticación (Clerk) no respondió en este dominio (<code>{host}</code>).
        </p>
        <p style={{ margin: '0 0 0.75rem', color: '#856404', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <strong>Causa probable:</strong> este host no está autorizado en la configuración de Clerk. Soluciones:
        </p>
        <ul style={{ margin: '0 0 1rem 1.25rem', color: '#856404', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <li>Accede desde <a href="https://www.medconnect.es/sign-in" style={{ color: '#856404' }}>www.medconnect.es</a> (dominio principal autorizado).</li>
          <li>Si eres administrador: añade <code>{host}</code> a los <em>Allowed origins</em> en el dashboard de Clerk y recarga.</li>
        </ul>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#6c757d' }}>
          ¿Necesitas ayuda? Escribe a <a href="mailto:hola@medconnect.es" style={{ color: '#6c757d' }}>hola@medconnect.es</a>.
        </p>
      </div>
    );
  }

  return (
    <div ref={wrapperRef}>
      <SignIn />
    </div>
  );
}

export default function SignInPage() {
  if (!hasClerkKeys) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
        <div style={{ padding: '2rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', maxWidth: '400px', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 0.5rem', color: '#856404' }}>Auth no configurada</h2>
          <p style={{ margin: 0, color: '#856404', fontSize: '0.9rem' }}>
            Añade <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> y <code>CLERK_SECRET_KEY</code> en <code>.env.local</code> para activar el login.
          </p>
          <p style={{ margin: '1rem 0 0', fontSize: '0.85rem', color: '#6c757d' }}>
            Demo: usa <a href="/pro/login" style={{ color: '#856404' }}>/pro/login</a> o <a href="/admin/login" style={{ color: '#856404' }}>/admin/login</a> con Admin / ADMIN
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <SignInWithFallback />
    </main>
  );
}
