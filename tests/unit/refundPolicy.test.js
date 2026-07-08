import { describe, it, expect } from 'vitest';
import { parseSlotDateTime, isRefundable, refundAmountFor } from '@/lib/refundPolicy';

// All expectations below are ABSOLUTE UTC instants. Slot date/times are
// stored as Madrid wall-clock strings; parseSlotDateTime must map them to
// the same UTC instant no matter what TZ the runtime uses (Vercel = UTC,
// local dev = Europe/Madrid). Asserting exact epoch values makes the suite
// fail if the runtime TZ ever leaks back into the parse.

describe('parseSlotDateTime — Madrid wall-clock semantics', () => {
  it('interprets summer dates as CEST (+02:00)', () => {
    const d = parseSlotDateTime('2026-07-10', '10:00');
    expect(d.getTime()).toBe(Date.parse('2026-07-10T08:00:00Z'));
  });

  it('interprets winter dates as CET (+01:00)', () => {
    const d = parseSlotDateTime('2026-01-15', '10:00');
    expect(d.getTime()).toBe(Date.parse('2026-01-15T09:00:00Z'));
  });

  it('handles the spring-forward DST day (2026-03-29 03:00 = 01:00Z)', () => {
    // Clocks jump 02:00 CET -> 03:00 CEST on 2026-03-29, so 03:00 is +02:00.
    const d = parseSlotDateTime('2026-03-29', '03:00');
    expect(d.getTime()).toBe(Date.parse('2026-03-29T01:00:00Z'));
  });

  it('handles the last instant before spring-forward (01:59 CET)', () => {
    const d = parseSlotDateTime('2026-03-29', '01:59');
    expect(d.getTime()).toBe(Date.parse('2026-03-29T00:59:00Z'));
  });

  it('defaults missing/malformed time to 00:00', () => {
    const d = parseSlotDateTime('2026-07-10', 'nope');
    expect(d.getTime()).toBe(Date.parse('2026-07-09T22:00:00Z'));
  });

  it('returns null for missing or unparseable date', () => {
    expect(parseSlotDateTime(null, '10:00')).toBeNull();
    expect(parseSlotDateTime('garbage', '10:00')).toBeNull();
  });
});

describe('isRefundable — three branches', () => {
  const slotDate = '2026-07-10';
  const slotTime = '10:00'; // Madrid => 2026-07-10T08:00:00Z

  it('> 24 h before the slot: full refund, any insurance state', () => {
    const now = new Date('2026-07-08T00:00:00Z');
    for (const hasInsurance of [true, false, undefined]) {
      const r = isRefundable(slotDate, slotTime, { hasInsurance, now });
      expect(r.allowed).toBe(true);
      expect(r.refundableAmount).toBe('full');
    }
  });

  it('<= 24 h before, insured: nothing refundable', () => {
    const now = new Date('2026-07-10T00:00:00Z');
    const r = isRefundable(slotDate, slotTime, { hasInsurance: true, now });
    expect(r.allowed).toBe(false);
    expect(r.refundableAmount).toBe('none');
  });

  it('<= 24 h before, unknown insurance: treated like insured (none)', () => {
    const now = new Date('2026-07-10T00:00:00Z');
    const r = isRefundable(slotDate, slotTime, { now });
    expect(r.allowed).toBe(false);
    expect(r.refundableAmount).toBe('none');
  });

  it('<= 24 h before, uninsured: service_only', () => {
    const now = new Date('2026-07-10T00:00:00Z');
    const r = isRefundable(slotDate, slotTime, { hasInsurance: false, now });
    expect(r.allowed).toBe(false);
    expect(r.refundableAmount).toBe('service_only');
  });

  it('exactly at the 24 h cutoff: NOT allowed (strict now < cutoff)', () => {
    const cutoff = new Date('2026-07-09T08:00:00Z'); // slotAt - 24h
    const atCutoff = isRefundable(slotDate, slotTime, { hasInsurance: false, now: cutoff });
    expect(atCutoff.allowed).toBe(false);
    expect(atCutoff.refundableAmount).toBe('service_only');
    expect(atCutoff.cutoffAt.getTime()).toBe(cutoff.getTime());

    const justBefore = isRefundable(slotDate, slotTime, {
      hasInsurance: false,
      now: new Date(cutoff.getTime() - 1),
    });
    expect(justBefore.allowed).toBe(true);
    expect(justBefore.refundableAmount).toBe('full');
  });

  it('DST crossing: slot 2026-03-29 03:00 with now the day before is 25 real hours away', () => {
    // Wall-clock delta says 27 h, but the clocks jump forward 1 h in between
    // and 03:00 already sits at +02:00, so the real distance from
    // 2026-03-28T00:00Z is 25 h. Full refund window still applies.
    const now = new Date('2026-03-28T00:00:00Z');
    const r = isRefundable('2026-03-29', '03:00', { hasInsurance: true, now });
    expect(r.hoursUntilSlot).toBeCloseTo(25, 5);
    expect(r.allowed).toBe(true);
    expect(r.refundableAmount).toBe('full');
  });

  it('is deterministic wrt runtime TZ: fixed opts.now yields fixed epoch results', () => {
    // With injected `now` and Madrid-anchored parsing, every field is a pure
    // function of the inputs. These exact epoch assertions would fail under
    // the old runtime-TZ parse when executed with TZ=UTC vs Europe/Madrid.
    const now = new Date('2026-07-09T07:30:00Z');
    const r = isRefundable(slotDate, slotTime, { hasInsurance: false, now });
    expect(r.cutoffAt.getTime()).toBe(Date.parse('2026-07-09T08:00:00Z'));
    expect(r.hoursUntilSlot).toBeCloseTo(24.5, 8);
    expect(r.allowed).toBe(true);
  });

  it('missing slot date: permissive full refund with null cutoff', () => {
    const r = isRefundable(null, null, { now: new Date() });
    expect(r).toMatchObject({ allowed: true, refundableAmount: 'full', cutoffAt: null, hoursUntilSlot: null });
  });
});

describe('refundAmountFor', () => {
  it('maps decisions to euro amounts', () => {
    expect(refundAmountFor({ refundableAmount: 'full' }, { amount: 55, servicePrice: 40 })).toBe(55);
    expect(refundAmountFor({ refundableAmount: 'service_only' }, { amount: 55, servicePrice: 40 })).toBe(40);
    expect(refundAmountFor({ refundableAmount: 'service_only' }, { amount: 30, servicePrice: 40 })).toBe(30);
    expect(refundAmountFor({ refundableAmount: 'none' }, { amount: 55, servicePrice: 40 })).toBe(0);
  });
});
