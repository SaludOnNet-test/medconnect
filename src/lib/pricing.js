// Pricing display helpers — strikethrough anchor + partner extra discount.
//
// 2026-06-08, owner-approved spec. Three layers stack:
//   1. PRICING_TIERS (in src/lib/slot-validation.js) — what we actually
//      charge: 29 / 19 / 10 / 5 by tier. UNCHANGED — single source of
//      truth for billing.
//   2. STANDARD_TIERS (here) — our "tarifa habitual" rate, +€10 above
//      each PRICING_TIERS price. Published on /tarifas as the official
//      list price so the strikethrough is legally defensible under Real
//      Decreto-ley 24/2021. Display only — never charged.
//   3. PARTNER_DISCOUNT_PCT (here) — 30% off the ACTIVE (pre-inflation)
//      tier price for clinics in PARTNER_CLINIC_IDS. Both DISPLAYED and
//      CHARGED — computeChargeAmount() applies it server-side so a
//      tampered client can't bypass.
//
// To preview the math:
//   Tier 1 non-partner:  Standard €39 → Active €29   (savings €10)
//   Tier 1 partner:      Standard €39 → Active €20.50 (savings €18.50, partner -30%)
//   Tier 4 partner:      Standard €10 → Active €3.50  (savings €6.50)

import { isPartnerClinic } from '@/lib/partnerClinics';
import { formatEUR } from '@/lib/format';

export const STANDARD_TIERS = [
  { tier: 1, standard: 39 },
  { tier: 2, standard: 29 },
  { tier: 3, standard: 19 },
  { tier: 4, standard: 10 },
];

export const PARTNER_DISCOUNT_PCT = 0.30;

// Active charge prices keyed by tier. Mirrors PRICING_TIERS but duplicated
// here so the display layer can compute partner discounts without
// importing slot-validation (which pulls in server-only deps in places).
// Keep these in sync with PRICING_TIERS — when one changes, the other does.
const ACTIVE_PRICE_BY_TIER = { 1: 29, 2: 19, 3: 10, 4: 5 };

function roundTo50Cents(n) {
  return Math.round(n * 2) / 2;
}

/**
 * applyPartnerDiscount — single source for the partner price math.
 * Used by both display (getPricingDisplay) and charge enforcement
 * (computeChargeAmount). Keeps the two paths consistent by construction.
 */
export function applyPartnerDiscount(basePrice, clinicId) {
  if (!isPartnerClinic(clinicId)) return basePrice;
  return roundTo50Cents(basePrice * (1 - PARTNER_DISCOUNT_PCT));
}

/**
 * getPricingDisplay — returns the strikethrough + active strings for a
 * given slot at a given clinic. Pure function. No side effects.
 *
 *   slot.tier   — 1..4 (REQUIRED)
 *   slot.price  — the active (pre-discount) tier price; if absent we
 *                 look it up from ACTIVE_PRICE_BY_TIER.
 *   clinicId    — for partner-discount lookup. Pass null for the
 *                 generic price ladder (PriceTier.js homepage).
 */
export function getPricingDisplay(slot, clinicId) {
  const tier = Number(slot?.tier) || 1;
  const stdEntry = STANDARD_TIERS.find((t) => t.tier === tier);
  const standard = stdEntry?.standard ?? 39;
  const basePrice = Number(slot?.price ?? ACTIVE_PRICE_BY_TIER[tier] ?? 29);
  const active = applyPartnerDiscount(basePrice, clinicId);
  const isPartner = clinicId != null && isPartnerClinic(clinicId);
  const savings = Math.max(0, standard - active);
  return {
    standard,
    active,
    savings,
    standardLabel: formatEUR(standard),
    activeLabel: formatEUR(active),
    savingsLabel: formatEUR(savings),
    isPartner,
    partnerDiscountPct: isPartner ? PARTNER_DISCOUNT_PCT : 0,
    showStrikethrough: standard > active,
  };
}

/**
 * computeChargeAmount — server-side enforcement of the actual amount we
 * charge. Used by /api/payments + /api/bookings/reserve to validate
 * that the amount the client is paying matches what we expect for the
 * given clinic + tier + has-insurance combination.
 *
 *   clinicId         — partner discount lookup
 *   tier             — 1..4
 *   hasInsurance     — true → charge only the priority fee.
 *                      false → priority fee + service price (procedurePrice).
 *   servicePrice     — only used when hasInsurance === false.
 *
 * Returns the EUR amount as a number. Callers compare to the client-
 * submitted amount and reject if they diverge beyond €0.50 (rounding).
 */
export function computeChargeAmount({ clinicId, tier, hasInsurance, servicePrice = 0 }) {
  const base = ACTIVE_PRICE_BY_TIER[tier] ?? ACTIVE_PRICE_BY_TIER[1];
  const priorityFee = applyPartnerDiscount(base, clinicId);
  return hasInsurance ? priorityFee : priorityFee + (Number(servicePrice) || 0);
}
