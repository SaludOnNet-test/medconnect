'use client';
import InsurerCtaLink from './InsurerCtaLink';

/**
 * Mobile-only bottom bar with the main booking action of the page. The
 * WhatsApp FAB already sits 80px above the bottom on mobile (globals.css),
 * so both fit without overlapping. Hidden from 641px up.
 */
export default function InsurerStickyCta({ href, insurerName, insurerSlug, specialtySlug }) {
  return (
    <div className="insurer-sticky-cta" role="region" aria-label="Reservar cita">
      <InsurerCtaLink
        href={href}
        cta="sticky_mobile"
        insurer={insurerSlug}
        specialty={specialtySlug}
        className="insurer-sticky-cta__btn"
      >
        Reservar cita con {insurerName}
      </InsurerCtaLink>
    </div>
  );
}
