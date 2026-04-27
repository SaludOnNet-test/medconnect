'use client';
import * as Lucide from 'lucide-react';

/**
 * Brand icon — Lucide, stroke 1.5, currentColor.
 *
 * Replaces the 100+ emoji used as inline icons across the codebase. Pass a
 * Lucide name in PascalCase (e.g. "Phone", "MapPin") OR kebab-case (e.g.
 * "phone", "map-pin") to mirror the `data-lucide=` attribute used in the
 * design kit demo.
 *
 * Usage:
 *   <Icon name="phone" size={18} />
 *   <Icon name="ArrowRight" />
 */
export default function Icon({ name, size = 18, strokeWidth = 1.5, ...rest }) {
  if (!name) return null;
  // Normalize kebab-case → PascalCase so callers can use either convention.
  const pascal = String(name)
    .split(/[-_ ]/)
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : ''))
    .join('');
  const Cmp = Lucide[pascal] || Lucide[name];
  if (!Cmp || typeof Cmp !== 'object') return null;
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}
