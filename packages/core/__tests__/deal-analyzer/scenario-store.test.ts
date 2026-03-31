import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import {
  saveScenarios,
  getScenariosForInvestment,
  deleteScenarios,
  type ScenarioInsert,
} from '../../src/deal-analyzer/scenario-store.js';

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

const SAMPLE_SCENARIOS: ScenarioInsert[] = [
  {
    case: 'bear',
    revenueGrowth: 0.0,
    margin: 0.08,
    multiple: 7,
    probabilityWeight: 0.25,
    targetPrice: 42,
    expectedValue: 10.5,
  },
  {
    case: 'base',
    revenueGrowth: 0.1,
    margin: 0.15,
    multiple: 10,
    probabilityWeight: 0.5,
    targetPrice: 80,
    expectedValue: 40,
  },
  {
    case: 'bull',
    revenueGrowth: 0.2,
    margin: 0.2,
    multiple: 14,
    probabilityWeight: 0.25,
    targetPrice: 140,
    expectedValue: 35,
  },
];

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
// saveScenarios
// ---------------------------------------------------------------------------

describe('saveScenarios', () => {
  it('inserts all scenarios for an investment', () => {
    saveScenarios(db, 'inv-1', SAMPLE_SCENARIOS);
    const rows = getScenariosForInvestment(db, 'inv-1');
    expect(rows).toHaveLength(3);
  });

  it('each row has a non-empty UUID id', () => {
    saveScenarios(db, 'inv-1', SAMPLE_SCENARIOS);
    const rows = getScenariosForInvestment(db, 'inv-1');
    for (const row of rows) {
      expect(row.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });

  it('stores investmentId on each row', () => {
    saveScenarios(db, 'inv-1', SAMPLE_SCENARIOS);
    const rows = getScenariosForInvestment(db, 'inv-1');
    for (const row of rows) {
      expect(row.investmentId).toBe('inv-1');
    }
  });

  it('stores correct scenario case labels', () => {
    saveScenarios(db, 'inv-1', SAMPLE_SCENARIOS);
    const rows = getScenariosForInvestment(db, 'inv-1');
    const cases = rows.map((r) => r.scenarioCase);
    expect(cases).toContain('bear');
    expect(cases).toContain('base');
    expect(cases).toContain('bull');
  });

  it('stores numeric fields correctly', () => {
    saveScenarios(db, 'inv-1', SAMPLE_SCENARIOS);
    const rows = getScenariosForInvestment(db, 'inv-1');
    const base = rows.find((r) => r.scenarioCase === 'base')!;
    expect(base.revenueGrowth).toBeCloseTo(0.1, 5);
    expect(base.margin).toBeCloseTo(0.15, 5);
    expect(base.multiple).toBeCloseTo(10, 5);
    expect(base.probabilityWeight).toBeCloseTo(0.5, 5);
    expect(base.targetPrice).toBeCloseTo(80, 5);
    expect(base.expectedValue).toBeCloseTo(40, 5);
  });

  it('stores null for optional fields when omitted', () => {
    saveScenarios(db, 'inv-1', [{ case: 'base' }]);
    const rows = getScenariosForInvestment(db, 'inv-1');
    const row = rows[0];
    expect(row.revenueGrowth).toBeNull();
    expect(row.margin).toBeNull();
    expect(row.multiple).toBeNull();
    expect(row.probabilityWeight).toBeNull();
    expect(row.targetPrice).toBeNull();
    expect(row.expectedValue).toBeNull();
  });

  it('does not mix up scenarios across different investments', () => {
    saveScenarios(db, 'inv-1', SAMPLE_SCENARIOS);
    saveScenarios(db, 'inv-2', [{ case: 'base', targetPrice: 99 }]);

    const inv1Rows = getScenariosForInvestment(db, 'inv-1');
    const inv2Rows = getScenariosForInvestment(db, 'inv-2');

    expect(inv1Rows).toHaveLength(3);
    expect(inv2Rows).toHaveLength(1);
    expect(inv2Rows[0].targetPrice).toBeCloseTo(99, 5);
  });

  it('handles an empty scenarios array without error', () => {
    expect(() => saveScenarios(db, 'inv-1', [])).not.toThrow();
    const rows = getScenariosForInvestment(db, 'inv-1');
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getScenariosForInvestment
// ---------------------------------------------------------------------------

describe('getScenariosForInvestment', () => {
  it('returns empty array when no scenarios exist', () => {
    const rows = getScenariosForInvestment(db, 'inv-1');
    expect(rows).toHaveLength(0);
  });

  it('returns rows in insertion order', () => {
    saveScenarios(db, 'inv-1', SAMPLE_SCENARIOS);
    const rows = getScenariosForInvestment(db, 'inv-1');
    expect(rows[0].scenarioCase).toBe('bear');
    expect(rows[1].scenarioCase).toBe('base');
    expect(rows[2].scenarioCase).toBe('bull');
  });
});

// ---------------------------------------------------------------------------
// deleteScenarios
// ---------------------------------------------------------------------------

describe('deleteScenarios', () => {
  it('removes all scenarios for the specified investment', () => {
    saveScenarios(db, 'inv-1', SAMPLE_SCENARIOS);
    deleteScenarios(db, 'inv-1');
    const rows = getScenariosForInvestment(db, 'inv-1');
    expect(rows).toHaveLength(0);
  });

  it('does not remove scenarios for other investments', () => {
    saveScenarios(db, 'inv-1', SAMPLE_SCENARIOS);
    saveScenarios(db, 'inv-2', [{ case: 'base' }]);
    deleteScenarios(db, 'inv-1');
    const inv2Rows = getScenariosForInvestment(db, 'inv-2');
    expect(inv2Rows).toHaveLength(1);
  });

  it('is idempotent — delete on empty set does not throw', () => {
    expect(() => deleteScenarios(db, 'inv-1')).not.toThrow();
  });

  it('allows re-insertion after delete', () => {
    saveScenarios(db, 'inv-1', SAMPLE_SCENARIOS);
    deleteScenarios(db, 'inv-1');
    saveScenarios(db, 'inv-1', [{ case: 'base', targetPrice: 55 }]);
    const rows = getScenariosForInvestment(db, 'inv-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].targetPrice).toBeCloseTo(55, 5);
  });
});
