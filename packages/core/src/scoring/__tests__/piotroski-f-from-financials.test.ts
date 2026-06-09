import { describe, it, expect } from 'vitest';
import { calculatePiotroskiFFromFinancials } from '../piotroski-f.js';
import type { Financial } from '../../models/financial.js';

const f = (overrides: Partial<Financial> = {}): Financial =>
  ({
    netIncome: 100,
    cashFromOps: 120,
    totalAssets: 5000,
    longTermDebt: 800,
    currentAssets: 1500,
    currentLiabilities: 700,
    sharesOutstanding: 1_000_000,
    grossProfit: 400,
    revenue: 1000,
    ebitda: 200,
    depreciation: 50,
    ...overrides,
  }) as Financial;

describe('calculatePiotroskiFFromFinancials', () => {
  it('returns a 0..9 score with full data', () => {
    const r = calculatePiotroskiFFromFinancials(f(), f({ netIncome: 60, cashFromOps: 70 }));
    expect('score' in r).toBe(true);
    if ('score' in r) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(9);
      expect(r.signals).toHaveLength(9);
    }
  });

  it('insufficient when current.cashFromOps is null', () => {
    const r = calculatePiotroskiFFromFinancials(f({ cashFromOps: null }), f());
    expect((r as { status: string }).status).toBe('insufficient');
    expect((r as { missingFields: string[] }).missingFields.some((m) => m.includes('cashFromOps'))).toBe(true);
  });

  it('insufficient when prior is null', () => {
    const r = calculatePiotroskiFFromFinancials(f(), null);
    expect((r as { status: string }).status).toBe('insufficient');
    expect((r as { missingFields: string[] }).missingFields).toContain('prior');
  });

  it('insufficient when a current-year field is missing but prior has it', () => {
    const r = calculatePiotroskiFFromFinancials(f({ grossProfit: null }), f());
    expect((r as { status: string }).status).toBe('insufficient');
    expect((r as { missingFields: string[] }).missingFields.some((m) => m.includes('grossProfit'))).toBe(true);
  });

  it('still computes when fields are all present', () => {
    const r = calculatePiotroskiFFromFinancials(f(), f({ netIncome: 50 }));
    expect('score' in r).toBe(true);
  });
});
