import { describe, it, expect } from 'vitest';
import {
  fermiDecompose,
  correctOverconfidence,
  type FermiComponent,
} from '../../src/deal-analyzer/probability.js';

// ---------------------------------------------------------------------------
// Fermi decomposition
//
// 4-component example:
//   P(management executes)   = 0.80
//   P(market expands)        = 0.60
//   P(no major competitor)   = 0.70
//   P(regulation stays same) = 0.90
//   combined = 0.80 * 0.60 * 0.70 * 0.90 = 0.3024
// ---------------------------------------------------------------------------

const FOUR_COMPONENTS: FermiComponent[] = [
  { question: 'P(management executes)',   probability: 0.80 },
  { question: 'P(market expands)',        probability: 0.60 },
  { question: 'P(no major competitor)',   probability: 0.70 },
  { question: 'P(regulation stays same)', probability: 0.90 },
];

describe('fermiDecompose — 4-component case', () => {
  it('computes combined probability ≈ 0.3024', () => {
    const result = fermiDecompose(FOUR_COMPONENTS);
    expect(result.combinedProbability).toBeCloseTo(0.3024, 6);
  });

  it('returns the same components that were passed in', () => {
    const result = fermiDecompose(FOUR_COMPONENTS);
    expect(result.components).toHaveLength(4);
    expect(result.components[0].question).toBe('P(management executes)');
  });

  it('produces a breakdown with 4 entries', () => {
    const result = fermiDecompose(FOUR_COMPONENTS);
    expect(result.breakdown).toHaveLength(4);
  });

  it('breakdown running values are cumulative products', () => {
    const result = fermiDecompose(FOUR_COMPONENTS);
    expect(result.breakdown[0].running).toBeCloseTo(0.80, 6);
    expect(result.breakdown[1].running).toBeCloseTo(0.80 * 0.60, 6);
    expect(result.breakdown[2].running).toBeCloseTo(0.80 * 0.60 * 0.70, 6);
    expect(result.breakdown[3].running).toBeCloseTo(0.3024, 6);
  });

  it('final breakdown running value equals combinedProbability', () => {
    const result = fermiDecompose(FOUR_COMPONENTS);
    const last = result.breakdown[result.breakdown.length - 1];
    expect(last.running).toBeCloseTo(result.combinedProbability, 10);
  });
});

describe('fermiDecompose — single component', () => {
  it('combinedProbability equals the sole component probability', () => {
    const result = fermiDecompose([{ question: 'Only factor', probability: 0.72 }]);
    expect(result.combinedProbability).toBeCloseTo(0.72, 6);
  });

  it('breakdown has 1 entry', () => {
    const result = fermiDecompose([{ question: 'Only factor', probability: 0.72 }]);
    expect(result.breakdown).toHaveLength(1);
  });
});

describe('fermiDecompose — boundary values', () => {
  it('probability = 0 yields combinedProbability = 0', () => {
    const result = fermiDecompose([
      { question: 'Impossible', probability: 0 },
      { question: 'Likely',     probability: 0.8 },
    ]);
    expect(result.combinedProbability).toBe(0);
  });

  it('all probability = 1 yields combinedProbability = 1', () => {
    const result = fermiDecompose([
      { question: 'Certain A', probability: 1 },
      { question: 'Certain B', probability: 1 },
    ]);
    expect(result.combinedProbability).toBe(1);
  });
});

describe('fermiDecompose — validation errors', () => {
  it('throws when the component array is empty', () => {
    expect(() => fermiDecompose([])).toThrow(/at least one component/);
  });

  it('throws when a component probability > 1', () => {
    expect(() =>
      fermiDecompose([{ question: 'Bad', probability: 1.1 }]),
    ).toThrow(/between 0 and 1/);
  });

  it('throws when a component probability < 0', () => {
    expect(() =>
      fermiDecompose([{ question: 'Bad', probability: -0.1 }]),
    ).toThrow(/between 0 and 1/);
  });
});

// ---------------------------------------------------------------------------
// Overconfidence correction
//
// corrected = p * (1 - s) + 0.5 * s
//
// 0.9 with default shrinkage 0.3:
//   0.9 * 0.7 + 0.5 * 0.3 = 0.63 + 0.15 = 0.78
//
// 0.1 with default shrinkage 0.3:
//   0.1 * 0.7 + 0.5 * 0.3 = 0.07 + 0.15 = 0.22
//
// 0.5 stays at 0.5 for any shrinkage.
// ---------------------------------------------------------------------------

describe('correctOverconfidence', () => {
  it.each([
    [0.9, 0.3, 0.78],
    [0.1, 0.3, 0.22],
    [0.8, 0.3, 0.71],
    [0.2, 0.3, 0.29],
    [0.5, 0.3, 0.50],  // midpoint stays unchanged
    [0.5, 0.8, 0.50],  // midpoint stays for any shrinkage
    [1.0, 0.5, 0.75],  // extreme pulled halfway toward 0.5
    [0.0, 0.5, 0.25],
  ] as const)(
    'correctOverconfidence(%s, %s) ≈ %s',
    (prob, shrinkage, expected) => {
      expect(correctOverconfidence(prob, shrinkage)).toBeCloseTo(expected, 6);
    },
  );

  it('uses 0.3 as the default shrinkage factor', () => {
    expect(correctOverconfidence(0.9)).toBeCloseTo(0.78, 6);
  });

  it('throws when probability > 1', () => {
    expect(() => correctOverconfidence(1.1)).toThrow(/between 0 and 1/);
  });

  it('throws when probability < 0', () => {
    expect(() => correctOverconfidence(-0.1)).toThrow(/between 0 and 1/);
  });

  it('throws when shrinkageFactor > 1', () => {
    expect(() => correctOverconfidence(0.8, 1.1)).toThrow(/shrinkageFactor/);
  });
});
