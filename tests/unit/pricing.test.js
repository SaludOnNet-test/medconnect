import { describe, it, expect } from 'vitest';
import {
  STANDARD_TIERS,
  PARTNER_DISCOUNT_PCT,
  applyPartnerDiscount,
  getPricingDisplay,
  computeChargeAmount,
} from '@/lib/pricing';

// Note: the advance-booking day cuts (0-7 / 8-14 / 15-30 / 31-45) live in
// PRICING_TIERS inside src/lib/slot-validation.js (server-only deps), not in
// pricing.js. pricing.js exposes the pure display/charge math tested here.
const PARTNER_CLINIC_ID = 1; // Cea Bermúdez
const NON_PARTNER = 999;

describe('applyPartnerDiscount', () => {
  it('leaves non-partner clinics untouched', () => {
    expect(applyPartnerDiscount(19, NON_PARTNER)).toBe(19);
    expect(applyPartnerDiscount(19, null)).toBe(19);
  });

  it('applies 16% and rounds to 50 cents for partner clinics', () => {
    expect(PARTNER_DISCOUNT_PCT).toBe(0.16);
    expect(applyPartnerDiscount(19, PARTNER_CLINIC_ID)).toBe(16); // tier 1 spec
    expect(applyPartnerDiscount(4, PARTNER_CLINIC_ID)).toBe(3.5); // tier 4 (rounded to .50)
  });
});

describe('getPricingDisplay', () => {
  it('tier price ladder (non-partner): standard vs active per tier', () => {
    const expected = { 1: [39, 19], 2: [29, 15], 3: [19, 8], 4: [10, 4] };
    for (const [tier, [standard, active]] of Object.entries(expected)) {
      const d = getPricingDisplay({ tier: Number(tier) }, null);
      expect(d.standard).toBe(standard);
      expect(d.active).toBe(active);
      expect(d.savings).toBe(standard - active);
      expect(d.showStrikethrough).toBe(true);
      expect(d.isPartner).toBe(false);
    }
  });

  it('partner clinic tier 1: 19 → 16 with partner flags set', () => {
    const d = getPricingDisplay({ tier: 1 }, PARTNER_CLINIC_ID);
    expect(d.active).toBe(16);
    expect(d.isPartner).toBe(true);
    expect(d.partnerDiscountPct).toBe(0.16);
    expect(d.savings).toBe(23);
  });

  it('uses slot.price when provided instead of the tier default', () => {
    const d = getPricingDisplay({ tier: 2, price: 12 }, null);
    expect(d.active).toBe(12);
    expect(d.standard).toBe(29);
  });

  it('unknown/missing tier falls back to tier 1', () => {
    const d = getPricingDisplay({}, null);
    expect(d.standard).toBe(39);
    expect(d.active).toBe(19);
  });
});

describe('computeChargeAmount', () => {
  it('insured: priority fee only', () => {
    expect(computeChargeAmount({ clinicId: NON_PARTNER, tier: 1, hasInsurance: true, servicePrice: 40 })).toBe(19);
    expect(computeChargeAmount({ clinicId: PARTNER_CLINIC_ID, tier: 1, hasInsurance: true, servicePrice: 40 })).toBe(16);
  });

  it('uninsured: priority fee + service price', () => {
    expect(computeChargeAmount({ clinicId: NON_PARTNER, tier: 3, hasInsurance: false, servicePrice: 40 })).toBe(48);
    expect(computeChargeAmount({ clinicId: NON_PARTNER, tier: 3, hasInsurance: false })).toBe(8);
  });

  it('unknown tier falls back to tier 1 pricing', () => {
    expect(computeChargeAmount({ clinicId: NON_PARTNER, tier: 42, hasInsurance: true })).toBe(19);
  });
});

describe('STANDARD_TIERS', () => {
  it('publishes the four-tier tarifa habitual ladder', () => {
    expect(STANDARD_TIERS).toEqual([
      { tier: 1, standard: 39 },
      { tier: 2, standard: 29 },
      { tier: 3, standard: 19 },
      { tier: 4, standard: 10 },
    ]);
  });
});
