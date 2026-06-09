import { describe, it, expect, vi, afterEach } from 'vitest';
import { pullStatements, mapEodhdToFinancial } from '../eodhd-statements.js';

const FUNDAMENTALS = {
  Financials: {
    Income_Statement: {
      yearly: {
        '2025-12-31': {
          totalRevenue: '1000',
          netIncome: '100',
          ebitda: '200',
          ebit: '180',
          grossProfit: '400',
          sellingGeneralAdministrative: '150',
        },
        '2024-12-31': {
          totalRevenue: '900',
          netIncome: '60',
          ebitda: '180',
          ebit: '160',
          grossProfit: '360',
          sellingGeneralAdministrative: '140',
        },
        '2023-12-31': {
          totalRevenue: '800',
          netIncome: '40',
        },
      },
    },
    Balance_Sheet: {
      yearly: {
        '2025-12-31': {
          totalAssets: '5000',
          totalLiab: '2500',
          cash: '500',
          retainedEarnings: '2000',
          longTermDebt: '800',
          totalCurrentAssets: '1500',
          totalCurrentLiabilities: '700',
          commonStockSharesOutstanding: '1000000',
          netReceivables: '200',
          propertyPlantEquipment: '3000',
          netWorkingCapital: '800',
          shortLongTermDebtTotal: '1000',
        },
        '2024-12-31': {
          totalAssets: '4500',
          totalLiab: '2300',
        },
      },
    },
    Cash_Flow: {
      yearly: {
        '2025-12-31': {
          totalCashFromOperatingActivities: '120',
          capitalExpenditures: '100',
          freeCashFlow: '80',
          depreciation: '50',
        },
      },
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mapEodhdToFinancial', () => {
  it('maps every supported field for a year', () => {
    const m = mapEodhdToFinancial('2025-12-31', FUNDAMENTALS.Financials);
    expect(m.year).toBe(2025);
    expect(m.source).toBe('api');
    expect(m.period).toBe('annual');
    expect(m.revenue).toBe(1000);
    expect(m.netIncome).toBe(100);
    expect(m.ebitda).toBe(200);
    expect(m.ebit).toBe(180);
    expect(m.grossProfit).toBe(400);
    expect(m.sga).toBe(150);
    expect(m.totalAssets).toBe(5000);
    expect(m.totalLiabilities).toBe(2500);
    expect(m.cash).toBe(500);
    expect(m.retainedEarnings).toBe(2000);
    expect(m.longTermDebt).toBe(800);
    expect(m.currentAssets).toBe(1500);
    expect(m.currentLiabilities).toBe(700);
    expect(m.sharesOutstanding).toBe(1_000_000);
    expect(m.receivables).toBe(200);
    expect(m.ppe).toBe(3000);
    expect(m.workingCapital).toBe(800);
    expect(m.totalDebt).toBe(1000);
    expect(m.cashFromOps).toBe(120);
    expect(m.capex).toBe(100);
    expect(m.fcf).toBe(80);
    expect(m.depreciation).toBe(50);
  });

  it('returns null for absent fields rather than NaN', () => {
    const m = mapEodhdToFinancial('2023-12-31', FUNDAMENTALS.Financials);
    expect(m.revenue).toBe(800);
    expect(m.totalAssets).toBeNull();
    expect(m.cashFromOps).toBeNull();
  });
});

describe('pullStatements', () => {
  it('returns the N most recent annual periods, newest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => FUNDAMENTALS })),
    );
    const rows = await pullStatements('KEY', 'AAPL.US', 2);
    expect(rows).toHaveLength(2);
    expect(rows[0].year).toBe(2025);
    expect(rows[1].year).toBe(2024);
  });

  it('returns [] on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    const rows = await pullStatements('KEY', 'UNKNOWN.US', 2);
    expect(rows).toEqual([]);
  });

  it('throws on 429 (rate limited)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })),
    );
    await expect(pullStatements('KEY', 'AAPL.US', 2)).rejects.toThrow(/429/);
  });
});
