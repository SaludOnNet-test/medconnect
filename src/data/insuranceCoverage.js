/**
 * Insurance × specialty coverage hints.
 *
 * 2026-06-04, conversion plan A7. Static, ops-provided lookup used by the
 * /book form step to add a reassurance badge below the insurance toggle:
 *   - GREEN  ("✅ Sanitas suele cubrir cardiología")
 *       — we believe the insurer × specialty pair is usually covered.
 *   - GREY   ("ℹ️ No estamos seguros si tu Adeslas cubre oftalmología")
 *       — we are NOT sure; ops will confirm before charging.
 *
 * The "usually covered" status here is a heuristic — ops always confirms
 * with the clinic before the 72-h refund window closes, regardless of the
 * UI hint. The purpose is to remove the dead-end binary feeling at the
 * insurance toggle, NOT to make a contractual coverage claim.
 *
 * If the (insurer, specialty) pair is NOT in this table, we surface the
 * grey "unsure" badge — never a red "not covered" — so the patient is
 * never told to walk away without giving us a chance to check.
 */

// keys are lowercased specialty slugs as they appear in /especialistas URLs
// (and in the bookings.specialty column). Match against the specialty id
// from src/lib/seoData.js — not the human label.
//
// The list reflects the standard SaludOnNet network coverage as of 2026-06.
// Insurers omitted entirely from a specialty's list will show the GREY
// badge for that specialty.
const COVERAGE = {
  cardiologia: ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Mapfre', 'Asisa', 'Cigna', 'Caser', 'Generali'],
  ginecologia: ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Mapfre', 'Asisa', 'Cigna', 'Caser', 'Generali'],
  'obstetricia-y-ginecologia': ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Mapfre', 'Asisa', 'Cigna', 'Caser', 'Generali'],
  traumatologia: ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Mapfre', 'Asisa', 'Cigna', 'Caser'],
  dermatologia: ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Mapfre', 'Asisa'],
  oftalmologia: ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Mapfre'],
  pediatria: ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Mapfre', 'Asisa', 'Cigna', 'Caser'],
  medicina_general: ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Mapfre', 'Asisa', 'Cigna', 'Caser', 'Generali', 'Néctar'],
  psicologia: ['Sanitas', 'Adeslas', 'DKV', 'AXA', 'Cigna'],
  psiquiatria: ['Sanitas', 'Adeslas', 'DKV', 'AXA'],
};

/**
 * isLikelyCovered(insurer: string, specialty: string) → boolean
 * Returns true when ops believes the pair is usually accepted.
 * Falsy specialty/insurer always returns false (grey badge).
 */
export function isLikelyCovered(insurer, specialty) {
  if (!insurer || !specialty) return false;
  const normalizedSpecialty = String(specialty)
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  const listKey = Object.keys(COVERAGE).find(
    (k) => k === normalizedSpecialty || k.replace(/-/g, '') === normalizedSpecialty.replace(/-/g, ''),
  );
  if (!listKey) return false;
  const list = COVERAGE[listKey];
  return list.some((i) => i.toLowerCase() === String(insurer).toLowerCase());
}
