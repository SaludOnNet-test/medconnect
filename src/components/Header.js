'use client';
import Link from 'next/link';
import './Header.css';

export default function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="header-logo">
          Med<span className="header-logo-accent">Connect</span>
        </Link>

        <div className="header-right">
          <Link href="/derivadores" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gold)' }}>
            Derivar un paciente
          </Link>
          <a href="tel:+34900123456" className="header-phone">
            <span className="header-phone-icon">📞</span>
            <div className="header-phone-block">
              <span className="header-phone-label">¿Dudas? Llámanos</span>
              <span className="header-phone-number">900 123 456</span>
            </div>
          </a>
        </div>
      </div>
    </header>
  );
}
