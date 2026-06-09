import { describe, it, expect } from 'vitest';
import { calculateBeneishMFromFinancials } from '../beneish-m.js';
import type { Financial } from '../../models/financial.js';

const f = (overrides: Partial<Financial> = {}): Financial =>
  ({
    receivables: 200,
    revenue: 1000,
    grossProfit: 400,
    currentAssets: 1500,
    ppe: 3000,
    totalAssets: 5000,
    depreciation: 50,
    sga: 150,
    netIncome: 100,
    currentLiabilities: 700,
    longTermDebt: 800,
    cashFromOps: 120,
    ...overrides,
  }) as Financial;

describe('calculateBeneishMFromFinancials', () => {
  it('returns an M-score and 8 indices with full data', () => {
    const r = calculateBeneishMFromFinancials(f(), f({ revenue: 900, receivables: 150 }));
    expect('mScore' in r).toBe(true);
    if ('mScore' in r) {
      expect(typeof r.mScore).toBe('number');
      expect(Object.keys(r.indices)).toEqual(
        expect.arrayContaining(['DSRI', 'GMI', 'AQI', 'SGI', 'DEPI', 'SGAI', 'TATA', 'LVGI']),
      );
    }
  });

  it('insufficient when current.receivables is null', () => {
    const r = calculateBeneishMFromFinancials(f({ receivables: null }), f());
    expect((r as { status: string }).status).toBe('insufficient');
    expect((r as { missingFields: string[] }).missingFields.some((m) => m.includes('receivables'))).toBe(true);
  });

  it('insufficient when prior is null', () => {
    const r = calculateBeneishMFromFinancials(f(), null);
    expect((r as { status: string }).status).toBe('insufficient');
    expect((r as { missingFields: string[] }).missingFields).toContain('prior');
  });

  it('insufficient when ppe is null on the prior year (AQI needs both years)', () => {
    const r = calculateBeneishMFromFinancials(f(), f({ ppe: null }));
    expect((r as { status: string }).status).toBe('insufficient');
    expect((r as { missingFields: string[] }).missingFields.some((m) => m.includes('ppe'))).toBe(true);
  });

  it('insufficient when current.cashFromOps is null (TATA needs it)', () => {
    const r = calculateBeneishMFromFinancials(f({ cashFromOps: null }), f());
    expect((r as { status: string }).status).toBe('insufficient');
    expect((r as { missingFields: string[] }).missingFields.some((m) => m.includes('cashFromOps'))).toBe(true);
  });
});
