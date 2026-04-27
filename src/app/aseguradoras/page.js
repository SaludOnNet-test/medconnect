import Image from 'next/image';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageHeader from '@/components/brand/PageHeader';
import Eyebrow from '@/components/brand/Eyebrow';
import StatBlock from '@/components/brand/StatBlock';
import Button from '@/components/brand/Button';

export const metadata = {
  title: 'Aseguradoras compatibles — Med Connect',
  description: 'Trabajamos con clínicas concertadas con Sanitas, Adeslas, DKV, AXA, Mapfre, Asisa, Cigna y Caser. Más de 7.100 clínicas en toda España.',
};

const INSURERS = [
  { id: 'sanitas', name: 'Sanitas', clinics: '1.240 clínicas' },
  { id: 'adeslas', name: 'Adeslas', clinics: '1.580 clínicas' },
  { id: 'dkv',     name: 'DKV',     clinics: '980 clínicas' },
  { id: 'axa',     name: 'AXA',     clinics: '720 clínicas' },
  { id: 'mapfre',  name: 'Mapfre',  clinics: '860 clínicas' },
  { id: 'asisa',   name: 'Asisa',   clinics: '910 clínicas' },
  { id: 'cigna',   name: 'Cigna',   clinics: '430 clínicas' },
  { id: 'caser',   name: 'Caser',   clinics: '380 clínicas' },
];

export default function AseguradorasPage() {
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
            {INSURERS.map((ins) => (
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
                  <div className="insurer-card-clinics">{ins.clinics}</div>
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
            Más de <em>7.100 clínicas</em> concertadas en toda España.
          </h2>
          <p className="info-section-lede">
            Madrid, Barcelona, Valencia, Sevilla, Bilbao, Málaga, Zaragoza y más de 80 ciudades adicionales. Si tu aseguradora opera en tu provincia, tenemos al menos una clínica con reservas prioritarias.
          </p>
          <div className="stats-grid">
            <StatBlock value="7.100+" label="Clínicas concertadas en la red" />
            <StatBlock value="8" label="Aseguradoras compatibles" accent />
            <StatBlock value="84" label="Ciudades con cobertura" />
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
