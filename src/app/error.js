'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';

// Global App Router error boundary. Catches unexpected render/runtime
// errors on any route segment below the root layout and shows a branded
// fallback instead of Next's default white screen.
//
// Next 16 passes `unstable_retry` (re-fetches + re-renders the segment);
// we fall back to the legacy `reset` when it isn't available.
export default function GlobalError({ error, unstable_retry, reset }) {
  useEffect(() => {
    // Surface in console / Sentry breadcrumb pickup.
    console.error('[app error boundary]', error);
  }, [error]);

  const retry = unstable_retry || reset;
  const isBookFlow =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/book');

  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.25rem',
        fontFamily: 'var(--font-body, system-ui, sans-serif)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
        <h1 style={{ fontSize: '1.4rem', color: 'var(--navy, #1a3c5e)', marginBottom: '0.6rem' }}>
          Algo no ha ido bien
        </h1>
        <p style={{ color: 'var(--muted, #6b7280)', lineHeight: 1.6, marginBottom: '1rem' }}>
          Ha ocurrido un error inesperado. Puedes intentarlo de nuevo — si el
          problema persiste, escríbenos a{' '}
          <a href="mailto:info@medconnect.es" style={{ color: 'var(--gold, #b45309)', textDecoration: 'underline' }}>
            info@medconnect.es
          </a>.
        </p>
        {isBookFlow && (
          <p
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 10,
              padding: '0.75rem 1rem',
              color: '#78350f',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              marginBottom: '1.25rem',
              textAlign: 'left',
            }}
          >
            Si acabas de realizar un pago, <strong>no se ha perdido</strong>:
            revisa tu email (confirmación y recibo) o escríbenos a{' '}
            <a href="mailto:info@medconnect.es" style={{ color: '#92400e', textDecoration: 'underline' }}>
              info@medconnect.es
            </a>{' '}
            indicando tu referencia.
          </p>
        )}
        <button
          type="button"
          className="btn btn-gold"
          onClick={() => retry && retry()}
          style={{
            display: 'inline-block',
            padding: '0.65rem 1.4rem',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            background: 'var(--gold, #d4a437)',
            color: 'var(--navy, #1a3c5e)',
          }}
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
