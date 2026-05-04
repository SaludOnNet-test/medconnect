// Text utilities. Kept tiny on purpose — accent-stripping comparisons show up
// in every search/autocomplete in the app (location, specialty, procedure,
// clinic name) and in the surgery blocklist for the booking catalogue.

// U+0300–U+036F is the Unicode block of combining diacritical marks. After
// NFD-normalising a string, every accented character is split into a base
// letter + one of these marks, so dropping the block leaves the bare ASCII
// letter. Using the explicit \u escape keeps the source ASCII-safe across
// editors that might otherwise mangle a literal combining-mark range.
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Lower-case + strip Spanish diacritics. Use when comparing user input
 * against catalogue strings — `normalizeText('malaga')` matches
 * `normalizeText('Málaga')`.
 */
export function normalizeText(s) {
  return (s || '').normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/**
 * Returns true if a procedure name should be offered for online booking.
 *
 * For the MVP launch we exclude any acto médico whose name contains
 * "cirugia"/"cirugía" — those need pre-op assessment, anaesthesia
 * planning and a surgeon's slot, which the marketplace can't broker
 * online today. The substring `cirug` is sufficient: after NFD strip
 * both `cirugia` and `cirugía` collapse to `cirugia`, and any
 * derivative (`cirugía menor`, `cirugia plástica`, etc.) still contains
 * `cirug`.
 */
export function isBookableProcedure(procedureName) {
  return !normalizeText(procedureName).includes('cirug');
}
