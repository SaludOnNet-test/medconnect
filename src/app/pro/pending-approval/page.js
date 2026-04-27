// Landing page shown to a Clerk user who is signed in but doesn't yet have
// publicMetadata.role === 'professional'. Without this, the middleware would
// bounce them back to /sign-in repeatedly, which looks like the auth flow is
// broken. This page is the place we point real pros at while ops promotes
// them via /api/admin/professionals/grant.

import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Cuenta pendiente de aprobación — Med Connect',
  description: 'Tu cuenta de profesional aún no ha sido aprobada por el equipo de Med Connect.',
};

export default function PendingApproval() {
  return (
    <>
      <Header />
      <main
        style={{
          maxWidth: '640px',
          margin: '0 auto',
          padding: 'clamp(2rem, 6vw, 4rem) 1.25rem',
          textAlign: 'center',
          color: '#374151',
          minHeight: '60vh',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(3rem, 9vw, 5rem)',
            color: '#D4AF37',
            lineHeight: 1,
            marginBottom: '0.5rem',
          }}
          aria-hidden="true"
        >
          ⏳
        </div>

        <h1
          style={{
            fontSize: 'clamp(1.5rem, 4.5vw, 2rem)',
            fontWeight: 800,
            color: '#1F2937',
            marginBottom: '0.75rem',
          }}
        >
          Tu cuenta está pendiente de aprobación
        </h1>

        <p style={{ fontSize: '1rem', color: '#6B7280', maxWidth: '500px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
          Hemos recibido tu registro como profesional. Nuestro equipo está
          revisando tu perfil y te activará el acceso al panel en las próximas
          horas. Recibirás un email cuando esté listo.
        </p>

        <p style={{ fontSize: '0.9rem', color: '#8892A4', marginBottom: '2.5rem' }}>
          ¿Necesitas activación urgente? Escríbenos a{' '}
          <a href="mailto:operaciones@medconnect.es" style={{ color: '#1F2937', fontWeight: 600 }}>
            operaciones@medconnect.es
          </a>
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.7rem 1.25rem',
              borderRadius: '999px',
              background: '#1F2937',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '0.95rem',
              textDecoration: 'none',
            }}
          >
            Volver a la portada
          </Link>
          <Link
            href="/derivadores"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.7rem 1.25rem',
              borderRadius: '999px',
              background: 'transparent',
              color: '#1F2937',
              fontWeight: 600,
              fontSize: '0.95rem',
              textDecoration: 'none',
              border: '1.5px solid #D0CBC4',
            }}
          >
            Sobre el programa de derivadores
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
