// TrustpilotSection — static mock reviews focused on insured patients
// who couldn't get appointments through their insurer's traditional channels.

const FEATURED = {
  name: 'Lucía F.',
  city: 'Valencia',
  insurer: 'Adeslas',
  fee: '9,99 €',
  date: 'Febrero 2026',
  text: 'Tengo Adeslas desde hace años, pero la app me daba cita para dentro de 6 semanas. Pagué 9,99 € de tarifa de prioridad y al día siguiente estaba en la consulta — con mi tarjeta de asegurada y sin pagar nada por la consulta. Por fin entiendo lo que hacéis.',
};

const REVIEWS = [
  {
    name: 'Carmen R.',
    city: 'Madrid',
    insurer: 'Sanitas',
    date: 'Marzo 2026',
    stars: 5,
    text: 'Llevaba semanas llamando a clínicas concertadas con Sanitas para traumatología — todas me daban a 4-5 semanas. Pagué 9,99 € de tarifa de prioridad y tuve cita en HM Sanchinarro en 48 horas. La consulta la cubrió mi seguro como siempre.',
  },
  {
    name: 'Dr. Javier M.',
    city: 'Barcelona',
    date: 'Abril 2026',
    stars: 5,
    text: 'Uso Med Connect para derivar pacientes que no consiguen cita prioritaria con sus aseguradoras. El paciente recibe el enlace, confirma en minutos y la cita queda gestionada con la clínica concertada. Ha cambiado cómo gestiono las derivaciones urgentes.',
  },
  {
    name: 'Miguel Á. T.',
    city: 'Sevilla',
    insurer: 'DKV',
    date: 'Marzo 2026',
    stars: 5,
    text: 'Mi hija necesitaba ginecología con cierta urgencia. La app de DKV: 3 meses. Aquí: cita en Clínica Teknon para el día siguiente, pagué 25 € de prioridad. La consulta corrió por la póliza, como cualquier cita concertada.',
  },
  {
    name: 'Raquel P.',
    city: 'Bilbao',
    insurer: 'AXA',
    date: 'Enero 2026',
    stars: 5,
    text: 'Al principio tenía miedo de que fuera otro portal sin citas reales o que mi seguro me complicara las cosas. Llegué a la clínica, entregué mi tarjeta de AXA, me atendieron sin un solo problema y solo había pagado los 9,99 € de la reserva. Total confianza.',
  },
  {
    name: 'Andrés G.',
    city: 'Madrid',
    date: 'Abril 2026',
    stars: 5,
    text: 'Soy cardiólogo y recomiendo Med Connect a mis pacientes que no consiguen cita rápida con su aseguradora. La plataforma es profesional, los centros son los mismos del cuadro médico, y la tarifa de prioridad es razonable para el valor del tiempo.',
  },
  {
    name: 'Elena V.',
    city: 'Valencia',
    insurer: 'Mapfre',
    date: 'Marzo 2026',
    stars: 5,
    text: 'Necesitaba dermatología en menos de una semana. Con Mapfre la cita más cercana era a 4 semanas. Pagué 9,99 € por la prioridad y me atendieron al día siguiente con mi tarjeta. Sin doble pago, sin papeleo extra. Es exactamente lo que prometen.',
  },
];

function StarRating({ count = 5 }) {
  return (
    <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{ color: '#00b67a', fontSize: '1.1rem' }}>★</span>
      ))}
    </div>
  );
}

export default function TrustpilotSection() {
  return (
    <section style={{ background: '#f0faf5', padding: '4rem 0' }}>
      <div className="container">
        {/* Header with Trustpilot badge */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          {/* Trustpilot logo row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '0.5rem' }}>
            <svg width="28" height="28" viewBox="0 0 124 124" fill="none">
              <rect width="124" height="124" rx="8" fill="#00b67a"/>
              <path d="M62 14.5L74.4 50.7H112L81.8 72.3L94.2 108.5L62 86.9L29.8 108.5L42.2 72.3L12 50.7H49.6L62 14.5Z" fill="white"/>
            </svg>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#191919' }}>Trustpilot</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '0.25rem' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} style={{ background: '#00b67a', width: '28px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '3px' }}>
                <span style={{ color: 'white', fontSize: '1rem' }}>★</span>
              </span>
            ))}
          </div>
          <p style={{ fontSize: '1rem', color: '#191919', fontWeight: '600' }}>
            <strong>Excelente</strong> · Puntuación 4,8 / 5
          </p>
          <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>Basado en 214 reseñas verificadas</p>
        </div>

        {/* Featured quote (insured patient who paid only the priority fee) */}
        <div style={{
          maxWidth: '760px',
          margin: '0 auto 2.5rem',
          padding: '2rem 2rem',
          background: '#fff',
          borderRadius: '16px',
          borderLeft: '4px solid #00b67a',
          boxShadow: '0 4px 18px rgba(0,0,0,0.06)',
        }}>
          <span style={{ fontSize: '2.5rem', color: '#00b67a', lineHeight: 1, display: 'block', marginBottom: '0.5rem' }}>"</span>
          <p style={{
            fontSize: '1.15rem',
            color: '#111827',
            lineHeight: '1.6',
            fontStyle: 'italic',
            marginBottom: '1.25rem',
          }}>
            {FEATURED.text}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <strong style={{ color: '#111827', fontSize: '0.95rem' }}>{FEATURED.name}</strong>
            <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>· {FEATURED.city}</span>
            <span style={{
              background: '#f0faf5',
              color: '#00805a',
              padding: '2px 10px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: '600',
            }}>
              Asegurada con {FEATURED.insurer} · pagó {FEATURED.fee}
            </span>
          </div>
        </div>

        {/* Reviews grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}>
          {REVIEWS.map((review, i) => (
            <div key={i} style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '1.5rem',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              border: '1px solid #e5e7eb',
            }}>
              <StarRating count={review.stars} />
              <p style={{
                fontSize: '0.9rem',
                color: '#374151',
                lineHeight: '1.65',
                marginBottom: '1rem',
                fontStyle: 'italic',
              }}>
                "{review.text}"
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '0.85rem', color: '#111827', margin: 0 }}>{review.name}</p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                    {review.city}
                    {review.insurer && (
                      <span style={{ marginLeft: '6px', color: '#00805a', fontWeight: '600' }}>
                        · {review.insurer}
                      </span>
                    )}
                  </p>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{review.date}</span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA link */}
        <div style={{ textAlign: 'center' }}>
          <a
            href="https://es.trustpilot.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#00b67a',
              fontWeight: '600',
              fontSize: '0.9rem',
              textDecoration: 'none',
              borderBottom: '2px solid #00b67a',
              paddingBottom: '2px',
            }}
          >
            Ver más opiniones en Trustpilot →
          </a>
        </div>
      </div>
    </section>
  );
}
