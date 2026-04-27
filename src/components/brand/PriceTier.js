'use client';
import { formatEUR } from '@/lib/format';
import './PriceTier.css';

/**
 * Single tier card in the price ladder. The full ladder mounts four of
 * these (4,99 / 9,99 / 19 / 29 €) in a 4-column grid with a stepped Bone
 * background.
 *
 * Props:
 *   - amount: number (in euros). Rendered with brand `formatEUR`.
 *   - label:  short headline (e.g. "Esta semana")
 *   - copy:   one-line description
 *   - tier:   1..4 — used for the bone-{50|100|200|300} surface step.
 *   - highlight: emphasises the tier as the "featured" one (Brass border).
 */
export default function PriceTier({
  amount,
  label,
  copy,
  tier = 1,
  highlight = false,
  className = '',
}) {
  const cls = [
    'brand-tier',
    `brand-tier--${tier}`,
    highlight ? 'brand-tier--highlight' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <div className="brand-tier__amount">{formatEUR(amount, { short: Number.isInteger(amount) })}</div>
      {label && <div className="brand-tier__label">{label}</div>}
      {copy && <p className="brand-tier__copy">{copy}</p>}
    </div>
  );
}

/**
 * Convenience composite for the canonical Med Connect price ladder.
 * Renders the four current tiers in order: 4,99 → 9,99 → 19 → 29.
 */
export function PriceLadder({ highlight = 2 } = {}) {
  const tiers = [
    { amount: 4.99, label: 'Más adelante', copy: 'Reserva con > 30 días de antelación. Para cuando puedes esperar pero quieres asegurar el hueco.' },
    { amount: 9.99, label: 'Esta semana',  copy: 'Cita disponible esta semana. La opción que cubre la mayoría de los casos.' },
    { amount: 19,   label: 'En 7 días',     copy: 'Necesitas verlo en menos de una semana. Conseguimos hueco prioritario.' },
    { amount: 29,   label: 'Urgente',       copy: 'En menos de 48 horas. Para cuando lo necesitas ya y tu cuadro médico no responde.' },
  ];
  return (
    <div className="brand-ladder">
      {tiers.map((t, i) => (
        <PriceTier
          key={i}
          tier={i + 1}
          highlight={i + 1 === highlight}
          {...t}
        />
      ))}
    </div>
  );
}
