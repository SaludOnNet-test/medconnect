'use client';

import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';

/**
 * WhatsAppFAB — floating "Te ayudamos por WhatsApp" button.
 *
 * 2026-06-04, conversion plan A6. Captures the "I'm-not-sure" segment we
 * lose 100% of today. Hidden on /book/* (the patient is committed; we don't
 * want to add a distraction at payment). Visible elsewhere — landing,
 * search, modal.
 *
 * Cookie-consent note: clicking opens a wa.me deep-link. No tracker fires
 * client-side beyond our own analytics event (which only records when
 * consent has already been granted).
 */

// E.164 (no + per wa.me convention).
// 2026-06-04 v2 — switched from the landline (91 197 70 52) to the
// dedicated ops mobile so WhatsApp routes to a number that actually
// receives messages. The header still shows the landline for voice.
const WA_NUMBER = '34677348588';
const DEFAULT_TEXT = 'Hola, necesito ayuda para reservar una cita en Med Connect.';

export default function WhatsAppFAB() {
  const pathname = usePathname() || '/';

  // Hide on /book/* — patient is in commitment mode, FAB distracts.
  // Hide on /pro/* — the FAB is for patients, not professionals.
  // Hide on /admin/* and /internal/* — ops dashboards.
  // Hide on /sign-in / /sign-up — auth flows.
  if (
    pathname.startsWith('/book') ||
    pathname.startsWith('/pro') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/internal') ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/lock-in')
  ) {
    return null;
  }

  // Tailor the prefilled message by route. wa.me decodes the `text` param,
  // so we URL-encode here.
  let prefill = DEFAULT_TEXT;
  if (pathname.startsWith('/especialistas/')) {
    const m = pathname.match(/^\/especialistas\/([^/]+)\/([^/]+)/);
    if (m) {
      const specialty = decodeURIComponent(m[1]).replace(/-/g, ' ');
      const city = decodeURIComponent(m[2]).replace(/-/g, ' ');
      prefill = `Hola, quiero ayuda para reservar una cita de ${specialty} en ${city}.`;
    }
  }

  const href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(prefill)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="wa-fab"
      aria-label="Abrir conversación de WhatsApp con Med Connect"
      onClick={() => {
        try {
          trackEvent('whatsapp_clicked', { source: 'fab', path: pathname });
        } catch { /* analytics is fire-and-forget */ }
      }}
    >
      <span className="wa-fab-icon" aria-hidden="true">
        {/* Simple WhatsApp glyph — single inline SVG, no external asset */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M20.52 3.48A11.83 11.83 0 0012 0C5.37 0 0 5.37 0 12c0 2.11.55 4.18 1.6 6L0 24l6.2-1.63A11.93 11.93 0 0012 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.21-3.48-8.52zM12 22.04a9.97 9.97 0 01-5.12-1.4l-.36-.21-3.66.96.99-3.55-.24-.37A9.96 9.96 0 012.04 12c0-5.5 4.47-9.96 9.96-9.96 2.66 0 5.16 1.04 7.04 2.92a9.93 9.93 0 012.92 7.04c0 5.5-4.47 9.96-9.96 9.96zm5.46-7.45c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.21 5.08 4.51.71.3 1.26.48 1.69.62.71.22 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.69.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z"
            fill="#fff"
          />
        </svg>
      </span>
      <span className="wa-fab-label">Te ayudamos</span>
    </a>
  );
}
