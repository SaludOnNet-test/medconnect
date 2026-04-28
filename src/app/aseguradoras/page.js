import Image from 'next/image';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHeader from '@/components/brand/PageHeader';
import Eyebrow from '@/components/brand/Eyebrow';
import StatBlock from '@/components/brand/StatBlock';
import Button from '@/components/brand/Button';

export const metadata = {
  title: 'Aseguradoras compatibles — Med Connect',
  description: 'Trabajamos con clínicas concertadas con Sanitas, Adeslas, DKV, AXA, Mapfre, Asisa, Cigna y Caser.',
};

// SSR — pulls the latest counts from /api/aseguradoras/stats on every
// request. The endpoint itself caches in memory inside the Next process,
// so this is cheap. We avoid `force-static` because the numbers are now
// driven by the live clinics table and we'd rather they update than be
// frozen at build time.
export const dynamic = 'force-dynamic';

const FALLBACK_INSURERS = [
  { id: 'sanitas', name: 'Sanitas', clinics: 1240 },
  { id: 'adeslas', name: 'Adeslas', clinics: 1580 },
  { id: 'dkv',     name: 'DKV',     clinics:  980 },
  { id: 'axa',     name: 'AXA',     clinics:  720 },
  { id: 'mapfre',  name: 'Mapfre',  clinics:  860 },
  { id: 'asisa',   name: 'Asisa',   clinics:  910 },
  { id: 'cigna',   name: 'Cigna',   clinics:  430 },
  { id: 'caser',   name: 'Caser',   clinics:  380 },
];

function formatThousands(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('es-ES');
}

function formatTotal(n) {
  // Hero rounds-down to the nearest 100 and adds a "+" so it doesn't
  // look like the number is precise to the unit. Falls back to the raw
  // string if smaller than 100.
  const v = Number(n);
  if (Number.isNaN(v) || v < 100) return formatThousands(n);
  const rounded = Math.floor(v / 100) * 100;
  return `${formatThousands(rounded)}+`;
}

function resolveBaseUrl() {
  // Prefer the explicit build-time URL, then Vercel's per-deploy host,
  // then localhost in dev. Important: Vercel sets VERCEL_URL but NOT
  // NEXT_PUBLIC_BASE_URL, so we cover both. Operator precedence kept
  // unambiguous with explicit branching.
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

async function fetchStats() {
  // We're in a Server Component — fetch with `cache: 'no-store'` so each
  // refresh hits the live endpoint (still cheap, one SQL count query).
  // The endpoint always returns a sane shape, even when DB is unavailable.
  try {
    const res = await fetch(`${resolveBaseUrl()}/api/aseguradoras/stats`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`stats ${res.status}`);
    return await res.json();
  } catch {
    return {
      source: 'fallback-page',
      insurers: FALLBACK_INSURERS,
      totals: { clinics: 7100, cities: 84, insurers: FALLBACK_INSURERS.length },
    };
  }
}

export default async function AseguradorasPage() {
  const stats = await fetchStats();
  const insurers = Array.isArray(stats.insurers) && stats.insurers.length
    ? stats.insurers
    : FALLBACK_INSURERS;
  const totals = stats.totals || { clinics: 7100, cities: 84, insurers: insurers.length };

  return (
    <>
      <Header />
      <PageHeader
        eyebrow="Aseguradoras"
        title={<>Tu póliza ya hace casi todo. <em>Nosotros, el resto.</em></>}
        lede="Trabajamos con clínicas concertadas con las principales aseguradoras de España. Si tu seguro está aquí, tienes acceso prioritario."
      />

      <section className="info-section">
        <div className="container">
          <div className="insurers-grid">
            {insurers.map((ins) => (
              <article key={ins.id} className="insurer-card">
                <div className="insurer-card-logo">
                  {/* Caser doesn't ship in our placeholder kit; show its name in serif */}
                  {['caser'].includes(ins.id) ? (
                    <span className="insurer-card-name">{ins.name}</span>
                  ) : (
                    <Image
                      src={`/brand/insurers/${ins.id}.svg`}
                      alt={ins.name}
                      width={120}
                      height={28}
                      className="insurer-card-logo-img"
                    />
                  )}
                </div>
                <div>
                  <div className="insurer-card-clinics">
                    {formatThousands(ins.clinics)} clínicas
                  </div>
                  <div className="insurer-card-meta">concertadas activas</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="info-section info-section--alt">
        <div className="container">
          <Eyebrow>Cobertura nacional</Eyebrow>
          <h2 className="info-section-title">
            Más de <em>{formatTotal(totals.clinics)} clínicas</em> concertadas en toda España.
          </h2>
          <p className="info-section-lede">
            Madrid, Barcelona, Valencia, Sevilla, Bilbao, Málaga, Zaragoza y más de 80 ciudades adicionales. Si tu aseguradora opera en tu provincia, tenemos al menos una clínica con reservas prioritarias.
          </p>
          <div className="stats-grid">
            <StatBlock value={formatTotal(totals.clinics)} label="Clínicas concertadas en la red" />
            <StatBlock value={String(totals.insurers)} label="Aseguradoras compatibles" accent />
            <StatBlock value={String(totals.cities)} label="Ciudades con cobertura" />
          </div>
        </div>
      </section>

      <section className="cta-section on-inverse">
        <div className="cta-noise" aria-hidden="true" />
        <div className="container cta-inner">
          <Eyebrow dark>Con tu seguro, sin esperas</Eyebrow>
          <h2 className="cta-title">
            Encuentra tu cita prioritaria <em>ahora</em>.
          </h2>
          <p className="cta-lede">
            Búscala con tu especialidad y ciudad. Te mostramos solo clínicas concertadas con tu aseguradora.
          </p>
          <div className="cta-actions">
            <Button href="/" variant="primary" size="lg">Buscar mi cita</Button>
            <Button href="/como-funciona" variant="ghostInv" size="lg">Cómo funciona</Button>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
