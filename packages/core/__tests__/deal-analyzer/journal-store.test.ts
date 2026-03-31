import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import {
  createJournalEntry,
  updateJournalOutcome,
  getJournalEntriesForInvestment,
  getLatestJournalEntry,
  type JournalEntryInsert,
} from '../../src/deal-analyzer/journal-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedInvestment(db: DatabaseConnection, id: string): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    'listed_stock',
    'Test Corp',
    'screening',
    'manual',
    'solo-investor',
    now,
    now,
  );
}

const BUY_ENTRY: JournalEntryInsert = {
  investmentId: 'inv-1',
  entryType: 'buy',
  thesis: 'Strong moat at 40% discount to intrinsic value.',
  confidence: 75,
  keyAssumptions: { revenueGrowth: 0.1, moatDurable: true },
  predictedProbability: 0.72,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: DatabaseConnection;

beforeEach(() => {
  db = createDatabase(':memory:');
  seedInvestment(db, 'inv-1');
  seedInvestment(db, 'inv-2');
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// createJournalEntry
// ---------------------------------------------------------------------------

describe('createJournalEntry', () => {
  it('returns a non-empty UUID string', () => {
    const id = createJournalEntry(db, BUY_ENTRY);
    expect(typeof id).toBe('string');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('stores the entry and makes it retrievable', () => {
    createJournalEntry(db, BUY_ENTRY);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    expect(entries).toHaveLength(1);
  });

  it('stores all provided fields', () => {
    const id = createJournalEntry(db, BUY_ENTRY);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    const entry = entries.find((e) => e.id === id)!;
    expect(entry.investmentId).toBe('inv-1');
    expect(entry.entryType).toBe('buy');
    expect(entry.thesis).toBe('Strong moat at 40% discount to intrinsic value.');
    expect(entry.confidence).toBe(75);
    expect(entry.predictedProbability).toBeCloseTo(0.72, 5);
    expect(entry.keyAssumptions).toEqual({ revenueGrowth: 0.1, moatDurable: true });
  });

  it('stores null for optional fields when omitted', () => {
    createJournalEntry(db, { investmentId: 'inv-1', entryType: 'review' });
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    const entry = entries[0];
    expect(entry.thesis).toBeNull();
    expect(entry.confidence).toBeNull();
    expect(entry.predictedProbability).toBeNull();
    expect(entry.actualOutcome).toBeNull();
    expect(entry.brierScore).toBeNull();
  });

  it('sets actualOutcome and brierScore to null on creation', () => {
    const id = createJournalEntry(db, BUY_ENTRY);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    const entry = entries.find((e) => e.id === id)!;
    expect(entry.actualOutcome).toBeNull();
    expect(entry.brierScore).toBeNull();
  });

  it('stores createdAt as an ISO string', () => {
    createJournalEntry(db, BUY_ENTRY);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    expect(entries[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// updateJournalOutcome — Brier score calculation
// ---------------------------------------------------------------------------

describe('updateJournalOutcome', () => {
  it('records actual outcome = 1 (win)', () => {
    const id = createJournalEntry(db, BUY_ENTRY);
    updateJournalOutcome(db, id, 1);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    const entry = entries.find((e) => e.id === id)!;
    expect(entry.actualOutcome).toBe(1);
  });

  it('records actual outcome = 0 (loss)', () => {
    const id = createJournalEntry(db, BUY_ENTRY);
    updateJournalOutcome(db, id, 0);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    const entry = entries.find((e) => e.id === id)!;
    expect(entry.actualOutcome).toBe(0);
  });

  it('calculates Brier score: (0.72 - 1)^2 = 0.0784', () => {
    const id = createJournalEntry(db, BUY_ENTRY); // predictedProbability = 0.72
    updateJournalOutcome(db, id, 1);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    const entry = entries.find((e) => e.id === id)!;
    // (0.72 - 1)^2 = (-0.28)^2 = 0.0784
    expect(entry.brierScore).toBeCloseTo(0.0784, 4);
  });

  it('calculates Brier score: (0.72 - 0)^2 = 0.5184', () => {
    const id = createJournalEntry(db, BUY_ENTRY); // predictedProbability = 0.72
    updateJournalOutcome(db, id, 0);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    const entry = entries.find((e) => e.id === id)!;
    // (0.72 - 0)^2 = 0.5184
    expect(entry.brierScore).toBeCloseTo(0.5184, 4);
  });

  it('stores Brier score = 0 for a perfect prediction', () => {
    const id = createJournalEntry(db, { ...BUY_ENTRY, predictedProbability: 1.0 });
    updateJournalOutcome(db, id, 1);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    const entry = entries.find((e) => e.id === id)!;
    expect(entry.brierScore).toBeCloseTo(0, 5);
  });

  it('stores Brier score as null when predictedProbability was null', () => {
    const id = createJournalEntry(db, {
      investmentId: 'inv-1',
      entryType: 'review',
      predictedProbability: null,
    });
    updateJournalOutcome(db, id, 1);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    const entry = entries.find((e) => e.id === id)!;
    expect(entry.brierScore).toBeNull();
  });

  it('throws when the entry id does not exist', () => {
    expect(() => updateJournalOutcome(db, 'nonexistent-id', 1)).toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// getJournalEntriesForInvestment
// ---------------------------------------------------------------------------

describe('getJournalEntriesForInvestment', () => {
  it('returns empty array when no entries exist', () => {
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    expect(entries).toHaveLength(0);
  });

  it('returns multiple entries for the same investment', () => {
    createJournalEntry(db, BUY_ENTRY);
    createJournalEntry(db, { ...BUY_ENTRY, entryType: 'review' });
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    expect(entries).toHaveLength(2);
  });

  it('does not return entries for other investments', () => {
    createJournalEntry(db, BUY_ENTRY);
    createJournalEntry(db, { ...BUY_ENTRY, investmentId: 'inv-2', entryType: 'buy' });
    const inv1Entries = getJournalEntriesForInvestment(db, 'inv-1');
    expect(inv1Entries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getLatestJournalEntry — entry type filtering
// ---------------------------------------------------------------------------

describe('getLatestJournalEntry', () => {
  it('returns undefined when no entries exist', () => {
    const result = getLatestJournalEntry(db, 'inv-1', 'buy');
    expect(result).toBeUndefined();
  });

  it('returns the latest entry matching the entryType', () => {
    createJournalEntry(db, { ...BUY_ENTRY, thesis: 'First buy' });
    createJournalEntry(db, { ...BUY_ENTRY, thesis: 'Second buy' });
    const latest = getLatestJournalEntry(db, 'inv-1', 'buy');
    expect(latest).toBeDefined();
    expect(latest!.thesis).toBe('Second buy');
  });

  it('ignores entries with a different entryType', () => {
    createJournalEntry(db, { ...BUY_ENTRY, entryType: 'review' });
    const result = getLatestJournalEntry(db, 'inv-1', 'buy');
    expect(result).toBeUndefined();
  });

  it('returns undefined for unknown investment id', () => {
    createJournalEntry(db, BUY_ENTRY);
    const result = getLatestJournalEntry(db, 'inv-999', 'buy');
    expect(result).toBeUndefined();
  });

  it('deserializes keyAssumptions from JSON', () => {
    createJournalEntry(db, BUY_ENTRY);
    const result = getLatestJournalEntry(db, 'inv-1', 'buy');
    expect(result!.keyAssumptions).toEqual({ revenueGrowth: 0.1, moatDurable: true });
  });
});
