import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import {
  captureDecisionSnapshot,
  getDecisionSnapshot,
  listDecisionSnapshots,
  type SnapshotScenario,
} from '../../src/rules-engine/snapshots.js';
import type { Rule } from '../../src/models/rule.js';
import type { EvaluationResult } from '../../src/rules-engine/evaluator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_RULE: Rule = {
  id: 'rule-fixture-1',
  name: 'Margin of Safety Gate',
  version: 1,
  category: 'valuation',
  type: 'hard_gate',
  sourceType: 'book',
  sourceDetail: 'Pabrai - Dhandho Investor',
  description: 'Never buy without significant margin of safety',
  conditions: [{ metric: 'intrinsic_value_discount', operator: 'gte', value: 0.3, weight: 1.0 }],
  weight: 1.0,
  active: true,
  activeFrom: new Date('2024-01-01'),
  activeTo: null,
  createdAt: new Date('2024-01-01'),
  timesFired: 5,
  timesCorrect: 4,
  believabilityScore: 0.75,
};

const MOCK_SCORE: EvaluationResult = {
  ruleId: 'rule-fixture-1',
  ruleVersion: 1,
  result: 'pass',
  conditionResults: [
    {
      metric: 'intrinsic_value_discount',
      operator: 'gte',
      threshold: 0.3,
      actual: 0.45,
      passed: true,
      missing: false,
    },
  ],
  weightedScore: undefined,
};

const MOCK_SCENARIOS: SnapshotScenario[] = [
  { scenarioCase: 'base', revenueGrowth: 0.05, margin: 0.15, multiple: 12, probabilityWeight: 0.6, targetPrice: 48, expectedValue: 28.8 },
  { scenarioCase: 'bear', revenueGrowth: -0.02, margin: 0.08, multiple: 8, probabilityWeight: 0.2, targetPrice: 22, expectedValue: 4.4 },
  { scenarioCase: 'bull', revenueGrowth: 0.12, margin: 0.22, multiple: 18, probabilityWeight: 0.2, targetPrice: 72, expectedValue: 14.4 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a minimal investment row required by the FK constraint. */
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

// ---------------------------------------------------------------------------
// Tests
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

describe('captureDecisionSnapshot', () => {
  it('returns a non-empty UUID string', () => {
    const id = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.15, MOCK_SCENARIOS);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('stores a row that can be retrieved by id', () => {
    const id = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.15, MOCK_SCENARIOS);
    const snapshot = getDecisionSnapshot(db, id);
    expect(snapshot).toBeDefined();
    expect(snapshot!.id).toBe(id);
  });

  it('stores the kelly position correctly', () => {
    const id = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.22, MOCK_SCENARIOS);
    const snapshot = getDecisionSnapshot(db, id);
    expect(snapshot!.kellyPosition).toBeCloseTo(0.22, 5);
  });

  it('accepts a null kelly position', () => {
    const id = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], null, []);
    const snapshot = getDecisionSnapshot(db, id);
    expect(snapshot!.kellyPosition).toBeNull();
  });
});

describe('getDecisionSnapshot', () => {
  it('returns undefined for a non-existent id', () => {
    const result = getDecisionSnapshot(db, 'nonexistent-id');
    expect(result).toBeUndefined();
  });

  it('deserializes activeRules correctly', () => {
    const id = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.1, []);
    const snapshot = getDecisionSnapshot(db, id);
    expect(snapshot!.activeRules).toHaveLength(1);
    expect(snapshot!.activeRules[0].name).toBe('Margin of Safety Gate');
    expect(snapshot!.activeRules[0].conditions[0].metric).toBe('intrinsic_value_discount');
  });

  it('deserializes scores correctly', () => {
    const id = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.1, []);
    const snapshot = getDecisionSnapshot(db, id);
    expect(snapshot!.scores).toHaveLength(1);
    expect(snapshot!.scores[0].ruleId).toBe('rule-fixture-1');
    expect(snapshot!.scores[0].result).toBe('pass');
  });

  it('deserializes scenarios correctly', () => {
    const id = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.1, MOCK_SCENARIOS);
    const snapshot = getDecisionSnapshot(db, id);
    expect(snapshot!.scenarios).toHaveLength(3);
    expect(snapshot!.scenarios[0].scenarioCase).toBe('base');
    expect(snapshot!.scenarios[1].scenarioCase).toBe('bear');
    expect(snapshot!.scenarios[2].scenarioCase).toBe('bull');
  });

  it('returns snapshotAt as a Date instance', () => {
    const id = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], null, []);
    const snapshot = getDecisionSnapshot(db, id);
    expect(snapshot!.snapshotAt).toBeInstanceOf(Date);
  });

  it('returns empty scenarios array when captured with none', () => {
    const id = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], null, []);
    const snapshot = getDecisionSnapshot(db, id);
    expect(snapshot!.scenarios).toEqual([]);
  });
});

describe('listDecisionSnapshots', () => {
  it('returns an empty array when no snapshots exist for an investment', () => {
    const results = listDecisionSnapshots(db, 'inv-1');
    expect(results).toHaveLength(0);
  });

  it('returns the correct number of snapshots for an investment', () => {
    captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.1, []);
    captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.15, []);
    captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.2, []);

    const results = listDecisionSnapshots(db, 'inv-1');
    expect(results).toHaveLength(3);
  });

  it('does not include snapshots for a different investment', () => {
    captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.1, []);
    captureDecisionSnapshot(db, 'inv-2', [MOCK_RULE], [MOCK_SCORE], 0.2, []);

    const inv1Results = listDecisionSnapshots(db, 'inv-1');
    expect(inv1Results).toHaveLength(1);
    expect(inv1Results[0].investmentId).toBe('inv-1');
  });

  it('returns snapshots ordered newest first', async () => {
    // Insert with slight delay to guarantee distinct timestamps
    captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.1, []);

    // Manually update the snapshot_at to an older timestamp to create ordering
    const firstId = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.2, []);
    db.run(
      `UPDATE decision_snapshots SET snapshot_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`,
      firstId,
    );

    const results = listDecisionSnapshots(db, 'inv-1');
    expect(results).toHaveLength(2);
    // The 2020 snapshot should be last (oldest)
    expect(results[results.length - 1].snapshotAt.getFullYear()).toBe(2020);
  });

  it('stores serialized JSON and round-trips it faithfully', () => {
    const id = captureDecisionSnapshot(db, 'inv-1', [MOCK_RULE], [MOCK_SCORE], 0.18, MOCK_SCENARIOS);
    const list = listDecisionSnapshots(db, 'inv-1');

    expect(list[0].id).toBe(id);
    expect(list[0].activeRules[0].believabilityScore).toBe(0.75);
    expect(list[0].scenarios[0].expectedValue).toBe(28.8);
  });
});
