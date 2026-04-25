import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Política de Cookies — Med Connect',
  description: 'Información sobre las cookies que usa Med Connect y cómo gestionarlas.',
};

export default function CookiesPage() {
  return (
    <>
      <Header />
      <main className="legal-page" style={{ color: '#374151', lineHeight: '1.8' }}>
        <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: '800', color: '#1a3c5e', marginBottom: '0.5rem' }}>Política de Cookies</h1>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '2.5rem' }}>Última actualización: abril 2026</p>

        <p>De acuerdo con el artículo 22.2 de la LSSI y el Reglamento (UE) 2016/679 (RGPD), te informamos sobre las cookies que utilizamos.</p>

        <Section title="¿Qué son las cookies?">
          <p>Las cookies son pequeños archivos que se almacenan en tu dispositivo cuando visitas un sitio web. Permiten que el sitio recuerde tus preferencias y analice cómo lo usas.</p>
        </Section>

        <Section title="Cookies que usamos">
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', minWidth: '560px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                {['Cookie', 'Proveedor', 'Tipo', 'Finalidad', 'Duración'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['mc_cookie_consent', 'Med Connect', 'Técnica', 'Guarda tu elección sobre cookies', '1 año'],
                ['mc_sid', 'Med Connect', 'Técnica', 'Identificador de sesión anónimo para analytics interno', 'Sesión'],
                ['_ga, _ga_*', 'Google Analytics', 'Analítica', 'Mide visitas y comportamiento de usuarios (solo con consentimiento)', '2 años'],
                ['_clck, _clsk', 'Microsoft Clarity', 'Analítica', 'Grabaciones de sesión y heatmaps (solo con consentimiento)', '1 año'],
              ].map(([cookie, proveedor, tipo, fin, dur], i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{cookie}</td>
                  <td style={{ padding: '10px 12px' }}>{proveedor}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ background: tipo === 'Técnica' ? '#dcfce7' : '#fef9c3', color: tipo === 'Técnica' ? '#166534' : '#854d0e', padding: '2px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600' }}>{tipo}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#4b5563' }}>{fin}</td>
                  <td style={{ padding: '10px 12px', color: '#4b5563' }}>{dur}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.75rem' }}>
            Las cookies técnicas (mc_cookie_consent, mc_sid) son necesarias para el funcionamiento básico y no requieren consentimiento. Las analíticas solo se activan si las aceptas.
          </p>
        </Section>

        <Section title="Cómo gestionar tus preferencias">
          <p>Puedes cambiar tu elección en cualquier momento:</p>
          <ul>
            <li><strong>Desde este sitio:</strong> borra la cookie <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: '3px' }}>mc_cookie_consent</code> de tu navegador y recarga la página — volverá a aparecer el banner.</li>
            <li><strong>Desde tu navegador:</strong> todos los navegadores modernos permiten bloquear o eliminar cookies desde Configuración → Privacidad.</li>
            <li><strong>Google Analytics:</strong> puedes instalar el <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" style={{ color: '#1a3c5e' }}>complemento de inhabilitación</a>.</li>
          </ul>
        </Section>

        <Section title="Más información">
          <p>
            Consulta nuestra <a href="/privacidad" style={{ color: '#1a3c5e' }}>Política de Privacidad</a> para más detalles sobre el tratamiento de datos personales.
            Contacto: <a href="mailto:privacidad@medconnect.es" style={{ color: '#1a3c5e' }}>privacidad@medconnect.es</a>
          </p>
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
