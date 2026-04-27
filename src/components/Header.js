'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Button from '@/components/brand/Button';
import Icon from '@/components/icons/Icon';
import './Header.css';

/**
 * Brand 2026 sticky nav bar.
 *
 * Layout: logo · 4-link primary nav · auth.
 *
 * Auth links are static: Clerk handles the redirect if the user is already
 * signed in (bounced to AFTER_SIGN_IN_URL). NOTE: calling Clerk hooks
 * (useAuth) here causes SSG failures — keep these as plain links.
 *
 * Some target routes (/como-funciona, /aseguradoras, /para-clinicas, /faq)
 * are still being built in subsequent brand-redesign PRs. Until then they
 * 404 — that's intentional for the migration window.
 */

const NAV = [
  { href: '/',              label: 'Inicio' },
  { href: '/como-funciona', label: 'Cómo funciona' },
  { href: '/aseguradoras',  label: 'Aseguradoras' },
  { href: '/para-clinicas', label: 'Para clínicas' },
  { href: '/derivadores',   label: 'Derivar paciente' },
  { href: '/faq',           label: 'FAQ' },
];

export default function Header() {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!accountOpen) return;
    function onDocClick(e) {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountOpen(false);
      }
    }
    function onEsc(e) {
      if (e.key === 'Escape') setAccountOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [accountOpen]);

  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="header-logo" aria-label="Med Connect — Inicio">
          <Image
            src="/brand/logo-medconnect.svg"
            alt="Med Connect"
            width={210}
            height={32}
            priority
            className="header-logo-img"
          />
        </Link>

        <nav className="header-nav" aria-label="Navegación principal">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`header-nav-link${active ? ' header-nav-link--active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="header-right">
          <a
            href="tel:+34912172193"
            className="header-phone"
            aria-label="Llamar al 91 217 21 93"
          >
            <Icon name="phone" size={16} className="header-phone-icon" />
            <span className="header-phone-block">
              <span className="header-phone-label">¿Tu seguro no te da cita?</span>
              <span className="header-phone-number">91 217 21 93</span>
            </span>
          </a>

          {/* Desktop: signin link + signup primary button. */}
          <div className="header-auth">
            <Link href="/sign-in" className="header-btn-login">Iniciar sesión</Link>
            <Button href="/sign-up" variant="primary" size="sm">Crear cuenta</Button>
          </div>

          {/* Mobile: single "Acceder" dropdown. */}
          <div className="header-account" ref={accountRef}>
            <button
              type="button"
              className="header-btn-account"
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((v) => !v)}
            >
              Acceder
              <Icon name={accountOpen ? 'chevron-up' : 'chevron-down'} size={14} />
            </button>
            {accountOpen && (
              <div className="header-account-menu" role="menu">
                <Link
                  href="/sign-up"
                  className="header-account-menu-item"
                  role="menuitem"
                  onClick={() => setAccountOpen(false)}
                >
                  Crear cuenta
                </Link>
                <Link
                  href="/sign-in"
                  className="header-account-menu-item"
                  role="menuitem"
                  onClick={() => setAccountOpen(false)}
                >
                  Iniciar sesión
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
