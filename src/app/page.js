import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SearchBarV2 from '@/components/SearchBarV2';
import TrustpilotSection from '@/components/TrustpilotSection';
import HowItWorks from '@/components/HowItWorks';
import HomeFAQ from '@/components/HomeFAQ';
import './home.css';

const INSURERS = [
  { name: 'Sanitas',  color: '#e30613' },
  { name: 'Adeslas',  color: '#005eaa' },
  { name: 'DKV',      color: '#0070b8' },
  { name: 'AXA',      color: '#00008f' },
  { name: 'Mapfre',   color: '#c8102e' },
  { name: 'Asisa',    color: '#004b87' },
  { name: 'Cigna',    color: '#007a8c' },
];

export default function HomePage() {
  return (
    <>
      <Header />
      <main>

        {/* ── Hero + SearchBarV2 ──────────────────────────────────────── */}
        <section className="home-hero">
          <div className="container">
            <div className="home-search-section">
              <p className="home-tagline animate-fade-in-up">Cita prioritaria con tu seguro médico</p>
              <h1 className="home-heading animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
                Tu seguro cubre la consulta.<br />Nosotros, la reserva.
              </h1>
              <h2 className="home-subheading animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <strong>Reserva prioritaria</strong> en clínicas concertadas con tu aseguradora cuando tu cuadro médico no te da cita a tiempo. Pagas solo la <strong>tarifa de prioridad</strong>.
              </h2>
              <div className="animate-fade-in-up" style={{ animationDelay: '0.15s', width: '100%' }}>
                <SearchBarV2 />
              </div>
              <p className="home-uninsured-line animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <strong><u>¿Sin seguro?</u></strong> También te conseguimos cita privada con todo incluido.
              </p>
            </div>
          </div>
        </section>

        {/* ── Value Pillars ───────────────────────────────────────────── */}
        <section className="container">
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)', paddingTop: 'var(--space-2xl)' }}>
            <h2 style={{ fontSize: '1.8rem', color: 'var(--navy)', marginBottom: 'var(--space-sm)' }}>
              El atajo legítimo cuando tu seguro no te da cita
            </h2>
          </div>
          <div className="home-pillars">
            <div className="home-pillar">
              <span className="home-pillar-icon" style={{ borderRadius: '50%', background: 'var(--gold-light)', color: 'var(--gold)', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto var(--space-md)' }}>⚡</span>
              <h3 className="home-pillar-title">La reserva que tu seguro no encuentra</h3>
              <p className="home-pillar-desc">
                Tu cuadro médico está saturado y tu app del seguro te ofrece fechas a 3-6 semanas. Llevas días llamando a clínicas. Ese es exactamente el problema que resolvemos.
              </p>
            </div>
            <div className="home-pillar">
              <span className="home-pillar-icon" style={{ borderRadius: '50%', background: 'var(--gold-light)', color: 'var(--gold)', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto var(--space-md)' }}>🏥</span>
              <h3 className="home-pillar-title">Concertados con tu aseguradora</h3>
              <p className="home-pillar-desc">
                Conseguimos reservas prioritarias en clínicas y hospitales que ya tienen acuerdo con Sanitas, Adeslas, DKV, AXA, Mapfre, Asisa, Cigna y más. Acudes con tu tarjeta, te atienden bajo tu póliza.
              </p>
            </div>
            <div className="home-pillar">
              <span className="home-pillar-icon" style={{ borderRadius: '50%', background: 'var(--gold-light)', color: 'var(--gold)', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto var(--space-md)' }}>💶</span>
              <h3 className="home-pillar-title">Pagas la prioridad, no la consulta</h3>
              <p className="home-pillar-desc">
                Tu seguro cubre la consulta como siempre. A nosotros nos pagas una <strong>tarifa de prioridad</strong> desde 0,99 €. Sin seguro, también: te decimos el total antes de pagar.
              </p>
            </div>
          </div>
        </section>

        {/* ── How It Works (3 steps) ──────────────────────────────────── */}
        <HowItWorks />

        {/* ── Trustpilot Reviews ──────────────────────────────────────── */}
        <TrustpilotSection />

        {/* ── SEO / Info Section ──────────────────────────────────────── */}
        <section className="container">
          <div className="home-seo-info" style={{ padding: 'var(--space-2xl) 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2rem', marginBottom: 'var(--space-lg)' }}>Lo que tu seguro no te explica</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-xl)', textAlign: 'left' }}>
              <div>
                <h4 style={{ color: 'var(--gold)', marginBottom: 'var(--space-sm)' }}>¿Por qué pagar si ya tengo seguro?</h4>
                <p style={{ color: 'var(--muted)', lineHeight: '1.8' }}>
                  Porque tu seguro te garantiza la consulta, pero no el cuándo. Cuando necesitas cita esta semana y tu cuadro médico te ofrece dentro de un mes, somos el atajo legítimo: clínicas que <strong>ya tienen acuerdo con tu aseguradora</strong>, con una reserva prioritaria reservada para ti.
                </p>
              </div>
              <div>
                <h4 style={{ color: 'var(--gold)', marginBottom: 'var(--space-sm)' }}>Sigues siendo paciente de tu seguro</h4>
                <p style={{ color: 'var(--muted)', lineHeight: '1.8' }}>
                  Llegas a la clínica con tu tarjeta de asegurado. Te atienden bajo tu póliza. La clínica factura la consulta a tu aseguradora, no a ti. Lo único nuevo es que la cita es para mañana, no para dentro de seis semanas.
                </p>
              </div>
              <div>
                <h4 style={{ color: 'var(--gold)', marginBottom: 'var(--space-sm)' }}>¿Qué pagas exactamente?</h4>
                <p style={{ color: 'var(--muted)', lineHeight: '1.8' }}>
                  Una <strong>tarifa de prioridad</strong>: desde 0,99 € si la cita es a 30+ días, 9,99 € si es esta semana, 25 € si es en menos de 48 horas. Nada más — el acto médico es entre tu aseguradora y la clínica.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ del modelo ──────────────────────────────────────────── */}
        <HomeFAQ />

        {/* ── Account CTA ─────────────────────────────────────────────── */}
        <section className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-2xl)' }}>
          <div style={{ background: 'var(--navy)', borderRadius: 'var(--radius-lg)', padding: '3rem 2rem', textAlign: 'center', color: '#fff' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.75rem' }}>
              Gestiona todas tus citas en un solo lugar
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.75)', maxWidth: '520px', margin: '0 auto 1.75rem', lineHeight: '1.7' }}>
              Crea tu cuenta gratuita y accede a tu historial de reservas, recibe recordatorios y gestiona tus citas desde cualquier dispositivo.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/sign-up" style={{ padding: '0.75rem 2rem', borderRadius: '8px', background: 'var(--gold)', color: 'var(--navy)', fontWeight: '700', fontSize: '1rem', display: 'inline-block' }}>
                Crear cuenta gratis
              </Link>
              <Link href="/sign-in" style={{ padding: '0.75rem 2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', fontWeight: '600', fontSize: '1rem', display: 'inline-block' }}>
                Ya tengo cuenta
              </Link>
            </div>
          </div>
        </section>

        {/* ── Trust bar ───────────────────────────────────────────────── */}
        <section className="container">
          <div className="home-trust">
            <p className="home-trust-label">Trabajamos con clínicas concertadas con tu aseguradora</p>
            <div className="home-trust-logos">
              {INSURERS.map((ins) => (
                <span
                  key={ins.name}
                  className="home-trust-logo"
                  style={{ borderLeft: `3px solid ${ins.color}` }}
                >
                  {ins.name}
                </span>
              ))}
            </div>
            <p className="home-trust-note">
              Si tu aseguradora aparece, las clínicas que te mostramos ya tienen concierto con ella. Tú no pagas la consulta.
            </p>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
