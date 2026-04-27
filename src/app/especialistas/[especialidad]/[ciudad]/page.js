import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SearchResults from './SearchResults';
import {
  SPECIALTY_MAP,
  CITY_MAP,
  getAllSpecialtyCityCombinations,
  specialtyPageUrl,
} from '@/lib/seoData';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://medconnect.es';

// ── Static generation ──────────────────────────────────────────────────────
export function generateStaticParams() {
  return getAllSpecialtyCityCombinations(); // 40 pages pre-rendered at build
}

// ── Per-page metadata ──────────────────────────────────────────────────────
export function generateMetadata({ params }) {
  const specialty = SPECIALTY_MAP[params.especialidad];
  const city      = CITY_MAP[params.ciudad];

  if (!specialty || !city) {
    return { title: 'Especialistas médicos | Med Connect' };
  }

  const title       = `${specialty.plural} en ${city} — Cita privada sin esperas | Med Connect`;
  const description = specialty.shortDesc(city);
  const canonical   = specialtyPageUrl(params.especialidad, params.ciudad);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Med Connect',
      locale: 'es_ES',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

// ── Page component ─────────────────────────────────────────────────────────
export default function EspecialistasCiudadPage({ params }) {
  const specialty = SPECIALTY_MAP[params.especialidad];
  const city      = CITY_MAP[params.ciudad];

  // Graceful 404 for unknown slugs (shouldn't happen with generateStaticParams)
  if (!specialty || !city) {
    return (
      <>
        <Header />
        <main style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <h1>Página no encontrada</h1>
          <Link href="/" className="btn btn-gold" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Volver al inicio
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const canonicalUrl = specialtyPageUrl(params.especialidad, params.ciudad);

  // JSON-LD: MedicalBusiness + FAQPage schema
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'MedicalBusiness',
        name: `${specialty.plural} en ${city} — Med Connect`,
        description: specialty.shortDesc(city),
        url: canonicalUrl,
        areaServed: {
          '@type': 'City',
          name: city,
          addressCountry: 'ES',
        },
        medicalSpecialty: specialty.name,
        priceRange: '€€',
        openingHoursSpecification: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '09:00',
          closes: '19:00',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: specialty.faqs.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio',        item: BASE_URL },
          { '@type': 'ListItem', position: 2, name: 'Especialistas', item: `${BASE_URL}/search-v2` },
          { '@type': 'ListItem', position: 3, name: specialty.name,  item: `${BASE_URL}/especialistas/${params.especialidad}` },
          { '@type': 'ListItem', position: 4, name: city,            item: canonicalUrl },
        ],
      },
    ],
  };

  // Quick-links to other cities for this specialty (internal linking)
  const otherCities = Object.entries(CITY_MAP)
    .filter(([slug]) => slug !== params.ciudad)
    .map(([slug, name]) => ({ slug, name }));

  // Quick-links to other specialties in this city
  const otherSpecialties = Object.entries(SPECIALTY_MAP)
    .filter(([slug]) => slug !== params.especialidad)
    .map(([slug, data]) => ({ slug, name: data.name }));

  return (
    <div className="seo-page">
      <Header />

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── Breadcrumb ──────────────────────────────────────────────── */}
      <nav
        aria-label="breadcrumb"
        style={{
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          padding: '0.6rem 0',
          fontSize: '0.8rem',
          color: '#6b7280',
        }}
      >
        <div className="container" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: '#1a3c5e' }}>Inicio</Link>
          <span>›</span>
          <Link href="/search-v2" style={{ color: '#1a3c5e' }}>Especialistas</Link>
          <span>›</span>
          <Link
            href={`/search-v2?specialty=${specialty.id}`}
            style={{ color: '#1a3c5e' }}
          >
            {specialty.name}
          </Link>
          <span>›</span>
          <span style={{ color: '#374151', fontWeight: 600 }}>{city}</span>
        </div>
      </nav>

      {/* ── Hero / SEO header ────────────────────────────────────────── */}
      <section
        style={{
          background: 'linear-gradient(135deg, #1a3c5e 0%, #245082 100%)',
          color: '#fff',
          padding: '2.5rem 0 2rem',
        }}
      >
        <div className="container">
          <h1
            style={{
              fontSize: 'clamp(1.5rem, 4vw, 2.2rem)',
              fontWeight: '800',
              marginBottom: '0.6rem',
              lineHeight: 1.2,
            }}
          >
            {specialty.plural} privados en {city}
          </h1>
          <p
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: '1rem',
              maxWidth: '600px',
              lineHeight: 1.6,
              marginBottom: '1.25rem',
            }}
          >
            {specialty.shortDesc(city)}
          </p>

          {/* Key stats row */}
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              flexWrap: 'wrap',
              fontSize: '0.85rem',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            <span>✅ Sin lista de espera</span>
            <span>📅 Cita en 24-72 h</span>
            <span>🏥 Centros verificados</span>
            <span>💳 Con y sin seguro</span>
          </div>
        </div>
      </section>

      {/* ── Search results (client component) ───────────────────────── */}
      <SearchResults specialtyId={specialty.id} city={city} />

      {/* ── SEO content: about section ───────────────────────────────── */}
      <section
        style={{
          background: '#f9fafb',
          borderTop: '1px solid #e5e7eb',
          padding: '3rem 0',
        }}
      >
        <div
          className="container"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.5rem' }}
        >
          {/* About the specialty */}
          <div>
            <h2
              style={{
                fontSize: '1.2rem',
                fontWeight: '700',
                color: '#1a3c5e',
                marginBottom: '0.75rem',
              }}
            >
              ¿Por qué elegir {specialty.articleName} privada en {city}?
            </h2>
            <p style={{ color: '#4b5563', lineHeight: 1.8, fontSize: '0.95rem' }}>
              La sanidad pública en España presenta tiempos de espera que pueden superar los{' '}
              <strong>3-6 meses</strong> para especialidades como {specialty.name}. Con Med Connect
              accedes a los mejores centros privados de {city} con cita disponible en{' '}
              <strong>24 a 72 horas</strong>, con y sin seguro médico, y a precios transparentes desde
              el primer momento.
            </p>
          </div>

          {/* How it works */}
          <div>
            <h2
              style={{
                fontSize: '1.2rem',
                fontWeight: '700',
                color: '#1a3c5e',
                marginBottom: '0.75rem',
              }}
            >
              Cómo reservar tu cita de {specialty.name.toLowerCase()} en {city}
            </h2>
            <ol style={{ paddingLeft: '1.25rem', color: '#4b5563', lineHeight: 2, fontSize: '0.95rem' }}>
              <li>Elige el centro que más te conviene en el listado de arriba.</li>
              <li>Selecciona el día y la hora disponibles.</li>
              <li>Completa tus datos y paga la tarifa de prioridad (desde 4,99&nbsp;€).</li>
              <li>Recibe confirmación por email con todos los detalles de tu cita.</li>
            </ol>
          </div>
        </div>
      </section>

      {/* ── FAQ section ──────────────────────────────────────────────── */}
      <section style={{ padding: '3rem 0', borderTop: '1px solid #e5e7eb' }}>
        <div className="container" style={{ maxWidth: '780px' }}>
          <h2
            style={{
              fontSize: '1.4rem',
              fontWeight: '800',
              color: '#1a3c5e',
              marginBottom: '1.5rem',
            }}
          >
            Preguntas frecuentes sobre {specialty.name.toLowerCase()} privada en {city}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {specialty.faqs.map(({ q, a }, i) => (
              <div
                key={i}
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '1.25rem 1.5rem',
                }}
              >
                <h3
                  style={{
                    fontSize: '1rem',
                    fontWeight: '700',
                    color: '#1a3c5e',
                    marginBottom: '0.5rem',
                  }}
                >
                  {q}
                </h3>
                <p style={{ color: '#4b5563', lineHeight: 1.7, fontSize: '0.925rem', margin: 0 }}>
                  {a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Internal links: other cities + other specialties ─────────── */}
      <section
        style={{
          background: '#f9fafb',
          borderTop: '1px solid #e5e7eb',
          padding: '2.5rem 0',
        }}
      >
        <div
          className="container"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}
        >
          {/* Other cities for same specialty */}
          <div>
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: '700',
                color: '#1a3c5e',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.75rem',
              }}
            >
              {specialty.plural} en otras ciudades
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {otherCities.map(({ slug, name }) => (
                <li key={slug}>
                  <Link
                    href={`/especialistas/${params.especialidad}/${slug}`}
                    style={{ color: '#2563eb', fontSize: '0.9rem', textDecoration: 'none' }}
                  >
                    → {specialty.plural} en {name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Other specialties in same city */}
          <div>
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: '700',
                color: '#1a3c5e',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.75rem',
              }}
            >
              Otras especialidades en {city}
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {otherSpecialties.map(({ slug, name }) => (
                <li key={slug}>
                  <Link
                    href={`/especialistas/${slug}/${params.ciudad}`}
                    style={{ color: '#2563eb', fontSize: '0.9rem', textDecoration: 'none' }}
                  >
                    → {name} en {city}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
