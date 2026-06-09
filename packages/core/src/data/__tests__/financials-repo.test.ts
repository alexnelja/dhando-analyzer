import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../db.js';
import {
  saveFinancial,
  getFinancialsForInvestment,
  getCurrentAndPrior,
} from '../financials-repo.js';
import type { Financial } from '../../models/financial.js';

const fixture = (overrides: Partial<Financial> = {}): Financial => ({
  id: 'f1',
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
  apiSource: 'eodhd',
  ...overrides,
});

describe('financials-repo', () => {
  let db: DatabaseConnection;
  beforeEach(() => {
    db = createDatabase(':memory:');
    db.run(
      `INSERT INTO investments (id, type, name, ticker, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'inv1',
      'equity',
      'Test',
      'TST',
      'researching',
      '2025-01-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
    );
  });

  it('round-trips all numeric fields', () => {
    saveFinancial(db, fixture());
    const rows = getFinancialsForInvestment(db, 'inv1');
    expect(rows).toHaveLength(1);
    expect(rows[0].retainedEarnings).toBe(2000);
    expect(rows[0].cashFromOps).toBe(120);
    expect(rows[0].sharesOutstanding).toBe(1_000_000);
    expect(rows[0].source).toBe('api');
    expect(rows[0].apiSource).toBe('eodhd');
  });

  it('returns current + prior in correct order', () => {
    saveFinancial(db, fixture({ id: 'f24', year: 2024 }));
    saveFinancial(db, fixture({ id: 'f25', year: 2025 }));
    saveFinancial(db, fixture({ id: 'f23', year: 2023 }));
    const { current, prior } = getCurrentAndPrior(db, 'inv1');
    expect(current?.year).toBe(2025);
    expect(prior?.year).toBe(2024);
  });

  it('upsert: same investmentId+period+year+quarter overwrites', () => {
    saveFinancial(db, fixture());
    saveFinancial(db, fixture({ revenue: 2000 }));
    const rows = getFinancialsForInvestment(db, 'inv1');
    expect(rows).toHaveLength(1);
    expect(rows[0].revenue).toBe(2000);
  });

  it('persists overriddenFields as JSON array', () => {
    saveFinancial(db, fixture({ overriddenFields: JSON.stringify(['revenue', 'ebitda']) }));
    const rows = getFinancialsForInvestment(db, 'inv1');
    expect(JSON.parse(rows[0].overriddenFields!)).toEqual(['revenue', 'ebitda']);
  });

  it('treats different quarters of the same year as distinct rows', () => {
    saveFinancial(db, fixture({ id: 'q1', period: 'quarterly', quarter: 1, revenue: 250 }));
    saveFinancial(db, fixture({ id: 'q2', period: 'quarterly', quarter: 2, revenue: 260 }));
    const rows = getFinancialsForInvestment(db, 'inv1');
    expect(rows).toHaveLength(2);
  });

  it('round-trips lastRefresh as a Date and autoUpdated as boolean', () => {
    const when = new Date('2025-06-01T12:00:00.000Z');
    saveFinancial(db, fixture({ autoUpdated: true, lastRefresh: when }));
    const rows = getFinancialsForInvestment(db, 'inv1');
    expect(rows[0].autoUpdated).toBe(true);
    expect(rows[0].lastRefresh?.toISOString()).toBe(when.toISOString());
  });
});
