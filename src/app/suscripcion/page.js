'use client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import './suscripcion.css';

export default function SuscripcionPage() {
  return (
    <>
      <Header />
      <main className="suscripcion-page">
        <section className="suscripcion-hero">
          <div className="container">
            <h1 className="suscripcion-title">Med<span>Connect</span> Plus</h1>
            <p className="suscripcion-subtitle">
              La forma más inteligente y exclusiva de cuidar tu salud. Prioridad total inmediata y servicios digitales ilimitados.
            </p>
          </div>
        </section>

        <section className="container">
          <div className="suscripcion-grid">
            <div className="suscripcion-card">
              <div className="suscripcion-card-header">
                <h3>Plan Mensual</h3>
                <div className="suscripcion-price">7.99€<span>/mes</span></div>
                <p className="suscripcion-note">Sin compromiso de permanencia</p>
              </div>
              <ul className="suscripcion-features">
                <li>✅ <strong>Hasta 3 citas Súper rápidas</strong> al mes sin coste de urgencia.</li>
                <li>✅ Videoconsulta ilimitada (Médico de Familia).</li>
                <li>✅ Chat médico 24/7 ilimitado.</li>
                <li>✅ Acceso exclusivo para el titular.</li>
              </ul>
              <button className="btn btn-navy" style={{ width: '100%' }}>Suscribirme ahora</button>
            </div>

            <div className="suscripcion-card featured">
              <div className="suscripcion-card-badge">MEJOR VALOR</div>
              <div className="suscripcion-card-header">
                <h3>Plan Anual</h3>
                <div className="suscripcion-price">71.88€<span>/año</span></div>
                <p className="suscripcion-note">Equivale a <strong>5.99€/mes</strong></p>
              </div>
              <ul className="suscripcion-features">
                <li>✅ <strong>Hasta 3 citas Súper rápidas</strong> al mes incluidas.</li>
                <li>✅ Videoconsulta y Chat 24/7 ilimitados.</li>
                <li>✅ Acceso prioritario garantizado YA.</li>
                <li>✅ Ahorro del 25% respecto al mensual.</li>
              </ul>
              <button className="btn btn-gold" style={{ width: '100%' }}>Suscribirme y Ahorrar</button>
            </div>
          </div>
        </section>

        <section className="container suscripcion-faq">
          <h2>¿Por qué Med Connect Plus?</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h4>¿A quién cubre la suscripción?</h4>
              <p>El plan es personal e intransferible, cubriendo exclusivamente al titular de la cuenta para sus necesidades médicas.</p>
            </div>
            <div className="faq-item">
              <h4>¿Qué servicios digitales incluye?</h4>
              <p>Incluye acceso ilimitado a videoconsultas con médicos de familia y un chat médico disponible las 24 horas del día para resolver cualquier duda al instante.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
