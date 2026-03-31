import { describe, it, expect } from 'vitest';
import {
  modelScenarios,
  type ScenarioInput,
  type ScenarioModelResult,
} from '../../src/deal-analyzer/scenarios.js';

// ---------------------------------------------------------------------------
// Reference fixtures — all expected values are hand-verified.
//
// baseRevenue = 1_000_000, sharesOutstanding = 100_000, years = 5
//
// Bear:  1_000_000 * (0.90)^5 * 0.10 * 6  / 100_000 = 590490 * 0.10 * 6 / 100k
//      = 1_000_000 * 0.59049 * 0.10 * 6 / 100_000 = 354294 / 100_000 = 3.54294
// Base:  1_000_000 * (1.05)^5 * 0.15 * 8  / 100_000 = 1276282 * 0.15 * 8 / 100k ≈ 15.3154
// Bull:  1_000_000 * (1.12)^5 * 0.20 * 12 / 100_000 = 1762342 * 0.20 * 12 / 100k ≈ 42.2962
//
// Weights: 0.25 + 0.50 + 0.25 = 1.00
// EV = 3.54294*0.25 + 15.3154*0.50 + 42.2962*0.25 ≈ 0.88573 + 7.65770 + 10.57405 ≈ 19.11748
// ---------------------------------------------------------------------------

const BASE_REVENUE = 1_000_000;
const SHARES = 100_000;
const YEARS = 5;

const THREE_CASE_INPUTS: ScenarioInput[] = [
  { case: 'bear', revenueGrowth: -0.10, margin: 0.10, multiple: 6,  probabilityWeight: 0.25 },
  { case: 'base', revenueGrowth: 0.05,  margin: 0.15, multiple: 8,  probabilityWeight: 0.50 },
  { case: 'bull', revenueGrowth: 0.12,  margin: 0.20, multiple: 12, probabilityWeight: 0.25 },
];

describe('modelScenarios — 3-case model', () => {
  let result: ScenarioModelResult;

  it('runs without throwing', () => {
    result = modelScenarios(BASE_REVENUE, SHARES, YEARS, THREE_CASE_INPUTS);
    expect(result).toBeDefined();
  });

  it('returns three scenario results', () => {
    result = modelScenarios(BASE_REVENUE, SHARES, YEARS, THREE_CASE_INPUTS);
    expect(result.scenarios).toHaveLength(3);
  });

  it('computes bear target price correctly (~3.543)', () => {
    result = modelScenarios(BASE_REVENUE, SHARES, YEARS, THREE_CASE_INPUTS);
    const bear = result.scenarios.find((s) => s.case === 'bear')!;
    // 1_000_000 * 0.9^5 * 0.10 * 6 / 100_000 = 3.54294
    expect(bear.targetPrice).toBeCloseTo(3.54294, 2);
  });

  it('computes base target price correctly (~15.315)', () => {
    result = modelScenarios(BASE_REVENUE, SHARES, YEARS, THREE_CASE_INPUTS);
    const base = result.scenarios.find((s) => s.case === 'base')!;
    // 1_000_000 * 1.05^5 * 0.15 * 8 / 100_000 ≈ 15.3154
    expect(base.targetPrice).toBeCloseTo(15.3154, 2);
  });

  it('computes bull target price correctly (~42.296)', () => {
    result = modelScenarios(BASE_REVENUE, SHARES, YEARS, THREE_CASE_INPUTS);
    const bull = result.scenarios.find((s) => s.case === 'bull')!;
    // 1_000_000 * 1.12^5 * 0.20 * 12 / 100_000 ≈ 42.296
    expect(bull.targetPrice).toBeCloseTo(42.296, 1);
  });

  it('weighted value = targetPrice × probabilityWeight', () => {
    result = modelScenarios(BASE_REVENUE, SHARES, YEARS, THREE_CASE_INPUTS);
    for (const s of result.scenarios) {
      expect(s.weightedValue).toBeCloseTo(s.targetPrice * s.probabilityWeight, 8);
    }
  });

  it('expectedValue is the sum of all weightedValues', () => {
    result = modelScenarios(BASE_REVENUE, SHARES, YEARS, THREE_CASE_INPUTS);
    const manualSum = result.scenarios.reduce((acc, s) => acc + s.weightedValue, 0);
    expect(result.expectedValue).toBeCloseTo(manualSum, 8);
  });

  it('maxDownside is the bear target price', () => {
    result = modelScenarios(BASE_REVENUE, SHARES, YEARS, THREE_CASE_INPUTS);
    const bear = result.scenarios.find((s) => s.case === 'bear')!;
    expect(result.maxDownside).toBeCloseTo(bear.targetPrice, 8);
  });

  it('maxUpside is the bull target price', () => {
    result = modelScenarios(BASE_REVENUE, SHARES, YEARS, THREE_CASE_INPUTS);
    const bull = result.scenarios.find((s) => s.case === 'bull')!;
    expect(result.maxUpside).toBeCloseTo(bull.targetPrice, 8);
  });
});

describe('modelScenarios — zero growth (base year = projection year)', () => {
  it('target price equals baseRevenue * margin * multiple / shares when growth = 0', () => {
    const inputs: ScenarioInput[] = [
      { case: 'base', revenueGrowth: 0, margin: 0.20, multiple: 10, probabilityWeight: 1.0 },
    ];
    const result = modelScenarios(1_000_000, 100_000, 5, inputs);
    // 1_000_000 * 1^5 * 0.20 * 10 / 100_000 = 20.0
    expect(result.scenarios[0].targetPrice).toBeCloseTo(20.0, 6);
  });
});

describe('modelScenarios — single scenario', () => {
  it('expectedValue equals the single weighted value', () => {
    const inputs: ScenarioInput[] = [
      { case: 'base', revenueGrowth: 0.08, margin: 0.12, multiple: 10, probabilityWeight: 1.0 },
    ];
    const result = modelScenarios(500_000, 50_000, 3, inputs);
    expect(result.expectedValue).toBeCloseTo(result.scenarios[0].weightedValue, 8);
  });

  it('maxDownside and maxUpside are both the single target price', () => {
    const inputs: ScenarioInput[] = [
      { case: 'base', revenueGrowth: 0.08, margin: 0.12, multiple: 10, probabilityWeight: 1.0 },
    ];
    const result = modelScenarios(500_000, 50_000, 3, inputs);
    expect(result.maxDownside).toBeCloseTo(result.scenarios[0].targetPrice, 8);
    expect(result.maxUpside).toBeCloseTo(result.scenarios[0].targetPrice, 8);
  });
});

describe('modelScenarios — probability validation', () => {
  it('throws when weights sum to 0.50 (too far from 1.0)', () => {
    const inputs: ScenarioInput[] = [
      { case: 'bear', revenueGrowth: -0.10, margin: 0.10, multiple: 6, probabilityWeight: 0.25 },
      { case: 'bull', revenueGrowth: 0.12,  margin: 0.20, multiple: 12, probabilityWeight: 0.25 },
    ];
    expect(() => modelScenarios(1_000_000, 100_000, 5, inputs)).toThrow(
      /probability weights must sum to ~1\.0/,
    );
  });

  it('does not throw when weights sum to 0.98 (within 0.05 tolerance)', () => {
    const inputs: ScenarioInput[] = [
      { case: 'bear', revenueGrowth: -0.10, margin: 0.10, multiple: 6, probabilityWeight: 0.24 },
      { case: 'base', revenueGrowth: 0.05,  margin: 0.15, multiple: 8, probabilityWeight: 0.50 },
      { case: 'bull', revenueGrowth: 0.12,  margin: 0.20, multiple: 12, probabilityWeight: 0.24 },
    ];
    expect(() => modelScenarios(1_000_000, 100_000, 5, inputs)).not.toThrow();
  });

  it('throws when sharesOutstanding is zero', () => {
    const inputs: ScenarioInput[] = [
      { case: 'base', revenueGrowth: 0.05, margin: 0.15, multiple: 8, probabilityWeight: 1.0 },
    ];
    expect(() => modelScenarios(1_000_000, 0, 5, inputs)).toThrow(
      /sharesOutstanding must not be zero/,
    );
  });
});
