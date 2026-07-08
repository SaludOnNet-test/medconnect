'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';

// /book-specific error boundary. The payment flow is the one place where
// an unexpected crash can coincide with a completed Stripe charge, so the
// "tu pago no se ha perdido" reassurance shows ALWAYS here (the global
// boundary only shows it when the path starts with /book).
export default function BookError({ error, unstable_retry, reset }) {
  useEffect(() => {
    console.error('[/book error boundary]', error);
  }, [error]);

  const retry = unstable_retry || reset;

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
          Algo no ha ido bien con la reserva
        </h1>
        <p style={{ color: 'var(--muted, #6b7280)', lineHeight: 1.6, marginBottom: '1rem' }}>
          Ha ocurrido un error inesperado en el proceso de reserva.
        </p>
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
