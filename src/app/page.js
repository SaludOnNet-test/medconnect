import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SearchBarV2 from '@/components/SearchBarV2';
import TrustpilotSection from '@/components/TrustpilotSection';
import HowItWorks from '@/components/HowItWorks';
import HomeFAQ from '@/components/HomeFAQ';
import AnnouncementBar from '@/components/brand/AnnouncementBar';
import Eyebrow from '@/components/brand/Eyebrow';
import Card from '@/components/brand/Card';
import Button from '@/components/brand/Button';
import { PriceLadder } from '@/components/brand/PriceTier';
import Icon from '@/components/icons/Icon';
import './home.css';

// Insurer placeholder lockups. SVGs ship as part of the brand kit; before
// public launch they must be replaced with officially-licensed logos.
const INSURERS = [
  { slug: 'sanitas', name: 'Sanitas' },
  { slug: 'adeslas', name: 'Adeslas' },
  { slug: 'dkv',     name: 'DKV' },
  { slug: 'axa',     name: 'AXA' },
  { slug: 'mapfre',  name: 'Mapfre' },
  { slug: 'asisa',   name: 'Asisa' },
  { slug: 'cigna',   name: 'Cigna' },
];

const PILLARS = [
  {
    icon: 'zap',
    title: 'La reserva que tu seguro no encuentra',
    body: 'Tu cuadro médico está saturado y tu app del seguro te ofrece fechas a 3-6 semanas. Llevas días llamando a clínicas. Ese es exactamente el problema que resolvemos.',
  },
  {
    icon: 'building-2',
    title: 'Concertados con tu aseguradora',
    body: 'Conseguimos reservas prioritarias en clínicas y hospitales que ya tienen acuerdo con Sanitas, Adeslas, DKV, AXA, Mapfre, Asisa, Cigna y más. Acudes con tu tarjeta, te atienden bajo tu póliza.',
  },
  {
    icon: 'euro',
    title: 'Pagas la prioridad, no la consulta',
    body: 'Tu seguro cubre la consulta como siempre. A nosotros nos pagas una tarifa de prioridad desde 4,99 €. Sin seguro, también: te decimos el total antes de pagar.',
  },
];

export default function HomePage() {
  return (
    <>
      <AnnouncementBar />
      <Header />
      <main>

        {/* ── Hero (Ink dark) ──────────────────────────────────────────── */}
        <section className="home-hero on-inverse">
          <div className="home-hero-noise" aria-hidden="true" />
          <div className="container home-hero-inner">
            <Eyebrow dark className="animate-fade-in-up">Reserva prioritaria · con tu seguro</Eyebrow>
            <h1 className="home-heading animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
              Tu seguro cubre la consulta. Nosotros, <em>la reserva.</em>
            </h1>
            <p className="home-lede animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              Reserva prioritaria en clínicas concertadas con tu aseguradora cuando tu cuadro médico no te da cita a tiempo. Pagas solo la <strong>tarifa de prioridad</strong>.
            </p>
            <div className="animate-fade-in-up home-search-wrap" style={{ animationDelay: '0.15s' }}>
              <SearchBarV2 />
            </div>
            <p className="home-uninsured-line animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <strong>¿Sin seguro?</strong> También te conseguimos cita privada con todo incluido.
            </p>
          </div>
        </section>

        {/* ── Insurers strip ───────────────────────────────────────────── */}
        <section className="home-insurers">
          <div className="container">
            <Eyebrow className="home-insurers-label">
              Trabajamos con clínicas concertadas con tu aseguradora
            </Eyebrow>
            <div className="home-insurers-logos">
              {INSURERS.map((ins) => (
                <Image
                  key={ins.slug}
                  src={`/brand/insurers/${ins.slug}.svg`}
                  alt={ins.name}
                  width={100}
                  height={24}
                  className="home-insurer-logo"
                />
              ))}
            </div>
          </div>
        </section>

        {/* ── Value pillars ────────────────────────────────────────────── */}
        <section className="home-pillars-section">
          <div className="container">
            <Eyebrow>El atajo legítimo</Eyebrow>
            <h2 className="home-section-title">
              Cuando tu seguro <em>no te da cita</em>.
            </h2>
            <div className="home-pillars">
              {PILLARS.map((p) => (
                <div key={p.title} className="home-pillar">
                  <Icon name={p.icon} size={28} className="home-pillar-icon" />
                  <h3 className="home-pillar-title">{p.title}</h3>
                  <p className="home-pillar-desc">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works (3 steps) — existing component ─────────────── */}
        <HowItWorks />

        {/* ── Price ladder ─────────────────────────────────────────────── */}
        <section className="home-price-section">
          <div className="container">
            <Eyebrow>Tarifa de prioridad</Eyebrow>
            <h2 className="home-section-title">
              Pagas la prioridad, <em>no la consulta.</em>
            </h2>
            <p className="home-price-lede">
              Cuanta más urgencia, mayor la tarifa. Eliges tú.
            </p>
            <PriceLadder highlight={2} />
            <p className="home-price-note">
              La consulta médica la cubre tu aseguradora. Med Connect cobra solo la tarifa de prioridad, separada y desglosada.
            </p>
          </div>
        </section>

        {/* ── Trustpilot — existing component ──────────────────────────── */}
        <TrustpilotSection />

        {/* ── SEO / Info section ───────────────────────────────────────── */}
        <section className="home-seo-section">
          <div className="container">
            <Eyebrow>Lo que tu seguro no te explica</Eyebrow>
            <h2 className="home-section-title">
              Lo que aclaramos antes de que <em>lo preguntes</em>.
            </h2>
            <div className="home-seo-grid">
              <div className="home-seo-item">
                <h4>¿Por qué pagar si ya tengo seguro?</h4>
                <p>
                  Porque tu seguro te garantiza la consulta, pero no el cuándo. Cuando necesitas cita esta semana y tu cuadro médico te ofrece dentro de un mes, somos el atajo legítimo: clínicas que <strong>ya tienen acuerdo con tu aseguradora</strong>, con una reserva prioritaria reservada para ti.
                </p>
              </div>
              <div className="home-seo-item">
                <h4>Sigues siendo paciente de tu seguro</h4>
                <p>
                  Llegas a la clínica con tu tarjeta de asegurado. Te atienden bajo tu póliza. La clínica factura la consulta a tu aseguradora, no a ti. Lo único nuevo es que la cita es para mañana, no para dentro de seis semanas.
                </p>
              </div>
              <div className="home-seo-item">
                <h4>¿Qué pagas exactamente?</h4>
                <p>
                  Una <strong>tarifa de prioridad</strong>: 4,99 € si la cita es a 30+ días, 9,99 € si es esta semana, 19 € en menos de 7 días, 29 € si es en menos de 48 horas. Nada más — el acto médico es entre tu aseguradora y la clínica.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ — existing component ─────────────────────────────────── */}
        <HomeFAQ />

        {/* ── Final CTA (Ink dark) ─────────────────────────────────────── */}
        <section className="home-cta on-inverse">
          <div className="home-cta-noise" aria-hidden="true" />
          <div className="container home-cta-inner">
            <Eyebrow dark>Tu cuenta · gratis</Eyebrow>
            <h2 className="home-cta-title">
              Gestiona todas tus citas <em>en un solo lugar</em>.
            </h2>
            <p className="home-cta-lede">
              Crea tu cuenta gratuita y accede a tu historial de reservas, recibe recordatorios y gestiona tus citas desde cualquier dispositivo.
            </p>
            <div className="home-cta-actions">
              <Button href="/sign-up" variant="primary" size="lg">Crear cuenta gratis</Button>
              <Button href="/sign-in" variant="ghostInv" size="lg">Ya tengo cuenta</Button>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
