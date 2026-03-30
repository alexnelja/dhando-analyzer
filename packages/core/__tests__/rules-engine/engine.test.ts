import { describe, it, expect } from 'vitest';
import { runEngine, type EngineResult } from '../../src/rules-engine/engine.js';
import type { Rule } from '../../src/models/rule.js';

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'r-default',
    name: 'Default Rule',
    version: 1,
    category: 'valuation',
    type: 'hard_gate',
    sourceType: 'book',
    sourceDetail: 'test',
    description: 'test rule',
    conditions: [
      { metric: 'margin_of_safety', operator: 'gte', value: 0.3, weight: 1.0 },
    ],
    weight: 1.0,
    active: true,
    activeFrom: new Date('2026-01-01'),
    activeTo: null,
    createdAt: new Date('2026-01-01'),
    timesFired: 0,
    timesCorrect: 0,
    believabilityScore: 0.5,
    ...overrides,
  };
}

describe('runEngine — hard gate', () => {
  it('blocked is false when all hard gates pass', () => {
    const rules = [makeRule({ id: 'r1' })];
    const result = runEngine(rules, { margin_of_safety: 0.4 });
    expect(result.blocked).toBe(false);
    expect(result.hardGateFails).toHaveLength(0);
    expect(result.allResults).toHaveLength(1);
    expect(result.allResults[0].result).toBe('pass');
  });

  it('blocked is true and hardGateFails populated when a hard gate fails', () => {
    const rules = [makeRule({ id: 'r1' })];
    const result = runEngine(rules, { margin_of_safety: 0.1 });
    expect(result.blocked).toBe(true);
    expect(result.hardGateFails).toHaveLength(1);
    expect(result.hardGateFails[0].ruleId).toBe('r1');
  });
});

describe('runEngine — soft gate', () => {
  it('soft gate warn populates softGateWarnings but does not block', () => {
    const rules = [makeRule({ id: 'r2', type: 'soft_gate' })];
    const result = runEngine(rules, { margin_of_safety: 0.1 });
    expect(result.blocked).toBe(false);
    expect(result.softGateWarnings).toHaveLength(1);
    expect(result.softGateWarnings[0].ruleId).toBe('r2');
  });

  it('soft gate pass does not appear in softGateWarnings', () => {
    const rules = [makeRule({ id: 'r2', type: 'soft_gate' })];
    const result = runEngine(rules, { margin_of_safety: 0.5 });
    expect(result.softGateWarnings).toHaveLength(0);
  });
});

describe('runEngine — scoring', () => {
  it('scoring rule results appear in scoringResults', () => {
    const rules = [
      makeRule({ id: 'r3', type: 'scoring', weight: 1.0 }),
    ];
    const result = runEngine(rules, { margin_of_safety: 0.5 });
    expect(result.scoringResults).toHaveLength(1);
    expect(result.scoringResults[0].weightedScore).toBeDefined();
  });

  it('scoring rule with a fail result still appears in scoringResults (not hardGateFails)', () => {
    const rules = [makeRule({ id: 'r3', type: 'scoring', weight: 1.0 })];
    const result = runEngine(rules, { margin_of_safety: 0.1 });
    expect(result.scoringResults).toHaveLength(1);
    expect(result.hardGateFails).toHaveLength(0);
    expect(result.blocked).toBe(false);
  });
});

describe('runEngine — inactive rules', () => {
  it('skips inactive rules entirely', () => {
    const rules = [
      makeRule({ id: 'r1', active: true }),
      makeRule({ id: 'r2', active: false }),
    ];
    const result = runEngine(rules, { margin_of_safety: 0.4 });
    expect(result.allResults).toHaveLength(1);
    expect(result.allResults[0].ruleId).toBe('r1');
  });
});

describe('runEngine — compositeScore', () => {
  it('returns 0 when there are no scoring rules', () => {
    const rules = [makeRule({ id: 'r1', type: 'hard_gate' })];
    const result = runEngine(rules, { margin_of_safety: 0.4 });
    expect(result.compositeScore).toBe(0);
  });

  it('computes weighted average of scoring rules weightedScore using rule.weight', () => {
    // Rule A: weight=2, conditions all pass → weightedScore=1.0
    const ruleA = makeRule({
      id: 'rA',
      type: 'scoring',
      weight: 2,
      conditions: [{ metric: 'mos', operator: 'gte', value: 0.3, weight: 1.0 }],
    });
    // Rule B: weight=1, conditions all fail → weightedScore=0.0
    const ruleB = makeRule({
      id: 'rB',
      type: 'scoring',
      weight: 1,
      conditions: [{ metric: 'mos', operator: 'gte', value: 0.9, weight: 1.0 }],
    });
    const result = runEngine([ruleA, ruleB], { mos: 0.5 });
    // compositeScore = (1.0*2 + 0.0*1) / (2+1) = 2/3 ≈ 0.6667
    expect(result.compositeScore).toBeCloseTo(2 / 3, 5);
  });

  it('handles single scoring rule with a partial score', () => {
    const rule = makeRule({
      id: 'r1',
      type: 'scoring',
      weight: 1.0,
      conditions: [
        { metric: 'mos', operator: 'gte', value: 0.3, weight: 1.0 },
        { metric: 'mos', operator: 'gte', value: 0.9, weight: 1.0 },
      ],
    });
    // mos=0.5 passes first condition (weight 1) but fails second (weight 1)
    // weightedScore = 0.5; compositeScore = 0.5 * 1.0 / 1.0 = 0.5
    const result = runEngine([rule], { mos: 0.5 });
    expect(result.compositeScore).toBeCloseTo(0.5, 5);
  });
});
