'use client';
import Link from 'next/link';
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
          <a href="tel:+34900123456" className="header-phone">
            <span className="header-phone-icon">📞</span>
            <div className="header-phone-block">
              <span className="header-phone-label">¿Dudas? Llámanos</span>
              <span className="header-phone-number">900 123 456</span>
            </div>
          </a>

          {/* Auth buttons — static links; Clerk redirects if already signed in */}
          <div className="header-auth">
            <Link href="/sign-in" className="header-btn-login">Iniciar sesión</Link>
            <Link href="/sign-up" className="header-btn-signup">Crear cuenta</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
