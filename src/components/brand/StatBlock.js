'use client';
import './StatBlock.css';

/**
 * Number + label pair for stats sections (e.g. "214 reseñas" / "4,8 / 5").
 * Number renders in display serif at scale; label uses Eyebrow tracking.
 */
export default function StatBlock({ value, label, accent = false, className = '' }) {
  const cls = ['brand-stat', accent ? 'brand-stat--accent' : '', className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="brand-stat__value">{value}</div>
      {label && <div className="brand-stat__label">{label}</div>}
    </div>
  );
}
