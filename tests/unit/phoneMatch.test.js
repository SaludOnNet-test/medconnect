import { describe, it, expect, vi } from 'vitest';

// whatsapp.js imports DB + Sentry + provider at module level; stub them so the
// pure phone helper can be tested without an mssql/Azure connection.
vi.mock('@/lib/db', () => ({ getPool: vi.fn(), DB_AVAILABLE: false }));
vi.mock('mssql', () => ({ default: {} }));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(async () => {}) }));

const { last9Digits } = await import('@/lib/whatsapp');

describe('last9Digits', () => {
  it('strips country prefix (34677860180 → 677860180)', () => {
    expect(last9Digits('34677860180')).toBe('677860180');
  });

  it('strips + and spaces (+34 677 86 01 80 → 677860180)', () => {
    expect(last9Digits('+34 677 86 01 80')).toBe('677860180');
  });

  it('strips 00 international prefix (0034677860180 → 677860180)', () => {
    expect(last9Digits('0034677860180')).toBe('677860180');
  });

  it('leaves a bare 9-digit mobile untouched (677860180 → 677860180)', () => {
    expect(last9Digits('677860180')).toBe('677860180');
  });

  it('returns empty string when fewer than 9 digits', () => {
    expect(last9Digits('abc')).toBe('');
    expect(last9Digits('12345')).toBe('');
    expect(last9Digits('')).toBe('');
    expect(last9Digits(null)).toBe('');
    expect(last9Digits(undefined)).toBe('');
  });
});
