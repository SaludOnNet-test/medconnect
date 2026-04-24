'use client';
import Link from 'next/link';
import './Header.css';

/**
 * Header — sticky nav bar.
 *
 * Auth state is derived from Clerk's useAuth hook (available in all
 * @clerk/nextjs versions). The conditional require pattern is safe
 * because NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a build-time constant —
 * Turbopack evaluates it statically and tree-shakes the unused branch.
 *
 * Note: SignedIn / SignedOut wrapper components require @clerk/nextjs v5+.
 * This project uses an earlier version, so we use useAuth + UserButton instead.
 */

const hasClerkKeys = !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

// useAuth and UserButton are available in all @clerk/nextjs versions
let useClerkAuth = () => ({ isLoaded: true, isSignedIn: false });
let ClerkUserButton = null;
if (hasClerkKeys) {
  const clerk = require('@clerk/nextjs');
  useClerkAuth = clerk.useAuth;
  ClerkUserButton = clerk.UserButton;
}

export default function Header() {
  const { isLoaded, isSignedIn } = useClerkAuth();

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
          <div className="header-auth">
            {hasClerkKeys && isLoaded && isSignedIn && ClerkUserButton ? (
              <ClerkUserButton afterSignOutUrl="/" />
            ) : (
              <>
                <Link href="/sign-in" className="header-btn-login">Iniciar sesión</Link>
                <Link href="/sign-up" className="header-btn-signup">Crear cuenta</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
