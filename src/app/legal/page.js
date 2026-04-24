import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Aviso Legal — Med Connect',
  description: 'Aviso legal de Med Connect conforme a la Ley 34/2002 de Servicios de la Sociedad de la Información (LSSI).',
};

export default function LegalPage() {
  return (
    <>
      <Header />
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem 1.5rem 5rem', color: '#374151', lineHeight: '1.8' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', color: '#1a3c5e', marginBottom: '0.5rem' }}>Aviso Legal</h1>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '2.5rem' }}>En cumplimiento de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE)</p>

        <Section title="1. Datos identificativos del titular">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <tbody>
              {[
                ['Razón social', 'Saludonnet Spain SL'],
                ['Nombre comercial', 'Med Connect'],
                // CIF omitted during MVP — to be added before public launch
                ['Domicilio', 'España'],
                ['Email de contacto', 'hola@medconnect.es'],
                ['Actividad', 'Intermediación en la reserva de citas médicas privadas'],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 12px', fontWeight: '600', color: '#1a3c5e', width: '40%' }}>{k}</td>
                  <td style={{ padding: '10px 12px', color: '#4b5563' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="2. Objeto y ámbito de aplicación">
          <p>El presente Aviso Legal regula el acceso y uso del sitio web <strong>www.medconnect.es</strong> (en adelante, «el Sitio»). El acceso implica la aceptación de las presentes condiciones.</p>
          <p>Med Connect actúa como <strong>intermediario tecnológico</strong> entre pacientes y centros médicos privados. No presta servicios médicos directamente y no es responsable del contenido clínico de las consultas ni de los actos médicos realizados por los profesionales o centros.</p>
        </Section>

        <Section title="3. Condiciones de uso">
          <ul>
            <li>El usuario se compromete a hacer un uso lícito del Sitio, respetando la legislación vigente y los derechos de terceros.</li>
            <li>Está prohibido usar el Sitio para fines comerciales no autorizados, enviar spam o intentar acceder a sistemas no públicos.</li>
            <li>Med Connect se reserva el derecho de suspender el acceso a usuarios que incumplan estas condiciones.</li>
          </ul>
        </Section>

        <Section title="4. Propiedad intelectual e industrial">
          <p>Todos los contenidos del Sitio (textos, imágenes, logotipos, código fuente, diseño) son propiedad de Saludonnet Spain SL o de sus licenciantes y están protegidos por la legislación española e internacional sobre propiedad intelectual. Queda prohibida su reproducción sin autorización expresa.</p>
        </Section>

        <Section title="5. Exclusión de responsabilidad">
          <ul>
            <li><strong>Disponibilidad:</strong> Med Connect no garantiza la disponibilidad ininterrumpida del Sitio y podrá suspenderlo temporalmente por mantenimiento.</li>
            <li><strong>Contenido médico:</strong> La información publicada tiene carácter divulgativo. No sustituye el diagnóstico ni el consejo médico profesional.</li>
            <li><strong>Enlaces externos:</strong> No somos responsables del contenido de sitios web de terceros enlazados desde el Sitio.</li>
          </ul>
        </Section>

        <Section title="6. Legislación aplicable y jurisdicción">
          <p>Este Aviso Legal se rige por la legislación española. Para cualquier controversia derivada del uso del Sitio, las partes se someten a los Juzgados y Tribunales del domicilio del usuario, salvo que la normativa aplicable disponga otro fuero.</p>
        </Section>

        <Section title="7. Contacto">
          <p>Para cualquier consulta legal: <a href="mailto:legal@medconnect.es" style={{ color: '#1a3c5e' }}>legal@medconnect.es</a></p>
        </Section>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#1a3c5e', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '2px solid #e5e7eb' }}>{title}</h2>
      {children}
    </section>
  );
}
