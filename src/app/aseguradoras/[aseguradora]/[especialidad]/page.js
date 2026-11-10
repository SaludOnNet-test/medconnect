import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Button from '@/components/brand/Button';
import TrustStrip from '@/components/TrustStrip';
import PatientTestimonials from '@/components/PatientTestimonials';
import { SPECIALTY_MAP, CITY_MAP } from '@/lib/seoData';
import { INSURER_MAP, getAllInsurerSpecialtyCombinations, insurerSpecialtyPageUrl } from '@/lib/insurerData';
import { getPool, DB_AVAILABLE, sql } from '@/lib/db';
import { getInsurerSpecialtyData } from '@/lib/insurerPageData';
import InsurerResults from './InsurerResults';
import InsurerCtaLink from './InsurerCtaLink';
import InsurerStickyCta from './InsurerStickyCta';
import './insurer-page.css';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';
// 2026-09-14 — Lowered from 3 → 0 to remove the gate entirely, matching
// the same second-pass change in
// src/app/especialistas/[especialidad]/[ciudad]/page.js. The initial 1
// still noindex'd the 0-clinic combos (GSC URL Inspection on
// ginecologia/bilbao surfaced this). See that file for the full
// audit-based reasoning.
const MIN_INDEXABLE_CLINICS = 0;

async function countClinicsForInsurerSpecialty(specialtySlug, insurerDbName) {
  if (!DB_AVAILABLE) return null;
  try {
    const pool = await getPool();
    const variants = specialtySlug === 'ginecologia'
      ? ['%ginecologia%', '%obstetricia%']
      : [`%${specialtySlug}%`];
    const req = pool.request()
      .input('insurer', sql.NVarChar(120), `%${insurerDbName}%`);
    variants.forEach((v, i) => req.input(`v${i}`, sql.NVarChar(100), v));
    const cond = variants.map((_, i) => `cs.specialty_slug LIKE @v${i}`).join(' OR ');
    const r = await req.query(`
      SELECT COUNT(DISTINCT c.id) AS n
      FROM clinics c
      WHERE (',' + c.accepted_insurance + ',') LIKE ('%,' + @insurer + ',%')
        AND EXISTS (
          SELECT 1 FROM clinic_specialties cs
          WHERE cs.clinic_id = c.id AND (${cond})
        )
    `);
    return Number(r.recordset[0]?.n || 0);
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  return getAllInsurerSpecialtyCombinations(SPECIALTY_MAP);
}

export async function generateMetadata({ params }) {
  const { aseguradora, especialidad } = await params;
  const insurer   = INSURER_MAP[aseguradora];
  const specialty = SPECIALTY_MAP[especialidad];
  if (!insurer || !specialty) return {};

  const clinicCount = await countClinicsForInsurerSpecialty(especialidad, insurer.dbName);
  const tooThin     = clinicCount !== null && clinicCount < MIN_INDEXABLE_CLINICS;

  // 2026-06-24 — Phase 5 SEO metadata. Mismo template que
  // /especialistas/[esp]/[ciudad]: precio en title (lidera el snippet)
  // + #centros en description (trust + counter al "duda de cantidad").
  const countCopy = clinicCount && clinicCount >= 3
    ? `${clinicCount} clínicas concertadas con ${insurer.name}. `
    : '';
  const title       = `${specialty.plural} con ${insurer.name} desde €4 — Cita en 24-72h | MedConnect`;
  const description = `Accede a cita prioritaria con ${specialty.name.toLowerCase()} en clínicas concertadas con ${insurer.name}. ${countCopy}Solo €4-€19 de tarifa de prioridad — la consulta la cubre tu seguro. Reembolso íntegro si no encontramos hueco.`;
  const canonical   = insurerSpecialtyPageUrl(aseguradora, especialidad);

  return {
    title,
    description,
    alternates: { canonical },
    ...(tooThin ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, url: canonical, siteName: 'MedConnect', locale: 'es_ES', type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

function buildSchema(insurer, specialty, aseguradora, especialidad, extraFaqs = []) {
  const url = insurerSpecialtyPageUrl(aseguradora, especialidad);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'MedicalBusiness',
        name: `${specialty.plural} con ${insurer.name} — Med Connect`,
        url,
        description: `Reserva cita prioritaria con ${specialty.plural.toLowerCase()} privados concertados con ${insurer.name}. Sin esperas de semanas.`,
        medicalSpecialty: specialty.name,
        priceRange: '€4–€19',
        areaServed: { '@type': 'Country', name: 'España' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `¿Puedo usar mi seguro ${insurer.name} para la consulta de ${specialty.name.toLowerCase()}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Sí. Med Connect te da acceso a clínicas concertadas con ${insurer.name} para ${specialty.name.toLowerCase()}. La consulta se factura a tu aseguradora como siempre; solo pagas la tarifa de acceso prioritario (4-19€ según urgencia).`,
            },
          },
          {
            '@type': 'Question',
            name: `¿Por qué hay espera para ${specialty.name.toLowerCase()} con ${insurer.name}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `${insurer.coverageNote} Med Connect accede a plazas prioritarias que no aparecen en el buscador habitual de ${insurer.name}.`,
            },
          },
          {
            '@type': 'Question',
            name: '¿Cuánto cuesta el acceso prioritario?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'La tarifa de Med Connect es de 4€ si la cita es a más de 30 días, 8€ entre 15 y 30 días, 15€ entre 7 y 14 días, o 19€ si la necesitas en menos de 7 días. La consulta médica la paga tu aseguradora.',
            },
          },
          ...extraFaqs.map((faq) => ({
            '@type': 'Question',
            name: faq.q,
            acceptedAnswer: { '@type': 'Answer', text: faq.a },
          })),
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: BASE_URL },
          { '@type': 'ListItem', position: 2, name: 'Aseguradoras', item: `${BASE_URL}/aseguradoras` },
          { '@type': 'ListItem', position: 3, name: insurer.name, item: `${BASE_URL}/aseguradoras/${aseguradora}` },
          { '@type': 'ListItem', position: 4, name: specialty.name, item: insurerSpecialtyPageUrl(aseguradora, especialidad) },
        ],
      },
    ],
  };
}

export default async function InsurerSpecialtyPage({ params }) {
  const { aseguradora, especialidad } = await params;
  const insurer   = INSURER_MAP[aseguradora];
  const specialty = SPECIALTY_MAP[especialidad];
  if (!insurer || !specialty) notFound();

  const { cities, consultationPrice } = await getInsurerSpecialtyData(especialidad, insurer.dbName);
  const specialtyLower = specialty.name.toLowerCase();

  // Booking entry points. All of them keep the specialty AND the insurer
  // (until 2026-11 the hero CTA sent the patient to a bare /search-v2 and
  // both filters were lost).
  const insuranceQuery = `insurance=${encodeURIComponent(insurer.dbName)}`;
  const searchHref = `/search-v2?specialtySlug=${especialidad}&${insuranceQuery}`;
  const landingHref = (citySlug) => `/especialistas/${especialidad}/${citySlug}?${insuranceQuery}`;
  const cityHref = (cityInfo) => (cityInfo.landingSlug
    ? landingHref(cityInfo.landingSlug)
    : `/search-v2?specialtySlug=${especialidad}&city=${encodeURIComponent(cityInfo.city)}&${insuranceQuery}`);

  const extraFaqs = [
    {
      q: `¿Necesito volante de ${insurer.name} para ir al especialista de ${specialtyLower}?`,
      a: `Depende de tu póliza: muchas pólizas de ${insurer.name} permiten ir directamente al especialista y otras piden volante del médico de cabecera o autorización previa. Revisa las condiciones de tu póliza o la app de ${insurer.name} antes de la cita; si necesitas volante, tenlo listo para el día de la consulta.`,
    },
    {
      q: '¿Qué pasa si no hay hueco en la clínica que elegí?',
      a: 'Antes de confirmar tu cita, nuestro equipo de Operaciones llama a la clínica para cerrar el hueco. Si ya no está disponible, te proponemos una alternativa cercana y, si no te encaja, te devolvemos la tarifa de prioridad íntegra.',
    },
    ...(consultationPrice ? [{
      q: `¿Cuánto cuesta la consulta de ${specialtyLower} si mi póliza no la cubre?`,
      a: `En los centros de nuestro catálogo, una consulta de ${specialtyLower} sin seguro cuesta entre ${consultationPrice.min} y ${consultationPrice.max} € según el centro y la ciudad. En ese caso pagas el precio de la consulta más la tarifa de prioridad, en un único cargo.`,
    }] : []),
  ];

  const schema = buildSchema(insurer, specialty, aseguradora, especialidad, extraFaqs);

  // Related specialties for internal linking
  const relatedSpecialties = Object.entries(SPECIALTY_MAP)
    .filter(([slug]) => slug !== especialidad)
    .slice(0, 5);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <Header />

      <main className="insurer-page-main">
        {/* Hero */}
        <section className="page-header">
          <div className="container page-header-inner">
            <nav className="page-header-breadcrumb" aria-label="Breadcrumb">
              <Link href="/">Inicio</Link>
              <span aria-hidden="true"> / </span>
              <Link href="/aseguradoras">Aseguradoras</Link>
              <span aria-hidden="true"> / </span>
              <span>{insurer.name}</span>
              <span aria-hidden="true"> / </span>
              <span>{specialty.name}</span>
            </nav>

            <p className="page-header-eyebrow">{insurer.name} · {specialty.name}</p>
            <h1 className="page-header-title">
              {specialty.plural} con {insurer.name}<br />
              <em>sin esperar semanas.</em>
            </h1>
            <p className="page-header-lede">
              {insurer.copyagLine} Med Connect accede a plazas prioritarias en clínicas concertadas con tu seguro.
              Pagas 4–19€ de tarifa de acceso. La consulta la cubre {insurer.name}.
            </p>
            <div className="page-header-actions">
              <InsurerCtaLink
                href={searchHref}
                cta="hero"
                insurer={aseguradora}
                specialty={especialidad}
                className="brand-btn brand-btn--primary brand-btn--lg"
              >
                Buscar cita de {specialty.name} con {insurer.name}
              </InsurerCtaLink>
              <Button href="/como-funciona" variant="ghost" size="lg">Cómo funciona</Button>
            </div>
          </div>
        </section>

        {/* Coverage explanation */}
        <section className="info-section">
          <div className="container">
            <div className="insurer-explain-block">
              <h2>¿Por qué hay espera si tienes {insurer.name}?</h2>
              <p>{insurer.coverageNote}</p>
              <p>
                Med Connect negocia acceso a plazas prioritarias en la red concertada de {insurer.name} para {specialty.name.toLowerCase()}.
                Esas plazas no aparecen en el buscador habitual del seguro — están reservadas para quienes no pueden esperar el turno ordinario.
              </p>
            </div>
          </div>
        </section>

        {/* City selector — the patient picks where they need the appointment
            and lands on the specialty/city page with the insurer pre-selected. */}
        <section className="info-section info-section--alt">
          <div className="container">
            <h2 className="section-title">¿En qué ciudad necesitas cita de {specialtyLower}?</h2>
            <p className="insurer-section-lede">
              Elige tu ciudad y te mostramos los huecos disponibles con {insurer.name} ya seleccionado.
            </p>
            <div className="insurer-city-links">
              {Object.entries(CITY_MAP).map(([citySlug, cityName]) => (
                <InsurerCtaLink
                  key={citySlug}
                  href={landingHref(citySlug)}
                  cta="city_chip"
                  insurer={aseguradora}
                  specialty={especialidad}
                  className="insurer-city-chip"
                >
                  {cityName}
                </InsurerCtaLink>
              ))}
              <InsurerCtaLink
                href={searchHref}
                cta="city_chip_other"
                insurer={aseguradora}
                specialty={especialidad}
                className="insurer-city-chip"
              >
                Otra ciudad
              </InsurerCtaLink>
            </div>
          </div>
        </section>

        {/* Server-rendered summary of where the clinics are, so the page has
            real, page-specific content in its initial HTML. */}
        {cities.length > 0 && (
          <section className="info-section">
            <div className="container">
              <h2 className="section-title">
                Dónde hay centros de {specialtyLower} con {insurer.name}
              </h2>
              <div className="insurer-city-grid">
                {cities.map((cityInfo) => (
                  <article key={cityInfo.city} className="insurer-city-card">
                    <h3 className="insurer-city-card__title">{cityInfo.city}</h3>
                    <p className="insurer-city-card__count">
                      {cityInfo.clinicCount} {cityInfo.clinicCount === 1 ? 'centro' : 'centros'} de {specialtyLower}
                    </p>
                    <ul className="insurer-city-card__clinics">
                      {cityInfo.exampleClinics.map((name) => <li key={name}>{name}</li>)}
                    </ul>
                    <InsurerCtaLink
                      href={cityHref(cityInfo)}
                      cta="city_card"
                      insurer={aseguradora}
                      specialty={especialidad}
                      className="insurer-city-card__link"
                    >
                      Ver huecos en {cityInfo.city}
                    </InsurerCtaLink>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* How booking works with this insurer */}
        <section className="info-section info-section--alt">
          <div className="container">
            <h2 className="section-title">Cómo pedir cita de {specialtyLower} con tu {insurer.name}</h2>
            <ol className="insurer-steps">
              <li>
                <strong>Elige centro y hueco.</strong> Busca por ciudad y reserva el hueco que te encaje; la tarifa de
                prioridad va de 4 € a 19 € según lo pronto que necesites la cita.
              </li>
              <li>
                <strong>Confirmamos con la clínica.</strong> Nuestro equipo de Operaciones llama al centro para cerrar
                el hueco con tu {insurer.name} y te avisa por email.
              </li>
              <li>
                <strong>Acude a la cita con tu tarjeta de {insurer.name} y tu DNI.</strong> Si tu póliza pide volante o
                autorización previa para {specialtyLower}, llévalo también.
              </li>
              <li>
                <strong>La consulta la paga {insurer.name}.</strong> Tú solo pagas la prioridad, y puedes cancelar gratis
                hasta 24 horas antes de la cita.
              </li>
            </ol>
            {consultationPrice && (
              <p className="insurer-price-note">
                Si tu póliza no cubre la consulta, en los centros de nuestro catálogo una consulta de {specialtyLower} sin
                seguro cuesta entre {consultationPrice.min} y {consultationPrice.max} €.
              </p>
            )}
          </div>
        </section>

        {/* Clinic listing */}
        <section className="info-section info-section--alt">
          <div className="container">
            <h2 className="section-title">
              Centros de {specialty.name.toLowerCase()} concertados con {insurer.name}
            </h2>
            <InsurerResults
              insurerSlug={aseguradora}
              specialtySlug={especialidad}
              insurerDbName={insurer.dbName}
              insurerName={insurer.name}
              specialtyName={specialty.name}
            />
          </div>
        </section>

        {/* FAQ */}
        <section className="info-section">
          <div className="container" style={{ maxWidth: 720 }}>
            <h2>Preguntas frecuentes</h2>

            <h3>¿Puedo usar mi {insurer.name} para la consulta de {specialty.name.toLowerCase()}?</h3>
            <p>
              Sí. Los centros de la lista están concertados con {insurer.name}. La consulta se factura a tu aseguradora
              exactamente igual que siempre. Med Connect solo cobra la tarifa de acceso prioritario (4–19€ según urgencia).
            </p>

            <h3>¿Cuánto cuesta el acceso prioritario?</h3>
            <p>
              La tarifa de Med Connect escalonada por urgencia: <strong>4€</strong> si la cita es a más de 30 días,
              <strong> 8€</strong> entre 15 y 30 días, <strong>15€</strong> entre 7 y 14 días, y
              <strong> 19€</strong> si la necesitas en menos de 7 días. Sin costes adicionales.
            </p>

            <h3>¿Puedo cancelar si cambio de opinión?</h3>
            <p>
              Sí. Puedes cancelar gratis hasta 24 horas antes de la cita y te devolvemos la tarifa íntegra.
            </p>

            {extraFaqs.map((faq) => (
              <div key={faq.q}>
                <h3>{faq.q}</h3>
                <p>{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Internal links: other specialties, same insurer */}
        <section className="info-section">
          <div className="container">
            <h2 className="section-title">Otras especialidades con {insurer.name}</h2>
            <div className="insurer-specialty-links">
              {relatedSpecialties.map(([slug, spec]) => (
                <Link
                  key={slug}
                  href={insurerSpecialtyPageUrl(aseguradora, slug)}
                  className="insurer-specialty-chip"
                >
                  {spec.name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <TrustStrip />
        <PatientTestimonials />
        <InsurerStickyCta
          href={searchHref}
          insurerName={insurer.name}
          insurerSlug={aseguradora}
          specialtySlug={especialidad}
        />
      </main>

      <Footer />
    </>
  );
}
