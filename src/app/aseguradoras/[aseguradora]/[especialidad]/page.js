import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Button from '@/components/brand/Button';
import TrustStrip from '@/components/TrustStrip';
import PatientTestimonials from '@/components/PatientTestimonials';
import { SPECIALTY_MAP, CITY_MAP, specialtyPageUrl } from '@/lib/seoData';
import { INSURER_MAP, getAllInsurerSpecialtyCombinations, insurerSpecialtyPageUrl } from '@/lib/insurerData';
import { getPool, DB_AVAILABLE, sql } from '@/lib/db';
import InsurerResults from './InsurerResults';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.medconnect.es';
const MIN_INDEXABLE_CLINICS = 3;

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
  const title       = `${specialty.plural} con ${insurer.name} desde €4 — Cita en 24-72h | Med Connect`;
  const description = `Accede a cita prioritaria con ${specialty.name.toLowerCase()} en clínicas concertadas con ${insurer.name}. ${countCopy}Solo €4-€19 de tarifa de prioridad — la consulta la cubre tu seguro. Reembolso íntegro si no encontramos hueco.`;
  const canonical   = insurerSpecialtyPageUrl(aseguradora, especialidad);

  return {
    title,
    description,
    alternates: { canonical },
    ...(tooThin ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, url: canonical, siteName: 'Med Connect', locale: 'es_ES', type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

function buildSchema(insurer, specialty, aseguradora, especialidad) {
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
              text: `Sí. Med Connect te da acceso a clínicas concertadas con ${insurer.name} para ${specialty.name.toLowerCase()}. La consulta se factura a tu aseguradora como siempre; solo pagas la tarifa de acceso prioritario (5-29€ según urgencia).`,
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
              text: 'La tarifa de Med Connect es de 5€ si la cita es a más de 30 días, 10€ entre 15 y 30 días, 19€ entre 7 y 14 días, o 29€ si la necesitas en menos de 7 días. La consulta médica la paga tu aseguradora.',
            },
          },
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

  const schema = buildSchema(insurer, specialty, aseguradora, especialidad);

  // Related specialties for internal linking
  const relatedSpecialties = Object.entries(SPECIALTY_MAP)
    .filter(([slug]) => slug !== especialidad)
    .slice(0, 5);

  // Related cities for this specialty (internal links to specialty/city pages)
  const mainCities = ['madrid', 'barcelona', 'valencia', 'sevilla', 'malaga'];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <Header />

      <main>
        {/* Hero */}
        <section className="page-header">
          <div className="container page-header-inner">
            <nav className="page-header-breadcrumb" aria-label="Breadcrumb">
              <Link href="/">Inicio</Link>
              <span aria-hidden="true"> / </span>
              <Link href="/aseguradoras">Aseguradoras</Link>
              <span aria-hidden="true"> / </span>
              <Link href={`/aseguradoras/${aseguradora}`}>{insurer.name}</Link>
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
              Pagas 5–29€ de tarifa de acceso. La consulta la cubre {insurer.name}.
            </p>
            <div className="page-header-actions">
              <Button href="/search-v2" variant="primary" size="lg">Buscar cita de {specialty.name}</Button>
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

        {/* Clinic listing */}
        <section className="info-section info-section--alt">
          <div className="container">
            <h2 className="section-title">
              Centros de {specialty.name.toLowerCase()} concertados con {insurer.name}
            </h2>
            <InsurerResults
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
              exactamente igual que siempre. Med Connect solo cobra la tarifa de acceso prioritario (5–29€ según urgencia).
            </p>

            <h3>¿Cuánto cuesta el acceso prioritario?</h3>
            <p>
              La tarifa de Med Connect escalonada por urgencia: <strong>5€</strong> si la cita es a más de 30 días,
              <strong> 10€</strong> entre 15 y 30 días, <strong>19€</strong> entre 7 y 14 días, y
              <strong> 29€</strong> si la necesitas en menos de 7 días. Sin costes adicionales.
            </p>

            <h3>¿Puedo cancelar si cambio de opinión?</h3>
            <p>
              Sí. Puedes cancelar gratis hasta 24 horas antes de la cita y te devolvemos la tarifa íntegra.
            </p>
          </div>
        </section>

        {/* Internal links: same specialty, other cities */}
        <section className="info-section info-section--alt">
          <div className="container">
            <h2 className="section-title">
              {specialty.plural} privados por ciudad
            </h2>
            <div className="insurer-city-links">
              {mainCities.map((citySlug) => (
                <Link
                  key={citySlug}
                  href={specialtyPageUrl(especialidad, citySlug)}
                  className="insurer-city-chip"
                >
                  {CITY_MAP[citySlug]}
                </Link>
              ))}
            </div>
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
      </main>

      <Footer />
    </>
  );
}
