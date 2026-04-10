// TrustpilotSection — static mock reviews with pain stories + success outcomes

const REVIEWS = [
  {
    name: 'Carmen R.',
    city: 'Madrid',
    date: 'Marzo 2026',
    stars: 5,
    text: 'Llevaba 4 meses en lista de espera para traumatología en la Seguridad Social. Con Med Connect tuve cita en el Hospital HM Sanchinarro en 48 horas. Me operaron la semana siguiente. Un servicio que debería existir desde hace años.',
  },
  {
    name: 'Dr. Javier M.',
    city: 'Barcelona',
    date: 'Abril 2026',
    stars: 5,
    text: 'Uso Med Connect para derivar pacientes a especialistas fuera de mi red. El paciente recibe el enlace, confirma en minutos y me llega una notificación al instante. Ha cambiado completamente la forma en que gestiono las derivaciones.',
  },
  {
    name: 'Lucía F.',
    city: 'Valencia',
    date: 'Febrero 2026',
    stars: 5,
    text: 'Pensé que sin seguro privado jamás podría permitirme ir a una clínica privada. Pagué solo 9,99€ de gestión y el seguro cubrió el resto. La cita fue al día siguiente. No puedo creer que esto sea real.',
  },
  {
    name: 'Miguel Á. T.',
    city: 'Sevilla',
    date: 'Marzo 2026',
    stars: 5,
    text: 'Mi hija necesitaba ginecología con cierta urgencia. En la sanidad pública: 3 meses de espera. Aquí: cita para el día siguiente en Clínica Teknon. El médico fue excelente. Seguiré usando Med Connect para toda la familia.',
  },
  {
    name: 'Raquel P.',
    city: 'Bilbao',
    date: 'Enero 2026',
    stars: 5,
    text: 'Al principio tenía miedo de que fuera otro portal sin citas reales. Pero la cita existía, el médico llegó puntual y el proceso fue completamente transparente. La confirmación llegó en segundos. Total confianza.',
  },
  {
    name: 'Andrés G.',
    city: 'Madrid',
    date: 'Abril 2026',
    stars: 5,
    text: 'Soy cardiólogo y recomiendo Med Connect a mis pacientes para seguimientos con otros especialistas. La plataforma es profesional, los centros son serios y el precio de gestión es más que razonable para el valor que aporta.',
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
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>{review.city}</p>
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
