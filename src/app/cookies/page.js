import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Eyebrow from '@/components/brand/Eyebrow';

export const metadata = {
  title: 'Política de Cookies — Med Connect',
  description: 'Información sobre las cookies que usa Med Connect y cómo gestionarlas.',
};

const COOKIES = [
  ['mc_cookie_consent', 'Med Connect', 'Técnica', 'Guarda tu elección sobre cookies', '1 año'],
  ['mc_sid', 'Med Connect', 'Técnica', 'Identificador de sesión anónimo para analytics interno', 'Sesión'],
  ['_ga, _ga_*', 'Google Analytics', 'Analítica', 'Mide visitas y comportamiento de usuarios (solo con consentimiento)', '2 años'],
  ['_clck, _clsk', 'Microsoft Clarity', 'Analítica', 'Grabaciones de sesión y heatmaps (solo con consentimiento)', '1 año'],
];

export default function CookiesPage() {
  return (
    <>
      <Header />
      <main className="legal-page">
        <Eyebrow style={{ marginBottom: 'var(--space-3)' }}>Política de cookies</Eyebrow>
        <h1 className="legal-title">Las cookies que usamos.</h1>
        <p className="legal-sub">Última actualización: abril 2026.</p>

        <p>De acuerdo con el artículo 22.2 de la LSSI y el Reglamento (UE) 2016/679 (RGPD), te informamos sobre las cookies que utilizamos.</p>

        <Section title="¿Qué son las cookies?">
          <p>Las cookies son pequeños archivos que se almacenan en tu dispositivo cuando visitas un sitio web. Permiten que el sitio recuerde tus preferencias y analice cómo lo usas.</p>
        </Section>

        <Section title="Cookies que usamos">
          <div className="table-scroll">
            <table className="legal-table legal-table--cookies">
              <thead>
                <tr>
                  {['Cookie', 'Proveedor', 'Tipo', 'Finalidad', 'Duración'].map((h) => (
                    <th key={h} scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COOKIES.map(([cookie, proveedor, tipo, fin, dur], i) => (
                  <tr key={i}>
                    <td><code>{cookie}</code></td>
                    <td>{proveedor}</td>
                    <td>
                      <span className={`legal-pill legal-pill--${tipo === 'Técnica' ? 'success' : 'warn'}`}>
                        {tipo}
                      </span>
                    </td>
                    <td>{fin}</td>
                    <td>{dur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="legal-note">
            Las cookies técnicas (mc_cookie_consent, mc_sid) son necesarias para el funcionamiento básico y no requieren consentimiento. Las analíticas solo se activan si las aceptas.
          </p>
        </Section>

        <Section title="Cómo gestionar tus preferencias">
          <p>Puedes cambiar tu elección en cualquier momento:</p>
          <ul>
            <li><strong>Desde este sitio:</strong> borra la cookie <code>mc_cookie_consent</code> de tu navegador y recarga la página — volverá a aparecer el banner.</li>
            <li><strong>Desde tu navegador:</strong> todos los navegadores modernos permiten bloquear o eliminar cookies desde Configuración → Privacidad.</li>
            <li><strong>Google Analytics:</strong> puedes instalar el <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">complemento de inhabilitación</a>.</li>
          </ul>
        </Section>

        <Section title="Más información">
          <p>
            Consulta nuestra <a href="/privacidad">Política de Privacidad</a> para más detalles sobre el tratamiento de datos personales.
            Contacto: <a href="mailto:privacidad@medconnect.es">privacidad@medconnect.es</a>
          </p>
        </Section>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, children }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      <div className="legal-section-body">{children}</div>
    </section>
  );
}
