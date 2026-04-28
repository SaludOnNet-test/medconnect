'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import Button from '@/components/brand/Button';
import Icon from '@/components/icons/Icon';
import './Header.css';

// Note: Clerk v7 moved <SignedIn>/<SignedOut> to server-only
// (`@clerk/nextjs/app-router/server/controlComponents`); we can't use them
// in this 'use client' file. The Header decides which auth UI to show
// from `useUser()`. Until Clerk hydrates, isLoaded is false and we paint
// the signed-out shell so the static prerender stays stable.

/**
 * Brand 2026 sticky nav bar.
 *
 * Layout: logo · 4-link primary nav · auth.
 *
 * Auth state — once Clerk JS finishes loading on the client we swap the
 * "Iniciar sesión / Crear cuenta" CTAs for a user-area dropdown so signed-
 * in users don't see a header that looks like they're logged out (the
 * exact bug that came up after we cut over to the prod Clerk instance:
 * users would create an account, get verified, then see the same
 * sign-in/sign-up buttons in the header and assume they'd been logged
 * out). The swap happens only after `isMounted` flips to true so the
 * static prerender keeps rendering the signed-out shell — avoids the
 * SSG/hydration mismatch the old comment warned about.
 *
 * Some target routes (/como-funciona, /aseguradoras, /para-clinicas, /faq)
 * are still being built in subsequent brand-redesign PRs. Until then they
 * 404 — that's intentional for the migration window.
 */

// Inline auth dropdown for the signed-in state. The parent only mounts
// this when `useUser()` reports a signed-in user, so we can use the
// hooks freely here.
function SignedInArea() {
  const { user } = useUser();
  const clerk = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Read the role from the Clerk user. Only pros / admins see the
  // "Panel profesional" link in the dropdown.
  const role = user?.publicMetadata?.role;

  // user is guaranteed non-null inside <SignedIn>, but keep a guard for the
  // brief instant before Clerk has populated the user object.
  if (!user) return null;

  const initial = (user.firstName?.[0] || user.primaryEmailAddress?.emailAddress?.[0] || '?').toUpperCase();
  const label = user.fullName || user.primaryEmailAddress?.emailAddress || 'Mi cuenta';

  return (
    <div className="header-account header-account--signed-in" ref={ref}>
      <button
        type="button"
        className="header-btn-account header-btn-account--avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="header-avatar" aria-hidden="true">{initial}</span>
        <span className="header-account-label">{label}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
      </button>
      {open && (
        <div className="header-account-menu" role="menu">
          {/* "Panel profesional" only makes sense for users with a
              professional / admin role — patients see only "Cerrar
              sesión". The middleware on /pro/dashboard would bounce
              them out anyway, but hiding the link avoids confusion. */}
          {(role === 'professional' || role === 'admin') && (
            <Link
              href="/pro/dashboard"
              className="header-account-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Panel profesional
            </Link>
          )}
          <button
            type="button"
            className="header-account-menu-item header-account-menu-item--danger"
            role="menuitem"
            onClick={() => { setOpen(false); clerk.signOut({ redirectUrl: '/' }); }}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

const NAV = [
  { href: '/',                          label: 'Inicio' },
  { href: '/como-funciona',             label: 'Cómo funciona' },
  { href: '/aseguradoras',              label: 'Aseguradoras' },
  { href: '/para-clinicas-o-medicos',   label: 'Para clínicas o médicos' },
  { href: '/faq',                       label: 'FAQ' },
];

export default function Header() {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const pathname = usePathname();
  // useUser() returns isLoaded=false during the brief window between
  // hydration and Clerk fetching the session. We render the signed-out
  // shell during that window so the static prerender's HTML matches the
  // first client paint — avoids hydration mismatch warnings.
  const { isSignedIn, isLoaded } = useUser();
  const showSignedIn = isLoaded && isSignedIn;

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

          {/* Auth area — switches based on Clerk session state. While
              Clerk JS is loading we render the signed-out shell so the
              static prerender + first client paint stay in sync. Once
              the session is known we either keep the CTAs or swap them
              for the avatar dropdown. */}
          {showSignedIn ? (
            <SignedInArea />
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </header>
  );
}
