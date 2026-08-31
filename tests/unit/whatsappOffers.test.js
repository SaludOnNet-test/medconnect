import { describe, it, expect, vi } from 'vitest';

// whatsappOffers pulls in the DB layer at module level; stub it so the pure
// formatters can be tested without an mssql/Azure connection.
vi.mock('@/lib/db', () => ({ getPool: vi.fn(), DB_AVAILABLE: false }));
vi.mock('mssql', () => ({ default: {} }));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(async () => {}) }));

const { formatSlotDate, buildOfferSummary, findConcreteOffers } = await import('@/lib/whatsappOffers');

describe('formatSlotDate', () => {
  it('renders a Spanish weekday + day + month', () => {
    // 2026-09-07 is a Monday.
    expect(formatSlotDate('2026-09-07')).toBe('lunes 7 de septiembre');
  });

  it('is stable across DST (a summer date keeps its own day)', () => {
    expect(formatSlotDate('2026-07-01')).toBe('miércoles 1 de julio');
  });

  it('returns an empty string for a missing date', () => {
    expect(formatSlotDate(null)).toBe('');
  });
});

describe('buildOfferSummary', () => {
  // The real Cea Bermúdez numbers behind the 2026-08-23 conversation that
  // triggered this feature: tier-1 slot at 19 € with the 16% partner
  // discount → 16 €, plus the 41 € gynaecology consultation → 57 € total.
  const offer = {
    clinicName: 'Centro Médico Cea Bermúdez',
    address: 'Calle Cea Bermúdez, 61',
    city: 'Madrid',
    slotDate: '2026-09-07',
    slotTime: '11:15',
    priorityFee: 16,
    procedureName: 'Consulta de Ginecología y obstetricia',
    procedurePrice: 41,
    totalWithoutInsurance: 57,
  };

  it('names the clinic, the address, the slot and the total', () => {
    const summary = buildOfferSummary(offer);
    expect(summary).toContain('Centro Médico Cea Bermúdez');
    expect(summary).toContain('Calle Cea Bermúdez, 61');
    expect(summary).toContain('lunes 7 de septiembre a las 11:15');
    expect(summary).toContain('tarifa de prioridad 16 €');
    expect(summary).toContain('total sin seguro 57 €');
  });

  it('omits the total when the clinic has no catalogue price', () => {
    const summary = buildOfferSummary({
      ...offer,
      procedureName: null,
      procedurePrice: null,
      totalWithoutInsurance: null,
    });
    expect(summary).not.toContain('total sin seguro');
    expect(summary).toContain('tarifa de prioridad 16 €');
  });

  it('falls back to the city when the clinic has no address on file', () => {
    expect(buildOfferSummary({ ...offer, address: null })).toContain('(Madrid)');
  });
});

describe('findConcreteOffers', () => {
  it('returns no offers when the DB is unavailable instead of throwing', async () => {
    await expect(findConcreteOffers({ specialty: 'Ginecología', city: 'Madrid' }))
      .resolves.toEqual([]);
  });

  it('returns no offers when the specialty is missing', async () => {
    await expect(findConcreteOffers({ city: 'Madrid' })).resolves.toEqual([]);
  });
});
