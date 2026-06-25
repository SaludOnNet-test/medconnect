'use client';
import { formatEUR } from '@/lib/format';
import { STANDARD_TIERS } from '@/lib/pricing';
import './PriceTier.css';

/**
 * Single tier card in the price ladder. The full ladder mounts four of
 * these (4 / 8 / 15 / 19 €) in a 4-column grid with a stepped Bone
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
  standardAmount, // 2026-06-08 — "tarifa habitual" anchor for strikethrough
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
      {standardAmount && standardAmount > amount && (
        <div className="brand-tier__standard">{formatEUR(standardAmount)}</div>
      )}
      <div className="brand-tier__amount">{formatEUR(amount)}</div>
      {label && <div className="brand-tier__label">{label}</div>}
      {copy && <p className="brand-tier__copy">{copy}</p>}
    </div>
  );
}

/**
 * Convenience composite for the canonical Med Connect price ladder.
 * Renders the four current tiers in order: 4 → 8 → 15 → 19.
 *
 * Pricing strategy (single source of truth — keep aligned with FAQ + SEO):
 *   - 4 €  → cita a más de 30 días (2026-06-24, ↓ desde €5)
 *   - 8 €  → cita entre 15 y 30 días (↓ desde €10)
 *   - 15 € → cita entre 7 y 14 días (↓ desde €19)
 *   - 19 € → cita en menos de 7 días (↓ desde €29)
 */
export function PriceLadder({ highlight = 2 } = {}) {
  // 2026-06-08 — Each tier now carries its "tarifa habitual" anchor
  // pulled from STANDARD_TIERS. The mapping is inverted from the display
  // order: cheapest tier in the ladder (€4) corresponds to STANDARD_TIERS
  // tier 4 (€10), etc.
  // 2026-06-24 — Active amounts shifted ~20-35% lower across the board.
  const standardByActive = Object.fromEntries(
    STANDARD_TIERS.map((t) => [
      ({ 1: 19, 2: 15, 3: 8, 4: 4 })[t.tier],
      t.standard,
    ]),
  );
  const tiers = [
    { amount: 4,  label: 'Más adelante',   copy: 'Cita a más de 30 días vista. Para cuando puedes esperar pero quieres asegurar el hueco.' },
    { amount: 8,  label: 'Este mes',       copy: 'Cita entre 15 y 30 días. La opción que cubre la mayoría de los casos.' },
    { amount: 15, label: 'Próxima semana', copy: 'Cita entre 7 y 14 días. Hueco prioritario para cuando no puedes esperar al mes siguiente.' },
    { amount: 19, label: 'Esta semana',    copy: 'Cita en menos de 7 días. Para cuando lo necesitas ya y tu cuadro médico no responde.' },
  ];
  return (
    <div className="brand-ladder">
      {tiers.map((t, i) => (
        <PriceTier
          key={i}
          tier={i + 1}
          highlight={i + 1 === highlight}
          standardAmount={standardByActive[t.amount]}
          {...t}
        />
      ))}
    </div>
  );
}
