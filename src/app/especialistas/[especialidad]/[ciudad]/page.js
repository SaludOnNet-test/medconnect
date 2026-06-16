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
import { getPool, DB_AVAILABLE, sql } from '@/lib/db';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';

// 2026-06-10 — Auto-noindex threshold.
// Google Search Console reported 19 of these landing pages as "Discovered:
// currently not indexed". 17 of them had < 3 clinics on the listing — Google
// reads that as thin content. Setting robots.index=false until we have at
// least 3 clinics for a (specialty, city) pair means:
//   • Google stops wasting crawl budget on thin pages
//   • Ops can onboard clinics; next deploy auto-flips index=true
//   • UX for direct visitors is unchanged — the page still serves
//
// Threshold 3 matches what we saw in the diagnostic: 3+ clinics consistently
// got indexed; 1-2 was the cliff. Pages with the threshold or more keep
// their normal indexable metadata.
//
// 2026-06-11 — Two corrections after the gine/madrid investigation:
//   1) Use the same `city LIKE '%@city%' OR province LIKE '%@city%'` filter
//      the production API uses (/api/clinics/search). Exact city='Madrid'
//      undercounted because some clinics in the Madrid metro area store
//      city='Móstoles' but province='Madrid'.
//   2) Require the clinic to have at least one available schedule row.
//      Earlier I was counting catalog rows in clinic_specialties — but a
//      clinic without schedules renders as a card without slots, which
//      cappedClinics() in SearchResults.js then drops. So the actual
//      visible count for /especialistas/gine/madrid was 9 even though
//      clinic_specialties said 74. Counting bookable clinics matches
//      what the user (and Google) actually sees.
const MIN_INDEXABLE_CLINICS = 3;

async function countIndexableClinics(specialtySlug, city) {
  if (!DB_AVAILABLE) return null; // dev / preview without DB → don't gate
  try {
    const pool = await getPool();
    const variants = specialtySlug === 'ginecologia'
      ? ['%ginecologia%', '%obstetricia%']
      : [`%${specialtySlug}%`];
    const req = pool.request().input('city', sql.NVarChar(120), `%${city}%`);
    variants.forEach((v, i) => req.input(`v${i}`, sql.NVarChar(100), v));
    const cond = variants.map((_, i) => `cs.specialty_slug LIKE @v${i}`).join(' OR ');
    const r = await req.query(`
      SELECT COUNT(DISTINCT c.id) AS n
      FROM clinics c
      WHERE (LOWER(c.city) LIKE LOWER(@city) OR LOWER(c.province) LIKE LOWER(@city))
        AND EXISTS (
          SELECT 1 FROM clinic_specialties cs
          WHERE cs.clinic_id = c.id AND (${cond})
        )
        AND EXISTS (
          SELECT 1 FROM clinic_schedules sch
          WHERE sch.clinic_id = c.id AND sch.is_available = 1
        )
    `);
    return Number(r.recordset[0]?.n || 0);
  } catch {
    // Any DB hiccup → be defensive and allow indexing (don't silently
    // noindex the whole network because of a transient failure).
    return null;
  }
}

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

  // 2026-06-10 — Auto-noindex when the listing would be thin. See the
  // MIN_INDEXABLE_CLINICS comment above. Pages still serve normally
  // (UX unchanged); we only flip the robots header so Google doesn't
  // include the page in its index until ops onboards more clinics.
  const clinicCount = await countIndexableClinics(especialidad, city);
  const tooThin = clinicCount !== null && clinicCount < MIN_INDEXABLE_CLINICS;
  const robots = tooThin
    ? { index: false, follow: true } // crawl OK, don't index
    : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    ...(robots ? { robots } : {}),
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

  // 2026-06-16 — CLS hard fix for low-inventory cities.
  // Bilbao gineco (1 clinic) recorded CLS 0.37 on mobile because
  // SearchResults reserved 1800 px while loading and shrank to ~280 px
  // when the single real card arrived — a 1500 px upward shift of the
  // FAQ/testimonials block. We now pre-compute the expected count on
  // the server and pass it as a prop so SearchResults reserves space
  // matching ONE skeleton per expected clinic. Same DB query as the
  // noindex threshold so it's a single source of truth for "how many
  // clinics will the patient actually see here". Best-effort: null
  // when DB unavailable → SearchResults falls back to its previous
  // generic skeleton.
  const expectedClinicCount = await countIndexableClinics(especialidad, city);

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

          {/* 2026-06-04 — A4: live social-proof bar. Hidden when count is 0.
              `especialidad` is the URL slug (e.g. "ginecologia") and maps
              1:1 to the bookings.specialty column. The earlier draft of
              this prop passed `specialty.id` which is the numeric
              SPECIALTY_MAP id (3 for gineco) — that failed the endpoint's
              slug-regex and silently 400'd. */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <RecentBookingsBar
              specialty={especialidad}
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

          {/* 2026-06-08 — Self-referential strikethrough replaces the
              external €60-120 comparison. Tarifa habitual published on
              /tarifas makes the strikethrough legally defensible. The
              "Oferta de lanzamiento" eyebrow frames it as a current
              promo, not a fabricated past price. */}
          <p
            className="esp-hero__anchor"
            style={{
              fontSize: '0.85rem',
              color: 'var(--fg-muted)',
              lineHeight: 1.45,
              maxWidth: '640px',
              marginBottom: 'var(--space-2)',
            }}
          >
            <span style={{ color: 'var(--brass-700, #a0824a)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.7rem' }}>
              Oferta de lanzamiento ·{' '}
            </span>
            Reserva{' '}
            <s style={{ color: 'var(--fg-muted)', textDecorationThickness: '1px' }}>desde €10</s>{' '}
            <strong style={{ color: 'var(--ink-1000)' }}>desde €5</strong>
            {' '}·{' '}
            <a href="/tarifas" style={{ color: 'inherit', textDecoration: 'underline' }}>ver tarifas</a>.
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
              at the moment of being charged. Inline variant (single thin
              line, ~22 px) keeps the first ClinicCard above the fold on
              mobile — the v1 compact chip row pushed it below. */}
          <div style={{ marginTop: 'var(--space-2)' }}>
            <TrustStrip variant="inline" />
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
      <SearchResults
        specialtySlug={especialidad}
        city={city}
        expectedClinicCount={expectedClinicCount}
      />

      {/* 2026-06-04 — A5 repositioned: real + seeded patient testimonials.
          Originally placed below the FAQ; user reported "tampoco veo
          comentarios" because that was 3 scrolls deep. Moved to right
          after the clinic listing — the patient sees them at the natural
          end of the listing scroll, before the SEO content fold.
          Honest by construction: renders nothing when fewer than 3
          qualifying reviews exist. */}
      <section style={{ borderTop: '1px solid var(--border)', background: '#fff' }}>
        <div className="container">
          <PatientTestimonials
            specialty={especialidad}
            specialtyLabel={specialty.plural}
          />
        </div>
      </section>

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
