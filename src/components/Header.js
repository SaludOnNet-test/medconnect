'use client';
import Link from 'next/link';
import './Header.css';

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// Conditionally load Clerk UI components — safe because env var is a build-time constant
let SignedIn = null;
let SignedOut = null;
let UserButton = null;
if (hasClerkKeys) {
  const clerk = require('@clerk/nextjs');
  SignedIn = clerk.SignedIn;
  SignedOut = clerk.SignedOut;
  UserButton = clerk.UserButton;
}

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

          {/* Auth buttons */}
          {hasClerkKeys ? (
            <>
              <SignedOut>
                <div className="header-auth">
                  <Link href="/sign-in" className="header-btn-login">Iniciar sesión</Link>
                  <Link href="/sign-up" className="header-btn-signup">Crear cuenta</Link>
                </div>
              </SignedOut>
              <SignedIn>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
            </>
          ) : (
            <div className="header-auth">
              <Link href="/sign-in" className="header-btn-login">Iniciar sesión</Link>
              <Link href="/sign-up" className="header-btn-signup">Crear cuenta</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
