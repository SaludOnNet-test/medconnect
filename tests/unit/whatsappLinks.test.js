import { describe, it, expect, vi } from 'vitest';

// whatsapp.js imports DB + Sentry at module level; stub them so the pure
// link builders can be tested without an mssql/Azure connection.
vi.mock('@/lib/db', () => ({ getPool: vi.fn(), DB_AVAILABLE: false }));
vi.mock('mssql', () => ({ default: {} }));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(async () => {}) }));

const { buildLinks, buildSearchLink, CEA_PROVIDER_NAME } = await import('@/lib/whatsapp');

function params(link) {
  return new URL(link).searchParams;
}

describe('buildLinks', () => {
  it('normalises accented specialty (cardiología → cardiologia)', () => {
    const { mainLink, videoLink } = buildLinks({ specialty: 'Cardiología', city: 'Madrid' });
    expect(params(mainLink).get('specialtySlug')).toBe('cardiologia');
    expect(params(videoLink).get('specialtySlug')).toBe('cardiologia');
    expect(params(mainLink).get('source')).toBe('whatsapp');
  });

  it('Madrid generates a ceaLink pointing at the partner clinic', () => {
    const { ceaLink } = buildLinks({ specialty: 'dermatología', city: 'Madrid' });
    expect(ceaLink).not.toBeNull();
    const p = params(ceaLink);
    expect(p.get('providerName')).toBe(CEA_PROVIDER_NAME);
    expect(p.get('city')).toBe('Madrid');
    expect(p.get('specialtySlug')).toBe('dermatologia');
  });

  it('video modality does NOT generate a ceaLink', () => {
    const { ceaLink, videoLink } = buildLinks({ specialty: 'cardiología', city: 'Madrid', modality: 'video' });
    expect(ceaLink).toBeNull();
    expect(params(videoLink).get('modality')).toBe('video');
  });

  it('non-Madrid city gets no ceaLink', () => {
    const { ceaLink, mainLink } = buildLinks({ specialty: 'cardiología', city: 'Barcelona' });
    expect(ceaLink).toBeNull();
    expect(params(mainLink).get('city')).toBe('Barcelona');
  });

  it('unknown specialty passes through as a lowercased hyphenated slug', () => {
    const { mainLink } = buildLinks({ specialty: 'Medicina del Deporte', city: 'Madrid' });
    expect(params(mainLink).get('specialtySlug')).toBe('medicina-del-deporte');
  });

  it('no specialty → no specialtySlug param at all', () => {
    const { mainLink, videoLink } = buildLinks({ city: 'Madrid' });
    expect(params(mainLink).has('specialtySlug')).toBe(false);
    expect(params(videoLink).has('specialtySlug')).toBe(false);
  });
});

describe('buildSearchLink (legacy alias)', () => {
  it('returns the mainLink of buildLinks', () => {
    const link = buildSearchLink('urología', 'Adeslas');
    expect(params(link).get('specialtySlug')).toBe('urologia');
    expect(params(link).get('source')).toBe('whatsapp');
  });
});
