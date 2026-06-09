import { describe, it, expect } from 'vitest';
import { deriveInputsFromFinancial } from '../MagicFormula.js';
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

describe('deriveInputsFromFinancial', () => {
  it('returns null when there is no financial', () => {
    expect(deriveInputsFromFinancial({ market_cap: 1000 }, undefined)).toBeNull();
  });

  it('derives EBIT, NWC, net fixed assets and EV from a full financial + market cap', () => {
    const out = deriveInputsFromFinancial({ market_cap: 4_000_000 }, fin())!;
    expect(out.inputs.ebit).toBe(180);
    expect(out.inputs.netWorkingCapital).toBe(800);
    expect(out.inputs.netFixedAssets).toBe(3000);
    // EV = marketCap + totalDebt - cash
    expect(out.inputs.enterpriseValue).toBe(4_000_000 + 1000 - 500);
    expect(out.dataSource).toBe('eodhd');
  });

  it('falls back to ebitda - depreciation when EBIT is null', () => {
    const out = deriveInputsFromFinancial({ market_cap: 1 }, fin({ ebit: null }))!;
    expect(out.inputs.ebit).toBe(200 - 50);
  });

  it('falls back to currentAssets - currentLiabilities for NWC', () => {
    const out = deriveInputsFromFinancial({ market_cap: 1 }, fin({ workingCapital: null }))!;
    expect(out.inputs.netWorkingCapital).toBe(1500 - 700);
  });

  it('keeps default enterprise value when market cap is unknown', () => {
    const out = deriveInputsFromFinancial({ market_cap: null }, fin())!;
    expect(out.inputs.enterpriseValue).toBe(550000000); // DEFAULT_INPUTS.enterpriseValue
  });

  it('reports manual data source for manually-entered financials', () => {
    const out = deriveInputsFromFinancial({ market_cap: 1 }, fin({ source: 'manual' }))!;
    expect(out.dataSource).toBe('manual');
  });
});
