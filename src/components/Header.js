'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SignedIn, SignedOut, useUser, useClerk } from '@clerk/nextjs';
import Button from '@/components/brand/Button';
import Icon from '@/components/icons/Icon';
import './Header.css';

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

// Inline auth dropdown for the signed-in state. Clerk's `<SignedIn>`
// only mounts this once the user has a real session, so we can read
// `useUser` here without worrying about the static prerender path.
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
          <Link
            href="/pro/dashboard"
            className="header-account-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Panel profesional
          </Link>
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

          {/* Auth area — Clerk swaps between the signed-out CTAs and a
              user dropdown automatically. <SignedIn> / <SignedOut> only
              render once Clerk has hydrated, so the static prerender
              shows nothing here briefly and then the right state paints
              in. Better than always showing "Iniciar sesión / Crear
              cuenta" even when the user is already logged in. */}
          <SignedOut>
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
          </SignedOut>

          <SignedIn>
            <SignedInArea />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
