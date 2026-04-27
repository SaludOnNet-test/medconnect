import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SearchBarV2 from '@/components/SearchBarV2';

export const metadata = {
  title: 'Página no encontrada — Med Connect',
  description: 'La página que buscas no existe o se ha movido. Encuentra un especialista o vuelve a la portada.',
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: 'clamp(2rem, 6vw, 4rem) 1.25rem',
          textAlign: 'center',
          color: '#374151',
          minHeight: '60vh',
        }}
      >
        <p
          style={{
            fontSize: 'clamp(4rem, 12vw, 6.5rem)',
            fontWeight: 800,
            color: '#1F2937',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            marginBottom: '0.5rem',
          }}
        >
          404
        </p>

        <h1
          style={{
            fontSize: 'clamp(1.4rem, 4vw, 1.9rem)',
            fontWeight: 800,
            color: '#1F2937',
            marginBottom: '0.75rem',
          }}
        >
          No encontramos esta página
        </h1>

        <p style={{ fontSize: '1rem', color: '#6B7280', maxWidth: '480px', margin: '0 auto 2.25rem' }}>
          El enlace puede estar roto o la página se ha movido. Prueba a buscar
          un especialista o vuelve a la portada.
        </p>

        <div style={{ marginBottom: '2rem' }}>
          <SearchBarV2 />
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.7rem 1.25rem',
              borderRadius: '999px',
              background: '#1F2937',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '0.95rem',
              textDecoration: 'none',
            }}
          >
            ← Volver a la portada
          </Link>

          <Link
            href="/sin-seguro"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
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
            Cita sin seguro
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
