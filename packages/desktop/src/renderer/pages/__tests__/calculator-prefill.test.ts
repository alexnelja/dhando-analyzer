import { describe, it, expect } from 'vitest';
import { buildValuationPrefill } from '../Calculator.js';
import type { Financial } from '@dhando/core';

const fin = (overrides: Partial<Financial> = {}): Financial =>
  ({
    id: 'f', investmentId: 'inv1', source: 'api', period: 'annual', year: 2025, quarter: null,
    revenue: 1000, netIncome: 100, ebitda: 200, totalAssets: 5000, totalDebt: 1000, cash: 500,
    capex: 100, fcf: 80, workingCapital: 800, retainedEarnings: 2000, ebit: 180,
    totalLiabilities: 2500, longTermDebt: 800, currentAssets: 1500, currentLiabilities: 700,
    sharesOutstanding: 1_000_000, grossProfit: 400, receivables: 200, ppe: 3000,
    depreciation: 50, sga: 150, cashFromOps: 120, apiValuesJson: null, overriddenFields: null,
    autoUpdated: false, lastRefresh: null, apiSource: 'eodhd', ...overrides,
  }) as Financial;

describe('buildValuationPrefill', () => {
  it('maps the EV/FCF and ROIC fields from a financial + market cap', () => {
    const p = buildValuationPrefill(fin(), 4_000_000);
    expect(p.roicEbit).toBe('180');
    expect(p.roicWC).toBe('800');
    expect(p.roicFA).toBe('3000');
    expect(p.evfcfMktCap).toBe('4000000');
    expect(p.evfcfDebt).toBe('1000');
    expect(p.evfcfCash).toBe('500');
    expect(p.evfcfFCF).toBe('80');
  });

  it('falls back to ebitda - depreciation for EBIT', () => {
    expect(buildValuationPrefill(fin({ ebit: null }), 1).roicEbit).toBe('150');
  });

  it('falls back to currentAssets - currentLiabilities for working capital', () => {
    expect(buildValuationPrefill(fin({ workingCapital: null }), 1).roicWC).toBe('800');
  });

  it('falls back to totalLiabilities when totalDebt is null', () => {
    expect(buildValuationPrefill(fin({ totalDebt: null }), 1).evfcfDebt).toBe('2500');
  });

  it('leaves market cap blank when unknown', () => {
    expect(buildValuationPrefill(fin(), null).evfcfMktCap).toBe('');
  });

  it('blanks fields that are entirely absent', () => {
    const p = buildValuationPrefill(fin({ fcf: null, cash: null, ppe: null }), 1);
    expect(p.evfcfFCF).toBe('');
    expect(p.evfcfCash).toBe('');
    expect(p.roicFA).toBe('');
  });
});
