import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import {
  upsertSuperInvestorPositions,
  getConvergenceSignals,
  type SuperInvestorConvergenceSignal,
} from '../../src/screener/super-investor-store.js';

let db: DatabaseConnection;

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

describe('upsertSuperInvestorPositions', () => {
  it('inserts new positions', () => {
    upsertSuperInvestorPositions(db, [
      { investorName: 'Buffett', ticker: 'AAPL', action: 'buy', quarter: '2024Q1', shares: 1000, value: 150000 },
    ]);

    const rows = db.all<{ investor_name: string; ticker: string }>(
      'SELECT investor_name, ticker FROM super_investor_positions',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].investor_name).toBe('Buffett');
    expect(rows[0].ticker).toBe('AAPL');
  });

  it('does not create a duplicate when upserting the same natural key', () => {
    const pos = {
      investorName: 'Buffett',
      ticker: 'AAPL',
      action: 'buy' as const,
      quarter: '2024Q1',
      shares: 1000,
      value: 150000,
    };

    upsertSuperInvestorPositions(db, [pos]);
    upsertSuperInvestorPositions(db, [{ ...pos, shares: 2000 }]);

    const rows = db.all('SELECT * FROM super_investor_positions');
    expect(rows).toHaveLength(1);
  });

  it('updates the action and shares when upserting an existing key', () => {
    upsertSuperInvestorPositions(db, [
      { investorName: 'Munger', ticker: 'BYD', action: 'buy', quarter: '2024Q2', shares: 500, value: 50000 },
    ]);
    upsertSuperInvestorPositions(db, [
      { investorName: 'Munger', ticker: 'BYD', action: 'sell', quarter: '2024Q2', shares: 250, value: 25000 },
    ]);

    const row = db.get<{ action: string; shares: number }>(
      'SELECT action, shares FROM super_investor_positions WHERE investor_name = ? AND ticker = ? AND quarter = ?',
      'Munger', 'BYD', '2024Q2',
    );
    expect(row!.action).toBe('sell');
    expect(row!.shares).toBe(250);
  });

  it('inserts multiple positions in one call', () => {
    upsertSuperInvestorPositions(db, [
      { investorName: 'Buffett', ticker: 'KO', action: 'buy', quarter: '2024Q1', shares: 400000000, value: 24000000000 },
      { investorName: 'Buffett', ticker: 'AXP', action: 'buy', quarter: '2024Q1', shares: 151610700, value: 20000000000 },
    ]);

    const rows = db.all('SELECT ticker FROM super_investor_positions');
    expect(rows).toHaveLength(2);
  });
});

describe('getConvergenceSignals', () => {
  it('returns tickers where distinct investor count meets threshold', () => {
    upsertSuperInvestorPositions(db, [
      { investorName: 'Buffett', ticker: 'AAPL', action: 'buy', quarter: '2024Q1', shares: 100, value: 100 },
      { investorName: 'Ackman',  ticker: 'AAPL', action: 'buy', quarter: '2024Q1', shares: 100, value: 100 },
      { investorName: 'Lynch',   ticker: 'AAPL', action: 'buy', quarter: '2024Q1', shares: 100, value: 100 },
    ]);

    const signals = getConvergenceSignals(db, 3);
    expect(signals).toHaveLength(1);
    expect(signals[0].ticker).toBe('AAPL');
    expect(signals[0].count).toBe(3);
    expect(signals[0].investors).toEqual(['Ackman', 'Buffett', 'Lynch']);
  });

  it('does not return tickers below the threshold', () => {
    upsertSuperInvestorPositions(db, [
      { investorName: 'Buffett', ticker: 'GOOG', action: 'buy', quarter: '2024Q1', shares: 100, value: 100 },
      { investorName: 'Ackman',  ticker: 'GOOG', action: 'buy', quarter: '2024Q1', shares: 100, value: 100 },
    ]);

    const signals = getConvergenceSignals(db, 3);
    expect(signals).toHaveLength(0);
  });

  it('deduplicates the same investor across multiple quarters', () => {
    // Buffett holds MSFT in two quarters — should still count as 1 distinct investor.
    upsertSuperInvestorPositions(db, [
      { investorName: 'Buffett', ticker: 'MSFT', action: 'buy', quarter: '2024Q1', shares: 100, value: 100 },
      { investorName: 'Buffett', ticker: 'MSFT', action: 'buy', quarter: '2024Q2', shares: 100, value: 100 },
      { investorName: 'Ackman',  ticker: 'MSFT', action: 'buy', quarter: '2024Q1', shares: 100, value: 100 },
    ]);

    const signals = getConvergenceSignals(db, 3);
    // Only 2 distinct investors — below threshold of 3.
    expect(signals).toHaveLength(0);
  });

  it('uses default threshold of 3 when none supplied', () => {
    upsertSuperInvestorPositions(db, [
      { investorName: 'A', ticker: 'XYZ', action: 'buy', quarter: '2024Q1', shares: 1, value: 1 },
      { investorName: 'B', ticker: 'XYZ', action: 'buy', quarter: '2024Q1', shares: 1, value: 1 },
      { investorName: 'C', ticker: 'XYZ', action: 'buy', quarter: '2024Q1', shares: 1, value: 1 },
    ]);

    const signals = getConvergenceSignals(db);
    expect(signals).toHaveLength(1);
    expect(signals[0].ticker).toBe('XYZ');
  });
});
