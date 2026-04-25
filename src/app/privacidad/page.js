import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Política de Privacidad — Med Connect',
  description: 'Política de privacidad y protección de datos de Med Connect conforme al RGPD y LOPDGDD.',
};

export default function PrivacidadPage() {
  return (
    <>
      <Header />
      <main className="legal-page" style={{ color: '#374151', lineHeight: '1.8' }}>
        <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: '800', color: '#1a3c5e', marginBottom: '0.5rem' }}>Política de Privacidad</h1>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '2.5rem' }}>Última actualización: abril 2026</p>

        <Section title="1. Responsable del tratamiento">
          <p><strong>Med Connect</strong> (en adelante, «la Plataforma»), operada por <strong>Saludonnet Spain SL</strong>, con domicilio en España. Contacto de privacidad: <a href="mailto:privacidad@medconnect.es" style={{ color: '#1a3c5e' }}>privacidad@medconnect.es</a></p>
        </Section>

        <Section title="2. Datos que recogemos">
          <ul>
            <li><strong>Datos de registro:</strong> nombre, email, teléfono al crear una cuenta o realizar una reserva.</li>
            <li><strong>Datos de la reserva:</strong> especialidad, fecha/hora de la cita, centro médico elegido.</li>
            <li><strong>Datos de pago:</strong> procesados por Stripe (no almacenamos datos de tarjeta).</li>
            <li><strong>Datos de navegación:</strong> dirección IP, páginas visitadas, eventos de interacción — solo si has dado tu consentimiento de cookies.</li>
          </ul>
        </Section>

        <Section title="3. Finalidades y base legal">
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', minWidth: '480px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={thStyle}>Finalidad</th>
                <th style={thStyle}>Base legal</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Gestionar la reserva de citas', 'Ejecución de contrato (art. 6.1.b RGPD)'],
                ['Enviar emails transaccionales (confirmación, recordatorio)', 'Ejecución de contrato'],
                ['Análisis de uso y mejora del servicio (GA4, Clarity)', 'Consentimiento (art. 6.1.a RGPD)'],
                ['Cumplimiento de obligaciones legales', 'Obligación legal (art. 6.1.c RGPD)'],
                ['Comunicaciones comerciales (si lo aceptas)', 'Consentimiento'],
              ].map(([fin, base], i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={tdStyle}>{fin}</td>
                  <td style={tdStyle}>{base}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Section>

        <Section title="4. Destinatarios de los datos">
          <p>Compartimos datos exclusivamente con proveedores necesarios para prestar el servicio:</p>
          <ul>
            <li><strong>Stripe</strong> — procesamiento de pagos (EEUU, cláusulas contractuales estándar)</li>
            <li><strong>Resend</strong> — envío de emails transaccionales</li>
            <li><strong>Microsoft Azure</strong> — alojamiento de base de datos (región UE)</li>
            <li><strong>Vercel</strong> — alojamiento web (EEUU, cláusulas contractuales estándar)</li>
            <li><strong>Google Analytics / Microsoft Clarity</strong> — solo si consientes cookies analíticas</li>
          </ul>
          <p>No vendemos ni cedemos tus datos a terceros para fines propios.</p>
        </Section>

        <Section title="5. Conservación de datos">
          <p>Conservamos tus datos mientras mantengas una cuenta activa y durante los plazos legales aplicables (máximo 5 años para datos contables, 3 años para datos de contacto sin actividad).</p>
        </Section>

        <Section title="6. Tus derechos">
          <p>Puedes ejercer en cualquier momento los derechos de <strong>acceso, rectificación, supresión, oposición, limitación y portabilidad</strong> escribiendo a <a href="mailto:privacidad@medconnect.es" style={{ color: '#1a3c5e' }}>privacidad@medconnect.es</a> con copia de tu DNI. También puedes reclamar ante la <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" style={{ color: '#1a3c5e' }}>Agencia Española de Protección de Datos (AEPD)</a>.</p>
        </Section>

        <Section title="7. Seguridad">
          <p>Aplicamos medidas técnicas y organizativas adecuadas: cifrado TLS en tránsito, base de datos protegida por firewall, accesos con autenticación multifactor y principio de mínimo privilegio.</p>
        </Section>

        <Section title="8. Cambios en esta política">
          <p>Notificaremos cambios relevantes por email y actualizaremos la fecha al inicio de este documento. El uso continuado del servicio tras la notificación implica la aceptación.</p>
        </Section>
      </main>
      <Footer />
    </>
  );
}

const thStyle = { padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#374151' };
const tdStyle = { padding: '10px 12px', color: '#4b5563', verticalAlign: 'top' };

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#1a3c5e', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '2px solid #e5e7eb' }}>{title}</h2>
      {children}
    </section>
  );
}
