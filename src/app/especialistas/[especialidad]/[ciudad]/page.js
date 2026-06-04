import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import TrustStrip from '@/components/TrustStrip';
import RecentBookingsBar from '@/components/RecentBookingsBar';
import PatientTestimonials from '@/components/PatientTestimonials';
import SearchResults from './SearchResults';
import {
  SPECIALTY_MAP,
  CITY_MAP,
  getAllSpecialtyCityCombinations,
  specialtyPageUrl,
} from '@/lib/seoData';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';

// ── Static generation ──────────────────────────────────────────────────────
export function generateStaticParams() {
  return getAllSpecialtyCityCombinations(); // 40 pages pre-rendered at build
}

// ── Per-page metadata ──────────────────────────────────────────────────────
// Next.js 16 changed `params` to a Promise (was a sync object pre-15). The
// previous code read `params.especialidad` directly, which evaluates to
// `undefined` on a Promise, so every SEO page silently fell into the
// not-found branch — the prerendered HTML ended up with the generic title
// and the "Página no encontrada" body. Async + await fixes both this
// metadata function and the page component below.
export async function generateMetadata({ params }) {
  const { especialidad, ciudad } = await params;
  const specialty = SPECIALTY_MAP[especialidad];
  const city      = CITY_MAP[ciudad];

  if (!specialty || !city) {
    return { title: 'Especialistas médicos | Med Connect' };
  }

  const title       = `${specialty.plural} en ${city} — Cita privada sin esperas | Med Connect`;
  const description = specialty.shortDesc(city);
  const canonical   = specialtyPageUrl(especialidad, ciudad);

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
export default async function EspecialistasCiudadPage({ params }) {
  // Next.js 16 — `params` is a Promise. See the note on generateMetadata
  // above for the regression this fixes.
  const { especialidad, ciudad } = await params;
  const specialty = SPECIALTY_MAP[especialidad];
  const city      = CITY_MAP[ciudad];

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

  const canonicalUrl = specialtyPageUrl(especialidad, ciudad);

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
          { '@type': 'ListItem', position: 3, name: specialty.name,  item: `${BASE_URL}/especialistas/${especialidad}` },
          { '@type': 'ListItem', position: 4, name: city,            item: canonicalUrl },
        ],
      },
    ],
  };

  // Quick-links to other cities for this specialty (internal linking)
  const otherCities = Object.entries(CITY_MAP)
    .filter(([slug]) => slug !== ciudad)
    .map(([slug, name]) => ({ slug, name }));

  // Quick-links to other specialties in this city
  const otherSpecialties = Object.entries(SPECIALTY_MAP)
    .filter(([slug]) => slug !== especialidad)
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
          background: 'var(--bone-200)',
          borderBottom: '1px solid var(--border)',
          padding: 'var(--space-2) 0',
          fontSize: '0.8rem',
          color: 'var(--fg-muted)',
        }}
      >
        <div className="container" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: 'var(--ink-900)' }}>Inicio</Link>
          <span aria-hidden="true">›</span>
          <Link href="/search-v2" style={{ color: 'var(--ink-900)' }}>Especialistas</Link>
          <span aria-hidden="true">›</span>
          <Link
            href={`/search-v2?specialty=${specialty.id}`}
            style={{ color: 'var(--ink-900)' }}
          >
            {specialty.name}
          </Link>
          <span aria-hidden="true">›</span>
          <span style={{ color: 'var(--ink-1000)', fontWeight: 600 }}>{city}</span>
        </div>
      </nav>

      {/* ── Hero / SEO header (brand-aligned bone variant — Option A) ──
          Was a hardcoded navy gradient (#1a3c5e → #245082) from the
          pre-redesign palette. Now bone-100 bg with ink text and brass
          left-border on the stat pills, matching /faq, /aseguradoras,
          /como-funciona's PageHeader style. */}
      {/* Hero — compresses ~50% on mobile (<640px) via the .esp-hero class
          + the responsive overrides in search-v2.css. Above-the-fold goal
          on mobile: header + breadcrumb + hero fits in <300px so the first
          ClinicCard is visible without scroll. We also hide 2 of the 4 stat
          pills below 640px (keep the 2 most distinctive). */}
      <section
        className="esp-hero"
        style={{
          background: 'var(--bone-100)',
          color: 'var(--ink-1000)',
          borderBottom: '1px solid var(--border)',
          padding: 'var(--space-7) 0 var(--space-6)',
        }}
      >
        <div className="container">
          <h1
            className="esp-hero__title"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.75rem, 4vw, 2.6rem)',
              fontWeight: 800,
              color: 'var(--ink-1000)',
              marginBottom: 'var(--space-3)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            {specialty.plural} privados en {city}
          </h1>

          {/* 2026-06-04 — A4: live social-proof bar. Hidden when count is 0
              so the patient never sees a placeholder that would read as
              scammy. specialty.id is the URL slug (e.g. "ginecologia") and
              maps 1:1 to the `specialty` column in bookings. */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <RecentBookingsBar
              specialty={specialty.id}
              city={city}
              specialtyLabel={specialty.plural}
            />
          </div>
          <p
            className="esp-hero__intro"
            style={{
              color: 'var(--fg-muted)',
              fontSize: '1.05rem',
              maxWidth: '640px',
              lineHeight: 1.6,
              marginBottom: 'var(--space-3)',
            }}
          >
            {specialty.shortDesc(city)}
          </p>

          {/* 2026-06-04 — A3: price anchor. €29 alone reads as "a fee".
              Anchored against €60-120 (Spanish private-consult market rate
              for first visits in cardiology / dermatology / gynecology),
              the same number reads as a deal. */}
          <p
            className="esp-hero__anchor"
            style={{
              color: 'var(--ink-1000)',
              fontSize: '1rem',
              maxWidth: '640px',
              lineHeight: 1.55,
              marginBottom: 'var(--space-5)',
            }}
          >
            Reserva {specialty.plural.toLowerCase()} en {city}{' '}
            <strong>desde €5</strong>. Una primera consulta privada cuesta
            entre <strong>€60 y €120</strong>; aquí solo pagas la tarifa de
            prioridad — <strong>tu seguro cubre el resto</strong>.
          </p>

          {/* Key stats — flat icon + label list. Earlier this was a
              row of pill-shaped chips (rounded border, accent stripe,
              bold font) that read as buttons; Clarity recorded a
              meaningful dead-click rate on them. Rendered now as a
              horizontal line of labels with cursor:default so the
              affordance matches the (lack of) behaviour. Styles live
              in `.esp-hero__pill` inside search-v2.css. */}
          <div className="esp-hero__pills">
            {[
              ['✅', 'Sin lista de espera', 'keep-mobile'],
              ['📅', 'Cita en 24-72 h', 'keep-mobile'],
              ['🏥', 'Centros verificados', 'hide-mobile'],
              ['💳', 'Con y sin seguro', 'hide-mobile'],
            ].map(([icon, label, mobileClass]) => (
              <span
                key={label}
                className={`esp-hero__pill esp-hero__pill--${mobileClass}`}
              >
                <span className="esp-hero__pill-icon" aria-hidden="true">{icon}</span>
                {label}
              </span>
            ))}
          </div>

          {/* 2026-06-04 — A2: trust strip replicated upstream. Same 3 claims
              that appear at the Stripe step (commit f2dc34a) so the patient
              sees the reassurance immediately on the SEM landing, not only
              at the moment of being charged. Identical wording on all 4
              surfaces is intentional — consistency builds familiarity. */}
          <div style={{ marginTop: 'var(--space-3)' }}>
            <TrustStrip variant="compact" />
          </div>

          {/* 2026-05-29 — Search escape hatch. A Clarity-recorded session
              showed a user scrolling to the top of the page looking for a
              search input, not finding one, and bouncing. The SEO landing
              page intentionally doesn't carry SearchBarV2 (alignment +
              breadcrumb redundancy reasons) — this small link below the
              hero pills gives users a direct affordance to /search-v2
              when they want to refine specialty or city. */}
          <div className="esp-hero__search-cta" style={{
            marginTop: 'var(--space-4)',
            fontSize: '0.9rem',
            color: 'var(--fg-muted)',
          }}>
            ¿Buscas otra especialidad o ciudad?{' '}
            <Link
              href="/search-v2"
              style={{
                color: 'var(--ink-1000)',
                fontWeight: 600,
                textDecoration: 'underline',
                textDecorationColor: 'var(--brass-500)',
                textDecorationThickness: '2px',
                textUnderlineOffset: '3px',
              }}
            >
              Buscar todo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Search results (client component) ───────────────────────── */}
      {/* Pass the URL slug (e.g. "cardiologia") instead of the numeric
          mock id — the new SearchResults uses /api/clinics/search which
          accepts `specialtySlug` natively, no slug→id round-trip needed. */}
      <SearchResults specialtySlug={especialidad} city={city} />

      {/* ── SEO content: about section ───────────────────────────────── */}
      <section
        style={{
          background: 'var(--bone-200)',
          borderTop: '1px solid var(--border)',
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
                color: 'var(--ink-1000)',
                marginBottom: '0.75rem',
              }}
            >
              ¿Por qué elegir {specialty.articleName} privada en {city}?
            </h2>
            <p style={{ color: 'var(--fg-muted)', lineHeight: 1.8, fontSize: '0.95rem' }}>
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
                color: 'var(--ink-1000)',
                marginBottom: '0.75rem',
              }}
            >
              Cómo reservar tu cita de {specialty.name.toLowerCase()} en {city}
            </h2>
            <ol style={{ paddingLeft: '1.25rem', color: 'var(--fg-muted)', lineHeight: 2, fontSize: '0.95rem' }}>
              <li>Elige el centro que más te conviene en el listado de arriba.</li>
              <li>Selecciona el día y la hora disponibles.</li>
              <li>Completa tus datos y paga la tarifa de prioridad (desde 5&nbsp;€).</li>
              <li>Recibe confirmación por email con todos los detalles de tu cita.</li>
            </ol>
          </div>
        </div>
      </section>

      {/* 2026-06-04 — A5: real patient testimonials.
          Honest by construction: this section renders NOTHING when fewer
          than 3 qualifying reviews exist. As reviews accumulate via the
          post-booking review flow, the strip starts populating on its
          own. No owner content step needed. */}
      <section style={{ padding: '0 0', borderTop: '1px solid var(--border)' }}>
        <div className="container">
          <PatientTestimonials
            specialty={specialty.id}
            specialtyLabel={specialty.plural}
          />
        </div>
      </section>

      {/* ── FAQ section ──────────────────────────────────────────────── */}
      <section style={{ padding: '3rem 0', borderTop: '1px solid var(--border)' }}>
        <div className="container" style={{ maxWidth: '780px' }}>
          <h2
            style={{
              fontSize: '1.4rem',
              fontWeight: '800',
              color: 'var(--ink-1000)',
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
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '1.25rem 1.5rem',
                }}
              >
                <h3
                  style={{
                    fontSize: '1rem',
                    fontWeight: '700',
                    color: 'var(--ink-1000)',
                    marginBottom: '0.5rem',
                  }}
                >
                  {q}
                </h3>
                <p style={{ color: 'var(--fg-muted)', lineHeight: 1.7, fontSize: '0.925rem', margin: 0 }}>
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
          background: 'var(--bone-200)',
          borderTop: '1px solid var(--border)',
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
                color: 'var(--ink-1000)',
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
                    href={`/especialistas/${especialidad}/${slug}`}
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
                color: 'var(--ink-1000)',
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
                    href={`/especialistas/${slug}/${ciudad}`}
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
