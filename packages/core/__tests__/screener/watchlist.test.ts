import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import {
  addToWatchlist,
  removeFromWatchlist,
  advancePipelineStatus,
  getWatchlist,
  getInvestmentById,
} from '../../src/screener/watchlist.js';

let db: DatabaseConnection;

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

const BASE_ENTRY = {
  type: 'listed_stock',
  name: 'Apple Inc.',
  ticker: 'AAPL',
} as const;

describe('addToWatchlist', () => {
  it('inserts an investment with status screening and returns its id', () => {
    const id = addToWatchlist(db, BASE_ENTRY);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const row = getInvestmentById(db, id);
    expect(row).toBeDefined();
    expect(row!.status).toBe('screening');
    expect(row!.name).toBe('Apple Inc.');
  });

  it('uses a provided id when supplied', () => {
    const id = addToWatchlist(db, { ...BASE_ENTRY, id: 'fixed-id' });
    expect(id).toBe('fixed-id');
    expect(getInvestmentById(db, 'fixed-id')).toBeDefined();
  });

  it('generates a unique id when none is provided', () => {
    const id1 = addToWatchlist(db, BASE_ENTRY);
    const id2 = addToWatchlist(db, { ...BASE_ENTRY, name: 'Google' });
    expect(id1).not.toBe(id2);
  });

  it('defaults data_source to manual and user_id to solo-investor', () => {
    const id = addToWatchlist(db, BASE_ENTRY);
    const row = getInvestmentById(db, id);
    expect(row!.data_source).toBe('manual');
    expect(row!.user_id).toBe('solo-investor');
  });
});

describe('removeFromWatchlist', () => {
  it('sets status to rejected without deleting the row', () => {
    const id = addToWatchlist(db, BASE_ENTRY);
    removeFromWatchlist(db, id);

    const row = getInvestmentById(db, id);
    expect(row).toBeDefined();
    expect(row!.status).toBe('rejected');
  });

  it('rejected investments do not appear when filtering by screening', () => {
    const id = addToWatchlist(db, BASE_ENTRY);
    removeFromWatchlist(db, id);

    const screening = getWatchlist(db, 'screening');
    expect(screening.map((r) => r.id)).not.toContain(id);
  });
});

describe('advancePipelineStatus', () => {
  it('advances from screening to researching', () => {
    const id = addToWatchlist(db, BASE_ENTRY);
    advancePipelineStatus(db, id);

    expect(getInvestmentById(db, id)!.status).toBe('researching');
  });

  it('advances through the full pipeline in order', () => {
    const id = addToWatchlist(db, BASE_ENTRY);
    const stages = ['researching', 'deep_dive', 'ready_to_buy', 'held'];

    for (const expected of stages) {
      advancePipelineStatus(db, id);
      expect(getInvestmentById(db, id)!.status).toBe(expected);
    }
  });

  it.each([
    ['held'],
    ['exited'],
    ['rejected'],
  ] as const)('throws when status is terminal: %s', (terminalStatus) => {
    const id = addToWatchlist(db, BASE_ENTRY);
    db.run(`UPDATE investments SET status = ? WHERE id = ?`, terminalStatus, id);

    expect(() => advancePipelineStatus(db, id)).toThrow(/terminal status/);
  });

  it('throws when investment does not exist', () => {
    expect(() => advancePipelineStatus(db, 'nonexistent-id')).toThrow(/not found/);
  });
});

describe('getWatchlist', () => {
  it('returns all investments when no status filter given', () => {
    addToWatchlist(db, BASE_ENTRY);
    addToWatchlist(db, { type: 'listed_stock', name: 'Google' });

    const all = getWatchlist(db);
    expect(all).toHaveLength(2);
  });

  it('filters by status correctly', () => {
    const id1 = addToWatchlist(db, BASE_ENTRY);
    addToWatchlist(db, { type: 'listed_stock', name: 'Google' });
    advancePipelineStatus(db, id1);

    const screening = getWatchlist(db, 'screening');
    const researching = getWatchlist(db, 'researching');

    expect(screening).toHaveLength(1);
    expect(screening[0].name).toBe('Google');
    expect(researching).toHaveLength(1);
    expect(researching[0].id).toBe(id1);
  });

  it('orders results by created_at descending', () => {
    const id1 = addToWatchlist(db, { type: 'listed_stock', name: 'First' });
    // Force a different timestamp so the ordering is deterministic.
    db.run(`UPDATE investments SET created_at = '2025-01-01T00:00:00.000Z' WHERE id = ?`, id1);
    const id2 = addToWatchlist(db, { type: 'listed_stock', name: 'Second' });
    db.run(`UPDATE investments SET created_at = '2025-06-01T00:00:00.000Z' WHERE id = ?`, id2);

    const rows = getWatchlist(db);
    // id2 has a later date → should appear first in DESC order.
    expect(rows[0].id).toBe(id2);
    expect(rows[1].id).toBe(id1);
  });
});

describe('getInvestmentById', () => {
  it('returns undefined for an unknown id', () => {
    expect(getInvestmentById(db, 'unknown')).toBeUndefined();
  });

  it('returns the investment for a known id', () => {
    const id = addToWatchlist(db, BASE_ENTRY);
    const row = getInvestmentById(db, id);
    expect(row).toBeDefined();
    expect(row!.ticker).toBe('AAPL');
  });
});
