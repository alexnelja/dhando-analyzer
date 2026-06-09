import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabase, type DatabaseConnection, type Financial } from '@dhando/core';
import {
  financialsGet,
  financialsSave,
  financialsPull,
  financialsExtract,
} from '../financials-handlers.js';

function seedInvestment(db: DatabaseConnection, id: string) {
  db.run(
    `INSERT INTO investments (id, type, name, ticker, status, created_at, updated_at)
     VALUES (?, 'equity', ?, 'TST', 'researching', '2025-01-01', '2025-01-01')`,
    id,
    `Co ${id}`,
  );
}

const financial = (overrides: Partial<Financial> = {}): Financial =>
  ({
    id: 'inv1-annual-2025-A',
    investmentId: 'inv1',
    source: 'manual',
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

describe('financials-handlers', () => {
  let db: DatabaseConnection;
  beforeEach(() => {
    db = createDatabase(':memory:');
    seedInvestment(db, 'inv1');
  });

  it('save then get round-trips a row', () => {
    financialsSave(db, financial());
    const rows = financialsGet(db, 'inv1');
    expect(rows).toHaveLength(1);
    expect(rows[0].revenue).toBe(1000);
  });

  it('pull saves rows via the injected fetcher', async () => {
    const fetcher = vi.fn(async () => [
      { source: 'api' as const, period: 'annual' as const, year: 2025, quarter: null, revenue: 999 },
    ]);
    const n = await financialsPull(db, fetcher, 'inv1', 'AAPL.US', 1);
    expect(n).toBe(1);
    expect(fetcher).toHaveBeenCalledWith('AAPL.US', 1);
    expect(financialsGet(db, 'inv1')[0].revenue).toBe(999);
  });

  it('extract saves every period returned by Claude and returns them', async () => {
    const client = {
      chat: vi.fn(async () => JSON.stringify([{ year: 2025, revenue: 500 }, { year: 2024, revenue: 400 }])),
    };
    const rows = await financialsExtract(db, client, 'inv1', 'pasted income statement');
    expect(rows).toHaveLength(2);
    expect(financialsGet(db, 'inv1')).toHaveLength(2);
    expect(financialsGet(db, 'inv1').find((r) => r.year === 2025)?.source).toBe('manual');
  });
});
