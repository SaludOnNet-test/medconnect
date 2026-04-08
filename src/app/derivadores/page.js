'use client';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import './derivadores.css';

const loginUrl = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? '/sign-up?role=professional'
  : '/pro/login';

export default function DerivadoresPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="derivadores-hero">
          <div className="container">
            <h1 className="derivadores-hero-title animate-fade-in-up">
              Tu clínica. Más ingresos. <span>Sin inversión extra.</span>
            </h1>
            <p className="derivadores-hero-subtitle animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              Aumenta los ingresos de tu consulta de dos formas: deriva pacientes a especialistas de nuestra red, y cobra un extra por los huecos urgentes y prioritarios que ofreces a través de Med Connect — sin tocar tus tarifas con las aseguradoras.
            </p>
            <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <Link href={loginUrl} className="btn btn-gold btn-lg">
                Empezar a derivar pacientes
              </Link>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="derivadores-benefits">
          <div className="container">
            <div className="derivadores-benefit-grid">
              <div className="derivadores-benefit-card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <span className="derivadores-benefit-icon">💶</span>
                <h3 className="derivadores-benefit-title">Nuevos ingresos sin coste</h3>
                <p className="derivadores-benefit-desc">
                  Genera comisiones por cada paciente que derivas a la red, y cobra el diferencial prioritario por los huecos urgentes que ofreces desde tu propia agenda. Sin invertir en recursos, equipos ni personal. Med Connect te abona el diferencial de tiempo directamente.
                </p>
              </div>
              <div className="derivadores-benefit-card animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <span className="derivadores-benefit-icon">🏥</span>
                <h3 className="derivadores-benefit-title">Derivación interna y externa</h3>
                <p className="derivadores-benefit-desc">
                  Gestiona derivaciones dentro de tu propia clínica —entre servicios y especialidades propios— y también hacia la red premium de especialistas verificados en toda España. Tu tarifa con las aseguradoras no cambia: lo que cobras de más es el valor del tiempo urgente.
                </p>
              </div>
              <div className="derivadores-benefit-card animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                <span className="derivadores-benefit-icon">📊</span>
                <h3 className="derivadores-benefit-title">Control total, en tiempo real</h3>
                <p className="derivadores-benefit-desc">
                  Panel propio con el estado de cada paciente, confirmaciones y liquidaciones de comisiones. Y tus tarifas con aseguradoras, intactas.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="derivadores-howitworks container">
          <h2 className="derivadores-section-title">¿Cómo funciona?</h2>
          <div className="derivadores-steps">
            <div className="derivadores-step">
              <div className="derivadores-step-number">1</div>
              <div className="derivadores-step-content">
                <h3>Deriva a tu primer paciente</h3>
                <p>Selecciona un especialista de la red (o de tu propia clínica), elige fecha y horario y envíale el enlace de confirmación en menos de 60 segundos. Sin registro previo.</p>
              </div>
            </div>
            <div className="derivadores-step">
              <div className="derivadores-step-number">2</div>
              <div className="derivadores-step-content">
                <h3>Registra tu clínica <span style={{ fontSize: '0.75rem', background: 'var(--gold-light)', color: 'var(--gold)', padding: '2px 8px', borderRadius: '4px', fontWeight: '700', verticalAlign: 'middle' }}>Opcional</span></h3>
                <p>¿Quieres recibir derivaciones de otros médicos Y cobrar el extra prioritario por tus huecos urgentes? Registra tu centro, añade tus especialidades y horarios. Tu tarifa con las aseguradoras no cambia: Med Connect te abona el diferencial de tiempo directamente.</p>
              </div>
            </div>
            <div className="derivadores-step">
              <div className="derivadores-step-number">3</div>
              <div className="derivadores-step-content">
                <h3>Cobra tus comisiones automáticamente</h3>
                <p>Por cada paciente derivado que acude a cita recibes la comisión. Por cada hueco prioritario que aceptas, recibes el extra urgente. Todo liquidado directamente en tu cuenta. Sin papeleo.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="derivadores-cta-section">
          <div className="container">
            <h2 className="derivadores-cta-title">Empieza hoy. Sin compromiso. Sin coste inicial.</h2>
            <Link href={loginUrl} className="btn btn-navy btn-lg">
              Empezar a derivar pacientes
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
