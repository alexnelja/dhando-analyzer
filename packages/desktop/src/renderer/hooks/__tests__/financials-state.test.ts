import { describe, it, expect } from 'vitest';
import { computeFinancialsState } from '../useFinancials.js';
import type { Financial } from '@dhando/core';

const full = (overrides: Partial<Financial> = {}): Financial =>
  ({
    id: 'x',
    investmentId: 'inv1',
    source: 'api',
    period: 'annual',
    year: 2025,
    quarter: null,
    revenue: 1000,
    netIncome: 100,
    ebitda: 200,
    totalAssets: 5000,
    totalDebt: 1000,
    cash: 500,
    capex: 100,
    fcf: 80,
    workingCapital: 800,
    retainedEarnings: 2000,
    ebit: 180,
    totalLiabilities: 2500,
    longTermDebt: 800,
    currentAssets: 1500,
    currentLiabilities: 700,
    sharesOutstanding: 1_000_000,
    grossProfit: 400,
    receivables: 200,
    ppe: 3000,
    depreciation: 50,
    sga: 150,
    cashFromOps: 120,
    apiValuesJson: null,
    overriddenFields: null,
    autoUpdated: false,
    lastRefresh: null,
    apiSource: null,
    ...overrides,
  }) as Financial;

describe('computeFinancialsState', () => {
  it('returns missing for 0 rows', () => {
    const s = computeFinancialsState([]);
    expect(s.status).toBe('missing');
    expect(s.current).toBeNull();
  });

  it('returns loaded for two fully-populated years', () => {
    const s = computeFinancialsState([full({ year: 2025 }), full({ year: 2024 })]);
    expect(s.status).toBe('loaded');
    expect(s.missingFields).toEqual([]);
    expect(s.current?.year).toBe(2025);
    expect(s.prior?.year).toBe(2024);
  });

  it('returns incomplete with one year (two needed for Piotroski/Beneish)', () => {
    const s = computeFinancialsState([full()]);
    expect(s.status).toBe('incomplete');
    expect(s.missingFields).toContain('prior');
  });

  it('returns incomplete and names the missing current-year field', () => {
    const s = computeFinancialsState([full({ cashFromOps: null }), full({ year: 2024 })]);
    expect(s.status).toBe('incomplete');
    expect(s.missingFields.some((m) => m.includes('cashFromOps'))).toBe(true);
  });

  it('does not flag marketCap as a missing statement field', () => {
    const s = computeFinancialsState([full({ year: 2025 }), full({ year: 2024 })]);
    expect(s.missingFields).not.toContain('marketCap');
  });
});
