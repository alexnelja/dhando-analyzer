# Phase 5: Portfolio Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Portfolio Tracker component — ongoing monitoring of held positions through the Dhandho lens. Produces a per-position `PortfolioPosition` result containing: cost-basis and return tracking, a traffic-light dashboard across 8 factors, margin-of-safety erosion alerts, Kelly rebalancing signals, and a portfolio-level summary. Extends this with a Brier score calibration engine (reads resolved `decision_journal` entries) and a structured post-mortem generator for exits. All business logic is pure where possible. DB operations live in a dedicated store module.

**Architecture:** All new code lives in `packages/core/src/portfolio/`. It consumes the existing `DatabaseConnection`, `calculateKelly` from `deal-analyzer/kelly.ts`, `JournalRow` / `updateJournalOutcome` from `deal-analyzer/journal-store.ts`, `getLatestScore` from `screener/score-store.ts`, and the existing `PortfolioPosition` contract from `contracts/index.ts`. New schema: one new table (`portfolio_positions`) via a Drizzle migration. No new runtime dependencies.

**Tech Stack:** TypeScript (strict), Vitest, better-sqlite3 (via existing `DatabaseConnection`)

**Spec references:**
- `docs/superpowers/specs/2026-03-30-dhando-analyzer-design.md` — Section 3 (Component 3), Section 7 (Calibration System), Appendix A.4 (Brier Score), Appendix A.8 (TRACK step)

---

## File Structure (additions)

```
packages/core/
└── src/
    ├── portfolio/
    │   ├── position.ts              ← Position metrics: return %, weight, drift from Kelly-optimal
    │   ├── traffic-light.ts         ← 8-factor traffic-light scorer (green/amber/red per factor)
    │   ├── mos-alert.ts             ← Margin-of-safety erosion alert engine
    │   ├── kelly-rebalance.ts       ← Kelly drift detector and rebalancing signal generator
    │   ├── brier.ts                 ← Brier score aggregation + calibration curve builder
    │   ├── post-mortem.ts           ← Structured post-mortem generator (pure)
    │   ├── summary.ts               ← Portfolio-level aggregate summary
    │   ├── position-store.ts        ← CRUD for portfolio_positions table
    │   └── index.ts                 ← Barrel export
    └── __tests__/
        └── portfolio/
            ├── position.test.ts
            ├── traffic-light.test.ts
            ├── mos-alert.test.ts
            ├── kelly-rebalance.test.ts
            ├── brier.test.ts
            ├── post-mortem.test.ts
            ├── summary.test.ts
            └── position-store.test.ts
```

### Schema addition (Drizzle migration)

```sql
-- New table: portfolio_positions
-- One row per held investment. Updated as prices change.
CREATE TABLE portfolio_positions (
  id          TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id),
  shares      REAL NOT NULL,
  cost_basis  REAL NOT NULL,          -- average cost per share (ZAR or local currency)
  current_price REAL NOT NULL,
  kelly_optimal REAL,                 -- half-Kelly fraction from the last DealAnalysis (0-1)
  entered_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

The `current_price` column is updated daily via the existing price-refresh flow. The `kelly_optimal` column is populated by the Deal Analyzer pipeline at entry and refreshed whenever a new analysis is run.

---

## Task 1: Position Metrics

**Files:**
- Create: `packages/core/src/portfolio/position.ts`
- Create: `packages/core/src/__tests__/portfolio/position.test.ts`

**What it does:** Pure functions that derive per-position metrics from raw position data. Computes return percentage, current portfolio weight (from position market value and total portfolio value), and drift from the Kelly-optimal allocation. Drift is signed — positive means overweight relative to Kelly.

**Key types:**

```typescript
export interface PositionInput {
  investmentId: string;
  shares: number;
  costBasis: number;         // average cost per share
  currentPrice: number;
  kellyOptimal: number;      // half-Kelly fraction, e.g. 0.12 for 12%
  totalPortfolioValue: number;
}

export interface PositionMetrics {
  investmentId: string;
  marketValue: number;       // shares * currentPrice
  returnPct: number;         // (currentPrice - costBasis) / costBasis
  currentWeight: number;     // marketValue / totalPortfolioValue
  kellyOptimal: number;
  kellyDrift: number;        // currentWeight - kellyOptimal (signed)
  kellyDriftPct: number;     // kellyDrift expressed as percentage points
}
```

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/portfolio/position.test.ts
import { describe, it, expect } from 'vitest';
import { computePositionMetrics, type PositionInput } from '../../portfolio/position.js';

describe('computePositionMetrics', () => {
  const base: PositionInput = {
    investmentId: 'inv-1',
    shares: 100,
    costBasis: 50,
    currentPrice: 60,
    kellyOptimal: 0.10,
    totalPortfolioValue: 10_000,
  };

  it('calculates market value as shares * currentPrice', () => {
    const result = computePositionMetrics(base);
    expect(result.marketValue).toBe(6_000);
  });

  it('calculates return % correctly', () => {
    // (60 - 50) / 50 = 0.20
    const result = computePositionMetrics(base);
    expect(result.returnPct).toBeCloseTo(0.20, 5);
  });

  it('calculates current weight as fraction of total portfolio', () => {
    // 6000 / 10000 = 0.60
    const result = computePositionMetrics(base);
    expect(result.currentWeight).toBeCloseTo(0.60, 5);
  });

  it('calculates Kelly drift as currentWeight - kellyOptimal', () => {
    // 0.60 - 0.10 = 0.50 (overweight by 50pp)
    const result = computePositionMetrics(base);
    expect(result.kellyDrift).toBeCloseTo(0.50, 5);
  });

  it('expresses kellyDriftPct in percentage points', () => {
    const result = computePositionMetrics(base);
    expect(result.kellyDriftPct).toBeCloseTo(50, 4);
  });

  it('returns negative drift when underweight', () => {
    const underweight: PositionInput = { ...base, totalPortfolioValue: 200_000 };
    // 6000 / 200000 = 0.03; drift = 0.03 - 0.10 = -0.07
    const result = computePositionMetrics(underweight);
    expect(result.kellyDrift).toBeLessThan(0);
  });

  it('throws when totalPortfolioValue is zero', () => {
    expect(() => computePositionMetrics({ ...base, totalPortfolioValue: 0 })).toThrow(
      'totalPortfolioValue must be greater than zero',
    );
  });

  it.each([
    [100, 80, -0.20],
    [100, 100, 0.00],
    [100, 150, 0.50],
  ])('returnPct for cost=%s price=%s → %s', (cost, price, expected) => {
    const result = computePositionMetrics({ ...base, costBasis: cost, currentPrice: price });
    expect(result.returnPct).toBeCloseTo(expected, 5);
  });
});
```

- [ ] **Step 2: Implement `position.ts`**

Implement `computePositionMetrics(input: PositionInput): PositionMetrics`. Guard: `totalPortfolioValue <= 0` throws. All arithmetic is straightforward; no external imports needed.

- [ ] **Step 3: Verify all tests pass**

Run `pnpm --filter @dhando/core test` and confirm zero failures.

---

## Task 2: Traffic-Light Dashboard

**Files:**
- Create: `packages/core/src/portfolio/traffic-light.ts`
- Create: `packages/core/src/__tests__/portfolio/traffic-light.test.ts`

**What it does:** Scores each held position across 8 factors and returns a `TrafficLight` status (`'green' | 'amber' | 'red'`) for each, plus an overall composite status (worst of all factors wins). The 8 factors and their thresholds:

| Factor | Green | Amber | Red | Source |
|---|---|---|---|---|
| `margin_of_safety` | MoS > 20% | 10-20% | < 10% | Graham / Pabrai ch. 7 |
| `moat` | score >= 4 | score = 3 | score <= 2 | Buffett |
| `management` | score >= 4 | score = 3 | score <= 2 | Munger |
| `altman_z` | zone = safe | zone = grey | zone = distress | Altman |
| `piotroski_f` | score >= 7 | score 4-6 | score <= 3 | Piotroski |
| `beneish_m` | score < -2.22 | -2.22 to -1.78 | score > -1.78 | Beneish |
| `kelly_drift` | abs drift <= 5pp | 5-15pp | > 15pp | Kelly / Thorp |
| `sentiment` | score >= 0.1 | -0.1 to 0.1 | score < -0.1 | FinBERT / GDELT |

Overall status: if any factor is `'red'` → overall red; else if any is `'amber'` → overall amber; else green.

**Key types:**

```typescript
export type TrafficLightStatus = 'green' | 'amber' | 'red';

export interface FactorScore {
  factor: string;
  value: number;
  status: TrafficLightStatus;
  label: string;   // human-readable description, e.g. "MoS 23% — above 20% threshold"
}

export interface TrafficLightInput {
  marginOfSafety: number;       // fraction, e.g. 0.23 for 23%
  moatScore: number;            // 1-5
  managementScore: number;      // 1-5
  altmanZZone: 'safe' | 'grey' | 'distress';
  piotroskiF: number;           // 0-9
  beneishM: number;             // negative = safer
  kellyDriftPct: number;        // percentage points, absolute value applied internally
  sentimentScore: number;       // -1.0 to 1.0
}

export interface TrafficLightResult {
  factors: FactorScore[];
  overallStatus: TrafficLightStatus;
}
```

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/portfolio/traffic-light.test.ts
import { describe, it, expect } from 'vitest';
import {
  scoreTrafficLight,
  type TrafficLightInput,
  type TrafficLightStatus,
} from '../../portfolio/traffic-light.js';

const ALL_GREEN: TrafficLightInput = {
  marginOfSafety: 0.25,
  moatScore: 4,
  managementScore: 4,
  altmanZZone: 'safe',
  piotroskiF: 8,
  beneishM: -2.50,
  kellyDriftPct: 3,
  sentimentScore: 0.20,
};

describe('scoreTrafficLight', () => {
  it('returns overall green when all factors are healthy', () => {
    expect(scoreTrafficLight(ALL_GREEN).overallStatus).toBe('green');
  });

  it('returns 8 factor scores', () => {
    expect(scoreTrafficLight(ALL_GREEN).factors).toHaveLength(8);
  });

  it('marks margin_of_safety red when MoS < 10%', () => {
    const result = scoreTrafficLight({ ...ALL_GREEN, marginOfSafety: 0.05 });
    const mos = result.factors.find((f) => f.factor === 'margin_of_safety')!;
    expect(mos.status).toBe('red');
  });

  it('marks margin_of_safety amber when MoS is 10-20%', () => {
    const result = scoreTrafficLight({ ...ALL_GREEN, marginOfSafety: 0.15 });
    const mos = result.factors.find((f) => f.factor === 'margin_of_safety')!;
    expect(mos.status).toBe('amber');
  });

  it('escalates overall status to red when any single factor is red', () => {
    const result = scoreTrafficLight({ ...ALL_GREEN, beneishM: -1.50 });
    expect(result.overallStatus).toBe('red');
  });

  it('escalates overall status to amber when worst factor is amber', () => {
    const result = scoreTrafficLight({ ...ALL_GREEN, moatScore: 3 });
    expect(result.overallStatus).toBe('amber');
  });

  it('marks kelly_drift red when abs drift > 15pp', () => {
    const result = scoreTrafficLight({ ...ALL_GREEN, kellyDriftPct: 20 });
    const kd = result.factors.find((f) => f.factor === 'kelly_drift')!;
    expect(kd.status).toBe('red');
  });

  it.each<[string, Partial<TrafficLightInput>, string, TrafficLightStatus]>([
    ['altman_z grey zone', { altmanZZone: 'grey' }, 'altman_z', 'amber'],
    ['altman_z distress zone', { altmanZZone: 'distress' }, 'altman_z', 'red'],
    ['piotroski_f <= 3', { piotroskiF: 2 }, 'piotroski_f', 'red'],
    ['piotroski_f 4-6', { piotroskiF: 5 }, 'piotroski_f', 'amber'],
    ['sentiment negative', { sentimentScore: -0.20 }, 'sentiment', 'red'],
    ['sentiment neutral', { sentimentScore: 0.0 }, 'sentiment', 'amber'],
    ['management score 2', { managementScore: 2 }, 'management', 'red'],
  ])('%s → factor %s = %s', (_name, overrides, factor, expected) => {
    const result = scoreTrafficLight({ ...ALL_GREEN, ...overrides });
    const f = result.factors.find((x) => x.factor === factor)!;
    expect(f.status).toBe(expected);
  });
});
```

- [ ] **Step 2: Implement `traffic-light.ts`**

Implement `scoreTrafficLight(input: TrafficLightInput): TrafficLightResult`. Each factor maps to a small helper that returns `{ factor, value, status, label }`. Overall status is derived by reducing over all factor statuses — red beats amber beats green. No external imports.

- [ ] **Step 3: Verify all tests pass**

---

## Task 3: Margin-of-Safety Erosion Alerts

**Files:**
- Create: `packages/core/src/portfolio/mos-alert.ts`
- Create: `packages/core/src/__tests__/portfolio/mos-alert.test.ts`

**What it does:** Given current price, intrinsic value, and the original entry-price margin of safety, detect how far the MoS has eroded since purchase. Produces an alert object with: current MoS, original MoS, erosion amount (pp), alert level (green/amber/red using the standard thresholds), and an `approachingValue` boolean flag that fires when MoS < 10%.

**Spec thresholds (Section 3, Component 3):**
- Green: current MoS > 20%
- Amber: current MoS 10-20%
- Red: current MoS < 10% (price approaching intrinsic value — consider trimming or re-analyzing)

**Key types:**

```typescript
export interface MoSAlertInput {
  currentPrice: number;
  intrinsicValue: number;
  originalMoS: number;      // MoS at time of purchase, e.g. 0.40 for 40%
}

export interface MoSAlertResult {
  currentMoS: number;        // (intrinsicValue - currentPrice) / intrinsicValue
  originalMoS: number;
  erosionPp: number;         // originalMoS - currentMoS, in percentage points
  alertLevel: 'green' | 'amber' | 'red';
  approachingValue: boolean; // true when currentMoS < 0.10
  priceToIV: number;         // currentPrice / intrinsicValue — how far through the gap we are
}
```

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/portfolio/mos-alert.test.ts
import { describe, it, expect } from 'vitest';
import { computeMoSAlert, type MoSAlertInput } from '../../portfolio/mos-alert.js';

describe('computeMoSAlert', () => {
  it('calculates current MoS as (IV - price) / IV', () => {
    // IV=100, price=70 → MoS = 30/100 = 0.30
    const result = computeMoSAlert({ currentPrice: 70, intrinsicValue: 100, originalMoS: 0.40 });
    expect(result.currentMoS).toBeCloseTo(0.30, 5);
  });

  it('calculates erosion in percentage points', () => {
    // originalMoS 40% → current 30% → erosion 10pp
    const result = computeMoSAlert({ currentPrice: 70, intrinsicValue: 100, originalMoS: 0.40 });
    expect(result.erosionPp).toBeCloseTo(10, 4);
  });

  it('returns green when current MoS > 20%', () => {
    const result = computeMoSAlert({ currentPrice: 70, intrinsicValue: 100, originalMoS: 0.40 });
    expect(result.alertLevel).toBe('green');
  });

  it('returns amber when current MoS is between 10% and 20%', () => {
    // price=85, IV=100 → MoS = 15%
    const result = computeMoSAlert({ currentPrice: 85, intrinsicValue: 100, originalMoS: 0.40 });
    expect(result.alertLevel).toBe('amber');
  });

  it('returns red and sets approachingValue when current MoS < 10%', () => {
    // price=95, IV=100 → MoS = 5%
    const result = computeMoSAlert({ currentPrice: 95, intrinsicValue: 100, originalMoS: 0.40 });
    expect(result.alertLevel).toBe('red');
    expect(result.approachingValue).toBe(true);
  });

  it('sets approachingValue false when MoS >= 10%', () => {
    const result = computeMoSAlert({ currentPrice: 80, intrinsicValue: 100, originalMoS: 0.40 });
    expect(result.approachingValue).toBe(false);
  });

  it('calculates priceToIV ratio', () => {
    // price=70, IV=100 → 0.70
    const result = computeMoSAlert({ currentPrice: 70, intrinsicValue: 100, originalMoS: 0.40 });
    expect(result.priceToIV).toBeCloseTo(0.70, 5);
  });

  it('handles negative MoS when price exceeds intrinsic value', () => {
    // price=110, IV=100 → MoS = -10%
    const result = computeMoSAlert({ currentPrice: 110, intrinsicValue: 100, originalMoS: 0.40 });
    expect(result.currentMoS).toBeCloseTo(-0.10, 5);
    expect(result.alertLevel).toBe('red');
    expect(result.approachingValue).toBe(true);
  });

  it('throws when intrinsicValue is zero', () => {
    expect(() =>
      computeMoSAlert({ currentPrice: 50, intrinsicValue: 0, originalMoS: 0.30 }),
    ).toThrow('intrinsicValue must be greater than zero');
  });
});
```

- [ ] **Step 2: Implement `mos-alert.ts`**

Implement `computeMoSAlert(input: MoSAlertInput): MoSAlertResult`. Guard: `intrinsicValue <= 0` throws. `currentMoS = (intrinsicValue - currentPrice) / intrinsicValue`. `approachingValue` is `currentMoS < 0.10`. Alert level uses the standard thresholds (> 0.20 = green, 0.10-0.20 = amber, < 0.10 = red). No external imports.

- [ ] **Step 3: Verify all tests pass**

---

## Task 4: Kelly Rebalancing Signals

**Files:**
- Create: `packages/core/src/portfolio/kelly-rebalance.ts`
- Create: `packages/core/src/__tests__/portfolio/kelly-rebalance.test.ts`

**What it does:** Given the current weight and Kelly-optimal weight of every position in the portfolio, generate rebalancing signals. A signal fires when `abs(currentWeight - kellyOptimal) > driftThresholdPct / 100` (default threshold = 5pp, per the spec). Each signal indicates direction (`'trim' | 'add' | 'none'`), magnitude of drift, and urgency (`'low' | 'medium' | 'high'` based on drift size).

Urgency scale:
- `low` — drift 5-10pp
- `medium` — drift 10-20pp
- `high` — drift > 20pp

**Key types:**

```typescript
export interface RebalanceInput {
  investmentId: string;
  currentWeight: number;     // fraction of portfolio (0-1)
  kellyOptimal: number;      // half-Kelly fraction (0-1)
}

export interface RebalanceSignal {
  investmentId: string;
  currentWeight: number;
  kellyOptimal: number;
  driftPct: number;          // abs(currentWeight - kellyOptimal) * 100
  direction: 'trim' | 'add' | 'none';
  urgency: 'low' | 'medium' | 'high' | 'none';
  actionRequired: boolean;   // true when driftPct > driftThresholdPct
}

export interface RebalanceResult {
  signals: RebalanceSignal[];
  anyActionRequired: boolean;
  highUrgencyCount: number;
}
```

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/portfolio/kelly-rebalance.test.ts
import { describe, it, expect } from 'vitest';
import {
  generateRebalanceSignals,
  type RebalanceInput,
} from '../../portfolio/kelly-rebalance.js';

const POSITIONS: RebalanceInput[] = [
  { investmentId: 'inv-a', currentWeight: 0.15, kellyOptimal: 0.10 },   // overweight 5pp — at threshold
  { investmentId: 'inv-b', currentWeight: 0.04, kellyOptimal: 0.12 },   // underweight 8pp
  { investmentId: 'inv-c', currentWeight: 0.10, kellyOptimal: 0.10 },   // exactly optimal
  { investmentId: 'inv-d', currentWeight: 0.35, kellyOptimal: 0.10 },   // severely overweight 25pp
];

describe('generateRebalanceSignals', () => {
  it('returns one signal per position', () => {
    expect(generateRebalanceSignals(POSITIONS).signals).toHaveLength(4);
  });

  it('sets actionRequired=true for drift above 5pp threshold', () => {
    const result = generateRebalanceSignals(POSITIONS);
    const invB = result.signals.find((s) => s.investmentId === 'inv-b')!;
    expect(invB.actionRequired).toBe(true);
  });

  it('sets actionRequired=false when drift is exactly 0', () => {
    const result = generateRebalanceSignals(POSITIONS);
    const invC = result.signals.find((s) => s.investmentId === 'inv-c')!;
    expect(invC.actionRequired).toBe(false);
    expect(invC.direction).toBe('none');
  });

  it('marks direction as trim when overweight', () => {
    const result = generateRebalanceSignals(POSITIONS);
    const invD = result.signals.find((s) => s.investmentId === 'inv-d')!;
    expect(invD.direction).toBe('trim');
  });

  it('marks direction as add when underweight', () => {
    const result = generateRebalanceSignals(POSITIONS);
    const invB = result.signals.find((s) => s.investmentId === 'inv-b')!;
    expect(invB.direction).toBe('add');
  });

  it('assigns high urgency when drift > 20pp', () => {
    const result = generateRebalanceSignals(POSITIONS);
    const invD = result.signals.find((s) => s.investmentId === 'inv-d')!;
    expect(invD.urgency).toBe('high');
  });

  it('assigns medium urgency for drift 10-20pp', () => {
    const positions: RebalanceInput[] = [
      { investmentId: 'inv-x', currentWeight: 0.25, kellyOptimal: 0.10 },
    ];
    const result = generateRebalanceSignals(positions);
    expect(result.signals[0].urgency).toBe('medium');
  });

  it('sets anyActionRequired=true when at least one position needs rebalancing', () => {
    expect(generateRebalanceSignals(POSITIONS).anyActionRequired).toBe(true);
  });

  it('counts high urgency positions', () => {
    expect(generateRebalanceSignals(POSITIONS).highUrgencyCount).toBe(1);
  });

  it('respects custom driftThresholdPct', () => {
    // With threshold=10pp, inv-a (5pp drift) should NOT require action
    const result = generateRebalanceSignals(POSITIONS, 10);
    const invA = result.signals.find((s) => s.investmentId === 'inv-a')!;
    expect(invA.actionRequired).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `kelly-rebalance.ts`**

Implement `generateRebalanceSignals(positions: RebalanceInput[], driftThresholdPct = 5): RebalanceResult`. Iterate positions, compute `driftPct = abs(currentWeight - kellyOptimal) * 100`, determine `direction` and `urgency`, set `actionRequired = driftPct > driftThresholdPct`. Aggregate `anyActionRequired` and `highUrgencyCount`. No external imports.

- [ ] **Step 3: Verify all tests pass**

---

## Task 5: Brier Score Calibration

**Files:**
- Create: `packages/core/src/portfolio/brier.ts`
- Create: `packages/core/src/__tests__/portfolio/brier.test.ts`

**What it does:** Reads resolved `JournalRow` entries (those with non-null `brierScore` and `actualOutcome`) and computes two things:

1. **Mean Brier score** — `(1/N) * sum((predicted - actual)^2)`. Lower is better; 0.25 = random guessing.
2. **Calibration curve** — groups predictions into probability buckets (0-10%, 10-20%, ..., 90-100%), computes average predicted probability and actual hit rate per bucket. A well-calibrated forecaster's 70% bucket should hit ~70% of the time.

This module is pure — it only processes data already passed in; it never reads from the DB itself. The caller is responsible for fetching the resolved journal entries.

**Key types:**

```typescript
export interface ResolvedPrediction {
  predictedProbability: number;   // 0-1
  actualOutcome: number;          // 0 or 1
  brierScore: number;             // pre-computed as (predicted - actual)^2
}

export interface CalibrationBucket {
  bucketLabel: string;            // e.g. "60-70%"
  lowerBound: number;             // e.g. 0.60
  upperBound: number;             // e.g. 0.70
  predictionCount: number;
  avgPredictedProbability: number;
  actualHitRate: number;          // fraction of predictions in this bucket that were correct
  calibrationError: number;       // abs(avgPredictedProbability - actualHitRate)
  wellCalibrated: boolean;        // calibrationError <= 0.10
}

export interface BrierCalibrationResult {
  meanBrierScore: number;
  sampleSize: number;
  randomBaselineScore: number;   // always 0.25
  skillScore: number;            // (randomBaselineScore - meanBrierScore) / randomBaselineScore
  isCalibrated: boolean;         // skillScore > 0 and meanBrierScore < 0.25
  calibrationCurve: CalibrationBucket[];
  overconfidenceBias: number | null;  // mean(predicted) - mean(actual); positive = overconfident
}
```

**Spec reference (Appendix A.4):**
- `BS = (1/N) * Sum of (predicted_probability - actual_outcome)^2`
- Perfect = 0.0, random = 0.25, worst = 1.0
- Skill score = `(0.25 - BS) / 0.25` — positive means better than random

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/portfolio/brier.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeBrierCalibration,
  type ResolvedPrediction,
} from '../../portfolio/brier.js';

const PERFECT_PREDICTIONS: ResolvedPrediction[] = [
  { predictedProbability: 1.0, actualOutcome: 1, brierScore: 0 },
  { predictedProbability: 0.0, actualOutcome: 0, brierScore: 0 },
];

const RANDOM_PREDICTIONS: ResolvedPrediction[] = [
  { predictedProbability: 0.5, actualOutcome: 1, brierScore: 0.25 },
  { predictedProbability: 0.5, actualOutcome: 0, brierScore: 0.25 },
  { predictedProbability: 0.5, actualOutcome: 1, brierScore: 0.25 },
  { predictedProbability: 0.5, actualOutcome: 0, brierScore: 0.25 },
];

const OVERCONFIDENT: ResolvedPrediction[] = [
  { predictedProbability: 0.90, actualOutcome: 1, brierScore: 0.01 },
  { predictedProbability: 0.90, actualOutcome: 0, brierScore: 0.81 },  // wrong with high confidence
  { predictedProbability: 0.90, actualOutcome: 0, brierScore: 0.81 },
  { predictedProbability: 0.90, actualOutcome: 1, brierScore: 0.01 },
];

describe('computeBrierCalibration', () => {
  it('returns mean Brier score of 0 for perfect predictions', () => {
    expect(computeBrierCalibration(PERFECT_PREDICTIONS).meanBrierScore).toBe(0);
  });

  it('returns mean Brier score of 0.25 for random predictions', () => {
    expect(computeBrierCalibration(RANDOM_PREDICTIONS).meanBrierScore).toBeCloseTo(0.25, 5);
  });

  it('sets sampleSize to number of predictions', () => {
    expect(computeBrierCalibration(RANDOM_PREDICTIONS).sampleSize).toBe(4);
  });

  it('sets randomBaselineScore to 0.25 always', () => {
    expect(computeBrierCalibration(RANDOM_PREDICTIONS).randomBaselineScore).toBe(0.25);
  });

  it('calculates skillScore as (0.25 - BS) / 0.25', () => {
    // For perfect: (0.25 - 0) / 0.25 = 1.0
    expect(computeBrierCalibration(PERFECT_PREDICTIONS).skillScore).toBeCloseTo(1.0, 5);
  });

  it('sets isCalibrated=true for perfect predictions', () => {
    expect(computeBrierCalibration(PERFECT_PREDICTIONS).isCalibrated).toBe(true);
  });

  it('sets isCalibrated=false for random predictions', () => {
    expect(computeBrierCalibration(RANDOM_PREDICTIONS).isCalibrated).toBe(false);
  });

  it('builds calibration curve with one bucket per 10pp band', () => {
    // Predictions at 0.5 should fall in the 40-50% bucket
    const result = computeBrierCalibration(RANDOM_PREDICTIONS);
    const bucket = result.calibrationCurve.find((b) => b.lowerBound === 0.40)!;
    expect(bucket).toBeDefined();
    expect(bucket.predictionCount).toBe(4);
  });

  it('calculates actual hit rate per bucket', () => {
    // 4 predictions at 0.5, 2 successes → hitRate = 0.5
    const result = computeBrierCalibration(RANDOM_PREDICTIONS);
    const bucket = result.calibrationCurve.find((b) => b.lowerBound === 0.40)!;
    expect(bucket.actualHitRate).toBeCloseTo(0.50, 5);
  });

  it('marks overconfidenceBias as positive when investor overestimates success', () => {
    // mean predicted = 0.90, mean actual = 0.50 → bias = +0.40
    const result = computeBrierCalibration(OVERCONFIDENT);
    expect(result.overconfidenceBias).not.toBeNull();
    expect(result.overconfidenceBias!).toBeGreaterThan(0);
  });

  it('returns null overconfidenceBias when sample is empty', () => {
    expect(computeBrierCalibration([]).overconfidenceBias).toBeNull();
  });

  it('throws when any brierScore is negative', () => {
    expect(() =>
      computeBrierCalibration([{ predictedProbability: 0.5, actualOutcome: 1, brierScore: -0.01 }]),
    ).toThrow('brierScore must be >= 0');
  });
});
```

- [ ] **Step 2: Implement `brier.ts`**

Implement `computeBrierCalibration(predictions: ResolvedPrediction[]): BrierCalibrationResult`.

- Guard: any `brierScore < 0` throws.
- Mean Brier: average of pre-computed `brierScore` values.
- Skill score: `(0.25 - meanBrierScore) / 0.25`.
- `isCalibrated`: `skillScore > 0`.
- Calibration curve: build 10 buckets [0,0.1), [0.1,0.2), ..., [0.9,1.0]. For each bucket, filter predictions where `lowerBound <= predictedProbability < upperBound` (last bucket includes 1.0). Compute `avgPredictedProbability` and `actualHitRate` for populated buckets; unpopulated buckets get `predictionCount: 0` and zeros elsewhere.
- `overconfidenceBias`: `null` if empty; otherwise `mean(predicted) - mean(actual)`.
- No external imports.

- [ ] **Step 3: Verify all tests pass**

---

## Task 6: Post-Mortem Generator

**Files:**
- Create: `packages/core/src/portfolio/post-mortem.ts`
- Create: `packages/core/src/__tests__/portfolio/post-mortem.test.ts`

**What it does:** A pure function that takes the original entry journal entry (thesis, confidence, key assumptions), the exit outcome, and the actual return, and produces a structured `PostMortemReport`. The report forces the investor through Tetlock's process-vs-outcome grid (good process/bad outcome = bad luck, not a bad decision; bad process/good outcome = good luck, not a good decision). It also derives a `processRating` and `outcomeRating`, each `'good' | 'poor'`, and calculates the Brier contribution of this specific prediction.

**Spec reference (Section 3, Component 3):** "structured review on every exit (process vs outcome analysis)"

**Key types:**

```typescript
export type ProcessOutcomeQuadrant =
  | 'good_process_good_outcome'    // deserved win
  | 'good_process_bad_outcome'     // bad luck — process was sound
  | 'bad_process_good_outcome'     // lucky win — do not reinforce this
  | 'bad_process_bad_outcome';     // deserved loss — learn from it

export interface PostMortemInput {
  investmentId: string;
  investmentName: string;
  originalThesis: string;
  entryConfidence: number;           // 0-100
  keyAssumptionsAtEntry: Record<string, unknown>;
  actualReturnPct: number;           // e.g. -0.35 for -35%
  actualOutcome: 0 | 1;             // 1 = positive return, 0 = loss
  predictedProbability: number;      // 0-1
  processRating: 'good' | 'poor';   // caller assesses whether the research process was sound
  whatActuallyHappened: string;
  assumptionsWrong: string[];        // which key assumptions turned out wrong
  lessonsLearned: string[];
}

export interface PostMortemReport {
  investmentId: string;
  investmentName: string;
  quadrant: ProcessOutcomeQuadrant;
  processRating: 'good' | 'poor';
  outcomeRating: 'good' | 'poor';
  brierContribution: number;         // (predictedProbability - actualOutcome)^2
  originalThesis: string;
  whatActuallyHappened: string;
  assumptionsWrong: string[];
  lessonsLearned: string[];
  keyAssumptionsAtEntry: Record<string, unknown>;
  summary: string;                   // one-sentence verdict for the post-mortem record
}
```

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/portfolio/post-mortem.test.ts
import { describe, it, expect } from 'vitest';
import {
  generatePostMortem,
  type PostMortemInput,
  type ProcessOutcomeQuadrant,
} from '../../portfolio/post-mortem.js';

const BASE_INPUT: PostMortemInput = {
  investmentId: 'inv-1',
  investmentName: 'Capitec Bank',
  originalThesis: 'SA banking disruptor with widening moat in digital.',
  entryConfidence: 75,
  keyAssumptionsAtEntry: { moatDurability: 4, marginExpansion: 0.02 },
  actualReturnPct: 0.45,
  actualOutcome: 1,
  predictedProbability: 0.75,
  processRating: 'good',
  whatActuallyHappened: 'Digital adoption accelerated; margin expansion exceeded estimate.',
  assumptionsWrong: [],
  lessonsLearned: ['Moat assessment was accurate.'],
};

describe('generatePostMortem', () => {
  it('assigns good_process_good_outcome when process good and outcome positive', () => {
    expect(generatePostMortem(BASE_INPUT).quadrant).toBe('good_process_good_outcome');
  });

  it('assigns good_process_bad_outcome for sound process but loss', () => {
    const input: PostMortemInput = {
      ...BASE_INPUT,
      actualOutcome: 0,
      actualReturnPct: -0.20,
      processRating: 'good',
    };
    expect(generatePostMortem(input).quadrant).toBe('good_process_bad_outcome');
  });

  it('assigns bad_process_good_outcome for poor process with win', () => {
    const input: PostMortemInput = { ...BASE_INPUT, processRating: 'poor' };
    expect(generatePostMortem(input).quadrant).toBe('bad_process_good_outcome');
  });

  it('assigns bad_process_bad_outcome for poor process with loss', () => {
    const input: PostMortemInput = {
      ...BASE_INPUT,
      processRating: 'poor',
      actualOutcome: 0,
      actualReturnPct: -0.30,
    };
    expect(generatePostMortem(input).quadrant).toBe('bad_process_bad_outcome');
  });

  it('calculates Brier contribution as (predicted - actual)^2', () => {
    // (0.75 - 1)^2 = 0.0625
    const result = generatePostMortem(BASE_INPUT);
    expect(result.brierContribution).toBeCloseTo(0.0625, 5);
  });

  it('sets outcomeRating good when actualOutcome = 1', () => {
    expect(generatePostMortem(BASE_INPUT).outcomeRating).toBe('good');
  });

  it('sets outcomeRating poor when actualOutcome = 0', () => {
    const result = generatePostMortem({ ...BASE_INPUT, actualOutcome: 0, actualReturnPct: -0.10 });
    expect(result.outcomeRating).toBe('poor');
  });

  it('includes original thesis, what happened, and lessons in the report', () => {
    const result = generatePostMortem(BASE_INPUT);
    expect(result.originalThesis).toBe(BASE_INPUT.originalThesis);
    expect(result.whatActuallyHappened).toBe(BASE_INPUT.whatActuallyHappened);
    expect(result.lessonsLearned).toEqual(BASE_INPUT.lessonsLearned);
  });

  it('produces a non-empty summary string', () => {
    expect(generatePostMortem(BASE_INPUT).summary.length).toBeGreaterThan(10);
  });

  it('throws when predictedProbability is outside [0, 1]', () => {
    expect(() =>
      generatePostMortem({ ...BASE_INPUT, predictedProbability: 1.5 }),
    ).toThrow('predictedProbability must be between 0 and 1');
  });
});
```

- [ ] **Step 2: Implement `post-mortem.ts`**

Implement `generatePostMortem(input: PostMortemInput): PostMortemReport`.

- Guard: `predictedProbability` outside [0, 1] throws.
- Quadrant: matrix of `processRating` × `actualOutcome`.
- `outcomeRating`: `'good'` when `actualOutcome === 1`, else `'poor'`.
- `brierContribution`: `(predictedProbability - actualOutcome) ** 2`.
- `summary`: a template string, e.g. `"${name}: ${quadrant.replace(/_/g, ' ')} — ${actualReturnPct >= 0 ? 'gain' : 'loss'} of ${Math.abs(actualReturnPct * 100).toFixed(1)}%."`.
- No external imports.

- [ ] **Step 3: Verify all tests pass**

---

## Task 7: Portfolio Summary

**Files:**
- Create: `packages/core/src/portfolio/summary.ts`
- Create: `packages/core/src/__tests__/portfolio/summary.test.ts`

**What it does:** Aggregates all position metrics into a portfolio-level view. Consumes an array of `PositionMetrics`, an array of `TrafficLightResult` (one per position), and a `BrierCalibrationResult`. Produces a `PortfolioSummary` with: total positions, total market value, weighted composite traffic-light status, count by color (green/amber/red), Kelly-weighted composite score, overall risk level, calibration score, and whether any rebalancing is overdue.

**Key types:**

```typescript
export interface PortfolioSummaryInput {
  positions: PositionMetrics[];
  trafficLights: TrafficLightResult[];        // same order as positions
  brierCalibration: BrierCalibrationResult;
  anyRebalancingRequired: boolean;
}

export interface PortfolioSummary {
  totalPositions: number;
  totalMarketValue: number;
  greenCount: number;
  amberCount: number;
  redCount: number;
  overallStatus: 'green' | 'amber' | 'red';
  weightedCompositeScore: number;     // 0-100; derived from traffic-light factor average weighted by position size
  riskLevel: 'low' | 'medium' | 'high';
  calibrationScore: number;           // meanBrierScore (lower is better, 0.25 = random)
  calibrationSkillScore: number;      // (0.25 - meanBrierScore) / 0.25
  rebalancingRequired: boolean;
}
```

Weighted composite score: map each position's `overallStatus` to a numeric value (green = 100, amber = 60, red = 20), weight by `currentWeight`, sum across positions.

Risk level:
- `'low'` — overallStatus = green and no red positions
- `'medium'` — any amber, or up to one red
- `'high'` — two or more red positions, or overallStatus = red

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/portfolio/summary.test.ts
import { describe, it, expect } from 'vitest';
import {
  computePortfolioSummary,
  type PortfolioSummaryInput,
} from '../../portfolio/summary.js';
import type { PositionMetrics } from '../../portfolio/position.js';
import type { TrafficLightResult } from '../../portfolio/traffic-light.js';
import type { BrierCalibrationResult } from '../../portfolio/brier.js';

const POS_A: PositionMetrics = {
  investmentId: 'a',
  marketValue: 6_000,
  returnPct: 0.20,
  currentWeight: 0.60,
  kellyOptimal: 0.10,
  kellyDrift: 0.50,
  kellyDriftPct: 50,
};

const POS_B: PositionMetrics = {
  investmentId: 'b',
  marketValue: 4_000,
  returnPct: -0.10,
  currentWeight: 0.40,
  kellyOptimal: 0.40,
  kellyDrift: 0.00,
  kellyDriftPct: 0,
};

const TL_GREEN: TrafficLightResult = {
  factors: [],
  overallStatus: 'green',
};

const TL_AMBER: TrafficLightResult = {
  factors: [],
  overallStatus: 'amber',
};

const BRIER: BrierCalibrationResult = {
  meanBrierScore: 0.15,
  sampleSize: 10,
  randomBaselineScore: 0.25,
  skillScore: 0.40,
  isCalibrated: true,
  calibrationCurve: [],
  overconfidenceBias: 0.05,
};

const BASE_INPUT: PortfolioSummaryInput = {
  positions: [POS_A, POS_B],
  trafficLights: [TL_GREEN, TL_GREEN],
  brierCalibration: BRIER,
  anyRebalancingRequired: false,
};

describe('computePortfolioSummary', () => {
  it('returns correct total positions count', () => {
    expect(computePortfolioSummary(BASE_INPUT).totalPositions).toBe(2);
  });

  it('sums total market value', () => {
    expect(computePortfolioSummary(BASE_INPUT).totalMarketValue).toBe(10_000);
  });

  it('returns overall green when all positions are green', () => {
    expect(computePortfolioSummary(BASE_INPUT).overallStatus).toBe('green');
  });

  it('returns overall amber when any position is amber', () => {
    const input: PortfolioSummaryInput = {
      ...BASE_INPUT,
      trafficLights: [TL_GREEN, TL_AMBER],
    };
    expect(computePortfolioSummary(input).overallStatus).toBe('amber');
  });

  it('counts green/amber/red positions correctly', () => {
    const result = computePortfolioSummary(BASE_INPUT);
    expect(result.greenCount).toBe(2);
    expect(result.amberCount).toBe(0);
    expect(result.redCount).toBe(0);
  });

  it('reflects calibration score from Brier result', () => {
    expect(computePortfolioSummary(BASE_INPUT).calibrationScore).toBeCloseTo(0.15, 5);
  });

  it('reflects skill score from Brier result', () => {
    expect(computePortfolioSummary(BASE_INPUT).calibrationSkillScore).toBeCloseTo(0.40, 5);
  });

  it('propagates rebalancingRequired flag', () => {
    const input: PortfolioSummaryInput = { ...BASE_INPUT, anyRebalancingRequired: true };
    expect(computePortfolioSummary(input).rebalancingRequired).toBe(true);
  });

  it('sets riskLevel to low when all green and no rebalancing', () => {
    expect(computePortfolioSummary(BASE_INPUT).riskLevel).toBe('low');
  });

  it('sets riskLevel to medium when any amber', () => {
    const input: PortfolioSummaryInput = {
      ...BASE_INPUT,
      trafficLights: [TL_GREEN, TL_AMBER],
    };
    expect(computePortfolioSummary(input).riskLevel).toBe('medium');
  });

  it('calculates weightedCompositeScore as weight-average of status numerics', () => {
    // A: weight=0.60, green=100 → 60; B: weight=0.40, green=100 → 40; total=100
    expect(computePortfolioSummary(BASE_INPUT).weightedCompositeScore).toBeCloseTo(100, 1);
  });
});
```

- [ ] **Step 2: Implement `summary.ts`**

Implement `computePortfolioSummary(input: PortfolioSummaryInput): PortfolioSummary`. Map `overallStatus` to numeric: green=100, amber=60, red=20. Weighted score = `sum(statusNumeric * currentWeight)`. Overall portfolio status = worst-of across all positions. Risk level from the spec above. No external imports beyond types from sibling modules.

- [ ] **Step 3: Verify all tests pass**

---

## Task 8: Position Store

**Files:**
- Create: `packages/core/src/portfolio/position-store.ts`
- Create: `packages/core/src/__tests__/portfolio/position-store.test.ts`
- Edit: `packages/core/src/data/schema.ts` — add `portfolioPositions` table definition
- Create: `packages/core/src/portfolio/index.ts`

**What it does:** CRUD layer for the `portfolio_positions` table. Provides:
- `upsertPortfolioPosition` — insert or replace a position row (keyed by `investmentId`; one row per investment)
- `getPortfolioPosition` — fetch by `investmentId`
- `listPortfolioPositions` — fetch all rows, ordered by `entered_at` descending
- `deletePortfolioPosition` — soft-deletes by marking `updated_at`; in v1 this is a hard delete since positions either exist or have been exited (exit is recorded via the journal, not a soft-delete flag)

Follow the same patterns as `screener/score-store.ts` and `deal-analyzer/journal-store.ts`: raw DB row interface, mapper function, named exports.

**Schema (add to `schema.ts`):**

```typescript
export const portfolioPositions = sqliteTable('portfolio_positions', {
  id: text('id').primaryKey(),
  investmentId: text('investment_id').notNull().references(() => investments.id),
  shares: real('shares').notNull(),
  costBasis: real('cost_basis').notNull(),
  currentPrice: real('current_price').notNull(),
  kellyOptimal: real('kelly_optimal'),
  enteredAt: text('entered_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

**Key types:**

```typescript
export interface PortfolioPositionInsert {
  investmentId: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  kellyOptimal?: number | null;
  enteredAt?: string;          // ISO-8601; defaults to now on insert
}

export interface PortfolioPositionRow {
  id: string;
  investmentId: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  kellyOptimal: number | null;
  enteredAt: string;
  updatedAt: string;
}
```

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/portfolio/position-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  upsertPortfolioPosition,
  getPortfolioPosition,
  listPortfolioPositions,
  deletePortfolioPosition,
  type PortfolioPositionInsert,
} from '../../portfolio/position-store.js';
import { openDb } from '../../data/db.js';
import { applyMigrations } from '../../data/migrations.js';

describe('position-store', () => {
  let db: ReturnType<typeof openDb>;

  beforeEach(() => {
    db = openDb(':memory:');
    applyMigrations(db);
    // Seed required investments row (FK constraint)
    db.run(
      `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
       VALUES ('inv-1', 'listed_stock', 'Test Co', 'held', 'manual', 'solo-investor', datetime('now'), datetime('now'))`,
    );
  });

  it('inserts a new position and retrieves it', () => {
    const insert: PortfolioPositionInsert = {
      investmentId: 'inv-1',
      shares: 200,
      costBasis: 45.00,
      currentPrice: 55.00,
      kellyOptimal: 0.08,
    };
    upsertPortfolioPosition(db, insert);
    const row = getPortfolioPosition(db, 'inv-1');
    expect(row).toBeDefined();
    expect(row!.shares).toBe(200);
    expect(row!.costBasis).toBe(45.00);
    expect(row!.currentPrice).toBe(55.00);
    expect(row!.kellyOptimal).toBe(0.08);
  });

  it('updates currentPrice on upsert without changing enteredAt', () => {
    const insert: PortfolioPositionInsert = {
      investmentId: 'inv-1',
      shares: 200,
      costBasis: 45.00,
      currentPrice: 55.00,
    };
    upsertPortfolioPosition(db, insert);
    const originalEnteredAt = getPortfolioPosition(db, 'inv-1')!.enteredAt;

    upsertPortfolioPosition(db, { ...insert, currentPrice: 60.00 });
    const updated = getPortfolioPosition(db, 'inv-1')!;
    expect(updated.currentPrice).toBe(60.00);
    expect(updated.enteredAt).toBe(originalEnteredAt);
  });

  it('returns undefined for an unknown investmentId', () => {
    expect(getPortfolioPosition(db, 'unknown')).toBeUndefined();
  });

  it('lists all positions ordered by enteredAt descending', () => {
    db.run(
      `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
       VALUES ('inv-2', 'listed_stock', 'Other Co', 'held', 'manual', 'solo-investor', datetime('now'), datetime('now'))`,
    );
    upsertPortfolioPosition(db, { investmentId: 'inv-1', shares: 100, costBasis: 50, currentPrice: 55 });
    upsertPortfolioPosition(db, { investmentId: 'inv-2', shares: 200, costBasis: 30, currentPrice: 35 });
    const list = listPortfolioPositions(db);
    expect(list).toHaveLength(2);
  });

  it('deletes a position and it no longer appears in listPortfolioPositions', () => {
    upsertPortfolioPosition(db, { investmentId: 'inv-1', shares: 100, costBasis: 50, currentPrice: 55 });
    deletePortfolioPosition(db, 'inv-1');
    expect(listPortfolioPositions(db)).toHaveLength(0);
  });

  it('stores null kellyOptimal when not provided', () => {
    upsertPortfolioPosition(db, {
      investmentId: 'inv-1',
      shares: 100,
      costBasis: 50,
      currentPrice: 55,
    });
    const row = getPortfolioPosition(db, 'inv-1')!;
    expect(row.kellyOptimal).toBeNull();
  });
});
```

- [ ] **Step 2: Add `portfolioPositions` table to `packages/core/src/data/schema.ts`**

Append the `portfolioPositions` Drizzle table definition following the same style as existing tables (see schema.ts). Add a Drizzle migration file if the project uses file-based migrations; otherwise rely on the existing `applyMigrations` call.

- [ ] **Step 3: Implement `position-store.ts`**

Implement the four CRUD functions. `upsertPortfolioPosition` uses `INSERT OR REPLACE` keyed on `investment_id` (unique constraint needed — add `UNIQUE(investment_id)` to the schema). `enteredAt` is set on first insert and preserved on update by using `INSERT OR REPLACE` with a subquery to carry forward the original `entered_at`.

Pattern for upsert preserving `entered_at`:
```sql
INSERT INTO portfolio_positions (id, investment_id, shares, cost_basis, current_price, kelly_optimal, entered_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT entered_at FROM portfolio_positions WHERE investment_id = ?), ?), ?)
ON CONFLICT(investment_id) DO UPDATE SET
  shares = excluded.shares,
  cost_basis = excluded.cost_basis,
  current_price = excluded.current_price,
  kelly_optimal = excluded.kelly_optimal,
  updated_at = excluded.updated_at
```

- [ ] **Step 4: Create `packages/core/src/portfolio/index.ts`**

Barrel-export all public types and functions from `position.ts`, `traffic-light.ts`, `mos-alert.ts`, `kelly-rebalance.ts`, `brier.ts`, `post-mortem.ts`, `summary.ts`, and `position-store.ts`. Follow the pattern of `deal-analyzer/index.ts`.

- [ ] **Step 5: Verify all tests pass**

Run the full test suite — `pnpm --filter @dhando/core test` — and confirm zero failures across all 8 test files.

---

## Implementation Notes

### Pure-vs-store separation

Every calculation module (Tasks 1-7) is pure: inputs in, output out, no side effects. Tests can run without a database. The store (Task 8) is the only module that touches `DatabaseConnection`. This mirrors the architecture of `deal-analyzer/` (e.g., `kelly.ts` vs `journal-store.ts`).

### Connecting to `PortfolioPosition` in `contracts/index.ts`

The existing `PortfolioPosition` contract in `packages/core/src/contracts/index.ts` is the surface this component fulfils. Phase 5 implements the underlying engine; a future desktop/CLI integration layer assembles the final `PortfolioPosition` objects by:

1. Fetching `PortfolioPositionRow[]` from the store.
2. Computing `PositionMetrics` via `computePositionMetrics`.
3. Fetching latest scores from `score-store.ts` and running `scoreTrafficLight`.
4. Running `computeMoSAlert` using the investment's `intrinsicValue`.
5. Running `generateRebalanceSignals` across all positions.
6. Fetching resolved journal entries and running `computeBrierCalibration`.
7. Assembling into a `PortfolioPosition` matching the contract.

This wiring is deliberately out of scope for Phase 5 to keep the delta small and testable. It will be done in Phase 6 (desktop integration).

### Brier score data dependency

`computeBrierCalibration` requires resolved journal entries — those with non-null `brier_score` and `actual_outcome`. These are populated by `updateJournalOutcome` from `deal-analyzer/journal-store.ts`, which is already implemented. No new journal logic is needed. The Phase 5 brier module simply processes what the journal has accumulated.

### Schema migration

The `portfolioPositions` table is a pure addition. It requires a Drizzle migration (additive column change, no destructive changes per Section 9 of the spec). If the project uses `applyMigrations` from `data/migrations.ts`, add the `CREATE TABLE IF NOT EXISTS portfolio_positions ...` statement there. The existing `investments` FK must already exist, which it does.

### Kelly drift threshold

The 5pp drift threshold for rebalancing signals (Task 4) matches the spec requirement ("flag when drift > 5%"). The `generateRebalanceSignals` function accepts it as an optional parameter so CLI and desktop callers can override it if needed without changing the core logic.

### Calibration curve empty bucket behaviour

Empty calibration buckets are included in the `calibrationCurve` array with `predictionCount: 0`. This is important for the UI, which must render a complete 10-bucket chart regardless of data density. Buckets with zero predictions have `wellCalibrated: false` and `calibrationError: 0` by convention.
