'use client';

/**
 * Trust strip — 3 claims replicated across the funnel.
 *
 * 2026-06-04, conversion plan A2. The patient sees MedConnect-level trust
 * copy at the Stripe step (commit f2dc34a). We replicate the SAME three
 * claims upstream so they are familiar by the time the patient is asked
 * for a card. Wording is intentionally identical across all surfaces.
 *
 * Variants
 *   inline   — single thin line, no chips, no background. ~22 px tall.
 *              Default. For landing hero + booking modal where above-
 *              the-fold space is precious.
 *   compact  — chip-style row (~60 px). Use only where the page has
 *              room to spare and we want the claims to feel like badges.
 *   stacked  — vertical list, used on the /book form step.
 *
 * The 2026-06-04 v2 swap (compact → inline as default on landing + modal)
 * was made after the Clarity recording showed clinic listings + the
 * modal's slot picker getting pushed below the fold on mobile because of
 * the chip row's height. The inline variant preserves the three claims
 * with a fraction of the vertical real estate.
 */

const CLAIMS = [
  { icon: '🔒', short: 'Stripe seguro', label: 'Pago seguro con Stripe' },
  { icon: '💸', short: 'Reembolso 72 h', label: 'Reembolso íntegro en 72 h si no encontramos hueco' },
  { icon: '🏥', short: 'Tu seguro cubre la consulta', label: 'Tu seguro sigue cubriendo la consulta' },
];

export default function TrustStrip({ variant = 'inline', className = '' }) {
  const cls = `trust-strip trust-strip--${variant}${className ? ' ' + className : ''}`;

  if (variant === 'inline') {
    return (
      <p className={cls} aria-label="Garantías de Med Connect">
        {CLAIMS.map((c, i) => (
          <span key={c.label} className="trust-strip-inline-item">
            <span className="trust-strip-icon" aria-hidden="true">{c.icon}</span>
            <span className="trust-strip-label">{c.short}</span>
            {i < CLAIMS.length - 1 && <span className="trust-strip-sep" aria-hidden="true"> · </span>}
          </span>
        ))}
      </p>
    );
  }

  return (
    <ul className={cls} aria-label="Garantías de Med Connect">
      {CLAIMS.map((c) => (
        <li key={c.label} className="trust-strip-item">
          <span className="trust-strip-icon" aria-hidden="true">{c.icon}</span>
          <span className="trust-strip-label">{c.label}</span>
        </li>
      ))}
    </ul>
  );
}
