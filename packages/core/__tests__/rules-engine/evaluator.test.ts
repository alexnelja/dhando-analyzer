import { describe, it, expect } from 'vitest';
import { evaluateRule } from '../../src/rules-engine/evaluator.js';
import type { EvaluationResult } from '../../src/rules-engine/evaluator.js';
import type { Rule } from '../../src/models/rule.js';

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'r1',
    name: 'Test Rule',
    version: 1,
    category: 'valuation',
    type: 'hard_gate',
    sourceType: 'book',
    sourceDetail: 'test',
    description: 'test rule',
    conditions: [
      { metric: 'intrinsic_value_discount', operator: 'gte', value: 0.30, weight: 1.0 },
      { metric: 'bear_case_loss', operator: 'lte', value: 0.15, weight: 0.8 },
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

describe('evaluateRule — hard_gate', () => {
  it('returns pass when all conditions are met', () => {
    const result = evaluateRule(makeRule(), { intrinsic_value_discount: 0.35, bear_case_loss: 0.10 });
    expect(result.result).toBe('pass');
    expect(result.conditionResults).toHaveLength(2);
  });

  it('returns fail when any condition fails', () => {
    const result = evaluateRule(makeRule(), { intrinsic_value_discount: 0.20, bear_case_loss: 0.10 });
    expect(result.result).toBe('fail');
    expect(result.conditionResults[0].passed).toBe(false);
  });

  it('returns fail when a metric is missing from context', () => {
    const result = evaluateRule(makeRule(), { intrinsic_value_discount: 0.35 });
    expect(result.result).toBe('fail');
    expect(result.conditionResults[1].passed).toBe(false);
    expect(result.conditionResults[1].missing).toBe(true);
  });
});

describe('evaluateRule — soft_gate', () => {
  it('returns warn (not fail) when condition fails', () => {
    const rule = makeRule({ type: 'soft_gate' });
    const result = evaluateRule(rule, { intrinsic_value_discount: 0.20, bear_case_loss: 0.10 });
    expect(result.result).toBe('warn');
  });
});

describe('evaluateRule — scoring', () => {
  it('returns pass when weighted pass fraction >= 0.6', () => {
    const rule = makeRule({ type: 'scoring' });
    // both conditions pass → fraction = 1.0
    const result = evaluateRule(rule, { intrinsic_value_discount: 0.40, bear_case_loss: 0.05 });
    expect(result.result).toBe('pass');
    expect(result.weightedScore).toBeGreaterThan(0);
  });

  it('returns fail when weighted pass fraction < 0.4', () => {
    const rule = makeRule({ type: 'scoring' });
    // both conditions fail
    const result = evaluateRule(rule, { intrinsic_value_discount: 0.10, bear_case_loss: 0.30 });
    expect(result.result).toBe('fail');
  });

  it('returns warn when weighted pass fraction is between 0.4 and 0.6', () => {
    // condition weights: 1.0 + 0.8 = 1.8 total; only first passes → 1.0/1.8 ≈ 0.556
    const rule = makeRule({ type: 'scoring' });
    const result = evaluateRule(rule, { intrinsic_value_discount: 0.40, bear_case_loss: 0.30 });
    expect(result.result).toBe('warn');
  });
});

describe('evaluateRule — between operator', () => {
  it('passes when metric is within [lo, hi]', () => {
    const rule = makeRule({
      type: 'hard_gate',
      conditions: [{ metric: 'altman_z', operator: 'between', value: [1.81, 2.99], weight: 1.0 }],
    });
    const result = evaluateRule(rule, { altman_z: 2.5 });
    expect(result.result).toBe('pass');
  });

  it('fails when metric is outside [lo, hi]', () => {
    const rule = makeRule({
      type: 'hard_gate',
      conditions: [{ metric: 'altman_z', operator: 'between', value: [1.81, 2.99], weight: 1.0 }],
    });
    const result = evaluateRule(rule, { altman_z: 3.5 });
    expect(result.result).toBe('fail');
  });
});

describe('evaluateRule — all operators', () => {
  it.each([
    // [operator, metricVal, threshold, expected]
    // metricVal is the actual observed metric; threshold is the rule's comparison value
    ['gt',  5, 4, 'pass'],
    ['gt',  5, 5, 'fail'],
    ['gte', 5, 5, 'pass'],
    ['lt',  3, 4, 'pass'],
    ['lt',  3, 3, 'fail'],
    ['lte', 3, 3, 'pass'],
    ['eq',  7, 7, 'pass'],
    ['eq',  7, 8, 'fail'],
    ['neq', 7, 8, 'pass'],
    ['neq', 7, 7, 'fail'],
  ] as const)('operator %s: metric=%s, threshold=%s → %s', (operator, metricVal, threshold, expected) => {
    const rule = makeRule({
      type: 'hard_gate',
      conditions: [{ metric: 'm', operator, value: threshold, weight: 1.0 }],
    });
    const result = evaluateRule(rule, { m: metricVal });
    expect(result.result).toBe(expected);
  });
});
