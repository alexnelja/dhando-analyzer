import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';

describe('Database connection', () => {
  let db: DatabaseConnection;

  afterEach(() => {
    if (db) db.close();
  });

  it('creates an in-memory database', () => {
    db = createDatabase(':memory:');
    expect(db).toBeDefined();
  });

  it('creates all 16 tables on initialisation', () => {
    db = createDatabase(':memory:');
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const tableNames = tables.map((t) => t.name);

    const expected = [
      'comparable_transactions',
      'decision_journal',
      'decision_snapshots',
      'distress_components',
      'distress_summary',
      'financials',
      'geopolitical_events',
      'investments',
      'portfolio_positions',
      'rule_audit_log',
      'rules',
      'scenarios',
      'sentiment',
      'super_investor_positions',
      'sync_conflict_log',
    ];

    for (const table of expected) {
      expect(tableNames, `expected table '${table}' to exist`).toContain(table);
    }
  });

  it('can insert and query an investment', () => {
    db = createDatabase(':memory:');
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO investments
         (id, type, name, ticker, exchange, sector, industry, status, data_source, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      '1',
      'listed_stock',
      'Capitec Bank',
      'CPI',
      'JSE',
      'Financials',
      'Banking',
      'screening',
      'eodhd',
      'solo-investor',
      now,
      now,
    );

    const result = db.get<{ name: string; ticker: string }>(
      'SELECT name, ticker FROM investments WHERE id = ?',
      '1',
    );
    expect(result?.name).toBe('Capitec Bank');
    expect(result?.ticker).toBe('CPI');
  });

  it('enforces foreign key constraints', () => {
    db = createDatabase(':memory:');
    expect(() => {
      db.run(
        `INSERT INTO financials (id, investment_id, source, period, year) VALUES (?, ?, ?, ?, ?)`,
        '1',
        'nonexistent-investment-id',
        'manual',
        'annual',
        2026,
      );
    }).toThrow();
  });

  it('allows re-opening an existing database without error', () => {
    // Idempotent DDL: CREATE TABLE IF NOT EXISTS should not throw on second open.
    const path = ':memory:';
    const first = createDatabase(path);
    first.close();
    // A second in-memory DB is independent, but this validates the DDL path runs cleanly.
    const second = createDatabase(path);
    expect(second).toBeDefined();
    db = second;
  });

  it('can insert financials linked to a valid investment', () => {
    db = createDatabase(':memory:');
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'inv-1',
      'listed_stock',
      'Naspers',
      'active',
      'manual',
      'solo-investor',
      now,
      now,
    );

    db.run(
      `INSERT INTO financials (id, investment_id, source, period, year, revenue, net_income)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'fin-1',
      'inv-1',
      'manual',
      'annual',
      2025,
      150_000_000,
      18_000_000,
    );

    const row = db.get<{ revenue: number; net_income: number }>(
      'SELECT revenue, net_income FROM financials WHERE id = ?',
      'fin-1',
    );
    expect(row?.revenue).toBe(150_000_000);
    expect(row?.net_income).toBe(18_000_000);
  });
});
