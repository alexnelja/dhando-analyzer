import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runDealAnalyzer, type DealAnalyzerInput } from '../../src/deal-analyzer/pipeline.js';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import { getScenariosForInvestment } from '../../src/deal-analyzer/scenario-store.js';
import { getJournalEntriesForInvestment } from '../../src/deal-analyzer/journal-store.js';
import { listDecisionSnapshots } from '../../src/rules-engine/snapshots.js';
import type { Rule } from '../../src/models/rule.js';

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_INPUT: DealAnalyzerInput = {
  investmentId: 'inv-1',
  name: 'Acme Corp',
  ticker: 'ACME',
  sector: 'Industrials',
  currentPrice: 60,
  marketCap: 6_000_000,
  sharesOutstanding: 100_000,
  screenerResult: {
    altmanZ: { score: 3.5, zone: 'safe' },
    piotroskiF: { score: 7 },
    beneishM: { score: -2.5, likelyManipulator: false },
    compositeScore: 72,
    valuation: {
      evEbitda: 8,
      pe: 15,
      pb: 2.2,
      fcfYield: 0.06,
      ownerEarnings: 500_000,
    },
  },
  moatScore: 4,
  managementScore: 4,
  scenarioInputs: [
    { case: 'bear', revenueGrowth: 0.0, margin: 0.08, multiple: 7, probabilityWeight: 0.25 },
    { case: 'base', revenueGrowth: 0.1, margin: 0.15, multiple: 10, probabilityWeight: 0.5 },
    { case: 'bull', revenueGrowth: 0.2, margin: 0.2, multiple: 14, probabilityWeight: 0.25 },
  ],
  baseRevenue: 1_000_000,
  projectionYears: 3,
  dcfInput: {
    ownerEarnings: 500_000,
    growthRate: 0.08,
    terminalGrowthRate: 0.03,
    discountRate: 0.10,
    projectionYears: 3,
  },
  winProbability: 0.75,
  dataStalenessHours: 12,
  debtToEbitda: 1.5,
};

const BLOCKING_RULE: Rule = {
  id: 'rule-block-1',
  name: 'Beneish Manipulator Gate',
  version: 1,
  category: 'risk',
  type: 'hard_gate',
  sourceType: 'book',
  sourceDetail: 'Beneish (1999)',
  description: 'Block when beneish_m score above manipulation threshold',
  // This condition fires when beneish_m > -1.78 (likely manipulator)
  conditions: [{ metric: 'beneish_m', operator: 'lt', value: -1.78, weight: 1 }],
  weight: 1.0,
  active: true,
  activeFrom: new Date('2024-01-01'),
  activeTo: null,
  createdAt: new Date('2024-01-01'),
  timesFired: 0,
  timesCorrect: 0,
  believabilityScore: 0.9,
};

const NON_BLOCKING_RULE: Rule = {
  ...BLOCKING_RULE,
  id: 'rule-pass-1',
  name: 'Composite Score Soft Gate',
  type: 'soft_gate',
  conditions: [{ metric: 'composite_score', operator: 'gte', value: 50, weight: 1 }],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: DatabaseConnection;

beforeEach(() => {
  db = createDatabase(':memory:');
  seedInvestment(db, 'inv-1');
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Pure pipeline (no DB)
// ---------------------------------------------------------------------------

describe('runDealAnalyzer — pure (no DB)', () => {
  it('returns a DealAnalysis with all required fields', () => {
    const result = runDealAnalyzer(BASE_INPUT);
    expect(result.investmentId).toBe('inv-1');
    expect(result.scenarioModel).toBeDefined();
    expect(result.dcf).toBeDefined();
    expect(result.kelly).toBeDefined();
    expect(result.memo).toBeDefined();
    expect(result.preMortem).toBeDefined();
    expect(result.rulesEngineResult).toBeNull();
    expect(result.blocked).toBe(false);
  });

  it('kellyPosition is the half-Kelly fraction', () => {
    const result = runDealAnalyzer(BASE_INPUT);
    expect(result.kellyPosition).toBe(result.kelly.halfKelly);
  });

  it('expectedValue is probability-weighted', () => {
    const result = runDealAnalyzer(BASE_INPUT);
    expect(result.expectedValue).toBeGreaterThan(0);
    expect(result.expectedValue).toBe(result.scenarioModel.expectedValue);
  });

  it('intrinsicValue matches DCF output', () => {
    const result = runDealAnalyzer(BASE_INPUT);
    expect(result.intrinsicValue).toBe(result.dcf.intrinsicValue);
  });

  it('marginOfSafety matches DCF output', () => {
    const result = runDealAnalyzer(BASE_INPUT);
    expect(result.marginOfSafety).toBe(result.dcf.marginOfSafety);
  });

  it('preMortem has 5 categories', () => {
    const result = runDealAnalyzer(BASE_INPUT);
    expect(result.preMortem.categories).toHaveLength(5);
  });

  it('adjustedWinProbability is shrunk from raw input', () => {
    const result = runDealAnalyzer(BASE_INPUT);
    // Raw = 0.75; corrected = 0.75 * 0.7 + 0.5 * 0.3 = 0.675
    expect(result.preMortem.adjustedWinProbability).toBeCloseTo(0.675, 4);
  });

  it('memo thesis contains company name', () => {
    const result = runDealAnalyzer(BASE_INPUT);
    expect(result.memo.thesis).toContain('Acme Corp');
  });

  it('kelly uses the overconfidence-adjusted probability', () => {
    const result = runDealAnalyzer(BASE_INPUT);
    // Kelly gain fraction is based on (IV - price) / price
    // With adjusted probability ≈ 0.675 the edge should exist
    expect(result.kelly.hasEdge).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pipeline with DB (persists)
// ---------------------------------------------------------------------------

describe('runDealAnalyzer — with DB', () => {
  it('persists scenarios for the investment', () => {
    runDealAnalyzer(BASE_INPUT, db);
    const rows = getScenariosForInvestment(db, 'inv-1');
    expect(rows).toHaveLength(3);
  });

  it('persists bear, base, and bull scenario cases', () => {
    runDealAnalyzer(BASE_INPUT, db);
    const rows = getScenariosForInvestment(db, 'inv-1');
    const cases = rows.map((r) => r.scenarioCase);
    expect(cases).toContain('bear');
    expect(cases).toContain('base');
    expect(cases).toContain('bull');
  });

  it('creates a journal entry for the decision', () => {
    runDealAnalyzer(BASE_INPUT, db);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe('deal_analysis');
  });

  it('journal entry stores the thesis', () => {
    const result = runDealAnalyzer(BASE_INPUT, db);
    const entries = getJournalEntriesForInvestment(db, 'inv-1');
    expect(entries[0].thesis).toBe(result.memo.thesis);
  });

  it('creates a decision snapshot', () => {
    runDealAnalyzer(BASE_INPUT, db);
    const snapshots = listDecisionSnapshots(db, 'inv-1');
    expect(snapshots).toHaveLength(1);
  });

  it('snapshot contains kelly position', () => {
    const result = runDealAnalyzer(BASE_INPUT, db);
    const snapshots = listDecisionSnapshots(db, 'inv-1');
    expect(snapshots[0].kellyPosition).toBeCloseTo(result.kellyPosition, 5);
  });

  it('re-running replaces stale scenarios', () => {
    runDealAnalyzer(BASE_INPUT, db);
    runDealAnalyzer(BASE_INPUT, db);
    const rows = getScenariosForInvestment(db, 'inv-1');
    // deleteScenarios + saveScenarios — should still be exactly 3
    expect(rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Pipeline blocked by rules engine
// ---------------------------------------------------------------------------

describe('runDealAnalyzer — blocked by rules engine', () => {
  it('rulesEngineResult is not null when rules are provided', () => {
    const result = runDealAnalyzer(BASE_INPUT, undefined, [NON_BLOCKING_RULE]);
    expect(result.rulesEngineResult).not.toBeNull();
  });

  it('blocked is false when no hard-gate rule fails', () => {
    const result = runDealAnalyzer(BASE_INPUT, undefined, [NON_BLOCKING_RULE]);
    expect(result.blocked).toBe(false);
    expect(result.kellyPosition).toBeGreaterThan(0);
  });

  it('blocked is true when a hard-gate rule fails', () => {
    // beneish_m in BASE_INPUT is -2.5; the rule requires lt -1.78
    // -2.5 < -1.78 is TRUE → condition passes → NOT a fail → blocked = false
    // We need a rule that FAILS — require composite_score >= 90 (we have 72)
    const strictRule: Rule = {
      ...BLOCKING_RULE,
      id: 'rule-strict-1',
      name: 'Strict Composite Gate',
      conditions: [{ metric: 'composite_score', operator: 'gte', value: 90, weight: 1 }],
    };
    const result = runDealAnalyzer(BASE_INPUT, undefined, [strictRule]);
    expect(result.blocked).toBe(true);
  });

  it('kellyPosition is 0 when blocked', () => {
    const strictRule: Rule = {
      ...BLOCKING_RULE,
      id: 'rule-strict-2',
      name: 'Strict Composite Gate 2',
      conditions: [{ metric: 'composite_score', operator: 'gte', value: 90, weight: 1 }],
    };
    const result = runDealAnalyzer(BASE_INPUT, undefined, [strictRule]);
    expect(result.kellyPosition).toBe(0);
  });

  it('persists a snapshot with kellyPosition = 0 when blocked', () => {
    const strictRule: Rule = {
      ...BLOCKING_RULE,
      id: 'rule-strict-3',
      name: 'Strict Composite Gate 3',
      conditions: [{ metric: 'composite_score', operator: 'gte', value: 90, weight: 1 }],
    };
    runDealAnalyzer(BASE_INPUT, db, [strictRule]);
    const snapshots = listDecisionSnapshots(db, 'inv-1');
    expect(snapshots[0].kellyPosition).toBe(0);
  });

  it('kellyPosition on the result equals kelly.halfKelly when not blocked', () => {
    const result = runDealAnalyzer(BASE_INPUT, undefined, [NON_BLOCKING_RULE]);
    expect(result.kellyPosition).toBe(result.kelly.halfKelly);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('runDealAnalyzer — edge cases', () => {
  it('works without dataStalenessHours (no stale penalty)', () => {
    const input = { ...BASE_INPUT, dataStalenessHours: undefined };
    expect(() => runDealAnalyzer(input)).not.toThrow();
  });

  it('works without debtToEbitda (null leverage data)', () => {
    const input = { ...BASE_INPUT, debtToEbitda: null };
    expect(() => runDealAnalyzer(input)).not.toThrow();
  });

  it('works without rules (rulesEngineResult is null)', () => {
    const result = runDealAnalyzer(BASE_INPUT);
    expect(result.rulesEngineResult).toBeNull();
    expect(result.blocked).toBe(false);
  });

  it('works with empty rules array (rulesEngineResult is null)', () => {
    const result = runDealAnalyzer(BASE_INPUT, undefined, []);
    expect(result.rulesEngineResult).toBeNull();
    expect(result.blocked).toBe(false);
  });
});
