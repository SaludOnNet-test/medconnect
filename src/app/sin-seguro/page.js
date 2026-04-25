import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: '¿Cómo funciona sin seguro? — Med Connect',
  description: 'Si no tienes seguro médico privado, también te conseguimos cita prioritaria con voucher de SaludOnNet que cubre el coste del acto médico.',
};

export default function SinSeguroPage() {
  return (
    <>
      <Header />
      <main className="legal-page" style={{ color: '#374151', lineHeight: 1.7 }}>
        <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 800, color: '#1a3c5e', marginBottom: '0.5rem' }}>
          ¿Cómo funciona sin seguro?
        </h1>
        <p style={{ color: '#9ca3af', fontSize: '0.95rem', marginBottom: '2rem' }}>
          Si no tienes póliza privada, te conseguimos la cita igual — y SaludOnNet cubre el coste de la consulta.
        </p>

        <ol style={{ paddingLeft: '1.25rem', fontSize: '1rem', lineHeight: 1.9, marginBottom: '2rem' }}>
          <li>
            <strong>Eliges clínica + acto médico</strong> en la búsqueda y reservas el horario que más te conviene.
          </li>
          <li>
            <strong>Pagas online</strong>: el coste del acto médico (según el catálogo de SaludOnNet, varía por clínica) + nuestra tarifa de prioridad por gestionar el hueco urgente.
          </li>
          <li>
            En las próximas <strong>24&nbsp;h</strong> recibes un email aparte con el <strong>voucher de SaludOnNet</strong> (PDF + QR) que cubre el coste del acto médico.
          </li>
          <li>
            Vas a la clínica con tu <strong>DNI + el voucher</strong>. Te atienden y la clínica le cobra el acto a SaludOnNet con ese voucher. Tú no pagas nada en recepción.
          </li>
        </ol>

        <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 700, color: '#065f46' }}>🛡️ Cancelación 100% reembolsable</p>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#065f46' }}>
            Si la clínica no puede atenderte el día y hora reservados, te devolvemos el importe completo (acto + tarifa de prioridad) sin preguntas.
          </p>
        </div>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1a3c5e', margin: '2rem 0 0.75rem' }}>
          Preguntas frecuentes
        </h2>

        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a3c5e', marginTop: '1rem' }}>¿Qué es SaludOnNet?</h3>
        <p>SaludOnNet es nuestro partner: una red sanitaria con catálogo de actos médicos privados a precios cerrados. Si no tenés póliza privada, SON cubre el coste del acto contra el voucher que recibes.</p>

        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a3c5e', marginTop: '1rem' }}>¿Por qué pago dos cosas (acto + tarifa)?</h3>
        <p>El precio del acto es la tarifa oficial de la clínica en el catálogo SON. La tarifa de prioridad es nuestra: cubre la gestión de conseguirte el hueco urgente cuando la clínica te ofrecía fechas lejanas. Ese es el total — no se vuelve a cobrar nada en recepción.</p>

        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a3c5e', marginTop: '1rem' }}>¿Cuánto tarda en llegar el voucher?</h3>
        <p>Lo enviamos en menos de 24&nbsp;h hábiles desde el pago. Si la cita es para mañana mismo, lo emitimos en horas. Si tras 24&nbsp;h no recibes nada, escribinos a <a href="mailto:operaciones@medconnect.es" style={{ color: '#1a3c5e' }}>operaciones@medconnect.es</a>.</p>

        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a3c5e', marginTop: '1rem' }}>¿Y si el día llego y no me atienden?</h3>
        <p>Te devolvemos el 100% — acto + tarifa — automáticamente. Te avisamos por email del reembolso y aparece en tu cuenta en 1–2 días hábiles.</p>

        <div style={{ marginTop: '2rem' }}>
          <Link href="/search-v2" className="btn btn-gold btn-lg" style={{ display: 'inline-block' }}>
            Buscar mi cita →
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
