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
 *
 * Pricing strategy (single source of truth — keep aligned with FAQ + SEO):
 *   - 4,99 €  → cita a más de 30 días
 *   - 9,99 €  → cita entre 15 y 30 días
 *   - 19 €    → cita entre 7 y 14 días (la próxima semana)
 *   - 29 €    → cita en menos de 7 días (urgente)
 */
export function PriceLadder({ highlight = 2 } = {}) {
  const tiers = [
    { amount: 4.99, label: 'Más adelante',   copy: 'Cita a más de 30 días vista. Para cuando puedes esperar pero quieres asegurar el hueco.' },
    { amount: 9.99, label: 'Este mes',       copy: 'Cita entre 15 y 30 días. La opción que cubre la mayoría de los casos.' },
    { amount: 19,   label: 'Próxima semana', copy: 'Cita entre 7 y 14 días. Hueco prioritario para cuando no puedes esperar al mes siguiente.' },
    { amount: 29,   label: 'Esta semana',    copy: 'Cita en menos de 7 días. Para cuando lo necesitas ya y tu cuadro médico no responde.' },
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
