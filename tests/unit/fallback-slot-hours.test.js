import { describe, it, expect } from 'vitest';
import { generateSlotsForClinic } from '@/lib/slot-validation';

// Clinics without a real schedule (rule 'fallback') must only get slots
// inside 10:00-13:00 / 16:00-19:00 and never on a Friday afternoon.
// Regression for the Ceorl 08:45 Friday booking (Ops, 2026-11-20).
describe('fallback slot hours', () => {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  it('keeps every fallback slot inside the safe windows', () => {
    const now = new Date('2026-11-20T12:00:00');
    for (let clinicId = 1; clinicId <= 400; clinicId++) {
      const { slots, rule } = generateSlotsForClinic(clinicId, [], { now, city: 'Barcelona' });
      expect(rule).toBe('fallback');
      for (const s of slots) {
        const m = toMin(s.time);
        const inMorning = m >= toMin('10:00') && m < toMin('13:00');
        const inAfternoon = m >= toMin('16:00') && m < toMin('19:00');
        expect(inMorning || inAfternoon, `${clinicId} ${s.date} ${s.time}`).toBe(true);
        const dow = new Date(`${s.date}T12:00:00`).getDay();
        if (dow === 5) expect(inMorning, `${clinicId} Friday ${s.time}`).toBe(true);
      }
    }
  });

  it('clinic 1227 (Ceorl) no longer gets an early-morning slot', () => {
    const { slots } = generateSlotsForClinic(1227, [], { now: new Date('2026-11-20T12:00:00'), city: 'Barcelona' });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(toMin(s.time)).toBeGreaterThanOrEqual(toMin('10:00'));
  });
});
