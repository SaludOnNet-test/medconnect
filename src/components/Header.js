'use client';
import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import './Header.css';

/**
 * Header — sticky nav bar.
 *
 * Auth buttons use Clerk's <SignedIn> / <SignedOut> wrappers.
 * These are safe to import always: they render nothing when
 * ClerkProvider is absent (no keys configured), so there is
 * no runtime error in environments without Clerk keys.
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

          {/* Auth buttons — Clerk components handle signed-in / signed-out state automatically */}
          <div className="header-auth">
            <SignedOut>
              <Link href="/sign-in" className="header-btn-login">Iniciar sesión</Link>
              <Link href="/sign-up" className="header-btn-signup">Crear cuenta</Link>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </div>
      </div>
    </header>
  );
}
