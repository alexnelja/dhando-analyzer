import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import {
  upsertPosition,
  getPosition,
  listActivePositions,
  closePosition,
} from '../../src/portfolio/position-store.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const INVESTMENT_ID = 'inv-001';
const NOW = '2024-01-15T10:00:00.000Z';

/**
 * Seed a minimal investment row so foreign-key constraints are satisfied.
 */
function seedInvestment(db: DatabaseConnection, id: string = INVESTMENT_ID): void {
  db.run(
    `INSERT INTO investments
       (id, type, name, ticker, exchange, sector, industry, status, data_source, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    'listed_stock',
    'Test Company',
    'TST',
    'JSE',
    'Financials',
    'Banking',
    'active',
    'manual',
    'solo-investor',
    NOW,
    NOW,
  );
}

describe('position-store', () => {
  let db: DatabaseConnection;

  beforeEach(() => {
    db = createDatabase(':memory:');
    seedInvestment(db);
  });

  afterEach(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // upsertPosition
  // ---------------------------------------------------------------------------

  it('inserts a new position and returns an id', () => {
    const id = upsertPosition(db, {
      investmentId: INVESTMENT_ID,
      costBasis: 100,
      shares: 50,
      enteredAt: NOW,
    });

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('position can be retrieved after insert', () => {
    upsertPosition(db, {
      investmentId: INVESTMENT_ID,
      costBasis: 100,
      shares: 50,
      enteredAt: NOW,
    });

    const row = getPosition(db, INVESTMENT_ID);

    expect(row).toBeDefined();
    expect(row!.investmentId).toBe(INVESTMENT_ID);
    expect(row!.costBasis).toBe(100);
    expect(row!.shares).toBe(50);
    expect(row!.enteredAt).toBe(NOW);
    expect(row!.exitedAt).toBeNull();
    expect(row!.exitPrice).toBeNull();
  });

  it('upsert replaces an existing position', () => {
    const firstId = upsertPosition(db, {
      investmentId: INVESTMENT_ID,
      costBasis: 100,
      shares: 50,
      enteredAt: NOW,
    });

    const secondId = upsertPosition(db, {
      investmentId: INVESTMENT_ID,
      costBasis: 120,
      shares: 60,
      enteredAt: NOW,
    });

    // Same id should be preserved (existing row is replaced).
    expect(secondId).toBe(firstId);

    const row = getPosition(db, INVESTMENT_ID);
    expect(row!.costBasis).toBe(120);
    expect(row!.shares).toBe(60);
  });

  it('defaults enteredAt to current time when not provided', () => {
    const before = new Date().toISOString();
    upsertPosition(db, { investmentId: INVESTMENT_ID, costBasis: 100, shares: 10 });
    const after = new Date().toISOString();

    const row = getPosition(db, INVESTMENT_ID);
    expect(row!.enteredAt >= before).toBe(true);
    expect(row!.enteredAt <= after).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // getPosition
  // ---------------------------------------------------------------------------

  it('returns undefined for an investment with no position', () => {
    const row = getPosition(db, 'does-not-exist');
    expect(row).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // listActivePositions
  // ---------------------------------------------------------------------------

  it('returns empty array when no active positions exist', () => {
    const rows = listActivePositions(db);
    expect(rows).toHaveLength(0);
  });

  it('lists only active (non-exited) positions', () => {
    const id2 = 'inv-002';
    seedInvestment(db, id2);

    upsertPosition(db, { investmentId: INVESTMENT_ID, costBasis: 100, shares: 10, enteredAt: NOW });
    upsertPosition(db, { investmentId: id2, costBasis: 200, shares: 5, enteredAt: NOW });

    // Close the first position.
    closePosition(db, INVESTMENT_ID, 150);

    const active = listActivePositions(db);
    expect(active).toHaveLength(1);
    expect(active[0].investmentId).toBe(id2);
  });

  it('includes all active positions when none are closed', () => {
    const id2 = 'inv-002';
    seedInvestment(db, id2);

    upsertPosition(db, { investmentId: INVESTMENT_ID, costBasis: 100, shares: 10, enteredAt: NOW });
    upsertPosition(db, { investmentId: id2, costBasis: 200, shares: 5, enteredAt: NOW });

    const active = listActivePositions(db);
    expect(active).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // closePosition
  // ---------------------------------------------------------------------------

  it('sets exitedAt and exitPrice when closing a position', () => {
    upsertPosition(db, { investmentId: INVESTMENT_ID, costBasis: 100, shares: 10, enteredAt: NOW });

    const before = new Date().toISOString();
    closePosition(db, INVESTMENT_ID, 180);
    const after = new Date().toISOString();

    const row = getPosition(db, INVESTMENT_ID);
    expect(row!.exitPrice).toBe(180);
    expect(row!.exitedAt).not.toBeNull();
    expect(row!.exitedAt! >= before).toBe(true);
    expect(row!.exitedAt! <= after).toBe(true);
  });

  it('closed position no longer appears in listActivePositions', () => {
    upsertPosition(db, { investmentId: INVESTMENT_ID, costBasis: 100, shares: 10, enteredAt: NOW });
    closePosition(db, INVESTMENT_ID, 200);

    const active = listActivePositions(db);
    expect(active).toHaveLength(0);
  });

  it('throws when closing a position that does not exist', () => {
    expect(() => closePosition(db, 'ghost-investment', 100)).toThrow(
      /no position found for investment/,
    );
  });
});
