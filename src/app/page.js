import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SearchBarV2 from '@/components/SearchBarV2';
import TrustpilotSection from '@/components/TrustpilotSection';
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
              <p className="home-tagline animate-fade-in-up">Citas Premium con Med Connect</p>
              <h1 className="home-heading animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
                Tu cita médica privada,<br />sin esperas
              </h1>
              <h2 className="home-subheading animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                La clínica, hospital o médico que quieras, en el momento que desees.
              </h2>
              <div className="animate-fade-in-up" style={{ animationDelay: '0.15s', width: '100%' }}>
                <SearchBarV2 />
              </div>
            </div>
          </div>
        </section>

        {/* ── Value Pillars ───────────────────────────────────────────── */}
        <section className="container">
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)', paddingTop: 'var(--space-2xl)' }}>
            <h2 style={{ fontSize: '1.8rem', color: 'var(--navy)', marginBottom: 'var(--space-sm)' }}>
              La alternativa premium a las listas de espera
            </h2>
          </div>
          <div className="home-pillars">
            <div className="home-pillar">
              <span className="home-pillar-icon" style={{ borderRadius: '50%', background: 'var(--gold-light)', color: 'var(--gold)', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto var(--space-md)' }}>⚡</span>
              <h3 className="home-pillar-title">Acceso prioritario inmediato</h3>
              <p className="home-pillar-desc">
                Reserva cita con el especialista que necesitas en tu ciudad sin esperar semanas. Selecciona la fecha que te conviene y listo.
              </p>
            </div>
            <div className="home-pillar">
              <span className="home-pillar-icon" style={{ borderRadius: '50%', background: 'var(--gold-light)', color: 'var(--gold)', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto var(--space-md)' }}>🏥</span>
              <h3 className="home-pillar-title">Los mejores centros de España</h3>
              <p className="home-pillar-desc">
                Red de hospitales y clínicas privadas verificados. Con o sin seguro médico, tú eliges el centro y la especialidad.
              </p>
            </div>
            <div className="home-pillar">
              <span className="home-pillar-icon" style={{ borderRadius: '50%', background: 'var(--gold-light)', color: 'var(--gold)', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto var(--space-md)' }}>🛡️</span>
              <h3 className="home-pillar-title">Seguridad y transparencia total</h3>
              <p className="home-pillar-desc">
                Precios claros desde el primer clic. Sin sorpresas, sin carencias y con gestión profesional de tu agenda de salud.
              </p>
            </div>
          </div>
        </section>

        {/* ── Trustpilot Reviews ──────────────────────────────────────── */}
        <TrustpilotSection />

        {/* ── SEO / Info Section ──────────────────────────────────────── */}
        <section className="container">
          <div className="home-seo-info" style={{ padding: 'var(--space-2xl) 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2rem', marginBottom: 'var(--space-lg)' }}>Reserva en 60 segundos, sin listas de espera</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-xl)', textAlign: 'left' }}>
              <div>
                <h4 style={{ color: 'var(--gold)', marginBottom: 'var(--space-sm)' }}>Agendamiento Médico Digital</h4>
                <p style={{ color: 'var(--muted)', lineHeight: '1.8' }}>
                  Med Connect es la solución definitiva para quienes buscan citas médicas privadas inmediatas en Madrid, Barcelona, Valencia y el resto de España. Olvídate de las demoras de la sanidad pública con nuestro sistema de prioridad total.
                </p>
              </div>
              <div>
                <h4 style={{ color: 'var(--gold)', marginBottom: 'var(--space-sm)' }}>Atención 24/7 sin Listas de Espera</h4>
                <p style={{ color: 'var(--muted)', lineHeight: '1.8' }}>
                  Accede a videoconsulta ilimitada con médico de familia y resuelve tus dudas al instante a través de nuestro chat médico. Garantizamos una respuesta asistencial de excelencia, diseñada para integrarse en tu ritmo de vida.
                </p>
              </div>
              <div>
                <h4 style={{ color: 'var(--gold)', marginBottom: 'var(--space-sm)' }}>Especialistas y Hospitales Top</h4>
                <p style={{ color: 'var(--muted)', lineHeight: '1.8' }}>
                  Nuestra red incluye los centros más prestigiosos para que puedas reservar tu especialista privado con la seguridad de una gestión profesional, transparente y sin carencias.
                </p>
              </div>
            </div>
          </div>
        </section>

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
            <p className="home-trust-label">Aseguradoras compatibles</p>
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
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
