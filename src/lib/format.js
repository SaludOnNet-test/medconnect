// Brand-compliant formatters. Always reach for these instead of inlining
// `.toFixed(2) + '€'` or `${X}€`. The brand mandates Spanish locale: comma
// decimal + non-breaking space + `€` glyph after the number.

const NBSP = '\u00A0';

/**
 * Format a number as a Med Connect-style euro amount.
 *
 *   formatEUR(29)               → "29 €"     (integer → no decimals)
 *   formatEUR(9.99)             → "9,99 €"
 *   formatEUR(29, { exact: true }) → "29,00 €"  (force two decimals)
 *   formatEUR(null)             → "0 €"
 *
 * Default behaviour drops decimals when the value is an integer — Jesús's
 * 2026-05 review flagged "45,50 €" as feeling "muy calculados". Catalogue
 * prices are now rounded at the data source so user-facing totals are
 * integers and render as "46 €". Pass `{ exact: true }` to force two
 * decimals when accountant-style precision is desired (admin/ops surfaces).
 *
 * @param {number|string|null|undefined} n
 * @param {{ exact?: boolean }} [opts]
 * @returns {string}
 */
export function formatEUR(n, opts = {}) {
  const v = Number(n);
  const safe = Number.isFinite(v) ? v : 0;
  if (!opts.exact && Number.isInteger(safe)) {
    return `${safe}${NBSP}€`;
  }
  return `${safe.toFixed(2).replace('.', ',')}${NBSP}€`;
}

/**
 * Backwards-compatible alias. Old call sites used `formatEURShort(n)` to
 * opt into the no-decimals-on-integers behaviour; that's now the default,
 * so this is just `formatEUR`.
 */
export function formatEURShort(n) {
  return formatEUR(n);
}
