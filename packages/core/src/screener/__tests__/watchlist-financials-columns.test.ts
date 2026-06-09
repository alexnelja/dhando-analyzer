import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../data/db.js';
import { addToWatchlist, getWatchlist, getInvestmentById } from '../watchlist.js';

describe('watchlist surfaces financials columns', () => {
  let db: DatabaseConnection;
  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('includes market_cap and needs_manual_financials on returned rows', () => {
    const id = addToWatchlist(db, { type: 'equity', name: 'Test', ticker: 'TST' });
    db.run(
      `UPDATE investments SET market_cap = ?, needs_manual_financials = ? WHERE id = ?`,
      4_000_000,
      1,
      id,
    );

    const [row] = getWatchlist(db);
    expect(row.market_cap).toBe(4_000_000);
    expect(row.needs_manual_financials).toBe(1);

    const byId = getInvestmentById(db, id);
    expect(byId?.market_cap).toBe(4_000_000);
    expect(byId?.needs_manual_financials).toBe(1);
  });

  it('defaults needs_manual_financials to 0 and market_cap to null for new rows', () => {
    addToWatchlist(db, { type: 'equity', name: 'Fresh' });
    const [row] = getWatchlist(db);
    expect(row.market_cap).toBeNull();
    expect(row.needs_manual_financials).toBe(0);
  });
});
