'use client';

/**
 * Trust strip — 3 chips replicated across the funnel.
 *
 * 2026-06-04, conversion plan A2. The patient currently sees MedConnect-level
 * trust copy ONLY at the Stripe step (the trust card shipped in commit
 * f2dc34a). Hypothesis: the patient bails BEFORE reaching Stripe because
 * landing/search/modal stay generic. We replicate the SAME three claims
 * upstream so by the time the patient hits the card field the message is
 * already familiar.
 *
 * Variants
 *   compact  — single row, used on landing hero + booking modal
 *   stacked  — vertical list, used on /book form step
 *
 * The wording is intentionally identical across surfaces — consistency is
 * the point. Do not localize per page.
 */

const CLAIMS = [
  { icon: '🔒', label: 'Pago seguro con Stripe' },
  { icon: '💸', label: 'Reembolso íntegro en 72 h si no encontramos hueco' },
  { icon: '🏥', label: 'Tu seguro sigue cubriendo la consulta' },
];

export default function TrustStrip({ variant = 'compact', className = '' }) {
  const cls = `trust-strip trust-strip--${variant}${className ? ' ' + className : ''}`;
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
