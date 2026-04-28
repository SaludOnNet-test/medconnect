import Link from 'next/link';
import Image from 'next/image';
import './Footer.css';

/**
 * Brand 2026 footer — 4-column layout matching `RFooter` from the design
 * kit. Bone 300 surface on the bottom with brand logo + tagline + three
 * link columns and a baseline row with copyright + legal sublinks.
 */
const COLUMNS = [
  {
    title: 'Producto',
    links: [
      ['Cómo funciona', '/como-funciona'],
      ['Aseguradoras', '/aseguradoras'],
      ['Tarifa de prioridad', '/como-funciona#tarifas'],
    ],
  },
  {
    title: 'Profesionales',
    links: [
      ['Vender huecos', '/para-clinicas-o-medicos#vender-huecos'],
      ['Derivar pacientes', '/para-clinicas-o-medicos#derivar-pacientes'],
    ],
  },
  {
    title: 'Soporte',
    links: [
      ['FAQ', '/faq'],
      ['Contacto', '/contacto'],
      ['hola@medconnect.es', 'mailto:hola@medconnect.es'],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Image
            src="/brand/logo-medconnect.svg"
            alt="Med Connect"
            width={170}
            height={26}
            className="footer-logo"
          />
          <p className="footer-tag">
            Reserva prioritaria en clínicas concertadas con tu aseguradora.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title} className="footer-col">
            <div className="footer-col-title">{col.title}</div>
            <ul className="footer-col-links">
              {col.links.map(([label, href]) => (
                <li key={href + label}>
                  {href.startsWith('mailto:')
                    ? <a href={href}>{label}</a>
                    : <Link href={href}>{label}</Link>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="footer-baseline">
        <div className="footer-copy">
          © 2026 Med Connect — Saludonnet Worldwide Medical Network SL.
        </div>
        <div className="footer-legal-links">
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/legal">Aviso legal</Link>
          <Link href="/cookies">Cookies</Link>
        </div>
      </div>
    </footer>
  );
}
