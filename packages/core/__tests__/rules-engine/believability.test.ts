import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import {
  calculateBelievability,
  applyExponentialDecay,
  updateRuleBelievability,
} from '../../src/rules-engine/believability.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a minimal rule row required for DB-level tests. */
function seedRule(db: DatabaseConnection, id: string, timesFired: number, timesCorrect: number): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO rules
       (id, name, version, category, type, source_type, source_detail, description,
        conditions_yaml, weight, active, active_from, created_at,
        times_fired, times_correct, believability_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    'Test Rule',
    1,
    'valuation',
    'hard_gate',
    'book',
    'test',
    'test rule',
    '- metric: mos\n  operator: gte\n  value: 0.3\n  weight: 1.0\n',
    1.0,
    1,
    now,
    now,
    timesFired,
    timesCorrect,
    0.5,
  );
}

// ---------------------------------------------------------------------------
// calculateBelievability
// ---------------------------------------------------------------------------

describe('calculateBelievability', () => {
  it('returns 0.5 when timesFired < 5 (no data)', () => {
    expect(calculateBelievability(0, 0)).toBe(0.5);
    expect(calculateBelievability(4, 4)).toBe(0.5);
    expect(calculateBelievability(2, 4)).toBe(0.5);
  });

  it('returns 0.5 exactly at the boundary timesFired = 4', () => {
    expect(calculateBelievability(4, 4)).toBe(0.5);
  });

  it('applies Bayesian shrinkage — small sample pulled toward 0.5', () => {
    // 5 firings, 5 correct: perfect record but priorWeight=5 pulls toward 0.5
    const score = calculateBelievability(5, 5, undefined, 5);
    // raw base = 1.0, bayesian = (1.0*5 + 0.5*5)/(5+5) = 7.5/10 = 0.75
    expect(score).toBeCloseTo(0.75, 5);
  });

  it('perfect record with large sample returns close to 1.0', () => {
    const score = calculateBelievability(100, 100, undefined, 5);
    // bayesian = (1.0*100 + 0.5*5)/(100+5) = 102.5/105 ≈ 0.976
    expect(score).toBeGreaterThan(0.95);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('zero correct record with large sample returns close to 0.0', () => {
    const score = calculateBelievability(0, 100, undefined, 5);
    // bayesian = (0*100 + 0.5*5)/(100+5) = 2.5/105 ≈ 0.024
    expect(score).toBeLessThan(0.05);
    expect(score).toBeGreaterThanOrEqual(0.0);
  });

  it('50% correct record with sufficient firings returns near 0.5', () => {
    const score = calculateBelievability(50, 100, undefined, 5);
    // bayesian = (0.5*100 + 0.5*5)/(100+5) = 52.5/105 = 0.5
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('uses priorWeight to control shrinkage strength', () => {
    // high prior weight => more conservative
    const aggressive = calculateBelievability(10, 10, undefined, 1);
    const conservative = calculateBelievability(10, 10, undefined, 50);
    expect(aggressive).toBeGreaterThan(conservative);
  });
});

// ---------------------------------------------------------------------------
// applyExponentialDecay
// ---------------------------------------------------------------------------

describe('applyExponentialDecay', () => {
  it('returns 1.0 for an empty timestamp array', () => {
    expect(applyExponentialDecay([], 365)).toBe(1.0);
  });

  it('a very recent timestamp returns close to 1.0', () => {
    const justNow = new Date();
    const weight = applyExponentialDecay([justNow], 365);
    expect(weight).toBeCloseTo(1.0, 4);
  });

  it('a timestamp exactly 365 days ago returns close to 0.5', () => {
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const weight = applyExponentialDecay([yearAgo], 365);
    expect(weight).toBeCloseTo(0.5, 2);
  });

  it('a very old timestamp returns close to 0.0', () => {
    const tenYearsAgo = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000);
    const weight = applyExponentialDecay([tenYearsAgo], 365);
    expect(weight).toBeLessThan(0.01);
  });

  it('recent outcomes are weighted higher than old ones', () => {
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const old = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
    const recentWeight = applyExponentialDecay([recent], 365);
    const oldWeight = applyExponentialDecay([old], 365);
    expect(recentWeight).toBeGreaterThan(oldWeight);
  });

  it('average of mixed timestamps is between their individual weights', () => {
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const old = new Date(Date.now() - 700 * 24 * 60 * 60 * 1000);
    const recentW = applyExponentialDecay([recent], 365);
    const oldW = applyExponentialDecay([old], 365);
    const mixed = applyExponentialDecay([recent, old], 365);
    expect(mixed).toBeGreaterThan(oldW);
    expect(mixed).toBeLessThan(recentW);
  });
});

// ---------------------------------------------------------------------------
// updateRuleBelievability (DB integration)
// ---------------------------------------------------------------------------

let db: DatabaseConnection;

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

describe('updateRuleBelievability', () => {
  it('updates believability_score in the DB', () => {
    seedRule(db, 'rule-1', 100, 100);

    updateRuleBelievability(db, 'rule-1');

    const row = db.get<{ believability_score: number }>(
      `SELECT believability_score FROM rules WHERE id = ?`,
      'rule-1',
    );
    // 100/100 with prior 5 => > 0.95
    expect(row!.believability_score).toBeGreaterThan(0.95);
  });

  it('sets score to 0.5 when timesFired < 5', () => {
    seedRule(db, 'rule-2', 4, 4);

    updateRuleBelievability(db, 'rule-2');

    const row = db.get<{ believability_score: number }>(
      `SELECT believability_score FROM rules WHERE id = ?`,
      'rule-2',
    );
    expect(row!.believability_score).toBe(0.5);
  });

  it('throws when the rule id does not exist', () => {
    expect(() => updateRuleBelievability(db, 'nonexistent-id')).toThrow('Rule not found: nonexistent-id');
  });

  it('correctly reflects a poor track record in the DB', () => {
    seedRule(db, 'rule-3', 100, 0);

    updateRuleBelievability(db, 'rule-3');

    const row = db.get<{ believability_score: number }>(
      `SELECT believability_score FROM rules WHERE id = ?`,
      'rule-3',
    );
    expect(row!.believability_score).toBeLessThan(0.05);
  });
});
