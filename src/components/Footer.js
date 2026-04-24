import Link from 'next/link';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          Med<span>Connect</span>
        </div>
        <div className="footer-links">
          <Link href="/privacidad">Política de Privacidad</Link>
          <Link href="/legal">Aviso Legal</Link>
          <Link href="/cookies">Política de Cookies</Link>
          <a href="mailto:hola@medconnect.es">Contacto</a>
        </div>
        <div className="footer-copy">
          © 2026 Med Connect — Saludonnet Spain SL. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
