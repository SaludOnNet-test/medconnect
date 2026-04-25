import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import '../book.css';

export default async function BookingConfirmedPage({ searchParams }) {
  const params = await searchParams;
  const ref = params.ref || '';
  const coverage = params.coverage || ''; // 'sin_seguro' triggers the voucher message

  const sinSeguro = coverage === 'sin_seguro';

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
          <p style={{ color: 'var(--muted)', lineHeight: '1.7', marginBottom: sinSeguro ? '1rem' : '2rem' }}>
            Has confirmado el cambio de tu cita. Te enviaremos un recordatorio con los nuevos detalles por correo electrónico.
          </p>
          {sinSeguro && (
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '10px', padding: '1rem 1.25rem', textAlign: 'left', marginBottom: '2rem', color: '#065f46', fontSize: '0.9rem', lineHeight: 1.6 }}>
              <strong>📧 Voucher de SaludOnNet en camino (≤24 h):</strong>{' '}
              te enviaremos un email aparte con el voucher que cubre el coste del acto médico.
              Llévalo (en móvil o impreso) junto a tu DNI a la clínica.
            </div>
          )}
          <Link href="/" className="btn btn-navy">
            Volver al inicio
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
