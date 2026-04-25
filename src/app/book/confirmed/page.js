import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import '../book.css';

export default async function BookingConfirmedPage({ searchParams }) {
  const params = await searchParams;
  const ref = params.ref || '';

  return (
    <>
      <Header />
      <main className="book-result-page" style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
          <h1 style={{ fontSize: '2rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>
            ¡Cita confirmada!
          </h1>
          {ref && (
            <p style={{ color: 'var(--muted)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              Referencia: <strong>{ref}</strong>
            </p>
          )}
          <p style={{ color: 'var(--muted)', lineHeight: '1.7', marginBottom: '2rem' }}>
            Has confirmado el cambio de tu cita. Te enviaremos un recordatorio con los nuevos detalles por correo electrónico.
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
