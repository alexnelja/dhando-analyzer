import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import {
  saveComparable,
  listComparables,
  getComparableById,
  getMedianMultiple,
  type ComparableTransactionInsert,
} from '../../src/private-markets/comparable-store.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: DatabaseConnection;

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TECH_ACQ: ComparableTransactionInsert = {
  dealType: 'acquisition',
  sector: 'technology',
  industry: 'software',
  valuationMetric: 'EV/EBITDA',
  valuationMultiple: 12,
  date: '2024-01-15',
  notes: 'Strategic software acquisition',
};

const HEALTHCARE_BUYOUT: ComparableTransactionInsert = {
  dealType: 'buyout',
  sector: 'healthcare',
  industry: 'medical_devices',
  valuationMetric: 'EV/Revenue',
  valuationMultiple: 3.5,
  date: '2024-03-01',
  notes: null,
};

// ---------------------------------------------------------------------------
// saveComparable
// ---------------------------------------------------------------------------

describe('saveComparable', () => {
  it('returns a non-empty UUID', () => {
    const id = saveComparable(db, TECH_ACQ);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('returned id is unique on multiple calls', () => {
    const id1 = saveComparable(db, TECH_ACQ);
    const id2 = saveComparable(db, TECH_ACQ);
    expect(id1).not.toBe(id2);
  });

  it('persists all provided fields', () => {
    const id = saveComparable(db, TECH_ACQ);
    const row = getComparableById(db, id);
    expect(row).toBeDefined();
    expect(row!.deal_type).toBe('acquisition');
    expect(row!.sector).toBe('technology');
    expect(row!.industry).toBe('software');
    expect(row!.valuation_metric).toBe('EV/EBITDA');
    expect(row!.valuation_multiple).toBeCloseTo(12, 5);
    expect(row!.date).toBe('2024-01-15');
    expect(row!.notes).toBe('Strategic software acquisition');
  });

  it('stores null for optional fields when omitted', () => {
    const id = saveComparable(db, { dealType: 'minority_stake' });
    const row = getComparableById(db, id);
    expect(row!.sector).toBeNull();
    expect(row!.industry).toBeNull();
    expect(row!.valuation_metric).toBeNull();
    expect(row!.valuation_multiple).toBeNull();
    expect(row!.date).toBeNull();
    expect(row!.notes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getComparableById
// ---------------------------------------------------------------------------

describe('getComparableById', () => {
  it('returns undefined for unknown id', () => {
    const row = getComparableById(db, 'nonexistent-id');
    expect(row).toBeUndefined();
  });

  it('returns the correct row', () => {
    const id = saveComparable(db, HEALTHCARE_BUYOUT);
    const row = getComparableById(db, id);
    expect(row).toBeDefined();
    expect(row!.id).toBe(id);
    expect(row!.deal_type).toBe('buyout');
  });
});

// ---------------------------------------------------------------------------
// listComparables
// ---------------------------------------------------------------------------

describe('listComparables — no filters', () => {
  it('returns empty array when table is empty', () => {
    const rows = listComparables(db);
    expect(rows).toHaveLength(0);
  });

  it('returns all rows', () => {
    saveComparable(db, TECH_ACQ);
    saveComparable(db, HEALTHCARE_BUYOUT);
    const rows = listComparables(db);
    expect(rows).toHaveLength(2);
  });

  it('returns rows in insertion order', () => {
    const id1 = saveComparable(db, TECH_ACQ);
    const id2 = saveComparable(db, HEALTHCARE_BUYOUT);
    const rows = listComparables(db);
    expect(rows[0]!.id).toBe(id1);
    expect(rows[1]!.id).toBe(id2);
  });
});

describe('listComparables — sector filter', () => {
  beforeEach(() => {
    saveComparable(db, TECH_ACQ);
    saveComparable(db, HEALTHCARE_BUYOUT);
    saveComparable(db, { dealType: 'acquisition', sector: 'technology', valuationMultiple: 15 });
  });

  it('returns only rows matching the sector', () => {
    const rows = listComparables(db, { sector: 'technology' });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.sector).toBe('technology');
    }
  });

  it('returns empty when sector has no matches', () => {
    const rows = listComparables(db, { sector: 'energy' });
    expect(rows).toHaveLength(0);
  });
});

describe('listComparables — dealType filter', () => {
  beforeEach(() => {
    saveComparable(db, TECH_ACQ);
    saveComparable(db, HEALTHCARE_BUYOUT);
    saveComparable(db, { dealType: 'acquisition', sector: 'healthcare' });
  });

  it('returns only rows matching the deal type', () => {
    const rows = listComparables(db, { dealType: 'acquisition' });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.deal_type).toBe('acquisition');
    }
  });

  it('returns empty when deal type has no matches', () => {
    const rows = listComparables(db, { dealType: 'ipo' });
    expect(rows).toHaveLength(0);
  });
});

describe('listComparables — combined filters', () => {
  it('AND-combines sector and dealType filters', () => {
    saveComparable(db, TECH_ACQ);                         // tech / acquisition
    saveComparable(db, HEALTHCARE_BUYOUT);                // healthcare / buyout
    saveComparable(db, { dealType: 'buyout', sector: 'technology' }); // tech / buyout

    const rows = listComparables(db, { sector: 'technology', dealType: 'acquisition' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sector).toBe('technology');
    expect(rows[0]!.deal_type).toBe('acquisition');
  });
});

// ---------------------------------------------------------------------------
// getMedianMultiple
// ---------------------------------------------------------------------------

describe('getMedianMultiple', () => {
  it('returns null when no matching rows exist', () => {
    const result = getMedianMultiple(db, 'technology', 'EV/EBITDA');
    expect(result).toBeNull();
  });

  it('returns the single value when only one row matches', () => {
    saveComparable(db, { dealType: 'acquisition', sector: 'technology', valuationMetric: 'EV/EBITDA', valuationMultiple: 10 });
    const result = getMedianMultiple(db, 'technology', 'EV/EBITDA');
    expect(result).toBeCloseTo(10, 5);
  });

  it('returns the middle value for odd count (3 rows)', () => {
    saveComparable(db, { dealType: 'a', sector: 'tech', valuationMetric: 'EV/EBITDA', valuationMultiple: 8 });
    saveComparable(db, { dealType: 'a', sector: 'tech', valuationMetric: 'EV/EBITDA', valuationMultiple: 12 });
    saveComparable(db, { dealType: 'a', sector: 'tech', valuationMetric: 'EV/EBITDA', valuationMultiple: 10 });
    // Sorted: [8, 10, 12] → median = 10
    const result = getMedianMultiple(db, 'tech', 'EV/EBITDA');
    expect(result).toBeCloseTo(10, 5);
  });

  it('returns the average of two middles for even count (4 rows)', () => {
    saveComparable(db, { dealType: 'a', sector: 'fintech', valuationMetric: 'EV/Revenue', valuationMultiple: 4 });
    saveComparable(db, { dealType: 'a', sector: 'fintech', valuationMetric: 'EV/Revenue', valuationMultiple: 6 });
    saveComparable(db, { dealType: 'a', sector: 'fintech', valuationMetric: 'EV/Revenue', valuationMultiple: 8 });
    saveComparable(db, { dealType: 'a', sector: 'fintech', valuationMetric: 'EV/Revenue', valuationMultiple: 10 });
    // Sorted: [4, 6, 8, 10] → median = (6 + 8) / 2 = 7
    const result = getMedianMultiple(db, 'fintech', 'EV/Revenue');
    expect(result).toBeCloseTo(7, 5);
  });

  it('excludes rows with null valuation_multiple', () => {
    saveComparable(db, { dealType: 'a', sector: 'retail', valuationMetric: 'EV/EBITDA', valuationMultiple: 5 });
    saveComparable(db, { dealType: 'a', sector: 'retail', valuationMetric: 'EV/EBITDA', valuationMultiple: null });
    saveComparable(db, { dealType: 'a', sector: 'retail', valuationMetric: 'EV/EBITDA', valuationMultiple: 9 });
    // Only two valid rows: [5, 9] → median = (5 + 9) / 2 = 7
    const result = getMedianMultiple(db, 'retail', 'EV/EBITDA');
    expect(result).toBeCloseTo(7, 5);
  });

  it('does not mix multiples across different sectors', () => {
    saveComparable(db, { dealType: 'a', sector: 'sectorA', valuationMetric: 'EV/EBITDA', valuationMultiple: 5 });
    saveComparable(db, { dealType: 'a', sector: 'sectorB', valuationMetric: 'EV/EBITDA', valuationMultiple: 100 });
    const result = getMedianMultiple(db, 'sectorA', 'EV/EBITDA');
    expect(result).toBeCloseTo(5, 5);
  });

  it('does not mix multiples across different metrics', () => {
    saveComparable(db, { dealType: 'a', sector: 'tech', valuationMetric: 'EV/EBITDA', valuationMultiple: 10 });
    saveComparable(db, { dealType: 'a', sector: 'tech', valuationMetric: 'EV/Revenue', valuationMultiple: 50 });
    const result = getMedianMultiple(db, 'tech', 'EV/EBITDA');
    expect(result).toBeCloseTo(10, 5);
  });
});
