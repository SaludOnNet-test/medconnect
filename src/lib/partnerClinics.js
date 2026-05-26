// Allowlist of clinic IDs that have signed up as Med Connect partners —
// clinics that have explicitly agreed to receive Med Connect patients.
//
// Listed clinics are sorted to the top of /search-v2 ahead of every
// other sort criterion (`is_preferential`, rating, reviews, alphabetical).
// Adding a new partner = appending an `id` here; no DB migration required
// for the soft launch. When the list grows past ~10 we should port this to
// a `clinics.is_medconnect_partner` column + an admin toggle.

/**
 * Set of clinic ids (numeric, matching `clinics.id` in Azure SQL).
 * Use Set for O(1) lookup in the response mapping.
 */
export const PARTNER_CLINIC_IDS = new Set([
  1, // Centro Médico Cea Bermúdez (Madrid) — onboarded 2026-05-05
]);

/**
 * Snapshot of the same ids as a comma-separated integer literal list,
 * ready to splice into a SQL CASE/IN clause. Empty string when the
 * allowlist is empty so callers can safely no-op the CASE.
 *
 * Safe to inline as a string fragment — the values come from a code
 * constant, not user input, and are validated as positive integers here.
 */
export const PARTNER_CLINIC_IDS_SQL = [...PARTNER_CLINIC_IDS]
  .map((n) => Number(n))
  .filter((n) => Number.isInteger(n) && n > 0)
  .join(',');

/**
 * O(1) check from JS — used in the API response mapping so the client
 * receives a precomputed `isPartner` boolean without re-running the lookup.
 */
export function isPartnerClinic(clinicId) {
  return PARTNER_CLINIC_IDS.has(Number(clinicId));
}
