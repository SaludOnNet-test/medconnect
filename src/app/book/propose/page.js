import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import '../book.css';

export default async function BookingProposePage({ searchParams }) {
  const params = await searchParams;
  const ref = params.ref || '';

  return (
    <>
      <Header />
      <main className="book-result-page" style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📅</div>
          <h1 style={{ fontSize: '2rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>
            Propuesta de nueva fecha
          </h1>
          {ref && (
            <p style={{ color: 'var(--muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              Referencia: <strong>{ref}</strong>
            </p>
          )}
          <p style={{ color: 'var(--muted)', lineHeight: '1.7', marginBottom: '2rem' }}>
            Hemos recibido tu solicitud de cambio de fecha. Un miembro de nuestro equipo se pondrá en contacto contigo en las próximas <strong>2 horas</strong> para coordinar una nueva cita que se adapte a tu disponibilidad.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '2rem' }}>
            ¿Prefieres llamarnos directamente?{' '}
            <a href="tel:+34911977052" style={{ color: 'var(--navy)', fontWeight: '600' }}>91 197 70 52</a>
          </p>
          <Link href="/" className="btn btn-navy">
            Volver al inicio
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
