'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import './Header.css';

/**
 * Header — sticky nav bar.
 *
 * Auth links are static: Clerk handles the redirect if the user
 * is already signed in (they are bounced to AFTER_SIGN_IN_URL).
 *
 * NOTE: Calling Clerk hooks (useAuth) here causes SSG failures because
 * ClerkProvider cannot verify session state at build time. Static links
 * are the safe pattern for App Router + SSG pages.
 */

export default function Header() {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);

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
        <Link href="/" className="header-logo">
          Med<span className="header-logo-accent">Connect</span>
        </Link>

        <div className="header-right">
          <Link href="/derivadores" className="header-link-pro">
            Derivar un paciente
          </Link>
          <a href="tel:+34900123456" className="header-phone" aria-label="Llamar al 900 123 456">
            <span className="header-phone-icon">📞</span>
            <div className="header-phone-block">
              <span className="header-phone-label">¿Tu seguro no te da cita? Llámanos</span>
              <span className="header-phone-number">900 123 456</span>
            </div>
          </a>

          {/* Desktop: two separate buttons. Mobile: single "Acceder" with dropdown. */}
          <div className="header-auth">
            <Link href="/sign-in" className="header-btn-login">Iniciar sesión</Link>
            <Link href="/sign-up" className="header-btn-signup">Crear cuenta</Link>
          </div>

          <div className="header-account" ref={accountRef}>
            <button
              type="button"
              className="header-btn-account"
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((v) => !v)}
            >
              Acceder
              <span className="header-btn-account-caret" aria-hidden="true">▾</span>
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
