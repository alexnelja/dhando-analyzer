import { describe, it, expect } from 'vitest';
import { createDatabase } from '../db';
import * as fs from 'fs';

describe('migrations', () => {
  it('adds new financial columns idempotently', () => {
    const db = createDatabase(':memory:');
    const cols = db.all<{ name: string }>(`PRAGMA table_info(financials)`).map(c => c.name);
    expect(cols).toEqual(expect.arrayContaining([
      'retained_earnings', 'ebit', 'total_liabilities', 'long_term_debt',
      'current_assets', 'current_liabilities', 'shares_outstanding',
      'gross_profit', 'receivables', 'ppe', 'depreciation', 'sga',
      'cash_from_ops', 'api_values_json', 'overridden_fields',
    ]));
    db.close();
  });

  it('adds market_cap + needs_manual_financials to investments', () => {
    const db = createDatabase(':memory:');
    const cols = db.all<{ name: string }>(`PRAGMA table_info(investments)`).map(c => c.name);
    expect(cols).toContain('market_cap');
    expect(cols).toContain('needs_manual_financials');
    db.close();
  });

  it('is safe to run on a re-opened database (idempotent)', () => {
    const tmp = `/tmp/dhando-mig-test-${Date.now()}.db`;
    try {
      const db1 = createDatabase(tmp);
      db1.close();
      expect(() => {
        const db2 = createDatabase(tmp);
        db2.close();
      }).not.toThrow();
    } finally {
      try { fs.unlinkSync(tmp); fs.unlinkSync(tmp + '-wal'); fs.unlinkSync(tmp + '-shm'); } catch {}
    }
  });
});
