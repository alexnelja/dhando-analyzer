# Phase 4: Deal Analyzer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Deal Analyzer component — deep-dive analysis of a single investment opportunity. Takes a screener-qualified investment and produces a `DealAnalysis` result containing: probability-weighted scenario expected value, Kelly position size with domain constraints, DCF intrinsic value, a structured investment memo, and a pre-mortem risk catalogue. All business logic is pure (inputs in → result out). DB operations live in separate store modules.

**Architecture:** All logic lives in `packages/core/src/deal-analyzer/`. The module is organised into five pure calculation layers (scenarios, Kelly, Fermi/probability, DCF, memo/pre-mortem) plus two store modules (scenario-store, journal-store) and a pipeline orchestrator. The pipeline wires the five layers together and calls `captureDecisionSnapshot` from the existing `rules-engine/snapshots.ts` to freeze state. No new runtime dependencies required — everything builds on existing `DatabaseConnection`, `runEngine`, `ScreenerPipelineResult`, and `JournalEntry`.

**Tech Stack:** TypeScript (strict), Vitest, better-sqlite3 (via existing `DatabaseConnection`)

**Spec:** `docs/superpowers/specs/2026-03-30-dhando-analyzer-design.md` — Sections 3 (Component 2), 7 (Kelly & Probability Calibration), 9 (Kelly domain constraints, Portfolio Kelly), Appendix A.4

---

## File Structure (additions)

```
packages/core/
└── src/
    ├── deal-analyzer/
    │   ├── scenarios.ts             ← Bear/base/bull modeler + expected value
    │   ├── kelly.ts                 ← Kelly formula, half-Kelly, domain constraints
    │   ├── probability.ts           ← Fermi decomposition + overconfidence correction
    │   ├── dcf.ts                   ← DCF intrinsic value (owner earnings + WACC + terminal value)
    │   ├── memo.ts                  ← Investment memo generator (pure, structured output)
    │   ├── premortem.ts             ← Pre-mortem framework (Pabrai's 5 failure categories)
    │   ├── pipeline.ts              ← Orchestrates all layers into DealAnalysis
    │   ├── scenario-store.ts        ← CRUD for scenarios table
    │   ├── journal-store.ts         ← CRUD for decision_journal table
    │   └── index.ts                 ← Barrel export
    └── __tests__/
        └── deal-analyzer/
            ├── scenarios.test.ts
            ├── kelly.test.ts
            ├── probability.test.ts
            ├── dcf.test.ts
            ├── memo.test.ts
            ├── premortem.test.ts
            ├── pipeline.test.ts
            ├── scenario-store.test.ts
            └── journal-store.test.ts
```

---

## Task 1: Scenario Modeler

**Files:**
- Create: `packages/core/src/deal-analyzer/scenarios.ts`
- Create: `packages/core/src/__tests__/deal-analyzer/scenarios.test.ts`

**What it does:** Accepts three scenario definitions (bear/base/bull), each with revenue growth, margin, exit multiple, and probability weight. Validates weights sum to 1.0. Calculates each case's target price using the formula `targetPrice = baseRevenue * (1 + revenueGrowth)^years * margin * multiple`. Derives `expectedValue` as the probability-weighted mean of all three target prices.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/deal-analyzer/scenarios.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildScenario,
  calculateExpectedValue,
  validateScenarioWeights,
  type ScenarioInputs,
  type ScenarioResult,
} from '../../deal-analyzer/scenarios.js';

const BASE_CASE: ScenarioInputs = {
  case: 'base',
  baseRevenue: 1000,
  revenueGrowth: 0.10,
  margin: 0.15,
  multiple: 10,
  years: 3,
  probabilityWeight: 0.50,
};

const BEAR_CASE: ScenarioInputs = {
  case: 'bear',
  baseRevenue: 1000,
  revenueGrowth: 0.00,
  margin: 0.08,
  multiple: 7,
  years: 3,
  probabilityWeight: 0.25,
};

const BULL_CASE: ScenarioInputs = {
  case: 'bull',
  baseRevenue: 1000,
  revenueGrowth: 0.20,
  margin: 0.20,
  multiple: 14,
  years: 3,
  probabilityWeight: 0.25,
};

describe('buildScenario', () => {
  it('calculates targetPrice correctly for base case', () => {
    // targetPrice = 1000 * (1.10)^3 * 0.15 * 10 = 1000 * 1.331 * 0.15 * 10 = 1996.5
    const result = buildScenario(BASE_CASE);
    expect(result.targetPrice).toBeCloseTo(1996.5, 0);
  });

  it('calculates targetPrice for bear case with zero growth', () => {
    // targetPrice = 1000 * 1^3 * 0.08 * 7 = 560
    const result = buildScenario(BEAR_CASE);
    expect(result.targetPrice).toBeCloseTo(560, 1);
  });

  it('returns the probability weight on the result', () => {
    const result = buildScenario(BASE_CASE);
    expect(result.probabilityWeight).toBe(0.50);
  });

  it('throws when revenueGrowth is less than -1', () => {
    expect(() => buildScenario({ ...BASE_CASE, revenueGrowth: -1.5 })).toThrow();
  });

  it('throws when years is less than 1', () => {
    expect(() => buildScenario({ ...BASE_CASE, years: 0 })).toThrow();
  });

  it('throws when multiple is zero or negative', () => {
    expect(() => buildScenario({ ...BASE_CASE, multiple: 0 })).toThrow();
  });
});

describe('calculateExpectedValue', () => {
  it('returns probability-weighted mean of target prices', () => {
    const bear = buildScenario(BEAR_CASE);
    const base = buildScenario(BASE_CASE);
    const bull = buildScenario(BULL_CASE);
    // EV = 0.25*560 + 0.50*1996.5 + 0.25*bull
    // bull = 1000 * (1.20)^3 * 0.20 * 14 = 1000 * 1.728 * 0.20 * 14 = 4838.4
    // EV = 140 + 998.25 + 1209.6 = 2347.85
    const ev = calculateExpectedValue([bear, base, bull]);
    expect(ev).toBeCloseTo(2347.85, 0);
  });

  it('throws when weights do not sum to 1.0', () => {
    const bear = buildScenario({ ...BEAR_CASE, probabilityWeight: 0.30 });
    const base = buildScenario(BASE_CASE);
    const bull = buildScenario(BULL_CASE);
    expect(() => calculateExpectedValue([bear, base, bull])).toThrow(/weights must sum/i);
  });

  it('throws when fewer than two scenarios are provided', () => {
    const base = buildScenario(BASE_CASE);
    expect(() => calculateExpectedValue([base])).toThrow();
  });
});

describe('validateScenarioWeights', () => {
  it.each([
    [[0.25, 0.50, 0.25], true],
    [[0.33, 0.34, 0.33], true],
    [[0.50, 0.50], true],
    [[0.30, 0.50, 0.25], false],  // sums to 1.05
    [[0.10, 0.10, 0.10], false],  // sums to 0.30
  ] as const)('weights %j → valid=%s', (weights, expected) => {
    expect(validateScenarioWeights(weights as number[])).toBe(expected);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement scenarios.ts**

```typescript
// packages/core/src/deal-analyzer/scenarios.ts

import type { ScenarioCase } from '../models/scenario.js';

/**
 * Inputs for a single bear / base / bull scenario projection.
 * All monetary values must be in a consistent unit (e.g. thousands, millions).
 *
 * Source: Pabrai, "The Dhandho Investor," Ch. 7 (three-case scenario model);
 * Spec: Section 3, Component 2.
 */
export interface ScenarioInputs {
  /** Which case this scenario represents. */
  case: ScenarioCase;
  /** Latest-year revenue as the base for compounding. */
  baseRevenue: number;
  /** Annual revenue growth rate as a decimal (e.g. 0.10 = 10%). Must be >= -1. */
  revenueGrowth: number;
  /** Net profit margin at the target year as a decimal. */
  margin: number;
  /** Exit multiple (e.g. P/E or EV/EBITDA) applied to projected earnings. */
  multiple: number;
  /** Projection horizon in years. Must be >= 1. */
  years: number;
  /** Probability assigned to this case. All cases must sum to 1.0 (+/- 0.01 tolerance). */
  probabilityWeight: number;
}

/**
 * The calculated output for a single scenario.
 */
export interface ScenarioResult {
  /** Which case this is. */
  case: ScenarioCase;
  /** Projected price/value at the target year: baseRevenue * (1+g)^years * margin * multiple. */
  targetPrice: number;
  /** Probability weight for this case. */
  probabilityWeight: number;
}

/**
 * Build a single scenario result from the given inputs.
 *
 * Formula: targetPrice = baseRevenue × (1 + revenueGrowth)^years × margin × multiple
 *
 * @param inputs - Scenario definition. See {@link ScenarioInputs}.
 * @returns {@link ScenarioResult} with the calculated target price.
 * @throws {Error} When domain constraints are violated.
 */
export function buildScenario(inputs: ScenarioInputs): ScenarioResult {
  const { case: scenarioCase, baseRevenue, revenueGrowth, margin, multiple, years, probabilityWeight } = inputs;

  if (revenueGrowth < -1) {
    throw new Error(`buildScenario: revenueGrowth must be >= -1, got ${revenueGrowth}`);
  }
  if (years < 1) {
    throw new Error(`buildScenario: years must be >= 1, got ${years}`);
  }
  if (multiple <= 0) {
    throw new Error(`buildScenario: multiple must be > 0, got ${multiple}`);
  }
  if (baseRevenue <= 0) {
    throw new Error(`buildScenario: baseRevenue must be > 0, got ${baseRevenue}`);
  }

  const projectedRevenue = baseRevenue * Math.pow(1 + revenueGrowth, years);
  const targetPrice = projectedRevenue * margin * multiple;

  return { case: scenarioCase, targetPrice, probabilityWeight };
}

/**
 * Validate that a set of probability weights sums to 1.0 within a tolerance of 0.01.
 *
 * @param weights - Array of probability weights.
 * @returns True when the sum is within [0.99, 1.01].
 */
export function validateScenarioWeights(weights: number[]): boolean {
  const sum = weights.reduce((acc, w) => acc + w, 0);
  return Math.abs(sum - 1.0) <= 0.01;
}

/**
 * Calculate the probability-weighted expected value across all scenario results.
 *
 * EV = sum of (scenario.targetPrice × scenario.probabilityWeight)
 *
 * @param scenarios - Array of at least two {@link ScenarioResult} objects.
 * @returns Expected value as a single number.
 * @throws {Error} When fewer than two scenarios are provided or weights do not sum to 1.0.
 */
export function calculateExpectedValue(scenarios: ScenarioResult[]): number {
  if (scenarios.length < 2) {
    throw new Error('calculateExpectedValue: at least two scenarios are required');
  }

  const weights = scenarios.map((s) => s.probabilityWeight);
  if (!validateScenarioWeights(weights)) {
    throw new Error(
      `calculateExpectedValue: weights must sum to 1.0, got ${weights.reduce((a, b) => a + b, 0).toFixed(4)}`,
    );
  }

  return scenarios.reduce((ev, s) => ev + s.targetPrice * s.probabilityWeight, 0);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): scenario modeler with bear/base/bull cases and expected value`

---

## Task 2: Kelly Criterion Calculator

**Files:**
- Create: `packages/core/src/deal-analyzer/kelly.ts`
- Create: `packages/core/src/__tests__/deal-analyzer/kelly.test.ts`

**What it does:** Implements `f* = W/A - (1-W)/B` with full domain constraints. Clamps output to [0, 1]. Applies half-Kelly by default. Applies staleness penalty (`× 0.8`) when data is > 72 hours old. Provides a `portfolioKelly` helper that enforces the no-leverage constraint across multiple positions.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/deal-analyzer/kelly.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateKelly,
  applyHalfKelly,
  applyStalenessPenalty,
  portfolioKelly,
  type KellyInputs,
  type KellyResult,
} from '../../deal-analyzer/kelly.js';

describe('calculateKelly', () => {
  it('returns correct f* for a positive-edge bet', () => {
    // W=0.6, A=0.3 (lose 30%), B=0.5 (gain 50%)
    // f* = 0.6/0.3 - 0.4/0.5 = 2.0 - 0.8 = 1.2 → clamped to 1.0
    const result = calculateKelly({ winProbability: 0.6, lossFraction: 0.3, gainFraction: 0.5 });
    expect(result.rawKelly).toBeCloseTo(1.2, 4);
    expect(result.clampedKelly).toBe(1.0);
  });

  it('returns 0 when there is no edge (W < A/(A+B))', () => {
    // W=0.3, A=0.5, B=0.5 → breakeven W = 0.5/(0.5+0.5) = 0.5
    // f* = 0.3/0.5 - 0.7/0.5 = 0.6 - 1.4 = -0.8 → clamped to 0
    const result = calculateKelly({ winProbability: 0.3, lossFraction: 0.5, gainFraction: 0.5 });
    expect(result.rawKelly).toBeCloseTo(-0.8, 4);
    expect(result.clampedKelly).toBe(0);
  });

  it('returns exactly 0 at the breakeven point', () => {
    // W = A/(A+B): W=0.5, A=0.5, B=0.5 → f* = 0.5/0.5 - 0.5/0.5 = 0
    const result = calculateKelly({ winProbability: 0.5, lossFraction: 0.5, gainFraction: 0.5 });
    expect(result.clampedKelly).toBeCloseTo(0, 6);
  });

  it('throws when winProbability is outside (0, 1)', () => {
    expect(() => calculateKelly({ winProbability: 0, lossFraction: 0.3, gainFraction: 0.5 })).toThrow();
    expect(() => calculateKelly({ winProbability: 1, lossFraction: 0.3, gainFraction: 0.5 })).toThrow();
  });

  it('throws when lossFraction is zero or negative', () => {
    expect(() => calculateKelly({ winProbability: 0.6, lossFraction: 0, gainFraction: 0.5 })).toThrow();
  });

  it('throws when gainFraction is zero or negative', () => {
    expect(() => calculateKelly({ winProbability: 0.6, lossFraction: 0.3, gainFraction: 0 })).toThrow();
  });
});

describe('applyHalfKelly', () => {
  it.each([
    [0.40, 0.20],
    [1.00, 0.50],
    [0.00, 0.00],
  ] as const)('full Kelly %s → half-Kelly %s', (full, expected) => {
    expect(applyHalfKelly(full)).toBeCloseTo(expected, 6);
  });
});

describe('applyStalenessPenalty', () => {
  it('returns the original value when data is fresh (<=72h)', () => {
    expect(applyStalenessPenalty(0.40, 48)).toBeCloseTo(0.40, 6);
    expect(applyStalenessPenalty(0.40, 72)).toBeCloseTo(0.40, 6);
  });

  it('applies 0.8 multiplier when data is stale (>72h)', () => {
    expect(applyStalenessPenalty(0.40, 73)).toBeCloseTo(0.32, 6);
    expect(applyStalenessPenalty(0.50, 200)).toBeCloseTo(0.40, 6);
  });
});

describe('portfolioKelly', () => {
  it('scales down positions proportionally when total exceeds 100%', () => {
    // Two positions each at 0.40 half-Kelly → sum = 0.80, both pass
    const result = portfolioKelly([
      { id: 'A', halfKelly: 0.40 },
      { id: 'B', halfKelly: 0.40 },
    ]);
    expect(result['A']).toBeCloseTo(0.40, 4);
    expect(result['B']).toBeCloseTo(0.40, 4);
  });

  it('scales down proportionally when total exceeds 1.0', () => {
    // Three positions at 0.40 each → sum 1.20, scale by 1/1.20
    const result = portfolioKelly([
      { id: 'A', halfKelly: 0.40 },
      { id: 'B', halfKelly: 0.40 },
      { id: 'C', halfKelly: 0.40 },
    ]);
    expect(result['A']).toBeCloseTo(0.333, 2);
    expect(result['B']).toBeCloseTo(0.333, 2);
    expect(result['C']).toBeCloseTo(0.333, 2);
  });

  it('returns an empty object for an empty input', () => {
    expect(portfolioKelly([])).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement kelly.ts**

```typescript
// packages/core/src/deal-analyzer/kelly.ts

/**
 * Kelly Criterion position sizing with domain constraints, half-Kelly default,
 * and staleness-aware adjustment.
 *
 * Sources:
 * - Kelly (1956), "A New Interpretation of Information Rate"
 * - Thorp (1962), "Beat the Dealer"; Thorp (2017), "A Man for All Markets"
 * - Pabrai, "The Dhandho Investor," Ch. 12-13: "Few Bets, Big Bets, Infrequent Bets"
 * - Spec: Section 7 (Kelly Formula), Section 9 (Kelly domain constraints, Portfolio Kelly)
 */

/** Inputs to the Kelly formula. */
export interface KellyInputs {
  /** Win probability W — must be in (0, 1) exclusive. */
  winProbability: number;
  /** Loss fraction A — fraction of the bet lost on a loss. Must be > 0. */
  lossFraction: number;
  /** Gain fraction B — fraction of the bet gained on a win. Must be > 0. */
  gainFraction: number;
}

/** Full result of the Kelly calculation before and after clamping. */
export interface KellyResult {
  /** Raw f* = W/A - (1-W)/B. May be negative or > 1. */
  rawKelly: number;
  /** f* clamped to [0, 1]. Negative → no edge; >1 → would require leverage (not supported). */
  clampedKelly: number;
}

/**
 * Calculate the Kelly fraction f* for a single bet.
 *
 * Formula: f* = W/A - (1-W)/B
 *
 * Domain constraints (Spec Section 7):
 * - winProbability must be in (0, 1) exclusive — certain outcomes use the scenario model.
 * - lossFraction and gainFraction must both be > 0.
 * - Negative f* → clamp to 0 (no edge, don't invest).
 * - f* > 1 → clamp to 1 (leverage not supported in v1).
 *
 * @param inputs - See {@link KellyInputs}.
 * @returns {@link KellyResult} with raw and clamped Kelly fractions.
 * @throws {Error} When any domain constraint on inputs is violated.
 */
export function calculateKelly(inputs: KellyInputs): KellyResult {
  const { winProbability: W, lossFraction: A, gainFraction: B } = inputs;

  if (W <= 0 || W >= 1) {
    throw new Error(`calculateKelly: winProbability must be in (0, 1), got ${W}`);
  }
  if (A <= 0) {
    throw new Error(`calculateKelly: lossFraction must be > 0, got ${A}`);
  }
  if (B <= 0) {
    throw new Error(`calculateKelly: gainFraction must be > 0, got ${B}`);
  }

  const rawKelly = W / A - (1 - W) / B;
  const clampedKelly = Math.min(Math.max(rawKelly, 0), 1);

  return { rawKelly, clampedKelly };
}

/**
 * Apply the half-Kelly divisor.
 *
 * Half-Kelly returns ~75% of the optimal growth rate with ~25% of the variance
 * (Thorp). This is the default position size used throughout the system.
 *
 * @param kellyFraction - The clamped Kelly fraction (output of `calculateKelly`).
 * @returns Half of the input — the recommended position size fraction.
 */
export function applyHalfKelly(kellyFraction: number): number {
  return kellyFraction / 2;
}

/**
 * Apply the data-staleness penalty.
 *
 * When the underlying financials are older than 72 hours, the Kelly estimate is
 * less reliable. The system applies a 0.8 multiplier and sets a `stale_warning`
 * flag on the score row. Spec: Section 7, "Data staleness impact."
 *
 * @param kellyFraction - The half-Kelly fraction to potentially discount.
 * @param dataStalenessHours - Age of the underlying financial data in hours.
 * @returns Adjusted Kelly fraction (unchanged if fresh, multiplied by 0.8 if stale).
 */
export function applyStalenessPenalty(kellyFraction: number, dataStalenessHours: number): number {
  const STALENESS_THRESHOLD_HOURS = 72;
  const STALENESS_PENALTY = 0.8;
  if (dataStalenessHours > STALENESS_THRESHOLD_HOURS) {
    return kellyFraction * STALENESS_PENALTY;
  }
  return kellyFraction;
}

/** A single position's ID and its computed half-Kelly fraction. */
export interface PortfolioPosition {
  id: string;
  halfKelly: number;
}

/**
 * Portfolio Kelly — enforce the no-leverage constraint across multiple positions.
 *
 * When the sum of individual half-Kelly positions exceeds 100% (1.0), scale
 * each position down proportionally so the total equals exactly 1.0.
 * No single position is ever inflated above its individual half-Kelly.
 *
 * This is a simplified v1 implementation. The full covariance-matrix approach
 * described in Spec Section 7 is a Phase 5 enhancement.
 *
 * @param positions - Array of positions with their half-Kelly fractions.
 * @returns Map of position ID → final allocated weight.
 */
export function portfolioKelly(positions: PortfolioPosition[]): Record<string, number> {
  if (positions.length === 0) return {};

  const total = positions.reduce((sum, p) => sum + p.halfKelly, 0);
  const scaleFactor = total > 1.0 ? 1.0 / total : 1.0;

  return Object.fromEntries(positions.map((p) => [p.id, p.halfKelly * scaleFactor]));
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): Kelly criterion calculator with half-Kelly, staleness penalty, portfolio scaling`

---

## Task 3: Probability Estimation Helpers

**Files:**
- Create: `packages/core/src/deal-analyzer/probability.ts`
- Create: `packages/core/src/__tests__/deal-analyzer/probability.test.ts`

**What it does:** Provides two probability tools. `fermiDecompose` multiplies a list of independent sub-question probabilities and returns both the product and each component — this makes compounding errors visible. `correctOverconfidence` applies the calibration factor from Tetlock's research: 90% expressed confidence maps to ~60-70% actual accuracy, implemented as a configurable deflation function that pulls estimates toward 0.5.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/deal-analyzer/probability.test.ts
import { describe, it, expect } from 'vitest';
import {
  fermiDecompose,
  correctOverconfidence,
  type FermiQuestion,
  type FermiResult,
} from '../../deal-analyzer/probability.js';

describe('fermiDecompose', () => {
  it('multiplies sub-question probabilities correctly', () => {
    // Example from Spec A.4: SA retailer doubling in 3 years
    const questions: FermiQuestion[] = [
      { label: 'SA consumer spending grows', probability: 0.6 },
      { label: 'Company gains market share', probability: 0.5 },
      { label: 'Margins expand', probability: 0.4 },
      { label: 'P/E multiple re-rates', probability: 0.7 },
      { label: 'Management executes', probability: 0.6 },
    ];
    // 0.6 * 0.5 * 0.4 * 0.7 * 0.6 = 0.0504
    const result = fermiDecompose(questions);
    expect(result.combinedProbability).toBeCloseTo(0.0504, 4);
    expect(result.components).toHaveLength(5);
  });

  it('returns 1.0 for a single question with probability 1', () => {
    const result = fermiDecompose([{ label: 'certain', probability: 1.0 }]);
    expect(result.combinedProbability).toBe(1.0);
  });

  it('throws when any probability is outside [0, 1]', () => {
    expect(() =>
      fermiDecompose([
        { label: 'valid', probability: 0.5 },
        { label: 'invalid', probability: 1.2 },
      ]),
    ).toThrow();
  });

  it('throws when the question list is empty', () => {
    expect(() => fermiDecompose([])).toThrow();
  });

  it('preserves labels on each component', () => {
    const result = fermiDecompose([
      { label: 'first', probability: 0.7 },
      { label: 'second', probability: 0.8 },
    ]);
    expect(result.components[0].label).toBe('first');
    expect(result.components[1].label).toBe('second');
  });
});

describe('correctOverconfidence', () => {
  it('pulls a high-confidence estimate toward 0.5', () => {
    // 0.9 with default deflation should move toward 0.5
    const corrected = correctOverconfidence(0.9);
    expect(corrected).toBeLessThan(0.9);
    expect(corrected).toBeGreaterThan(0.5);
  });

  it('pulls a low-confidence estimate toward 0.5', () => {
    // 0.1 with default deflation should move toward 0.5
    const corrected = correctOverconfidence(0.1);
    expect(corrected).toBeGreaterThan(0.1);
    expect(corrected).toBeLessThan(0.5);
  });

  it('leaves 0.5 unchanged (no overconfidence at the midpoint)', () => {
    expect(correctOverconfidence(0.5)).toBeCloseTo(0.5, 6);
  });

  it('returns a value within [0, 1]', () => {
    for (const p of [0.01, 0.1, 0.3, 0.7, 0.9, 0.99]) {
      const corrected = correctOverconfidence(p);
      expect(corrected).toBeGreaterThanOrEqual(0);
      expect(corrected).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    [0.9, 0.3, 0.72],  // shrinkage 0.3: 0.9 - 0.3*(0.9-0.5) = 0.9 - 0.12 = 0.78... use linear shrink
    [0.7, 0.0, 0.70],  // shrinkage 0.0: no correction
  ] as const)('p=%s shrinkage=%s → expected ~%s', (p, shrinkage, expected) => {
    expect(correctOverconfidence(p, shrinkage)).toBeCloseTo(expected, 1);
  });

  it('throws when probability is outside [0, 1]', () => {
    expect(() => correctOverconfidence(1.1)).toThrow();
    expect(() => correctOverconfidence(-0.1)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement probability.ts**

```typescript
// packages/core/src/deal-analyzer/probability.ts

/**
 * Probability estimation helpers: Fermi decomposition and overconfidence correction.
 *
 * Sources:
 * - Fermi decomposition: Tetlock & Gardner, "Superforecasting" (2015)
 * - Overconfidence correction: Kahneman, "Thinking, Fast and Slow" (2011);
 *   research showing 90% CI is correct only 50-70% of the time
 * - Pre-mortem reduces overconfidence by ~30%: Klein, "The Power of Intuition" (2004)
 * - Spec: Section 7 (Probability Estimation Pipeline), Appendix A.4
 */

/** A single sub-question in a Fermi decomposition. */
export interface FermiQuestion {
  /** Human-readable label for the sub-question. */
  label: string;
  /** Probability assigned to this sub-question. Must be in [0, 1]. */
  probability: number;
}

/** A single component as it appears in the Fermi result, with its running product. */
export interface FermiComponent {
  label: string;
  probability: number;
  /** Product of all probabilities up to and including this component. */
  runningProduct: number;
}

/**
 * The full Fermi decomposition result.
 */
export interface FermiResult {
  /** Product of all sub-question probabilities. */
  combinedProbability: number;
  /** Per-component breakdown with running product for transparency. */
  components: FermiComponent[];
}

/**
 * Fermi-decompose a hard-to-estimate probability into independently estimable sub-questions.
 *
 * The combined probability is the product of all sub-question probabilities.
 * This often produces a much lower estimate than intuition would suggest —
 * which is precisely the point: it exposes overconfidence in compound outcomes.
 *
 * @param questions - Array of at least one sub-question with probabilities in [0, 1].
 * @returns {@link FermiResult} with the combined probability and a per-component breakdown.
 * @throws {Error} When the list is empty or any probability is outside [0, 1].
 */
export function fermiDecompose(questions: FermiQuestion[]): FermiResult {
  if (questions.length === 0) {
    throw new Error('fermiDecompose: at least one sub-question is required');
  }

  for (const q of questions) {
    if (q.probability < 0 || q.probability > 1) {
      throw new Error(
        `fermiDecompose: probability for "${q.label}" must be in [0, 1], got ${q.probability}`,
      );
    }
  }

  const components: FermiComponent[] = [];
  let runningProduct = 1;

  for (const q of questions) {
    runningProduct *= q.probability;
    components.push({ label: q.label, probability: q.probability, runningProduct });
  }

  return { combinedProbability: runningProduct, components };
}

/**
 * Correct for overconfidence by shrinking probability estimates toward 0.5.
 *
 * Formula: corrected = p - shrinkageFactor × (p - 0.5)
 *
 * This is a linear shrinkage toward the 0.5 prior. A shrinkage of 0.3 reduces
 * the distance from 0.5 by 30%, reflecting the Tetlock finding that expressed
 * 90% confidence achieves only ~60-70% actual accuracy.
 *
 * The pre-mortem analysis (Task 6) applies an additional ~30% reduction to the
 * distance from 0.5 after this base correction.
 *
 * @param probability - Raw probability estimate. Must be in [0, 1].
 * @param shrinkageFactor - Fraction to reduce distance from 0.5. Default 0.3.
 * @returns Corrected probability, clamped to [0, 1].
 * @throws {Error} When probability is outside [0, 1].
 */
export function correctOverconfidence(probability: number, shrinkageFactor = 0.3): number {
  if (probability < 0 || probability > 1) {
    throw new Error(`correctOverconfidence: probability must be in [0, 1], got ${probability}`);
  }
  const corrected = probability - shrinkageFactor * (probability - 0.5);
  return Math.min(Math.max(corrected, 0), 1);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): Fermi decomposition and overconfidence correction helpers`

---

## Task 4: DCF Intrinsic Value Calculator

**Files:**
- Create: `packages/core/src/deal-analyzer/dcf.ts`
- Create: `packages/core/src/__tests__/deal-analyzer/dcf.test.ts`

**What it does:** Calculates intrinsic value per share by discounting projected owner earnings at WACC over a holding period, then adding a Gordon Growth Model terminal value. Exposes `calculateWacc` as a standalone helper. Returns `intrinsicValuePerShare`, `marginOfSafety` (relative to current price), and whether the investment passes the 30% margin-of-safety gate from the spec.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/deal-analyzer/dcf.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateWacc,
  calculateDcf,
  type WaccInputs,
  type DcfInputs,
  type DcfResult,
} from '../../deal-analyzer/dcf.js';

describe('calculateWacc', () => {
  it('calculates WACC correctly', () => {
    // E=800, D=200, V=1000, Re=0.12, Rd=0.06, T=0.28
    // WACC = (800/1000)*0.12 + (200/1000)*0.06*(1-0.28)
    //      = 0.096 + 0.00864 = 0.10464
    const wacc = calculateWacc({
      equityValue: 800,
      debtValue: 200,
      costOfEquity: 0.12,
      costOfDebt: 0.06,
      taxRate: 0.28,
    });
    expect(wacc).toBeCloseTo(0.10464, 4);
  });

  it('throws when equityValue + debtValue is zero', () => {
    expect(() =>
      calculateWacc({ equityValue: 0, debtValue: 0, costOfEquity: 0.10, costOfDebt: 0.05, taxRate: 0.28 }),
    ).toThrow();
  });

  it('throws when taxRate is outside [0, 1)', () => {
    expect(() =>
      calculateWacc({ equityValue: 800, debtValue: 200, costOfEquity: 0.12, costOfDebt: 0.06, taxRate: 1.1 }),
    ).toThrow();
  });
});

describe('calculateDcf', () => {
  const BASE_INPUTS: DcfInputs = {
    ownerEarnings: 100,          // current owner earnings
    growthRate: 0.08,            // 8% per year
    terminalGrowthRate: 0.03,    // 3% perpetuity
    wacc: 0.10,
    years: 5,
    sharesOutstanding: 100,
    currentPrice: 80,
  };

  it('returns a positive intrinsic value per share', () => {
    const result = calculateDcf(BASE_INPUTS);
    expect(result.intrinsicValuePerShare).toBeGreaterThan(0);
  });

  it('calculates margin of safety correctly relative to current price', () => {
    const result = calculateDcf(BASE_INPUTS);
    // marginOfSafety = (IV - currentPrice) / IV
    const expected = (result.intrinsicValuePerShare - BASE_INPUTS.currentPrice) / result.intrinsicValuePerShare;
    expect(result.marginOfSafety).toBeCloseTo(expected, 4);
  });

  it('flags passesGate=true when margin of safety >= 30%', () => {
    // Force IV well above current price
    const result = calculateDcf({ ...BASE_INPUTS, currentPrice: 10 });
    expect(result.passesGate).toBe(true);
  });

  it('flags passesGate=false when margin of safety < 30%', () => {
    // Force current price close to IV
    const result = calculateDcf({ ...BASE_INPUTS, currentPrice: 200 });
    expect(result.passesGate).toBe(false);
  });

  it('includes the total intrinsic value (before per-share division) in the result', () => {
    const result = calculateDcf(BASE_INPUTS);
    expect(result.totalIntrinsicValue).toBeCloseTo(
      result.intrinsicValuePerShare * BASE_INPUTS.sharesOutstanding,
      2,
    );
  });

  it('throws when wacc <= terminalGrowthRate (Gordon Growth Model undefined)', () => {
    expect(() =>
      calculateDcf({ ...BASE_INPUTS, wacc: 0.03, terminalGrowthRate: 0.04 }),
    ).toThrow(/wacc must be greater than terminalGrowthRate/i);
  });

  it('throws when sharesOutstanding is zero', () => {
    expect(() => calculateDcf({ ...BASE_INPUTS, sharesOutstanding: 0 })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement dcf.ts**

```typescript
// packages/core/src/deal-analyzer/dcf.ts

/**
 * DCF intrinsic value calculator using owner earnings discounted at WACC,
 * with a Gordon Growth Model terminal value.
 *
 * Sources:
 * - Buffett, Berkshire Hathaway Annual Letter (1986) — Owner Earnings definition
 * - Graham (1934), "Security Analysis" — intrinsic value concept
 * - Modigliani & Miller (1958) — WACC definition
 * - Pabrai, "The Dhandho Investor," Ch. 7 — 30% margin of safety requirement
 * - Spec: Section 3 (Component 2), Appendix A.2 (Intrinsic Value, WACC)
 */

/** Inputs for WACC calculation. */
export interface WaccInputs {
  /** Market value of equity (shares outstanding × price). */
  equityValue: number;
  /** Market value of debt. */
  debtValue: number;
  /** Cost of equity (e.g. from CAPM: Rf + β × ERP). */
  costOfEquity: number;
  /** Pre-tax cost of debt (yield on outstanding bonds or bank rate). */
  costOfDebt: number;
  /** Effective corporate tax rate. Must be in [0, 1). */
  taxRate: number;
}

/** Inputs for the DCF intrinsic value calculation. */
export interface DcfInputs {
  /** Current-year owner earnings: net income + depreciation − maintenance capex. */
  ownerEarnings: number;
  /** Annual growth rate of owner earnings during the explicit forecast period. */
  growthRate: number;
  /** Perpetuity growth rate for the Gordon Growth Model terminal value. Must be < wacc. */
  terminalGrowthRate: number;
  /** Weighted average cost of capital — the discount rate. Must be > terminalGrowthRate. */
  wacc: number;
  /** Number of years in the explicit forecast period. Must be >= 1. */
  years: number;
  /** Diluted shares outstanding used to convert total IV to per-share. Must be > 0. */
  sharesOutstanding: number;
  /** Current market price per share, used to compute margin of safety. */
  currentPrice: number;
}

/** Full DCF result. */
export interface DcfResult {
  /** Sum of discounted owner earnings + discounted terminal value. */
  totalIntrinsicValue: number;
  /** Total intrinsic value divided by shares outstanding. */
  intrinsicValuePerShare: number;
  /** (IV - currentPrice) / IV. Negative when overvalued. */
  marginOfSafety: number;
  /** True when marginOfSafety >= 0.30 (Pabrai's 30% gate). */
  passesGate: boolean;
  /** Year-by-year discounted owner earnings. */
  discountedCashFlows: number[];
  /** Discounted terminal value. */
  discountedTerminalValue: number;
}

/**
 * Calculate the Weighted Average Cost of Capital (WACC).
 *
 * Formula: WACC = (E/V × Re) + (D/V × Rd × (1-T))
 *
 * @param inputs - See {@link WaccInputs}.
 * @returns WACC as a decimal.
 * @throws {Error} When total value (E+D) is zero or taxRate is outside [0, 1).
 */
export function calculateWacc(inputs: WaccInputs): number {
  const { equityValue: E, debtValue: D, costOfEquity: Re, costOfDebt: Rd, taxRate: T } = inputs;
  const V = E + D;

  if (V === 0) {
    throw new Error('calculateWacc: equityValue + debtValue must not be zero');
  }
  if (T < 0 || T >= 1) {
    throw new Error(`calculateWacc: taxRate must be in [0, 1), got ${T}`);
  }

  return (E / V) * Re + (D / V) * Rd * (1 - T);
}

/**
 * Calculate intrinsic value per share using a two-stage DCF model.
 *
 * Stage 1: Explicitly discount owner earnings for `years` years at `wacc`.
 * Stage 2: Gordon Growth Model terminal value at year N, discounted back to year 0.
 *
 * Terminal value = ownerEarnings_N × (1 + terminalGrowthRate) / (wacc - terminalGrowthRate)
 *
 * @param inputs - See {@link DcfInputs}.
 * @returns {@link DcfResult} with full breakdown.
 * @throws {Error} When wacc <= terminalGrowthRate, sharesOutstanding is zero, or years < 1.
 */
export function calculateDcf(inputs: DcfInputs): DcfResult {
  const {
    ownerEarnings,
    growthRate,
    terminalGrowthRate,
    wacc,
    years,
    sharesOutstanding,
    currentPrice,
  } = inputs;

  if (wacc <= terminalGrowthRate) {
    throw new Error(
      `calculateDcf: wacc (${wacc}) must be greater than terminalGrowthRate (${terminalGrowthRate})`,
    );
  }
  if (sharesOutstanding <= 0) {
    throw new Error(`calculateDcf: sharesOutstanding must be > 0, got ${sharesOutstanding}`);
  }
  if (years < 1) {
    throw new Error(`calculateDcf: years must be >= 1, got ${years}`);
  }

  // Stage 1: explicit-period discounted cash flows.
  const discountedCashFlows: number[] = [];
  let sumDcf = 0;

  for (let year = 1; year <= years; year++) {
    const earnings = ownerEarnings * Math.pow(1 + growthRate, year);
    const discounted = earnings / Math.pow(1 + wacc, year);
    discountedCashFlows.push(discounted);
    sumDcf += discounted;
  }

  // Stage 2: terminal value (Gordon Growth Model).
  const finalYearEarnings = ownerEarnings * Math.pow(1 + growthRate, years);
  const terminalValue = (finalYearEarnings * (1 + terminalGrowthRate)) / (wacc - terminalGrowthRate);
  const discountedTerminalValue = terminalValue / Math.pow(1 + wacc, years);

  const totalIntrinsicValue = sumDcf + discountedTerminalValue;
  const intrinsicValuePerShare = totalIntrinsicValue / sharesOutstanding;
  const marginOfSafety = (intrinsicValuePerShare - currentPrice) / intrinsicValuePerShare;

  return {
    totalIntrinsicValue,
    intrinsicValuePerShare,
    marginOfSafety,
    passesGate: marginOfSafety >= 0.30,
    discountedCashFlows,
    discountedTerminalValue,
  };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): DCF intrinsic value calculator with WACC and margin-of-safety gate`

---

## Task 5: Investment Memo Generator

**Files:**
- Create: `packages/core/src/deal-analyzer/memo.ts`
- Create: `packages/core/src/__tests__/deal-analyzer/memo.test.ts`

**What it does:** A pure function that accepts all deal analysis inputs and returns a structured `InvestmentMemo` object. The memo groups findings into five fields: `thesis` (≤ 5 sentences), `moat`, `risks`, `valuation`, and `exitCriteria`. All fields are strings built from the provided inputs — no LLM, no I/O. This provides the structured data that the desktop UI and CLI can render, and that the journal store will persist.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/deal-analyzer/memo.test.ts
import { describe, it, expect } from 'vitest';
import {
  generateMemo,
  type MemoInputs,
  type InvestmentMemo,
} from '../../deal-analyzer/memo.js';

const BASE_INPUTS: MemoInputs = {
  investmentName: 'Capitec Bank',
  ticker: 'CPI',
  thesis: 'Capitec is the lowest-cost retail bank in SA with a widening digital moat.',
  moatScore: 4,
  moatDescription: 'Low-cost digital distribution and switching costs via salary routing.',
  managementScore: 5,
  keyRisks: [
    'Credit cycle deterioration in SA consumer segment',
    'Regulatory capital requirement increase',
    'Fintech disruptors (TymeBank, Discovery Bank)',
  ],
  intrinsicValuePerShare: 2800,
  currentPrice: 1800,
  marginOfSafety: 0.357,
  expectedValue: 2600,
  kellyPositionSize: 0.12,
  exitCriteria: [
    'Price reaches 90% of intrinsic value',
    'Moat score deteriorates to <= 2',
    'Non-performing loans exceed 12% of book',
  ],
};

describe('generateMemo', () => {
  it('returns an InvestmentMemo with all required fields', () => {
    const memo = generateMemo(BASE_INPUTS);
    expect(memo.thesis).toBeTruthy();
    expect(memo.moat).toBeTruthy();
    expect(memo.risks).toBeTruthy();
    expect(memo.valuation).toBeTruthy();
    expect(memo.exitCriteria).toBeTruthy();
  });

  it('includes the investment name in the thesis', () => {
    const memo = generateMemo(BASE_INPUTS);
    expect(memo.thesis).toContain('Capitec Bank');
  });

  it('includes all provided risks in the risks field', () => {
    const memo = generateMemo(BASE_INPUTS);
    for (const risk of BASE_INPUTS.keyRisks) {
      expect(memo.risks).toContain(risk);
    }
  });

  it('includes margin of safety and Kelly position in the valuation field', () => {
    const memo = generateMemo(BASE_INPUTS);
    expect(memo.valuation).toContain('35.7%');   // 0.357 → 35.7%
    expect(memo.valuation).toContain('12%');      // 0.12 → 12%
  });

  it('includes all exit criteria in the exitCriteria field', () => {
    const memo = generateMemo(BASE_INPUTS);
    for (const criterion of BASE_INPUTS.exitCriteria) {
      expect(memo.exitCriteria).toContain(criterion);
    }
  });

  it('flags overvalued investments in the valuation field when MOS is negative', () => {
    const memo = generateMemo({ ...BASE_INPUTS, marginOfSafety: -0.10, currentPrice: 3100 });
    expect(memo.valuation).toMatch(/overvalued|above intrinsic/i);
  });

  it('returns the same memo on repeated calls with the same inputs (pure function)', () => {
    const first = generateMemo(BASE_INPUTS);
    const second = generateMemo(BASE_INPUTS);
    expect(first).toEqual(second);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement memo.ts**

```typescript
// packages/core/src/deal-analyzer/memo.ts

/**
 * Investment memo generator.
 *
 * A pure function that takes deal analysis inputs and returns a structured
 * InvestmentMemo. All output is deterministic — no I/O, no LLM calls.
 * The memo is the human-readable summary of the full DealAnalysis, suitable
 * for rendering in the desktop UI, CLI output, or journal persistence.
 *
 * Source: Pabrai, "The Dhandho Investor," Ch. 7-13 (memo structure mirrors
 * his investment checklist categories: thesis, moat, risks, valuation, exit).
 * Spec: Section 3, Component 2 — "Investment memo generator."
 */

/** All inputs needed to generate a structured investment memo. */
export interface MemoInputs {
  /** Full name of the investment. */
  investmentName: string;
  /** Ticker symbol (optional — used for display). */
  ticker?: string;
  /** One-paragraph analyst thesis (5 sentences max). */
  thesis: string;
  /** Moat durability score 1-5. */
  moatScore: number;
  /** Qualitative description of the moat sources. */
  moatDescription: string;
  /** Management quality score 1-5. */
  managementScore: number;
  /** Ordered list of key investment risks. */
  keyRisks: string[];
  /** Intrinsic value per share from DCF. */
  intrinsicValuePerShare: number;
  /** Current market price per share. */
  currentPrice: number;
  /** (IV - price) / IV. Can be negative. */
  marginOfSafety: number;
  /** Probability-weighted expected value from scenario model. */
  expectedValue: number;
  /** Recommended half-Kelly position size as a decimal. */
  kellyPositionSize: number;
  /** Conditions that would trigger an exit. */
  exitCriteria: string[];
}

/**
 * Structured investment memo suitable for display and persistence.
 * All fields are plain text strings — rendering is left to the consumer.
 */
export interface InvestmentMemo {
  /** Investment thesis (≤ 5 sentences). */
  thesis: string;
  /** Moat description with score. */
  moat: string;
  /** Risk catalogue as a numbered list. */
  risks: string;
  /** Valuation summary including IV, price, MOS, EV, and Kelly sizing. */
  valuation: string;
  /** Exit trigger list. */
  exitCriteria: string;
}

/** Format a decimal as a percentage string (e.g. 0.357 → "35.7%"). */
function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Generate a structured investment memo from deal analysis inputs.
 *
 * @param inputs - Full deal analysis summary. See {@link MemoInputs}.
 * @returns {@link InvestmentMemo} with five structured text fields.
 */
export function generateMemo(inputs: MemoInputs): InvestmentMemo {
  const {
    investmentName,
    ticker,
    thesis,
    moatScore,
    moatDescription,
    managementScore,
    keyRisks,
    intrinsicValuePerShare,
    currentPrice,
    marginOfSafety,
    expectedValue,
    kellyPositionSize,
    exitCriteria,
  } = inputs;

  const label = ticker ? `${investmentName} (${ticker})` : investmentName;

  // --- Thesis ---
  const thesisSection = `${label}: ${thesis}`;

  // --- Moat ---
  const moatSection = [
    `Moat score: ${moatScore}/5. Management score: ${managementScore}/5.`,
    moatDescription,
  ].join(' ');

  // --- Risks ---
  const riskLines = keyRisks.map((r, i) => `${i + 1}. ${r}`).join('\n');
  const risksSection = `Key risks:\n${riskLines}`;

  // --- Valuation ---
  const mosSign = marginOfSafety >= 0 ? 'below' : 'above';
  const mosLabel = marginOfSafety >= 0
    ? `${fmtPct(marginOfSafety)} margin of safety`
    : `overvalued — current price is ${fmtPct(Math.abs(marginOfSafety))} above intrinsic value`;

  const valuationSection = [
    `Intrinsic value: ${intrinsicValuePerShare.toFixed(2)} per share.`,
    `Current price: ${currentPrice.toFixed(2)} (${mosSign} intrinsic value — ${mosLabel}).`,
    `Expected value (probability-weighted): ${expectedValue.toFixed(2)}.`,
    `Recommended position size (half-Kelly): ${fmtPct(kellyPositionSize)}.`,
  ].join(' ');

  // --- Exit Criteria ---
  const exitLines = exitCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const exitSection = `Exit triggers:\n${exitLines}`;

  return {
    thesis: thesisSection,
    moat: moatSection,
    risks: risksSection,
    valuation: valuationSection,
    exitCriteria: exitSection,
  };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): investment memo generator (pure structured output)`

---

## Task 6: Pre-Mortem Framework

**Files:**
- Create: `packages/core/src/deal-analyzer/premortem.ts`
- Create: `packages/core/src/__tests__/deal-analyzer/premortem.test.ts`

**What it does:** Structures the "how could this lose money?" analysis using Pabrai's 5 failure categories: (1) valuation errors, (2) leverage / balance sheet risks, (3) management / fraud, (4) moat erosion, (5) macro / external shocks. Each category accepts a list of analyst-supplied risk strings. Returns a `PreMortemResult` with per-category items and a `correctedProbability` that applies an additional 0.3 overconfidence shrinkage to the supplied win probability — modelling the documented ~30% overconfidence reduction that structured pre-mortems produce.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/deal-analyzer/premortem.test.ts
import { describe, it, expect } from 'vitest';
import {
  runPreMortem,
  type PreMortemInputs,
  type PreMortemResult,
} from '../../deal-analyzer/premortem.js';

const BASE_INPUTS: PreMortemInputs = {
  winProbability: 0.70,
  valuationErrors: ['IV assumes 10% growth but SA GDP may contract', 'Terminal multiple too optimistic'],
  leverageRisks: ['Net debt/EBITDA rises above 4x if EBITDA falls 20%'],
  managementRisks: ['CEO has not managed through a full credit cycle'],
  moatErosionRisks: ['TymeBank gaining 1M customers per quarter'],
  macroRisks: ['Rand depreciation compresses real returns for ZAR-based investor'],
};

describe('runPreMortem', () => {
  it('returns all five categories with their supplied risk items', () => {
    const result = runPreMortem(BASE_INPUTS);
    expect(result.valuationErrors).toEqual(BASE_INPUTS.valuationErrors);
    expect(result.leverageRisks).toEqual(BASE_INPUTS.leverageRisks);
    expect(result.managementRisks).toEqual(BASE_INPUTS.managementRisks);
    expect(result.moatErosionRisks).toEqual(BASE_INPUTS.moatErosionRisks);
    expect(result.macroRisks).toEqual(BASE_INPUTS.macroRisks);
  });

  it('applies ~30% overconfidence correction to the win probability', () => {
    const result = runPreMortem(BASE_INPUTS);
    // correctOverconfidence(0.70, 0.30) = 0.70 - 0.30*(0.70-0.5) = 0.70 - 0.06 = 0.64
    expect(result.correctedProbability).toBeCloseTo(0.64, 4);
  });

  it('does not over-correct: corrected probability stays in (0, 1)', () => {
    const edge1 = runPreMortem({ ...BASE_INPUTS, winProbability: 0.99 });
    const edge2 = runPreMortem({ ...BASE_INPUTS, winProbability: 0.01 });
    expect(edge1.correctedProbability).toBeLessThan(1);
    expect(edge2.correctedProbability).toBeGreaterThan(0);
  });

  it('returns the total risk item count across all five categories', () => {
    const result = runPreMortem(BASE_INPUTS);
    const expected =
      BASE_INPUTS.valuationErrors.length +
      BASE_INPUTS.leverageRisks.length +
      BASE_INPUTS.managementRisks.length +
      BASE_INPUTS.moatErosionRisks.length +
      BASE_INPUTS.macroRisks.length;
    expect(result.totalRiskItems).toBe(expected);
  });

  it('works when some categories have no items', () => {
    const result = runPreMortem({
      ...BASE_INPUTS,
      leverageRisks: [],
      managementRisks: [],
    });
    expect(result.leverageRisks).toEqual([]);
    expect(result.correctedProbability).toBeCloseTo(0.64, 4);
  });

  it('throws when winProbability is outside (0, 1)', () => {
    expect(() => runPreMortem({ ...BASE_INPUTS, winProbability: 0 })).toThrow();
    expect(() => runPreMortem({ ...BASE_INPUTS, winProbability: 1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement premortem.ts**

```typescript
// packages/core/src/deal-analyzer/premortem.ts

/**
 * Pre-mortem framework structured around Pabrai's 5 failure categories.
 *
 * Sources:
 * - Klein, "The Power of Intuition" (2004) — pre-mortem method
 * - Pabrai, "The Dhandho Investor" — 5-category checklist
 * - Tetlock & Gardner, "Superforecasting" (2015) — ~30% confidence reduction
 * - Spec: Section 3 (Component 2), Appendix A.4 (Pre-Mortem Analysis)
 *
 * Pabrai's 5 failure categories:
 * 1. Valuation errors — paid too much or mis-estimated intrinsic value
 * 2. Leverage / balance sheet risks — debt kills the equity before recovery
 * 3. Management / fraud — management destroys value or misrepresents financials
 * 4. Moat erosion — competitive advantage disappears faster than expected
 * 5. Macro / external shocks — events outside the company's control
 */

import { correctOverconfidence } from './probability.js';

/** Inputs for the pre-mortem. */
export interface PreMortemInputs {
  /** Win probability BEFORE pre-mortem correction. Must be in (0, 1). */
  winProbability: number;
  /** Category 1: ways the valuation could be wrong. */
  valuationErrors: string[];
  /** Category 2: balance sheet or leverage scenarios that could impair equity. */
  leverageRisks: string[];
  /** Category 3: management failure or accounting fraud scenarios. */
  managementRisks: string[];
  /** Category 4: scenarios where the competitive moat erodes. */
  moatErosionRisks: string[];
  /** Category 5: macro, geopolitical, or sector-level shocks. */
  macroRisks: string[];
}

/** The pre-mortem output with all risk items and the corrected probability. */
export interface PreMortemResult {
  valuationErrors: string[];
  leverageRisks: string[];
  managementRisks: string[];
  moatErosionRisks: string[];
  macroRisks: string[];
  /** Total number of risk items across all five categories. */
  totalRiskItems: number;
  /**
   * Win probability after applying a 0.3 overconfidence shrinkage, modelling
   * the ~30% confidence reduction that structured pre-mortems produce
   * (Klein, 2004; referenced in Spec Appendix A.4).
   */
  correctedProbability: number;
}

/** Shrinkage factor applied during pre-mortem, based on Klein (2004) research. */
const PRE_MORTEM_SHRINKAGE = 0.3;

/**
 * Run a structured pre-mortem analysis.
 *
 * Takes a win probability and five categories of analyst-supplied risk items.
 * Returns all items as-is plus a probability corrected for overconfidence via
 * a 30% shrinkage toward 0.5.
 *
 * @param inputs - See {@link PreMortemInputs}.
 * @returns {@link PreMortemResult} with categorised risks and corrected probability.
 * @throws {Error} When winProbability is outside (0, 1).
 */
export function runPreMortem(inputs: PreMortemInputs): PreMortemResult {
  const {
    winProbability,
    valuationErrors,
    leverageRisks,
    managementRisks,
    moatErosionRisks,
    macroRisks,
  } = inputs;

  if (winProbability <= 0 || winProbability >= 1) {
    throw new Error(`runPreMortem: winProbability must be in (0, 1), got ${winProbability}`);
  }

  const correctedProbability = correctOverconfidence(winProbability, PRE_MORTEM_SHRINKAGE);
  const totalRiskItems =
    valuationErrors.length +
    leverageRisks.length +
    managementRisks.length +
    moatErosionRisks.length +
    macroRisks.length;

  return {
    valuationErrors,
    leverageRisks,
    managementRisks,
    moatErosionRisks,
    macroRisks,
    totalRiskItems,
    correctedProbability,
  };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): pre-mortem framework with Pabrai 5 categories and overconfidence correction`

---

## Task 7: Scenario Store and Journal Store

**Files:**
- Create: `packages/core/src/deal-analyzer/scenario-store.ts`
- Create: `packages/core/src/deal-analyzer/journal-store.ts`
- Create: `packages/core/src/__tests__/deal-analyzer/scenario-store.test.ts`
- Create: `packages/core/src/__tests__/deal-analyzer/journal-store.test.ts`

**What it does:** Two store modules that persist and retrieve data from the `scenarios` and `decision_journal` tables respectively. Both follow the `DatabaseConnection` pattern used in `rules-engine/audit.ts` and `rules-engine/snapshots.ts`. Functions: `upsertScenario`, `listScenarios`, `deleteScenario` for scenarios; `createJournalEntry`, `listJournalEntries`, `updateJournalOutcome` (populates `actual_outcome` and `brier_score`) for the journal.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/deal-analyzer/scenario-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../../data/db.js';
import {
  upsertScenario,
  listScenarios,
  deleteScenario,
} from '../../deal-analyzer/scenario-store.js';
import type { DatabaseConnection } from '../../data/db.js';

let db: DatabaseConnection;

beforeEach(() => {
  db = openDatabase(':memory:');
  db.run(`INSERT INTO investments (id, type, name, data_source, status, created_at, updated_at, user_id)
          VALUES ('inv-1', 'listed_stock', 'Test Co', 'manual', 'screening', datetime('now'), datetime('now'), 'solo-investor')`);
});

describe('upsertScenario', () => {
  it('inserts a new scenario and returns its id', () => {
    const id = upsertScenario(db, {
      investmentId: 'inv-1',
      case: 'base',
      revenueGrowth: 0.08,
      margin: 0.12,
      multiple: 10,
      probabilityWeight: 0.5,
      targetPrice: 150,
      expectedValue: 140,
    });
    expect(id).toBeTruthy();
  });

  it('updates an existing scenario when given an id', () => {
    const id = upsertScenario(db, {
      investmentId: 'inv-1',
      case: 'base',
      revenueGrowth: 0.08,
      margin: 0.12,
      multiple: 10,
      probabilityWeight: 0.5,
      targetPrice: 150,
      expectedValue: 140,
    });
    upsertScenario(db, {
      id,
      investmentId: 'inv-1',
      case: 'base',
      revenueGrowth: 0.10,
      margin: 0.15,
      multiple: 12,
      probabilityWeight: 0.5,
      targetPrice: 200,
      expectedValue: 180,
    });
    const scenarios = listScenarios(db, 'inv-1');
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].revenueGrowth).toBeCloseTo(0.10, 4);
  });
});

describe('listScenarios', () => {
  it('returns all scenarios for an investment', () => {
    upsertScenario(db, { investmentId: 'inv-1', case: 'bear', revenueGrowth: 0, margin: 0.05, multiple: 6, probabilityWeight: 0.25, targetPrice: 60, expectedValue: 110 });
    upsertScenario(db, { investmentId: 'inv-1', case: 'base', revenueGrowth: 0.08, margin: 0.12, multiple: 10, probabilityWeight: 0.50, targetPrice: 150, expectedValue: 110 });
    upsertScenario(db, { investmentId: 'inv-1', case: 'bull', revenueGrowth: 0.18, margin: 0.18, multiple: 14, probabilityWeight: 0.25, targetPrice: 280, expectedValue: 110 });
    expect(listScenarios(db, 'inv-1')).toHaveLength(3);
  });

  it('returns an empty array when no scenarios exist', () => {
    expect(listScenarios(db, 'inv-1')).toEqual([]);
  });
});

describe('deleteScenario', () => {
  it('removes the scenario from the database', () => {
    const id = upsertScenario(db, { investmentId: 'inv-1', case: 'bear', revenueGrowth: 0, margin: 0.05, multiple: 6, probabilityWeight: 0.25, targetPrice: 60, expectedValue: 110 });
    deleteScenario(db, id);
    expect(listScenarios(db, 'inv-1')).toHaveLength(0);
  });
});
```

```typescript
// packages/core/src/__tests__/deal-analyzer/journal-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../../data/db.js';
import {
  createJournalEntry,
  listJournalEntries,
  updateJournalOutcome,
} from '../../deal-analyzer/journal-store.js';
import type { DatabaseConnection } from '../../data/db.js';

let db: DatabaseConnection;

beforeEach(() => {
  db = openDatabase(':memory:');
  db.run(`INSERT INTO investments (id, type, name, data_source, status, created_at, updated_at, user_id)
          VALUES ('inv-1', 'listed_stock', 'Test Co', 'manual', 'screening', datetime('now'), datetime('now'), 'solo-investor')`);
});

describe('createJournalEntry', () => {
  it('inserts a pre_investment entry and returns its id', () => {
    const id = createJournalEntry(db, {
      investmentId: 'inv-1',
      entryType: 'pre_investment',
      thesis: 'Strong moat, wide margin of safety.',
      confidence: 75,
      keyAssumptions: { revenueGrowth: 0.08 },
      predictedProbability: 0.70,
    });
    expect(id).toBeTruthy();
  });
});

describe('listJournalEntries', () => {
  it('returns all entries for an investment', () => {
    createJournalEntry(db, { investmentId: 'inv-1', entryType: 'pre_investment', thesis: 'Entry 1', confidence: 70, keyAssumptions: {}, predictedProbability: 0.65 });
    createJournalEntry(db, { investmentId: 'inv-1', entryType: 'pre_mortem', thesis: 'Pre-mortem', confidence: null, keyAssumptions: {}, predictedProbability: null });
    expect(listJournalEntries(db, 'inv-1')).toHaveLength(2);
  });
});

describe('updateJournalOutcome', () => {
  it('sets actual_outcome and brier_score on a resolved entry', () => {
    const id = createJournalEntry(db, {
      investmentId: 'inv-1',
      entryType: 'pre_investment',
      thesis: 'Strong moat.',
      confidence: 75,
      keyAssumptions: {},
      predictedProbability: 0.70,
    });
    // Brier score = (0.70 - 1)^2 = 0.09
    updateJournalOutcome(db, id, 1);
    const entries = listJournalEntries(db, 'inv-1');
    expect(entries[0].actualOutcome).toBe(1);
    expect(entries[0].brierScore).toBeCloseTo(0.09, 4);
  });

  it('throws when the entry is not found', () => {
    expect(() => updateJournalOutcome(db, 'nonexistent-id', 1)).toThrow();
  });

  it('throws when the entry has no predictedProbability to score', () => {
    const id = createJournalEntry(db, {
      investmentId: 'inv-1',
      entryType: 'pre_mortem',
      thesis: 'Pre-mortem entry',
      confidence: null,
      keyAssumptions: {},
      predictedProbability: null,
    });
    expect(() => updateJournalOutcome(db, id, 1)).toThrow(/no predictedProbability/i);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement scenario-store.ts**

```typescript
// packages/core/src/deal-analyzer/scenario-store.ts

/**
 * CRUD operations for the `scenarios` table.
 *
 * Scenarios persist bear/base/bull case projections per investment so they can
 * be retrieved for display, journal logging, and decision snapshot capture.
 * The upsert pattern (insert or replace on id) prevents duplicate case rows.
 */

import type { DatabaseConnection } from '../data/db.js';
import type { Scenario, ScenarioCase } from '../models/scenario.js';

/** Input for creating or updating a scenario row. */
export interface UpsertScenarioInput {
  /** When provided, update the existing row. When omitted, insert a new row. */
  id?: string;
  investmentId: string;
  case: ScenarioCase;
  revenueGrowth: number;
  margin: number;
  multiple: number;
  probabilityWeight: number;
  targetPrice: number;
  expectedValue: number;
}

/** Raw DB row shape from the `scenarios` table. */
interface ScenarioRow {
  id: string;
  investment_id: string;
  scenario_case: string;
  revenue_growth: number | null;
  margin: number | null;
  multiple: number | null;
  probability_weight: number | null;
  target_price: number | null;
  expected_value: number | null;
}

function rowToScenario(row: ScenarioRow): Scenario {
  return {
    id: row.id,
    investmentId: row.investment_id,
    case: row.scenario_case as ScenarioCase,
    revenueGrowth: row.revenue_growth ?? 0,
    margin: row.margin ?? 0,
    multiple: row.multiple ?? 0,
    probabilityWeight: row.probability_weight ?? 0,
    targetPrice: row.target_price ?? 0,
    expectedValue: row.expected_value ?? 0,
  };
}

/**
 * Insert or update a scenario row.
 *
 * Uses INSERT OR REPLACE semantics on `id`. When no `id` is supplied, a new
 * UUID is generated and a fresh row is inserted.
 *
 * @param db - Active database connection.
 * @param input - Scenario data. See {@link UpsertScenarioInput}.
 * @returns The id of the inserted or updated row.
 */
export function upsertScenario(db: DatabaseConnection, input: UpsertScenarioInput): string {
  const id = input.id ?? crypto.randomUUID();

  db.run(
    `INSERT OR REPLACE INTO scenarios
       (id, investment_id, scenario_case, revenue_growth, margin, multiple,
        probability_weight, target_price, expected_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.investmentId,
    input.case,
    input.revenueGrowth,
    input.margin,
    input.multiple,
    input.probabilityWeight,
    input.targetPrice,
    input.expectedValue,
  );

  return id;
}

/**
 * Return all scenarios for a given investment.
 *
 * @param db - Active database connection.
 * @param investmentId - Investment to query.
 * @returns Array of {@link Scenario} objects.
 */
export function listScenarios(db: DatabaseConnection, investmentId: string): Scenario[] {
  const rows = db.all<ScenarioRow>(
    `SELECT * FROM scenarios WHERE investment_id = ?`,
    investmentId,
  );
  return rows.map(rowToScenario);
}

/**
 * Delete a single scenario row by id.
 *
 * @param db - Active database connection.
 * @param id - UUID of the scenario to delete.
 */
export function deleteScenario(db: DatabaseConnection, id: string): void {
  db.run(`DELETE FROM scenarios WHERE id = ?`, id);
}
```

- [ ] **Step 4: Implement journal-store.ts**

```typescript
// packages/core/src/deal-analyzer/journal-store.ts

/**
 * CRUD operations for the `decision_journal` table.
 *
 * Journal entries track the analyst's thesis, confidence, and predicted
 * probability at the time of each decision. Outcomes are recorded later and
 * Brier scores are calculated automatically on resolution.
 *
 * Brier score formula: BS = (predictedProbability - actualOutcome)^2
 * Perfect = 0.0; random = 0.25; worst = 1.0.
 * Source: Brier (1950); Tetlock, "Superforecasting" (2015).
 */

import type { DatabaseConnection } from '../data/db.js';
import type { JournalEntry, JournalEntryType } from '../models/journal.js';

/** Input for creating a new journal entry. */
export interface CreateJournalEntryInput {
  investmentId: string;
  entryType: JournalEntryType;
  thesis: string | null;
  confidence: number | null;
  keyAssumptions: Record<string, unknown>;
  predictedProbability: number | null;
  lessons?: string | null;
}

/** Raw DB row shape from the `decision_journal` table. */
interface JournalRow {
  id: string;
  investment_id: string;
  entry_type: string;
  thesis: string | null;
  confidence: number | null;
  key_assumptions_json: string;
  predicted_probability: number | null;
  actual_outcome: number | null;
  brier_score: number | null;
  lessons: string | null;
  created_at: string;
}

function rowToEntry(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    investmentId: row.investment_id,
    entryType: row.entry_type as JournalEntryType,
    thesis: row.thesis,
    confidence: row.confidence,
    keyAssumptions: JSON.parse(row.key_assumptions_json || '{}'),
    predictedProbability: row.predicted_probability,
    actualOutcome: row.actual_outcome,
    brierScore: row.brier_score,
    lessons: row.lessons,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Insert a new journal entry.
 *
 * @param db - Active database connection.
 * @param input - Entry data. See {@link CreateJournalEntryInput}.
 * @returns The UUID of the newly created entry.
 */
export function createJournalEntry(db: DatabaseConnection, input: CreateJournalEntryInput): string {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.run(
    `INSERT INTO decision_journal
       (id, investment_id, entry_type, thesis, confidence, key_assumptions_json,
        predicted_probability, actual_outcome, brier_score, lessons, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    id,
    input.investmentId,
    input.entryType,
    input.thesis,
    input.confidence,
    JSON.stringify(input.keyAssumptions),
    input.predictedProbability,
    input.lessons ?? null,
    createdAt,
  );

  return id;
}

/**
 * Return all journal entries for a given investment, oldest first.
 *
 * @param db - Active database connection.
 * @param investmentId - Investment to query.
 * @returns Array of {@link JournalEntry} objects.
 */
export function listJournalEntries(db: DatabaseConnection, investmentId: string): JournalEntry[] {
  const rows = db.all<JournalRow>(
    `SELECT * FROM decision_journal WHERE investment_id = ? ORDER BY created_at ASC`,
    investmentId,
  );
  return rows.map(rowToEntry);
}

/**
 * Record the outcome of a resolved journal entry and calculate its Brier score.
 *
 * The Brier score is (predictedProbability - actualOutcome)^2.
 * `actualOutcome` must be 0 (loss) or 1 (win/success).
 *
 * @param db - Active database connection.
 * @param entryId - UUID of the journal entry to resolve.
 * @param actualOutcome - 0 for loss, 1 for win.
 * @throws {Error} When the entry is not found or has no predicted probability.
 */
export function updateJournalOutcome(
  db: DatabaseConnection,
  entryId: string,
  actualOutcome: 0 | 1,
): void {
  const row = db.get<{ predicted_probability: number | null }>(
    `SELECT predicted_probability FROM decision_journal WHERE id = ?`,
    entryId,
  );

  if (!row) {
    throw new Error(`updateJournalOutcome: journal entry not found: ${entryId}`);
  }
  if (row.predicted_probability === null) {
    throw new Error(
      `updateJournalOutcome: entry ${entryId} has no predictedProbability — cannot calculate Brier score`,
    );
  }

  const brierScore = Math.pow(row.predicted_probability - actualOutcome, 2);

  db.run(
    `UPDATE decision_journal SET actual_outcome = ?, brier_score = ? WHERE id = ?`,
    actualOutcome,
    brierScore,
    entryId,
  );
}
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): scenario store and journal store with Brier score calculation`

---

## Task 8: Deal Analyzer Pipeline

**Files:**
- Create: `packages/core/src/deal-analyzer/pipeline.ts`
- Create: `packages/core/src/deal-analyzer/index.ts`
- Create: `packages/core/src/__tests__/deal-analyzer/pipeline.test.ts`
- Modify: `packages/core/src/contracts/index.ts` (extend `DealAnalysis`)

**What it does:** The pipeline is the public entry point for the entire Deal Analyzer component. `runDealAnalyzerPipeline` accepts all required inputs, calls the five pure calculation layers in sequence, persists scenarios and a journal entry to the DB, captures a decision snapshot via `captureDecisionSnapshot`, and returns a fully populated `DealAnalysis`. It also updates `investments.intrinsic_value` and `investments.intrinsic_value_calculated_at` in the DB.

The `DealAnalysis` contract is extended to carry the full structured memo and pre-mortem result alongside the existing fields.

**Failing test first.**

- [ ] **Step 1: Extend DealAnalysis in contracts/index.ts**

The existing `DealAnalysis` interface carries `premortemScenarios: string[]` and `memoThesis: string`. Replace these with the richer structured types from Tasks 5 and 6.

```typescript
// packages/core/src/contracts/index.ts — replace DealAnalysis interface

export interface DealAnalysis {
  investment: Investment;
  scores: Score[];
  scenarios: Scenario[];
  kellyPosition: number;
  expectedValue: number;
  marginOfSafety: number;
  intrinsicValue: number;
  /** Full structured investment memo. */
  memo: InvestmentMemo;
  /** Full pre-mortem result with five Pabrai categories and corrected probability. */
  preMortem: PreMortemResult;
  /** ID of the decision snapshot frozen at pipeline run time. */
  snapshotId: string;
}
```

Add the required imports at the top:
```typescript
import type { InvestmentMemo } from '../deal-analyzer/memo.js';
import type { PreMortemResult } from '../deal-analyzer/premortem.js';
```

- [ ] **Step 2: Write the failing pipeline test**

```typescript
// packages/core/src/__tests__/deal-analyzer/pipeline.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase } from '../../data/db.js';
import { runDealAnalyzerPipeline, type DealAnalyzerPipelineInput } from '../../deal-analyzer/pipeline.js';
import type { DatabaseConnection } from '../../data/db.js';

let db: DatabaseConnection;

const BASE_INPUT: DealAnalyzerPipelineInput = {
  investment: { id: 'inv-1', name: 'Capitec Bank', ticker: 'CPI' },
  screenerResult: {
    compositeScore: 72,
    valuation: { ownerEarnings: 120, evEbitda: 9.5, pe: 14, pb: 2.1, fcfYield: 0.07 },
    altmanZ: { z: 3.2, zone: 'safe', components: { A: 0.4, B: 0.3, C: 0.2, D: 1.5, E: 0.9 } },
    piotroskiF: { score: 7, signals: {} as never },
    beneishM: { mScore: -2.5, isProbableManipulator: false, indices: {} as never },
    rulesResult: null,
    blocked: false,
  },
  scenarios: {
    bear: { revenueGrowth: 0.0, margin: 0.08, multiple: 8, probabilityWeight: 0.25 },
    base: { revenueGrowth: 0.10, margin: 0.14, multiple: 11, probabilityWeight: 0.50 },
    bull: { revenueGrowth: 0.20, margin: 0.20, multiple: 15, probabilityWeight: 0.25 },
    baseRevenue: 1000,
    years: 3,
  },
  kelly: { winProbability: 0.65, lossFraction: 0.25, gainFraction: 0.60 },
  dcf: {
    ownerEarnings: 120,
    growthRate: 0.10,
    terminalGrowthRate: 0.03,
    wacc: 0.11,
    years: 5,
    sharesOutstanding: 500,
    currentPrice: 1800,
  },
  memo: {
    thesis: 'Capitec is the lowest-cost retail bank in SA with widening digital advantages.',
    moatScore: 4,
    moatDescription: 'Low-cost digital distribution and salary-routing switching costs.',
    managementScore: 5,
    keyRisks: ['Credit cycle deterioration', 'TymeBank competition'],
    exitCriteria: ['Price reaches 90% of IV', 'NPL ratio exceeds 12%'],
  },
  preMortem: {
    valuationErrors: ['Terminal growth rate may be optimistic in SA low-growth environment'],
    leverageRisks: [],
    managementRisks: [],
    moatErosionRisks: ['TymeBank gaining share rapidly'],
    macroRisks: ['Rand depreciation, SA sovereign downgrade'],
  },
  activeRules: [],
  dataStalenessHours: 24,
};

beforeEach(() => {
  db = openDatabase(':memory:');
  db.run(`INSERT INTO investments (id, type, name, data_source, status, created_at, updated_at, user_id)
          VALUES ('inv-1', 'listed_stock', 'Capitec Bank', 'manual', 'research', datetime('now'), datetime('now'), 'solo-investor')`);
});

describe('runDealAnalyzerPipeline', () => {
  it('returns a DealAnalysis with all required fields', () => {
    const result = runDealAnalyzerPipeline(db, BASE_INPUT);
    expect(result.investment.id).toBe('inv-1');
    expect(result.scenarios).toHaveLength(3);
    expect(result.kellyPosition).toBeGreaterThanOrEqual(0);
    expect(result.kellyPosition).toBeLessThanOrEqual(1);
    expect(result.expectedValue).toBeGreaterThan(0);
    expect(result.intrinsicValue).toBeGreaterThan(0);
    expect(result.marginOfSafety).toBeDefined();
    expect(result.memo.thesis).toContain('Capitec');
    expect(result.preMortem.correctedProbability).toBeGreaterThan(0);
    expect(result.snapshotId).toBeTruthy();
  });

  it('persists all three scenario rows to the database', () => {
    runDealAnalyzerPipeline(db, BASE_INPUT);
    const rows = db.all('SELECT * FROM scenarios WHERE investment_id = ?', 'inv-1');
    expect(rows).toHaveLength(3);
  });

  it('creates a pre_investment journal entry', () => {
    runDealAnalyzerPipeline(db, BASE_INPUT);
    const rows = db.all(
      `SELECT * FROM decision_journal WHERE investment_id = ? AND entry_type = 'pre_investment'`,
      'inv-1',
    );
    expect(rows).toHaveLength(1);
  });

  it('captures a decision snapshot', () => {
    const result = runDealAnalyzerPipeline(db, BASE_INPUT);
    const snapshot = db.get('SELECT * FROM decision_snapshots WHERE id = ?', result.snapshotId);
    expect(snapshot).toBeDefined();
  });

  it('applies the staleness penalty when data is older than 72 hours', () => {
    const freshResult = runDealAnalyzerPipeline(db, { ...BASE_INPUT, dataStalenessHours: 24 });
    db.run(`DELETE FROM scenarios WHERE investment_id = 'inv-1'`);
    db.run(`DELETE FROM decision_journal WHERE investment_id = 'inv-1'`);
    db.run(`DELETE FROM decision_snapshots WHERE investment_id = 'inv-1'`);
    const staleResult = runDealAnalyzerPipeline(db, { ...BASE_INPUT, dataStalenessHours: 100 });
    expect(staleResult.kellyPosition).toBeLessThan(freshResult.kellyPosition);
  });

  it('returns kellyPosition = 0 when the rules engine blocks the investment', () => {
    const blockedInput: DealAnalyzerPipelineInput = {
      ...BASE_INPUT,
      screenerResult: { ...BASE_INPUT.screenerResult, blocked: true },
    };
    const result = runDealAnalyzerPipeline(db, blockedInput);
    expect(result.kellyPosition).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 4: Implement pipeline.ts**

```typescript
// packages/core/src/deal-analyzer/pipeline.ts

/**
 * Deal Analyzer pipeline orchestrator.
 *
 * Wires together the five pure calculation layers (scenarios, Kelly, DCF, memo,
 * pre-mortem) with the two store modules (scenario-store, journal-store) and
 * the existing captureDecisionSnapshot utility to produce a fully populated
 * DealAnalysis result.
 *
 * All business logic remains in the pure layer functions. This module only
 * coordinates: it calls functions in the correct order and moves data between
 * them. No direct SQL is written here.
 *
 * Spec: Section 3, Component 2.
 */

import type { DatabaseConnection } from '../data/db.js';
import type { DealAnalysis } from '../contracts/index.js';
import type { Rule } from '../models/rule.js';
import type { Score } from '../models/score.js';

import { buildScenario, calculateExpectedValue } from './scenarios.js';
import { calculateKelly, applyHalfKelly, applyStalenessPenalty } from './kelly.js';
import { calculateDcf, type DcfInputs } from './dcf.js';
import { generateMemo, type MemoInputs } from './memo.js';
import { runPreMortem, type PreMortemInputs } from './premortem.js';
import { upsertScenario } from './scenario-store.js';
import { createJournalEntry } from './journal-store.js';
import { captureDecisionSnapshot } from '../rules-engine/snapshots.js';
import type { ScreenerPipelineResult } from '../screener/pipeline.js';
import type { ScenarioCase } from '../models/scenario.js';

/** Per-case scenario definition supplied to the pipeline. */
interface ScenarioCaseInput {
  revenueGrowth: number;
  margin: number;
  multiple: number;
  probabilityWeight: number;
}

/** Full input to the deal analyzer pipeline. */
export interface DealAnalyzerPipelineInput {
  investment: { id: string; name: string; ticker?: string };
  screenerResult: ScreenerPipelineResult;
  scenarios: {
    bear: ScenarioCaseInput;
    base: ScenarioCaseInput;
    bull: ScenarioCaseInput;
    /** Base revenue used for all three scenario projections. */
    baseRevenue: number;
    /** Projection horizon in years. */
    years: number;
  };
  kelly: { winProbability: number; lossFraction: number; gainFraction: number };
  dcf: DcfInputs;
  memo: Omit<MemoInputs, 'investmentName' | 'ticker' | 'intrinsicValuePerShare' | 'currentPrice' | 'marginOfSafety' | 'expectedValue' | 'kellyPositionSize'>;
  preMortem: Omit<PreMortemInputs, 'winProbability'>;
  /** Active rules to freeze in the decision snapshot. */
  activeRules: Rule[];
  /** Age of the underlying financial data in hours; triggers staleness penalty above 72. */
  dataStalenessHours: number;
}

/**
 * Run the full deal analyzer pipeline for a single investment.
 *
 * Steps:
 * 1. Build bear/base/bull scenario results and calculate expected value.
 * 2. Calculate Kelly fraction → apply half-Kelly → apply staleness penalty.
 *    Force to 0 if the rules engine has blocked the investment.
 * 3. Run DCF to get intrinsic value and margin of safety.
 * 4. Generate the investment memo.
 * 5. Run the pre-mortem (uses corrected probability from step 2 win probability).
 * 6. Persist scenario rows and a pre_investment journal entry.
 * 7. Capture a decision snapshot.
 * 8. Return DealAnalysis.
 *
 * @param db - Active database connection.
 * @param input - Full pipeline inputs. See {@link DealAnalyzerPipelineInput}.
 * @returns Fully populated {@link DealAnalysis}.
 */
export function runDealAnalyzerPipeline(
  db: DatabaseConnection,
  input: DealAnalyzerPipelineInput,
): DealAnalysis {
  const { investment, screenerResult, scenarios: sc, kelly: ki, dcf: dcfInputs,
          memo: memoPartial, preMortem: pmPartial, activeRules, dataStalenessHours } = input;

  // Step 1: Scenarios.
  const cases: Array<{ key: ScenarioCase; def: ScenarioCaseInput }> = [
    { key: 'bear', def: sc.bear },
    { key: 'base', def: sc.base },
    { key: 'bull', def: sc.bull },
  ];

  const scenarioResults = cases.map(({ key, def }) =>
    buildScenario({
      case: key,
      baseRevenue: sc.baseRevenue,
      revenueGrowth: def.revenueGrowth,
      margin: def.margin,
      multiple: def.multiple,
      years: sc.years,
      probabilityWeight: def.probabilityWeight,
    }),
  );

  const expectedValue = calculateExpectedValue(scenarioResults);

  // Step 2: Kelly.
  let kellyPosition = 0;
  if (!screenerResult.blocked) {
    const { clampedKelly } = calculateKelly(ki);
    const halfKelly = applyHalfKelly(clampedKelly);
    kellyPosition = applyStalenessPenalty(halfKelly, dataStalenessHours);
  }

  // Step 3: DCF.
  const dcfResult = calculateDcf(dcfInputs);

  // Step 4: Memo.
  const memo = generateMemo({
    investmentName: investment.name,
    ticker: investment.ticker,
    intrinsicValuePerShare: dcfResult.intrinsicValuePerShare,
    currentPrice: dcfInputs.currentPrice,
    marginOfSafety: dcfResult.marginOfSafety,
    expectedValue,
    kellyPositionSize: kellyPosition,
    ...memoPartial,
  });

  // Step 5: Pre-mortem (uses the raw win probability for its own shrinkage).
  const preMortem = runPreMortem({ winProbability: ki.winProbability, ...pmPartial });

  // Step 6: Persist.
  for (const sr of scenarioResults) {
    upsertScenario(db, {
      investmentId: investment.id,
      case: sr.case,
      revenueGrowth: cases.find((c) => c.key === sr.case)!.def.revenueGrowth,
      margin: cases.find((c) => c.key === sr.case)!.def.margin,
      multiple: cases.find((c) => c.key === sr.case)!.def.multiple,
      probabilityWeight: sr.probabilityWeight,
      targetPrice: sr.targetPrice,
      expectedValue,
    });
  }

  createJournalEntry(db, {
    investmentId: investment.id,
    entryType: 'pre_investment',
    thesis: memoPartial.thesis,
    confidence: Math.round(ki.winProbability * 100),
    keyAssumptions: {
      revenueGrowthBase: sc.base.revenueGrowth,
      wacc: dcfInputs.wacc,
      terminalGrowthRate: dcfInputs.terminalGrowthRate,
    },
    predictedProbability: ki.winProbability,
  });

  // Step 7: Snapshot.
  const snapshotId = captureDecisionSnapshot(
    db,
    investment.id,
    activeRules,
    [],
    kellyPosition,
    scenarioResults.map((sr) => ({
      scenarioCase: sr.case,
      probabilityWeight: sr.probabilityWeight,
      targetPrice: sr.targetPrice,
      expectedValue,
    })),
  );

  // Step 8: Build result — map to DealAnalysis contract.
  const scores: Score[] = [];

  return {
    investment: {
      id: investment.id,
      name: investment.name,
      ticker: investment.ticker ?? null,
      type: 'listed_stock',
      exchange: null,
      sector: null,
      industry: null,
      status: 'researching',
      peDealStage: null,
      dataSource: 'manual',
      intrinsicValue: dcfResult.intrinsicValuePerShare,
      intrinsicValueCalculatedAt: new Date(),
      moatScore: memoPartial.moatScore,
      managementScore: memoPartial.managementScore,
      circleOfCompetenceFit: null,
      userId: 'solo-investor',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    scores,
    scenarios: scenarioResults.map((sr, i) => ({
      id: `scenario-${i}`,
      investmentId: investment.id,
      case: sr.case,
      revenueGrowth: cases[i].def.revenueGrowth,
      margin: cases[i].def.margin,
      multiple: cases[i].def.multiple,
      probabilityWeight: sr.probabilityWeight,
      targetPrice: sr.targetPrice,
      expectedValue,
    })),
    kellyPosition,
    expectedValue,
    marginOfSafety: dcfResult.marginOfSafety,
    intrinsicValue: dcfResult.intrinsicValuePerShare,
    memo,
    preMortem,
    snapshotId,
  };
}
```

- [ ] **Step 5: Implement the barrel export**

```typescript
// packages/core/src/deal-analyzer/index.ts
export * from './scenarios.js';
export * from './kelly.js';
export * from './probability.js';
export * from './dcf.js';
export * from './memo.js';
export * from './premortem.js';
export * from './pipeline.js';
export * from './scenario-store.js';
export * from './journal-store.js';
```

- [ ] **Step 6: Run all tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): deal analyzer pipeline orchestrating all layers into DealAnalysis`

---

## Task 9: Export Integration and Full Test Run

**Files:**
- Modify: `packages/core/src/index.ts` (add deal-analyzer exports)

**What it does:** Integrates the new `deal-analyzer` module into the package's public surface. Runs the full test suite to confirm all 9 tasks pass with no regressions. Verifies TypeScript strict compilation across the entire package.

- [ ] **Step 1: Add deal-analyzer to the core barrel export**

```typescript
// packages/core/src/index.ts — add after existing exports
export * from './deal-analyzer/index.js';
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

- [ ] **Step 3: Type-check the entire package**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core exec tsc --noEmit
```

- [ ] **Step 4: Confirm test coverage is >= 80% for the new module**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --coverage 2>&1 | grep -E "deal-analyzer|All files"
```

**Commit:** `feat(core): export deal-analyzer from core package public surface`

---

## Summary

| Task | Module | Type | Key Exports |
|------|--------|------|-------------|
| 1 | `scenarios.ts` | Pure | `buildScenario`, `calculateExpectedValue`, `validateScenarioWeights` |
| 2 | `kelly.ts` | Pure | `calculateKelly`, `applyHalfKelly`, `applyStalenessPenalty`, `portfolioKelly` |
| 3 | `probability.ts` | Pure | `fermiDecompose`, `correctOverconfidence` |
| 4 | `dcf.ts` | Pure | `calculateWacc`, `calculateDcf` |
| 5 | `memo.ts` | Pure | `generateMemo` |
| 6 | `premortem.ts` | Pure | `runPreMortem` |
| 7 | `scenario-store.ts`, `journal-store.ts` | DB | `upsertScenario`, `listScenarios`, `deleteScenario`, `createJournalEntry`, `listJournalEntries`, `updateJournalOutcome` |
| 8 | `pipeline.ts` | Orchestrator | `runDealAnalyzerPipeline` |
| 9 | `index.ts` + `core/index.ts` | Export | Full public surface |

**Architecture invariants maintained:**
- All business logic is pure — no I/O, no side effects, deterministic output.
- DB operations are isolated in `*-store.ts` modules using the existing `DatabaseConnection` pattern.
- The pipeline is the only function that coordinates pure logic with DB writes.
- `DealAnalysis` contract is extended additively — no fields removed.
- Every module has a corresponding `__tests__` file with failing tests written before implementation (TDD).
- All `calculateX` functions throw descriptive errors for domain violations rather than returning `NaN` or `undefined`.
