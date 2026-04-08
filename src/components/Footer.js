import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          Prior<span>Salus</span>
        </div>
        <div className="footer-links">
          <a href="#">Política de Privacidad</a>
          <a href="#">Términos de Uso</a>
          <a href="#">Contacto</a>
        </div>
        <div className="footer-copy">
          © 2026 Med Connect. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
