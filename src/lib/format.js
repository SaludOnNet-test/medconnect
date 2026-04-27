// Brand-compliant formatters. Always reach for these instead of inlining
// `.toFixed(2) + '€'` or `${X}€`. The brand mandates Spanish locale: comma
// decimal + non-breaking space + `€` glyph after the number.

const NBSP = '\u00A0';

/**
 * Format a number as a Med Connect-style euro amount.
 *
 *   formatEUR(9.99)           → "9,99 €"
 *   formatEUR(29)             → "29,00 €"
 *   formatEUR(29, { short: true }) → "29 €"   (drops decimals when integer)
 *   formatEUR(null)           → "0,00 €"
 *
 * @param {number|string|null|undefined} n
 * @param {{ short?: boolean }} [opts]
 * @returns {string}
 */
export function formatEUR(n, opts = {}) {
  const v = Number(n);
  const safe = Number.isFinite(v) ? v : 0;
  if (opts.short && Number.isInteger(safe)) {
    return `${safe}${NBSP}€`;
  }
  return `${safe.toFixed(2).replace('.', ',')}${NBSP}€`;
}

/**
 * Like formatEUR but with the integer-shortening enabled by default — useful
 * for headlines where "29 €" reads cleaner than "29,00 €".
 */
export function formatEURShort(n) {
  return formatEUR(n, { short: true });
}
