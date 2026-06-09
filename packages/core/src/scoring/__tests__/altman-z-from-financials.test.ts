import { describe, it, expect } from 'vitest';
import { calculateAltmanZFromFinancials } from '../altman-z.js';
import type { Financial } from '../../models/financial.js';

const f = (overrides: Partial<Financial> = {}): Financial =>
  ({
    workingCapital: 800,
    totalAssets: 5000,
    retainedEarnings: 2000,
    ebit: 180,
    totalLiabilities: 2500,
    ebitda: 200,
    depreciation: 50,
    revenue: 1000,
    ...overrides,
  }) as Financial;

describe('calculateAltmanZFromFinancials', () => {
  it('returns Z-score when all fields present', () => {
    const r = calculateAltmanZFromFinancials(f(), { marketCap: 4_000_000 });
    expect('z' in r ? r.z : null).toBeGreaterThan(0);
  });

  it('falls back to ebitda - depreciation when ebit is null', () => {
    const r = calculateAltmanZFromFinancials(f({ ebit: null }), { marketCap: 4e6 });
    expect('z' in r).toBe(true);
  });

  it('returns insufficient when retainedEarnings is null and no fallback', () => {
    const r = calculateAltmanZFromFinancials(f({ retainedEarnings: null }), { marketCap: 4e6 });
    expect((r as { status: string }).status).toBe('insufficient');
    expect((r as { missingFields: string[] }).missingFields).toContain('retainedEarnings');
  });

  it('returns insufficient when marketCap is null', () => {
    const r = calculateAltmanZFromFinancials(f(), { marketCap: null });
    expect((r as { status: string }).status).toBe('insufficient');
    expect((r as { missingFields: string[] }).missingFields).toContain('marketCap');
  });

  it('insufficient when ebit AND ebitda both null (no fallback path)', () => {
    const r = calculateAltmanZFromFinancials(f({ ebit: null, ebitda: null }), { marketCap: 4e6 });
    expect((r as { status: string }).status).toBe('insufficient');
    expect((r as { missingFields: string[] }).missingFields).toContain('ebit');
  });

  it('insufficient lists ALL missing fields, not just first', () => {
    const r = calculateAltmanZFromFinancials(
      f({ retainedEarnings: null, totalLiabilities: null }),
      { marketCap: null },
    );
    const missing = (r as { missingFields: string[] }).missingFields;
    expect(missing).toEqual(
      expect.arrayContaining(['retainedEarnings', 'totalLiabilities', 'marketCap']),
    );
  });
});
