# Phase 3: Screener — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Screener component — the first stage of the Dhandho decision pipeline. Takes a universe of investments, calculates Altman Z, Piotroski F, and Beneish M scores, derives valuation metrics, applies the rules engine, checks super investor convergence, and returns a ranked `ScreenerOutput`. All scoring logic is pure (data in → score out) for isolated testability.

**Architecture:** All scoring functions live in `packages/core/src/scoring/`. The pipeline orchestrator in `packages/core/src/screener/` wires data fetching → scoring → rules engine → ranking. Watchlist CRUD uses the same `DatabaseConnection` pattern established in Phase 1. No new dependencies required — everything builds on the existing `Financial` model, `DatabaseConnection`, `runEngine`, and `createDataromaClient`.

**Tech Stack:** TypeScript (strict), Vitest, better-sqlite3 (via existing `DatabaseConnection`), existing API clients

**Spec:** `docs/superpowers/specs/2026-03-30-dhando-analyzer-design.md` — Sections 3 (Component 1), A.1, A.2, A.8

---

## File Structure (additions)

```
packages/core/
└── src/
    ├── scoring/
    │   ├── altman-z.ts                   ← Pure Z-Score calculator
    │   ├── piotroski-f.ts                ← Pure F-Score calculator (9 signals)
    │   ├── beneish-m.ts                  ← Pure M-Score calculator (8 indices)
    │   ├── composite.ts                  ← Normalize + combine Z/F/M to 0-100
    │   ├── valuation.ts                  ← EV/EBITDA, P/E, P/B, FCF Yield, Owner Earnings
    │   └── index.ts                      ← Barrel export
    ├── screener/
    │   ├── pipeline.ts                   ← Orchestrates fetch → score → rules → rank
    │   ├── watchlist.ts                  ← Watchlist CRUD (add/remove/update status)
    │   ├── super-investor-store.ts       ← Persist convergence results to DB
    │   └── index.ts                      ← Barrel export
    └── __tests__/
        ├── scoring/
        │   ├── altman-z.test.ts
        │   ├── piotroski-f.test.ts
        │   ├── beneish-m.test.ts
        │   ├── composite.test.ts
        │   └── valuation.test.ts
        └── screener/
            ├── pipeline.test.ts
            ├── watchlist.test.ts
            └── super-investor-store.test.ts
```

---

## Task 1: Altman Z-Score Calculator

**Files:**
- Create: `packages/core/src/scoring/altman-z.ts`
- Create: `packages/core/src/__tests__/scoring/altman-z.test.ts`

**Formula:** `Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E`
- A = Working Capital / Total Assets
- B = Retained Earnings / Total Assets
- C = EBIT / Total Assets
- D = Market Cap / Total Liabilities
- E = Revenue / Total Assets

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/scoring/altman-z.test.ts
import { describe, it, expect } from 'vitest';
import { calculateAltmanZ, interpretAltmanZ, type AltmanZInputs, type AltmanZResult } from '../../scoring/altman-z.js';

// Reference values derived from the Altman (1968) formula with known inputs.
// These fixtures serve as regression anchors — if the formula changes, tests break.
const SAFE_INPUTS: AltmanZInputs = {
  workingCapital: 500,
  totalAssets: 1000,
  retainedEarnings: 300,
  ebit: 200,
  marketCapEquity: 800,
  totalLiabilities: 400,
  revenue: 1200,
};

// Z = 1.2*(500/1000) + 1.4*(300/1000) + 3.3*(200/1000) + 0.6*(800/400) + 1.0*(1200/1000)
//   = 1.2*0.5 + 1.4*0.3 + 3.3*0.2 + 0.6*2.0 + 1.0*1.2
//   = 0.6 + 0.42 + 0.66 + 1.2 + 1.2 = 4.08
const SAFE_EXPECTED_Z = 4.08;

const DISTRESS_INPUTS: AltmanZInputs = {
  workingCapital: -100,
  totalAssets: 1000,
  retainedEarnings: -50,
  ebit: 20,
  marketCapEquity: 200,
  totalLiabilities: 900,
  revenue: 600,
};

// Z = 1.2*(-100/1000) + 1.4*(-50/1000) + 3.3*(20/1000) + 0.6*(200/900) + 1.0*(600/1000)
//   = -0.12 + -0.07 + 0.066 + 0.1333 + 0.6 = 0.6093
const DISTRESS_EXPECTED_Z = 0.6093;

describe('calculateAltmanZ', () => {
  it('returns the correct Z-Score for a healthy company', () => {
    const result = calculateAltmanZ(SAFE_INPUTS);
    expect(result.z).toBeCloseTo(SAFE_EXPECTED_Z, 2);
  });

  it('returns the correct Z-Score for a distressed company', () => {
    const result = calculateAltmanZ(DISTRESS_INPUTS);
    expect(result.z).toBeCloseTo(DISTRESS_EXPECTED_Z, 3);
  });

  it('includes all five component ratios in the result', () => {
    const result = calculateAltmanZ(SAFE_INPUTS);
    expect(result.components.A).toBeCloseTo(0.5, 4);
    expect(result.components.B).toBeCloseTo(0.3, 4);
    expect(result.components.C).toBeCloseTo(0.2, 4);
    expect(result.components.D).toBeCloseTo(2.0, 4);
    expect(result.components.E).toBeCloseTo(1.2, 4);
  });

  it('throws when totalAssets is zero to prevent division by zero', () => {
    expect(() => calculateAltmanZ({ ...SAFE_INPUTS, totalAssets: 0 })).toThrow();
  });

  it('throws when totalLiabilities is zero to prevent division by zero', () => {
    expect(() => calculateAltmanZ({ ...SAFE_INPUTS, totalLiabilities: 0 })).toThrow();
  });
});

describe('interpretAltmanZ', () => {
  it.each([
    [4.08,  'safe'],
    [2.5,   'grey'],
    [1.81,  'grey'],   // boundary — grey zone starts at <= 2.99
    [0.61,  'distress'],
    [1.80,  'distress'], // just below 1.81
  ] as const)('Z=%s → %s zone', (z, expected) => {
    expect(interpretAltmanZ(z)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement altman-z.ts**

```typescript
// packages/core/src/scoring/altman-z.ts

/**
 * Inputs required for the Altman Z-Score calculation.
 * All monetary values must be in a consistent unit (e.g. thousands, millions).
 * Source: Altman (1968), "Financial Ratios, Discriminant Analysis and the
 * Prediction of Corporate Bankruptcy."
 */
export interface AltmanZInputs {
  /** Current assets minus current liabilities. */
  workingCapital: number;
  /** Balance sheet total assets. */
  totalAssets: number;
  /** Accumulated retained earnings on the balance sheet. */
  retainedEarnings: number;
  /** Earnings before interest and taxes (operating profit). */
  ebit: number;
  /** Market capitalisation of equity (shares outstanding × price). */
  marketCapEquity: number;
  /** Total liabilities (current + long-term). */
  totalLiabilities: number;
  /** Net revenue / turnover for the period. */
  revenue: number;
}

/** The five intermediate ratios that compose the Z-Score. */
export interface AltmanZComponents {
  /** Working Capital / Total Assets — liquidity proxy. */
  A: number;
  /** Retained Earnings / Total Assets — cumulative profitability. */
  B: number;
  /** EBIT / Total Assets — operating efficiency. */
  C: number;
  /** Market Cap of Equity / Total Liabilities — solvency proxy. */
  D: number;
  /** Revenue / Total Assets — asset turnover. */
  E: number;
}

/** Zone classification derived from the raw Z-Score. */
export type AltmanZZone = 'safe' | 'grey' | 'distress';

export interface AltmanZResult {
  /** The raw Altman Z-Score. */
  z: number;
  /** Breakdown of the five component ratios. */
  components: AltmanZComponents;
  /** Textual zone classification. */
  zone: AltmanZZone;
}

/**
 * Calculate the Altman Z-Score for a manufacturing / industrial company.
 *
 * Formula: Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
 *
 * @param inputs - Financial inputs. See {@link AltmanZInputs}.
 * @returns Full {@link AltmanZResult} including components and zone.
 * @throws {Error} If `totalAssets` or `totalLiabilities` is zero.
 */
export function calculateAltmanZ(inputs: AltmanZInputs): AltmanZResult {
  const { workingCapital, totalAssets, retainedEarnings, ebit,
          marketCapEquity, totalLiabilities, revenue } = inputs;

  if (totalAssets === 0) {
    throw new Error('Altman Z-Score: totalAssets must not be zero');
  }
  if (totalLiabilities === 0) {
    throw new Error('Altman Z-Score: totalLiabilities must not be zero');
  }

  const A = workingCapital    / totalAssets;
  const B = retainedEarnings  / totalAssets;
  const C = ebit              / totalAssets;
  const D = marketCapEquity   / totalLiabilities;
  const E = revenue           / totalAssets;

  const z = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;

  return { z, components: { A, B, C, D, E }, zone: interpretAltmanZ(z) };
}

/**
 * Map a raw Z-Score to its Altman zone classification.
 *
 * - Z > 2.99  → safe     (low bankruptcy risk)
 * - Z 1.81–2.99 → grey  (moderate risk)
 * - Z < 1.81  → distress (high bankruptcy risk)
 *
 * @param z - The raw Z-Score value.
 * @returns The zone label.
 */
export function interpretAltmanZ(z: number): AltmanZZone {
  if (z > 2.99) return 'safe';
  if (z >= 1.81) return 'grey';
  return 'distress';
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): Altman Z-Score calculator with zone interpretation`

---

## Task 2: Piotroski F-Score Calculator

**Files:**
- Create: `packages/core/src/scoring/piotroski-f.ts`
- Create: `packages/core/src/__tests__/scoring/piotroski-f.test.ts`

**Formula:** 9 binary signals, 1 point each. Requires current-year and prior-year financials. Signals are grouped: Profitability (4), Leverage & Liquidity (3), Operating Efficiency (2).

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/scoring/piotroski-f.test.ts
import { describe, it, expect } from 'vitest';
import { calculatePiotroskiF, type PiotroskiInputs, type PiotroskiFResult } from '../../scoring/piotroski-f.js';

// A financially strong company with all 9 signals firing.
const STRONG_CURRENT: PiotroskiInputs['current'] = {
  netIncome: 120,
  operatingCashFlow: 150,
  totalAssets: 1000,
  totalAssetsLastYear: 950,   // needed for ROA delta
  longTermDebt: 200,
  currentAssets: 400,
  currentLiabilities: 180,
  sharesOutstanding: 100,
  grossProfit: 500,
  revenue: 1000,
};

const STRONG_PRIOR: PiotroskiInputs['prior'] = {
  netIncome: 80,
  operatingCashFlow: 100,
  totalAssets: 950,
  longTermDebt: 250,         // higher than current → debt decreased ✓
  currentAssets: 350,
  currentLiabilities: 200,  // current ratio was 350/200=1.75, now 400/180=2.22 ✓
  sharesOutstanding: 100,   // same → no dilution ✓
  grossProfit: 420,
  revenue: 900,
};

// ROA current = 120/1000 = 0.12; prior = 80/950 = 0.084 → increasing ✓
// OCF > net income: 150 > 120 ✓
// LT debt ratio: 200/1000 = 0.20 vs 250/950 = 0.263 → decreased ✓
// Current ratio: 400/180 = 2.22 vs 350/200 = 1.75 → increased ✓
// Gross margin: 500/1000 = 0.50 vs 420/900 = 0.467 → increased ✓
// Asset turnover: 1000/1000 = 1.0 vs 900/950 = 0.947 → increased ✓

// A financially weak company scoring 0.
const WEAK_CURRENT: PiotroskiInputs['current'] = {
  netIncome: -50,
  operatingCashFlow: -30,
  totalAssets: 800,
  totalAssetsLastYear: 1000,
  longTermDebt: 600,
  currentAssets: 100,
  currentLiabilities: 300,
  sharesOutstanding: 120,    // more shares than prior → dilution occurred
  grossProfit: 100,
  revenue: 500,
};

const WEAK_PRIOR: PiotroskiInputs['prior'] = {
  netIncome: 50,
  operatingCashFlow: 60,
  totalAssets: 1000,
  longTermDebt: 400,         // lower than current → debt increased → signal fails
  currentAssets: 400,
  currentLiabilities: 200,  // ratio was 2.0, now 0.33 → decreased → signal fails
  sharesOutstanding: 100,
  grossProfit: 300,
  revenue: 600,
};

describe('calculatePiotroskiF — strong company', () => {
  it('scores 9/9 when all signals fire', () => {
    const result = calculatePiotroskiF({ current: STRONG_CURRENT, prior: STRONG_PRIOR });
    expect(result.score).toBe(9);
  });

  it('returns all 9 signals with value=1', () => {
    const result = calculatePiotroskiF({ current: STRONG_CURRENT, prior: STRONG_PRIOR });
    expect(result.signals).toHaveLength(9);
    result.signals.forEach((s) => expect(s.value).toBe(1));
  });
});

describe('calculatePiotroskiF — weak company', () => {
  it('scores 0/9 when no signals fire', () => {
    const result = calculatePiotroskiF({ current: WEAK_CURRENT, prior: WEAK_PRIOR });
    expect(result.score).toBe(0);
  });

  it('returns all 9 signals with value=0', () => {
    const result = calculatePiotroskiF({ current: WEAK_CURRENT, prior: WEAK_PRIOR });
    expect(result.signals).toHaveLength(9);
    result.signals.forEach((s) => expect(s.value).toBe(0));
  });
});

describe('calculatePiotroskiF — signal names', () => {
  it('signal names match the 9 Piotroski criteria', () => {
    const result = calculatePiotroskiF({ current: STRONG_CURRENT, prior: STRONG_PRIOR });
    const names = result.signals.map((s) => s.name);
    expect(names).toContain('positive_net_income');
    expect(names).toContain('positive_operating_cash_flow');
    expect(names).toContain('increasing_roa');
    expect(names).toContain('cash_flow_exceeds_net_income');
    expect(names).toContain('decreasing_leverage');
    expect(names).toContain('increasing_current_ratio');
    expect(names).toContain('no_new_shares');
    expect(names).toContain('increasing_gross_margin');
    expect(names).toContain('increasing_asset_turnover');
  });
});

describe('calculatePiotroskiF — interpretation', () => {
  it.each([
    [9, 'strong'],
    [8, 'strong'],
    [7, 'average'],
    [5, 'average'],
    [2, 'weak'],
    [0, 'weak'],
  ] as const)('score=%s → %s', (score, expected) => {
    // Build a minimal valid result by overriding score
    const result = calculatePiotroskiF({ current: STRONG_CURRENT, prior: STRONG_PRIOR });
    // Test the interpretation function directly
    const { interpretPiotroskiF } = require('../../scoring/piotroski-f.js');
    expect(interpretPiotroskiF(score)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement piotroski-f.ts**

```typescript
// packages/core/src/scoring/piotroski-f.ts

/** Financial data for a single reporting period used by the F-Score. */
export interface PiotroskiPeriodInputs {
  netIncome: number;
  operatingCashFlow: number;
  totalAssets: number;
  /** Total assets from the year before this period (for ROA delta denominator). */
  totalAssetsLastYear: number;
  longTermDebt: number;
  currentAssets: number;
  currentLiabilities: number;
  sharesOutstanding: number;
  grossProfit: number;
  revenue: number;
}

export interface PiotroskiInputs {
  current: PiotroskiPeriodInputs;
  prior: PiotroskiPeriodInputs;
}

/** One of the nine binary Piotroski signals. */
export interface PiotroskiSignal {
  /** Canonical snake_case name identifying this signal. */
  name: string;
  /** 1 if the signal fires (positive indicator), 0 otherwise. */
  value: 0 | 1;
}

export type PiotroskiInterpretation = 'strong' | 'average' | 'weak';

export interface PiotroskiFResult {
  /** Total F-Score: sum of all 9 signal values (0–9). */
  score: number;
  /** All nine individual signals with their 0/1 values. */
  signals: PiotroskiSignal[];
  /** Textual interpretation of the score. */
  interpretation: PiotroskiInterpretation;
}

/**
 * Map a raw F-Score to its qualitative interpretation.
 *
 * - 8–9 → strong  (buy signal among cheap stocks)
 * - 3–7 → average
 * - 0–2 → weak    (avoid or investigate further)
 *
 * @param score - Integer F-Score in range [0, 9].
 */
export function interpretPiotroskiF(score: number): PiotroskiInterpretation {
  if (score >= 8) return 'strong';
  if (score >= 3) return 'average';
  return 'weak';
}

/**
 * Calculate the Piotroski F-Score using current and prior year financials.
 *
 * Each of the 9 binary signals contributes 1 point. The score ranges from 0
 * (worst) to 9 (best). Requires two consecutive annual periods.
 *
 * Source: Piotroski (2000), "Value Investing: The Use of Historical Financial
 * Statement Information to Separate Winners from Losers."
 *
 * @param inputs - Current and prior year financial data.
 * @returns {@link PiotroskiFResult} with score, signals, and interpretation.
 */
export function calculatePiotroskiF(inputs: PiotroskiInputs): PiotroskiFResult {
  const { current: c, prior: p } = inputs;

  // --- Profitability (4 signals) ---

  // 1. Net income > 0
  const s1: PiotroskiSignal = {
    name: 'positive_net_income',
    value: c.netIncome > 0 ? 1 : 0,
  };

  // 2. Operating cash flow > 0
  const s2: PiotroskiSignal = {
    name: 'positive_operating_cash_flow',
    value: c.operatingCashFlow > 0 ? 1 : 0,
  };

  // 3. Return on assets increasing (ROA = net income / avg total assets)
  const roaCurrent = c.totalAssetsLastYear > 0
    ? c.netIncome / ((c.totalAssets + c.totalAssetsLastYear) / 2)
    : c.netIncome / c.totalAssets;
  const roaPrior = p.totalAssets > 0
    ? p.netIncome / p.totalAssets
    : 0;
  const s3: PiotroskiSignal = {
    name: 'increasing_roa',
    value: roaCurrent > roaPrior ? 1 : 0,
  };

  // 4. Operating cash flow > net income (earnings quality / accruals check)
  const s4: PiotroskiSignal = {
    name: 'cash_flow_exceeds_net_income',
    value: c.operatingCashFlow > c.netIncome ? 1 : 0,
  };

  // --- Leverage & Liquidity (3 signals) ---

  // 5. Long-term debt ratio decreasing (LT debt / total assets)
  const leverageCurrent = c.totalAssets > 0 ? c.longTermDebt / c.totalAssets : 0;
  const leveragePrior   = p.totalAssets > 0 ? p.longTermDebt / p.totalAssets : 0;
  const s5: PiotroskiSignal = {
    name: 'decreasing_leverage',
    value: leverageCurrent < leveragePrior ? 1 : 0,
  };

  // 6. Current ratio increasing (current assets / current liabilities)
  const currentRatioCurrent = c.currentLiabilities > 0 ? c.currentAssets / c.currentLiabilities : 0;
  const currentRatioPrior   = p.currentLiabilities > 0 ? p.currentAssets / p.currentLiabilities : 0;
  const s6: PiotroskiSignal = {
    name: 'increasing_current_ratio',
    value: currentRatioCurrent > currentRatioPrior ? 1 : 0,
  };

  // 7. No new shares issued (dilution check)
  const s7: PiotroskiSignal = {
    name: 'no_new_shares',
    value: c.sharesOutstanding <= p.sharesOutstanding ? 1 : 0,
  };

  // --- Operating Efficiency (2 signals) ---

  // 8. Gross margin increasing
  const grossMarginCurrent = c.revenue > 0 ? c.grossProfit / c.revenue : 0;
  const grossMarginPrior   = p.revenue > 0 ? p.grossProfit / p.revenue : 0;
  const s8: PiotroskiSignal = {
    name: 'increasing_gross_margin',
    value: grossMarginCurrent > grossMarginPrior ? 1 : 0,
  };

  // 9. Asset turnover increasing (revenue / total assets)
  const assetTurnoverCurrent = c.totalAssets > 0 ? c.revenue / c.totalAssets : 0;
  const assetTurnoverPrior   = p.totalAssets > 0 ? p.revenue / p.totalAssets : 0;
  const s9: PiotroskiSignal = {
    name: 'increasing_asset_turnover',
    value: assetTurnoverCurrent > assetTurnoverPrior ? 1 : 0,
  };

  const signals: PiotroskiSignal[] = [s1, s2, s3, s4, s5, s6, s7, s8, s9];
  const score = signals.reduce((sum, s) => sum + s.value, 0);

  return { score, signals, interpretation: interpretPiotroskiF(score) };
}
```

- [ ] **Step 4: Fix interpretation test — `require` is CJS; use a direct import instead**

The `interpretPiotroskiF` test above uses `require()` for convenience. Replace that test case with a direct import-based approach:

```typescript
// Replace the interpretation describe block in the test file with:
import { calculatePiotroskiF, interpretPiotroskiF } from '../../scoring/piotroski-f.js';

describe('interpretPiotroskiF', () => {
  it.each([
    [9, 'strong'],
    [8, 'strong'],
    [7, 'average'],
    [5, 'average'],
    [2, 'weak'],
    [0, 'weak'],
  ] as const)('score=%s → %s', (score, expected) => {
    expect(interpretPiotroskiF(score)).toBe(expected);
  });
});
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): Piotroski F-Score calculator with 9 binary signals`

---

## Task 3: Beneish M-Score Calculator

**Files:**
- Create: `packages/core/src/scoring/beneish-m.ts`
- Create: `packages/core/src/__tests__/scoring/beneish-m.test.ts`

**Formula:** `M = -4.84 + 0.92*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI - 0.172*SGAI + 4.679*TATA - 0.327*LVGI`

Each index compares the current year to the prior year. Requires full income statement and balance sheet data for both periods.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/scoring/beneish-m.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateBeneishM,
  interpretBeneishM,
  type BeneishInputs,
  type BeneishMResult,
} from '../../scoring/beneish-m.js';

// Clean company — all indices near 1.0, no manipulation signal.
// TATA near zero (cash-based income), DSRI near 1.0 (receivables growing with revenue).
const CLEAN_CURRENT: BeneishInputs['current'] = {
  accountsReceivable: 100,
  revenue: 1000,
  grossProfit: 400,
  currentAssets: 500,
  ppAndE: 300,          // property, plant & equipment
  totalAssets: 1000,
  depreciation: 50,
  sgaExpenses: 100,
  netIncome: 120,
  totalCurrentLiabilities: 200,
  longTermDebt: 200,
  operatingCashFlow: 140,
};

const CLEAN_PRIOR: BeneishInputs['prior'] = {
  accountsReceivable: 95,
  revenue: 950,
  grossProfit: 380,
  currentAssets: 480,
  ppAndE: 280,
  totalAssets: 950,
  depreciation: 45,
  sgaExpenses: 95,
  netIncome: 100,
  totalCurrentLiabilities: 190,
  longTermDebt: 210,
};

// Manipulator — receivables spiking vs revenue, margins declining, high accruals.
const MANIP_CURRENT: BeneishInputs['current'] = {
  accountsReceivable: 300,   // AR nearly tripled vs revenue growth
  revenue: 1100,
  grossProfit: 250,          // margin collapsed
  currentAssets: 700,
  ppAndE: 500,
  totalAssets: 1200,
  depreciation: 30,          // lower depreciation than prior → DEPI > 1
  sgaExpenses: 200,
  netIncome: 150,            // income high but...
  totalCurrentLiabilities: 350,
  longTermDebt: 400,
  operatingCashFlow: 20,     // ...cash flow much lower → high accruals
};

const MANIP_PRIOR: BeneishInputs['prior'] = {
  accountsReceivable: 100,
  revenue: 1000,
  grossProfit: 420,
  currentAssets: 500,
  ppAndE: 400,
  totalAssets: 1000,
  depreciation: 50,
  sgaExpenses: 150,
  netIncome: 100,
  totalCurrentLiabilities: 250,
  longTermDebt: 300,
};

describe('calculateBeneishM — clean company', () => {
  it('returns M-Score below -1.78 (unlikely manipulator)', () => {
    const result = calculateBeneishM({ current: CLEAN_CURRENT, prior: CLEAN_PRIOR });
    expect(result.mScore).toBeLessThan(-1.78);
    expect(result.manipulationFlag).toBe(false);
  });

  it('includes all 8 index components', () => {
    const result = calculateBeneishM({ current: CLEAN_CURRENT, prior: CLEAN_PRIOR });
    expect(Object.keys(result.indices)).toEqual(
      expect.arrayContaining(['DSRI', 'GMI', 'AQI', 'SGI', 'DEPI', 'SGAI', 'TATA', 'LVGI'])
    );
  });
});

describe('calculateBeneishM — manipulator', () => {
  it('returns M-Score above -1.78 (likely manipulator)', () => {
    const result = calculateBeneishM({ current: MANIP_CURRENT, prior: MANIP_PRIOR });
    expect(result.mScore).toBeGreaterThan(-1.78);
    expect(result.manipulationFlag).toBe(true);
  });
});

describe('interpretBeneishM', () => {
  it.each([
    [-2.5,  false, 'unlikely_manipulator'],
    [-1.78, false, 'unlikely_manipulator'],  // boundary — exactly -1.78 is not flagged
    [-1.77, true,  'likely_manipulator'],
    [0,     true,  'likely_manipulator'],
  ] as const)('M=%s → flag=%s, %s', (m, flag, label) => {
    const r = interpretBeneishM(m);
    expect(r.manipulationFlag).toBe(flag);
    expect(r.label).toBe(label);
  });
});

describe('calculateBeneishM — DSRI index', () => {
  it('DSRI > 1 when receivables grow faster than revenue', () => {
    const result = calculateBeneishM({ current: MANIP_CURRENT, prior: MANIP_PRIOR });
    // AR/Rev current = 300/1100 = 0.273; prior = 100/1000 = 0.1 → DSRI = 2.73
    expect(result.indices.DSRI).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement beneish-m.ts**

```typescript
// packages/core/src/scoring/beneish-m.ts

/**
 * Financial inputs for one annual period required for the Beneish M-Score.
 * Source: Beneish (1999), "The Detection of Earnings Manipulation."
 */
export interface BeneishPeriodInputs {
  accountsReceivable: number;
  revenue: number;
  grossProfit: number;
  /** Non-cash current assets (total current assets - cash). */
  currentAssets: number;
  /** Net property, plant & equipment. */
  ppAndE: number;
  totalAssets: number;
  depreciation: number;
  sgaExpenses: number;
  netIncome: number;
  totalCurrentLiabilities: number;
  longTermDebt: number;
  /** Required for current period only: operating cash flow for TATA calculation. */
  operatingCashFlow?: number;
}

export interface BeneishInputs {
  current: BeneishPeriodInputs & { operatingCashFlow: number };
  prior: Omit<BeneishPeriodInputs, 'operatingCashFlow'>;
}

/** The eight Beneish indices. */
export interface BeneishIndices {
  /** Days Sales in Receivables Index — receivables growing faster than revenue? */
  DSRI: number;
  /** Gross Margin Index — margins deteriorating? */
  GMI: number;
  /** Asset Quality Index — off-balance-sheet asset inflation? */
  AQI: number;
  /** Sales Growth Index — growth rate sustainable? */
  SGI: number;
  /** Depreciation Index — depreciation policy changing to inflate earnings? */
  DEPI: number;
  /** SGA Expense Index — overhead being leveraged or building? */
  SGAI: number;
  /** Total Accruals to Total Assets — accrual-based income vs cash income. */
  TATA: number;
  /** Leverage Index — debt load increasing? */
  LVGI: number;
}

export type BeneishLabel = 'likely_manipulator' | 'unlikely_manipulator';

export interface BeneishInterpretation {
  manipulationFlag: boolean;
  label: BeneishLabel;
}

export interface BeneishMResult {
  mScore: number;
  indices: BeneishIndices;
  manipulationFlag: boolean;
}

/**
 * Interpret a raw M-Score.
 *
 * - M > -1.78 → likely manipulator (red flag)
 * - M <= -1.78 → unlikely manipulator
 *
 * @param mScore - The raw Beneish M-Score.
 */
export function interpretBeneishM(mScore: number): BeneishInterpretation {
  const manipulationFlag = mScore > -1.78;
  return {
    manipulationFlag,
    label: manipulationFlag ? 'likely_manipulator' : 'unlikely_manipulator',
  };
}

/**
 * Calculate the Beneish M-Score using current and prior year financials.
 *
 * Formula:
 *   M = -4.84 + 0.92*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI
 *       + 0.115*DEPI - 0.172*SGAI + 4.679*TATA - 0.327*LVGI
 *
 * A score > -1.78 indicates a likely earnings manipulator.
 *
 * @param inputs - Current and prior year financial data.
 * @returns {@link BeneishMResult} with M-Score, indices, and manipulation flag.
 */
export function calculateBeneishM(inputs: BeneishInputs): BeneishMResult {
  const { current: c, prior: p } = inputs;

  // Guard against zero denominators — use a small epsilon fallback.
  const safe = (n: number, d: number): number => (d === 0 ? 0 : n / d);

  // DSRI = (AR_t / Rev_t) / (AR_t-1 / Rev_t-1)
  const DSRI = safe(safe(c.accountsReceivable, c.revenue), safe(p.accountsReceivable, p.revenue));

  // GMI = GrossMargin_t-1 / GrossMargin_t
  const gmCurrent = safe(c.grossProfit, c.revenue);
  const gmPrior   = safe(p.grossProfit, p.revenue);
  const GMI = safe(gmPrior, gmCurrent);

  // AQI = (1 - (CA_t + PPE_t) / TotalAssets_t) / (1 - (CA_t-1 + PPE_t-1) / TotalAssets_t-1)
  const aqiCurrent = 1 - safe(c.currentAssets + c.ppAndE, c.totalAssets);
  const aqiPrior   = 1 - safe(p.currentAssets + p.ppAndE, p.totalAssets);
  const AQI = safe(aqiCurrent, aqiPrior);

  // SGI = Revenue_t / Revenue_t-1
  const SGI = safe(c.revenue, p.revenue);

  // DEPI = (Depreciation_t-1 / (Depreciation_t-1 + PPE_t-1)) /
  //        (Depreciation_t   / (Depreciation_t   + PPE_t))
  const depiPrior   = safe(p.depreciation, p.depreciation + p.ppAndE);
  const depiCurrent = safe(c.depreciation, c.depreciation + c.ppAndE);
  const DEPI = safe(depiPrior, depiCurrent);

  // SGAI = (SGA_t / Rev_t) / (SGA_t-1 / Rev_t-1)
  const SGAI = safe(safe(c.sgaExpenses, c.revenue), safe(p.sgaExpenses, p.revenue));

  // TATA = (Net Income - Operating Cash Flow) / Total Assets
  // Represents total accruals: high positive TATA signals income inflation.
  const TATA = safe(c.netIncome - c.operatingCashFlow, c.totalAssets);

  // LVGI = ((LTD_t + CL_t) / TA_t) / ((LTD_t-1 + CL_t-1) / TA_t-1)
  const lvgiCurrent = safe(c.longTermDebt + c.totalCurrentLiabilities, c.totalAssets);
  const lvgiPrior   = safe(p.longTermDebt + p.totalCurrentLiabilities, p.totalAssets);
  const LVGI = safe(lvgiCurrent, lvgiPrior);

  const mScore = -4.84
    + 0.92  * DSRI
    + 0.528 * GMI
    + 0.404 * AQI
    + 0.892 * SGI
    + 0.115 * DEPI
    - 0.172 * SGAI
    + 4.679 * TATA
    - 0.327 * LVGI;

  const { manipulationFlag } = interpretBeneishM(mScore);

  return {
    mScore,
    indices: { DSRI, GMI, AQI, SGI, DEPI, SGAI, TATA, LVGI },
    manipulationFlag,
  };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): Beneish M-Score calculator with 8 manipulation indices`

---

## Task 4: Composite Quantitative Score + Valuation Metrics

**Files:**
- Create: `packages/core/src/scoring/composite.ts`
- Create: `packages/core/src/scoring/valuation.ts`
- Create: `packages/core/src/__tests__/scoring/composite.test.ts`
- Create: `packages/core/src/__tests__/scoring/valuation.test.ts`
- Create: `packages/core/src/scoring/index.ts`

**Composite formula:** `score = 0.35 * Z_normalized + 0.35 * F_normalized + 0.30 * M_normalized`
- Z normalization: clamp to [-5, 10], scale to [0, 100]
- F normalization: divide by 9, multiply by 100 (natural 0-9 range)
- M normalization: M is an inverse signal (lower/more negative = better). Clamp M to [-3, 2], invert and scale to [0, 100]

**Valuation metrics:** EV/EBITDA, P/E, P/B, FCF Yield, Owner Earnings — pure functions taking financials + price data.

**Failing test first.**

- [ ] **Step 1: Write the failing composite test**

```typescript
// packages/core/src/__tests__/scoring/composite.test.ts
import { describe, it, expect } from 'vitest';
import {
  normalizeAltmanZ,
  normalizePiotroskiF,
  normalizeBeneishM,
  calculateCompositeScore,
} from '../../scoring/composite.js';

describe('normalizeAltmanZ', () => {
  it('maps Z=10 (maximum healthy) to 100', () => {
    expect(normalizeAltmanZ(10)).toBe(100);
  });

  it('maps Z=-5 (severe distress) to 0', () => {
    expect(normalizeAltmanZ(-5)).toBe(0);
  });

  it('maps Z=2.5 (grey zone) to a value between 40 and 75', () => {
    const n = normalizeAltmanZ(2.5);
    expect(n).toBeGreaterThan(40);
    expect(n).toBeLessThan(75);
  });

  it('clamps values outside the range', () => {
    expect(normalizeAltmanZ(100)).toBe(100);
    expect(normalizeAltmanZ(-100)).toBe(0);
  });
});

describe('normalizePiotroskiF', () => {
  it('maps F=9 to 100', () => {
    expect(normalizePiotroskiF(9)).toBeCloseTo(100, 1);
  });

  it('maps F=0 to 0', () => {
    expect(normalizePiotroskiF(0)).toBe(0);
  });

  it('maps F=5 to ~55.6', () => {
    expect(normalizePiotroskiF(5)).toBeCloseTo(55.6, 1);
  });
});

describe('normalizeBeneishM', () => {
  it('maps M=-3 (cleanest) to 100', () => {
    expect(normalizeBeneishM(-3)).toBe(100);
  });

  it('maps M=2 (manipulator) to 0', () => {
    expect(normalizeBeneishM(2)).toBe(0);
  });

  it('maps M=-1.78 (threshold) to a value in [35, 65]', () => {
    const n = normalizeBeneishM(-1.78);
    expect(n).toBeGreaterThan(35);
    expect(n).toBeLessThan(65);
  });

  it('clamps values outside the range', () => {
    expect(normalizeBeneishM(-100)).toBe(100);
    expect(normalizeBeneishM(100)).toBe(0);
  });
});

describe('calculateCompositeScore', () => {
  it('returns 100 when all scores are perfect', () => {
    // Z=10 → 100, F=9 → 100, M=-3 → 100
    const score = calculateCompositeScore({ z: 10, f: 9, m: -3 });
    expect(score).toBeCloseTo(100, 1);
  });

  it('returns 0 when all scores are worst case', () => {
    const score = calculateCompositeScore({ z: -5, f: 0, m: 2 });
    expect(score).toBeCloseTo(0, 1);
  });

  it('applies weights 0.35/0.35/0.30', () => {
    // Z fully healthy (100), F=0 (0), M neutral (50)
    // composite = 0.35*100 + 0.35*0 + 0.30*50 = 35 + 0 + 15 = 50
    const m50 = -3 + (2 - (-3)) * 0.5; // midpoint of M range = -0.5
    const score = calculateCompositeScore({ z: 10, f: 0, m: m50 });
    expect(score).toBeCloseTo(50, 1);
  });

  it('returns a value in [0, 100] for typical inputs', () => {
    const score = calculateCompositeScore({ z: 2.5, f: 5, m: -2.0 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Write the failing valuation test**

```typescript
// packages/core/src/__tests__/scoring/valuation.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateEvEbitda,
  calculatePE,
  calculatePB,
  calculateFcfYield,
  calculateOwnerEarnings,
  type ValuationInputs,
} from '../../scoring/valuation.js';

const BASE: ValuationInputs = {
  marketCap: 1000,
  totalDebt: 300,
  cash: 100,
  ebitda: 200,
  netIncome: 120,
  sharesOutstanding: 100,
  sharePrice: 10,
  totalAssets: 1500,
  totalLiabilities: 600,
  fcf: 150,
  depreciation: 80,
  capex: 50,
};

describe('calculateEvEbitda', () => {
  it('computes EV/EBITDA correctly', () => {
    // EV = 1000 + 300 - 100 = 1200; EV/EBITDA = 1200/200 = 6.0
    expect(calculateEvEbitda(BASE)).toBeCloseTo(6.0, 4);
  });

  it('throws when ebitda is zero', () => {
    expect(() => calculateEvEbitda({ ...BASE, ebitda: 0 })).toThrow();
  });
});

describe('calculatePE', () => {
  it('computes P/E correctly', () => {
    // EPS = 120/100 = 1.2; P/E = 10/1.2 = 8.33
    expect(calculatePE(BASE)).toBeCloseTo(8.33, 2);
  });

  it('throws when netIncome is zero or negative', () => {
    expect(() => calculatePE({ ...BASE, netIncome: 0 })).toThrow();
    expect(() => calculatePE({ ...BASE, netIncome: -10 })).toThrow();
  });
});

describe('calculatePB', () => {
  it('computes P/B correctly', () => {
    // Book value = 1500 - 600 = 900; BV per share = 900/100 = 9.0; P/B = 10/9 = 1.11
    expect(calculatePB(BASE)).toBeCloseTo(1.11, 2);
  });

  it('throws when book value per share is zero or negative', () => {
    expect(() => calculatePB({ ...BASE, totalAssets: 600, totalLiabilities: 600 })).toThrow();
  });
});

describe('calculateFcfYield', () => {
  it('computes FCF Yield correctly', () => {
    // FCF Yield = 150/1000 = 0.15 = 15%
    expect(calculateFcfYield(BASE)).toBeCloseTo(0.15, 4);
  });

  it('throws when marketCap is zero', () => {
    expect(() => calculateFcfYield({ ...BASE, marketCap: 0 })).toThrow();
  });
});

describe('calculateOwnerEarnings', () => {
  it('computes Owner Earnings = net income + depreciation - capex', () => {
    // 120 + 80 - 50 = 150
    expect(calculateOwnerEarnings(BASE)).toBeCloseTo(150, 4);
  });

  it('can return negative when capex exceeds income + depreciation', () => {
    const result = calculateOwnerEarnings({ ...BASE, capex: 500 });
    expect(result).toBeLessThan(0);
  });
});
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -60
```

- [ ] **Step 4: Implement composite.ts**

```typescript
// packages/core/src/scoring/composite.ts

/** Normalize the Altman Z-Score to [0, 100]. Range: [-5, 10]. Higher = better. */
export function normalizeAltmanZ(z: number): number {
  const MIN = -5;
  const MAX = 10;
  const clamped = Math.max(MIN, Math.min(MAX, z));
  return ((clamped - MIN) / (MAX - MIN)) * 100;
}

/** Normalize the Piotroski F-Score to [0, 100]. Natural range [0, 9]. Higher = better. */
export function normalizePiotroskiF(f: number): number {
  return (Math.max(0, Math.min(9, f)) / 9) * 100;
}

/**
 * Normalize the Beneish M-Score to [0, 100].
 * Range: [-3, 2]. M is an inverse signal — lower (more negative) = more trustworthy.
 * We invert so that a clean company (M=-3) maps to 100 and a manipulator (M=2) maps to 0.
 */
export function normalizeBeneishM(m: number): number {
  const MIN = -3;
  const MAX = 2;
  const clamped = Math.max(MIN, Math.min(MAX, m));
  // Invert: score = (MAX - clamped) / (MAX - MIN) * 100
  return ((MAX - clamped) / (MAX - MIN)) * 100;
}

/**
 * Calculate the composite quantitative score (0–100) from raw Z, F, M values.
 *
 * Formula: `composite = 0.35 * Z_norm + 0.35 * F_norm + 0.30 * M_norm`
 *
 * Weights rationale (spec A.1):
 * - Z and F are complementary health signals (solvency + operational strength): 0.35 each
 * - M is a fraud veto signal — different in kind but equally critical: 0.30
 *
 * @param scores - Raw scores. `z` is the Altman Z, `f` is the Piotroski integer (0-9),
 *                 `m` is the Beneish M (more negative = better).
 * @returns Composite score in [0, 100].
 */
export function calculateCompositeScore(scores: { z: number; f: number; m: number }): number {
  const zNorm = normalizeAltmanZ(scores.z);
  const fNorm = normalizePiotroskiF(scores.f);
  const mNorm = normalizeBeneishM(scores.m);
  return 0.35 * zNorm + 0.35 * fNorm + 0.30 * mNorm;
}
```

- [ ] **Step 5: Implement valuation.ts**

```typescript
// packages/core/src/scoring/valuation.ts

/**
 * Inputs needed to calculate all standard valuation metrics.
 * All monetary values must be in a consistent unit.
 */
export interface ValuationInputs {
  /** Market capitalisation (shares outstanding × price). */
  marketCap: number;
  /** Total debt (current + long-term). */
  totalDebt: number;
  /** Cash and cash equivalents. */
  cash: number;
  /** EBITDA for the period. */
  ebitda: number;
  /** Net income (bottom line). */
  netIncome: number;
  /** Diluted shares outstanding. */
  sharesOutstanding: number;
  /** Current share price. */
  sharePrice: number;
  /** Total assets. */
  totalAssets: number;
  /** Total liabilities. */
  totalLiabilities: number;
  /** Free cash flow (operating cash flow minus maintenance capex). */
  fcf: number;
  /** Depreciation and amortisation. */
  depreciation: number;
  /** Capital expenditure (total, including growth capex). */
  capex: number;
}

/**
 * Calculate EV/EBITDA — "The Acquirer's Multiple."
 *
 * Formula: `EV = Market Cap + Total Debt - Cash; EV/EBITDA = EV / EBITDA`
 *
 * Source: Carlisle (2017), "The Acquirer's Multiple."
 *
 * @throws {Error} If EBITDA is zero (undefined multiple).
 */
export function calculateEvEbitda(inputs: ValuationInputs): number {
  if (inputs.ebitda === 0) {
    throw new Error('EV/EBITDA: EBITDA must not be zero');
  }
  const ev = inputs.marketCap + inputs.totalDebt - inputs.cash;
  return ev / inputs.ebitda;
}

/**
 * Calculate P/E ratio.
 *
 * Formula: `EPS = Net Income / Shares Outstanding; P/E = Share Price / EPS`
 *
 * Source: Graham (1949), "The Intelligent Investor."
 *
 * @throws {Error} If net income is zero or negative (P/E undefined for loss-making companies).
 */
export function calculatePE(inputs: ValuationInputs): number {
  if (inputs.netIncome <= 0) {
    throw new Error('P/E: net income must be positive (loss-making companies have no meaningful P/E)');
  }
  const eps = inputs.netIncome / inputs.sharesOutstanding;
  return inputs.sharePrice / eps;
}

/**
 * Calculate P/B ratio.
 *
 * Formula: `Book Value = Total Assets - Total Liabilities; BV per share = BV / Shares; P/B = Price / BV per share`
 *
 * Source: Graham (1934), "Security Analysis."
 *
 * @throws {Error} If book value per share is zero or negative.
 */
export function calculatePB(inputs: ValuationInputs): number {
  const bookValue = inputs.totalAssets - inputs.totalLiabilities;
  const bvPerShare = bookValue / inputs.sharesOutstanding;
  if (bvPerShare <= 0) {
    throw new Error('P/B: book value per share must be positive');
  }
  return inputs.sharePrice / bvPerShare;
}

/**
 * Calculate FCF Yield.
 *
 * Formula: `FCF Yield = FCF / Market Cap`
 *
 * Source: Greenblatt (2005), "The Little Book That Beats the Market."
 *
 * @throws {Error} If market cap is zero.
 * @returns FCF yield as a decimal (e.g. 0.12 = 12%).
 */
export function calculateFcfYield(inputs: ValuationInputs): number {
  if (inputs.marketCap === 0) {
    throw new Error('FCF Yield: market cap must not be zero');
  }
  return inputs.fcf / inputs.marketCap;
}

/**
 * Calculate Owner Earnings (Buffett's true economic earnings).
 *
 * Formula: `Owner Earnings = Net Income + Depreciation/Amortisation - CapEx`
 *
 * Source: Buffett, Berkshire Hathaway Annual Letter (1986).
 *
 * Note: This uses total capex as an approximation. For a more precise
 * calculation, separate maintenance capex from growth capex, and use only
 * the maintenance portion. Total capex is the conservative upper bound.
 */
export function calculateOwnerEarnings(inputs: ValuationInputs): number {
  return inputs.netIncome + inputs.depreciation - inputs.capex;
}
```

- [ ] **Step 6: Create scoring/index.ts barrel**

```typescript
// packages/core/src/scoring/index.ts
export * from './altman-z.js';
export * from './piotroski-f.js';
export * from './beneish-m.js';
export * from './composite.js';
export * from './valuation.js';
```

- [ ] **Step 7: Run tests — confirm all pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): composite score normalizer and valuation metrics calculator`

---

## Task 5: Super Investor Store

**Files:**
- Create: `packages/core/src/screener/super-investor-store.ts`
- Create: `packages/core/src/__tests__/screener/super-investor-store.test.ts`

This module persists `SuperInvestorPosition` records to the `super_investor_positions` table and wraps `createDataromaClient().findConvergence` to produce `ScreenerOutput.superInvestorOverlap` entries. The convergence threshold from the spec is >= 3 investors within the last 6 quarters.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/screener/super-investor-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../data/db.js';
import {
  upsertPositions,
  findConvergenceSignals,
  listPositionsByTicker,
  type StoredConvergenceSignal,
} from '../../screener/super-investor-store.js';
import type { SuperInvestorPosition } from '../../models/super-investor.js';

let db: DatabaseConnection;

beforeEach(() => {
  db = createDatabase(':memory:');
});

const makePosition = (
  investorName: string,
  ticker: string,
  quarter = '2025-Q4',
): Omit<SuperInvestorPosition, 'id'> => ({
  investorName,
  ticker,
  action: 'buy',
  quarter,
  shares: 1000,
  value: 50000,
});

describe('upsertPositions', () => {
  it('inserts positions into the database', () => {
    upsertPositions(db, [
      makePosition('Pabrai', 'AAPL'),
      makePosition('Klarman', 'AAPL'),
    ]);
    const rows = listPositionsByTicker(db, 'AAPL');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.investorName)).toContain('Pabrai');
  });

  it('updates an existing position on re-insert (same investor + ticker + quarter)', () => {
    upsertPositions(db, [makePosition('Pabrai', 'AAPL', '2025-Q4')]);
    upsertPositions(db, [{ ...makePosition('Pabrai', 'AAPL', '2025-Q4'), shares: 2000 }]);
    const rows = listPositionsByTicker(db, 'AAPL');
    expect(rows).toHaveLength(1);
    expect(rows[0].shares).toBe(2000);
  });

  it('does not duplicate positions for different investors', () => {
    upsertPositions(db, [
      makePosition('Pabrai', 'AAPL'),
      makePosition('Klarman', 'AAPL'),
      makePosition('Burry', 'AAPL'),
    ]);
    expect(listPositionsByTicker(db, 'AAPL')).toHaveLength(3);
  });
});

describe('findConvergenceSignals', () => {
  it('flags a ticker when >= 3 investors hold it', () => {
    upsertPositions(db, [
      makePosition('Pabrai', 'AAPL'),
      makePosition('Klarman', 'AAPL'),
      makePosition('Burry', 'AAPL'),
    ]);
    const signals = findConvergenceSignals(db);
    const aapl = signals.find((s) => s.ticker === 'AAPL');
    expect(aapl).toBeDefined();
    expect(aapl!.convergenceSignal).toBe(true);
    expect(aapl!.investors).toHaveLength(3);
  });

  it('does not flag a ticker with fewer than 3 investors', () => {
    upsertPositions(db, [
      makePosition('Pabrai', 'GOOG'),
      makePosition('Klarman', 'GOOG'),
    ]);
    const signals = findConvergenceSignals(db);
    const goog = signals.find((s) => s.ticker === 'GOOG');
    expect(goog).toBeUndefined();
  });

  it('respects a custom threshold', () => {
    upsertPositions(db, [
      makePosition('Pabrai', 'MSFT'),
      makePosition('Klarman', 'MSFT'),
    ]);
    const signals = findConvergenceSignals(db, { threshold: 2 });
    expect(signals.find((s) => s.ticker === 'MSFT')).toBeDefined();
  });

  it('returns an empty array when no positions exist', () => {
    expect(findConvergenceSignals(db)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement super-investor-store.ts**

```typescript
// packages/core/src/screener/super-investor-store.ts
import type { DatabaseConnection } from '../data/db.js';
import type { SuperInvestorPosition } from '../models/super-investor.js';
import type { ConvergenceSignal } from '../api/dataroma.js';

export type StoredConvergenceSignal = ConvergenceSignal;

interface PositionRow {
  id: string;
  investor_name: string;
  ticker: string;
  action: string;
  quarter: string;
  shares: number | null;
  value: number | null;
}

function rowToPosition(row: PositionRow): SuperInvestorPosition {
  return {
    id: row.id,
    investorName: row.investor_name,
    ticker: row.ticker,
    action: row.action as SuperInvestorPosition['action'],
    quarter: row.quarter,
    shares: row.shares ?? 0,
    value: row.value ?? 0,
  };
}

/**
 * Insert or update super investor positions in the database.
 *
 * Uses an INSERT OR REPLACE strategy keyed on (investor_name, ticker, quarter)
 * so that re-running a quarterly sync is idempotent.
 *
 * @param db - Active database connection.
 * @param positions - Positions to upsert.
 */
export function upsertPositions(
  db: DatabaseConnection,
  positions: Omit<SuperInvestorPosition, 'id'>[],
): void {
  for (const pos of positions) {
    // Check for an existing row with the same natural key.
    const existing = db.get<{ id: string }>(
      `SELECT id FROM super_investor_positions
       WHERE investor_name = ? AND ticker = ? AND quarter = ?`,
      pos.investorName,
      pos.ticker,
      pos.quarter,
    );

    if (existing) {
      db.run(
        `UPDATE super_investor_positions
         SET action = ?, shares = ?, value = ?
         WHERE id = ?`,
        pos.action,
        pos.shares,
        pos.value,
        existing.id,
      );
    } else {
      db.run(
        `INSERT INTO super_investor_positions
           (id, investor_name, ticker, action, quarter, shares, value)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        pos.investorName,
        pos.ticker,
        pos.action,
        pos.quarter,
        pos.shares,
        pos.value,
      );
    }
  }
}

/**
 * Return all stored positions for a given ticker.
 *
 * @param db - Active database connection.
 * @param ticker - The ticker symbol to query.
 */
export function listPositionsByTicker(
  db: DatabaseConnection,
  ticker: string,
): SuperInvestorPosition[] {
  const rows = db.all<PositionRow>(
    `SELECT * FROM super_investor_positions WHERE ticker = ?`,
    ticker,
  );
  return rows.map(rowToPosition);
}

/**
 * Find convergence signals from positions stored in the database.
 *
 * A convergence signal is triggered when >= `threshold` distinct investors
 * hold a position in the same ticker. Only the most recent quarter per
 * investor-ticker pair is considered to avoid double-counting.
 *
 * @param db - Active database connection.
 * @param options - Optional threshold override (default: 3).
 * @returns Array of tickers with convergence signals.
 */
export function findConvergenceSignals(
  db: DatabaseConnection,
  options: { threshold?: number } = {},
): StoredConvergenceSignal[] {
  const threshold = options.threshold ?? 3;

  // Aggregate distinct investors per ticker using only their latest quarter.
  const rows = db.all<{ ticker: string; investor_name: string }>(
    `SELECT ticker, investor_name
     FROM super_investor_positions
     WHERE (investor_name, ticker, quarter) IN (
       SELECT investor_name, ticker, MAX(quarter)
       FROM super_investor_positions
       GROUP BY investor_name, ticker
     )`,
  );

  const tickerMap = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!tickerMap.has(row.ticker)) tickerMap.set(row.ticker, new Set());
    tickerMap.get(row.ticker)!.add(row.investor_name);
  }

  const signals: StoredConvergenceSignal[] = [];
  for (const [ticker, investors] of tickerMap) {
    if (investors.size >= threshold) {
      signals.push({
        ticker,
        investors: Array.from(investors),
        convergenceSignal: true,
      });
    }
  }
  return signals;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): super investor convergence store with upsert and threshold query`

---

## Task 6: Watchlist CRUD

**Files:**
- Create: `packages/core/src/screener/watchlist.ts`
- Create: `packages/core/src/__tests__/screener/watchlist.test.ts`

The watchlist is a view over the `investments` table filtered by `status`. The pipeline funnel is: `screening → researching → deep_dive → ready_to_buy → held → exited | rejected`. CRUD operations add investments to the watchlist, remove them (soft-delete to `rejected`), and advance their status through the pipeline.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/screener/watchlist.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../data/db.js';
import {
  addToWatchlist,
  removeFromWatchlist,
  advancePipelineStatus,
  getWatchlist,
  getWatchlistItem,
  type WatchlistEntry,
} from '../../screener/watchlist.js';
import { InvestmentStatus } from '../../models/investment.js';

let db: DatabaseConnection;

beforeEach(() => {
  db = createDatabase(':memory:');
});

const ENTRY: Omit<WatchlistEntry, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'listed_stock',
  name: 'Anglo American',
  ticker: 'AGL',
  exchange: 'JSE',
  sector: 'Mining',
  industry: 'Diversified Metals & Mining',
  dataSource: 'manual',
  userId: 'solo-investor',
};

describe('addToWatchlist', () => {
  it('inserts an investment with status=screening', () => {
    const id = addToWatchlist(db, ENTRY);
    const item = getWatchlistItem(db, id);
    expect(item).toBeDefined();
    expect(item!.status).toBe('screening');
    expect(item!.ticker).toBe('AGL');
  });

  it('returns a UUID string', () => {
    const id = addToWatchlist(db, ENTRY);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('removeFromWatchlist', () => {
  it('sets status to rejected (soft delete)', () => {
    const id = addToWatchlist(db, ENTRY);
    removeFromWatchlist(db, id);
    const item = getWatchlistItem(db, id);
    expect(item!.status).toBe('rejected');
  });
});

describe('advancePipelineStatus', () => {
  it.each([
    ['screening',   'researching'],
    ['researching', 'deep_dive'],
    ['deep_dive',   'ready_to_buy'],
    ['ready_to_buy', 'held'],
  ] as const)('%s → %s', (from, to) => {
    const id = addToWatchlist(db, ENTRY);
    // Force the starting status
    db.run(`UPDATE investments SET status = ? WHERE id = ?`, from, id);
    advancePipelineStatus(db, id);
    expect(getWatchlistItem(db, id)!.status).toBe(to);
  });

  it('throws when trying to advance from held (terminal state)', () => {
    const id = addToWatchlist(db, ENTRY);
    db.run(`UPDATE investments SET status = ? WHERE id = ?`, 'held', id);
    expect(() => advancePipelineStatus(db, id)).toThrow();
  });

  it('throws when trying to advance from rejected (terminal state)', () => {
    const id = addToWatchlist(db, ENTRY);
    removeFromWatchlist(db, id);
    expect(() => advancePipelineStatus(db, id)).toThrow();
  });
});

describe('getWatchlist', () => {
  it('returns only investments at the specified status', () => {
    const id1 = addToWatchlist(db, { ...ENTRY, name: 'Anglo' });
    const id2 = addToWatchlist(db, { ...ENTRY, name: 'BHP' });
    db.run(`UPDATE investments SET status = 'researching' WHERE id = ?`, id2);
    const screening = getWatchlist(db, 'screening');
    expect(screening.map((i) => i.id)).toContain(id1);
    expect(screening.map((i) => i.id)).not.toContain(id2);
  });

  it('returns all active investments when no status is specified', () => {
    addToWatchlist(db, { ...ENTRY, name: 'Anglo' });
    addToWatchlist(db, { ...ENTRY, name: 'BHP' });
    expect(getWatchlist(db)).toHaveLength(2);
  });

  it('excludes rejected investments from the default list', () => {
    const id = addToWatchlist(db, ENTRY);
    removeFromWatchlist(db, id);
    expect(getWatchlist(db)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement watchlist.ts**

```typescript
// packages/core/src/screener/watchlist.ts
import type { DatabaseConnection } from '../data/db.js';
import { InvestmentStatus, type InvestmentType, type DataSource } from '../models/investment.js';

/** The subset of Investment fields managed by the watchlist. */
export interface WatchlistEntry {
  id: string;
  type: InvestmentType;
  name: string;
  ticker: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  status: string;
  dataSource: DataSource;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface InvestmentRow {
  id: string;
  type: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  status: string;
  data_source: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

function rowToEntry(row: InvestmentRow): WatchlistEntry {
  return {
    id: row.id,
    type: row.type as InvestmentType,
    name: row.name,
    ticker: row.ticker,
    exchange: row.exchange,
    sector: row.sector,
    industry: row.industry,
    status: row.status,
    dataSource: row.data_source as DataSource,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Ordered pipeline states (excluding terminal states). */
const PIPELINE_ORDER: string[] = [
  InvestmentStatus.SCREENING,
  InvestmentStatus.RESEARCHING,
  InvestmentStatus.DEEP_DIVE,
  InvestmentStatus.READY_TO_BUY,
  InvestmentStatus.HELD,
];

const TERMINAL_STATES = new Set([InvestmentStatus.HELD, InvestmentStatus.EXITED, InvestmentStatus.REJECTED]);

/**
 * Add a new investment to the watchlist at status=screening.
 *
 * @param db - Active database connection.
 * @param entry - Investment fields (id, createdAt, updatedAt are generated).
 * @returns The new investment ID.
 */
export function addToWatchlist(
  db: DatabaseConnection,
  entry: Omit<WatchlistEntry, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO investments
       (id, type, name, ticker, exchange, sector, industry, status,
        data_source, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    entry.type,
    entry.name,
    entry.ticker ?? null,
    entry.exchange ?? null,
    entry.sector ?? null,
    entry.industry ?? null,
    InvestmentStatus.SCREENING,
    entry.dataSource,
    entry.userId,
    now,
    now,
  );

  return id;
}

/**
 * Soft-delete an investment by setting its status to `rejected`.
 * The record is preserved for audit purposes.
 *
 * @param db - Active database connection.
 * @param id - Investment ID.
 */
export function removeFromWatchlist(db: DatabaseConnection, id: string): void {
  const now = new Date().toISOString();
  db.run(
    `UPDATE investments SET status = ?, updated_at = ? WHERE id = ?`,
    InvestmentStatus.REJECTED,
    now,
    id,
  );
}

/**
 * Advance an investment to the next pipeline stage.
 *
 * Pipeline order: screening → researching → deep_dive → ready_to_buy → held
 *
 * @param db - Active database connection.
 * @param id - Investment ID.
 * @throws {Error} If the investment is already in a terminal state (held, exited, rejected).
 */
export function advancePipelineStatus(db: DatabaseConnection, id: string): void {
  const item = getWatchlistItem(db, id);
  if (!item) throw new Error(`Watchlist item not found: ${id}`);

  if (TERMINAL_STATES.has(item.status as InvestmentStatus)) {
    throw new Error(
      `Cannot advance pipeline status from terminal state "${item.status}" for investment ${id}`,
    );
  }

  const currentIndex = PIPELINE_ORDER.indexOf(item.status);
  if (currentIndex === -1 || currentIndex === PIPELINE_ORDER.length - 1) {
    throw new Error(`No next pipeline stage after "${item.status}"`);
  }

  const nextStatus = PIPELINE_ORDER[currentIndex + 1];
  const now = new Date().toISOString();
  db.run(
    `UPDATE investments SET status = ?, updated_at = ? WHERE id = ?`,
    nextStatus,
    now,
    id,
  );
}

/**
 * Retrieve a single watchlist item by ID.
 *
 * @param db - Active database connection.
 * @param id - Investment ID.
 * @returns The entry, or `undefined` if not found.
 */
export function getWatchlistItem(
  db: DatabaseConnection,
  id: string,
): WatchlistEntry | undefined {
  const row = db.get<InvestmentRow>(
    `SELECT id, type, name, ticker, exchange, sector, industry, status,
            data_source, user_id, created_at, updated_at
     FROM investments WHERE id = ?`,
    id,
  );
  return row ? rowToEntry(row) : undefined;
}

/**
 * List investments from the watchlist, optionally filtered by pipeline status.
 *
 * When no status is provided, returns all investments excluding `rejected`
 * and `exited` (the terminal disposal states).
 *
 * @param db - Active database connection.
 * @param status - Optional status filter.
 * @returns Array of matching watchlist entries.
 */
export function getWatchlist(
  db: DatabaseConnection,
  status?: string,
): WatchlistEntry[] {
  let rows: InvestmentRow[];

  if (status !== undefined) {
    rows = db.all<InvestmentRow>(
      `SELECT id, type, name, ticker, exchange, sector, industry, status,
              data_source, user_id, created_at, updated_at
       FROM investments WHERE status = ?`,
      status,
    );
  } else {
    rows = db.all<InvestmentRow>(
      `SELECT id, type, name, ticker, exchange, sector, industry, status,
              data_source, user_id, created_at, updated_at
       FROM investments
       WHERE status NOT IN ('rejected', 'exited')`,
    );
  }

  return rows.map(rowToEntry);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): watchlist CRUD with pipeline stage advancement`

---

## Task 7: Score Persistence

**Files:**
- Create: `packages/core/src/screener/score-store.ts`
- Create: `packages/core/src/__tests__/screener/score-store.test.ts`

Persists calculated scores to the `scores` table and retrieves the latest score of each type per investment. Provides the `saveScore` and `getLatestScore` functions that the pipeline orchestrator will use. Includes staleness calculation (hours since `calculatedAt`).

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/screener/score-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../data/db.js';
import { saveScore, getLatestScore, listScoresForInvestment } from '../../screener/score-store.js';
import { ScoreType } from '../../models/score.js';

let db: DatabaseConnection;
const INVESTMENT_ID = 'inv-test-001';

beforeEach(() => {
  db = createDatabase(':memory:');
  // Insert a required parent investment row to satisfy the foreign key constraint.
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    INVESTMENT_ID, 'listed_stock', 'Test Co', 'screening', 'manual', 'solo-investor', now, now,
  );
});

describe('saveScore', () => {
  it('inserts a score row and returns its ID', () => {
    const id = saveScore(db, {
      investmentId: INVESTMENT_ID,
      scoreType: ScoreType.ALTMAN_Z,
      value: 3.45,
      inputs: { z: 3.45 },
      financialsVersionId: null,
      dataStalenessHours: 0,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('the saved score can be retrieved by investment and type', () => {
    saveScore(db, {
      investmentId: INVESTMENT_ID,
      scoreType: ScoreType.PIOTROSKI_F,
      value: 7,
      inputs: { f: 7 },
      financialsVersionId: null,
      dataStalenessHours: 0,
    });
    const score = getLatestScore(db, INVESTMENT_ID, ScoreType.PIOTROSKI_F);
    expect(score).toBeDefined();
    expect(score!.value).toBe(7);
  });
});

describe('getLatestScore', () => {
  it('returns the most recent score when multiple exist', () => {
    saveScore(db, { investmentId: INVESTMENT_ID, scoreType: ScoreType.ALTMAN_Z, value: 2.0, inputs: {}, financialsVersionId: null, dataStalenessHours: 0 });
    saveScore(db, { investmentId: INVESTMENT_ID, scoreType: ScoreType.ALTMAN_Z, value: 3.5, inputs: {}, financialsVersionId: null, dataStalenessHours: 0 });
    const score = getLatestScore(db, INVESTMENT_ID, ScoreType.ALTMAN_Z);
    expect(score!.value).toBe(3.5);
  });

  it('returns undefined when no score of that type exists', () => {
    expect(getLatestScore(db, INVESTMENT_ID, ScoreType.BENEISH_M)).toBeUndefined();
  });
});

describe('listScoresForInvestment', () => {
  it('returns all score types saved for an investment', () => {
    saveScore(db, { investmentId: INVESTMENT_ID, scoreType: ScoreType.ALTMAN_Z,    value: 3.5, inputs: {}, financialsVersionId: null, dataStalenessHours: 0 });
    saveScore(db, { investmentId: INVESTMENT_ID, scoreType: ScoreType.PIOTROSKI_F, value: 7,   inputs: {}, financialsVersionId: null, dataStalenessHours: 0 });
    saveScore(db, { investmentId: INVESTMENT_ID, scoreType: ScoreType.BENEISH_M,   value: -2.1,inputs: {}, financialsVersionId: null, dataStalenessHours: 0 });
    const scores = listScoresForInvestment(db, INVESTMENT_ID);
    expect(scores.map((s) => s.scoreType)).toEqual(
      expect.arrayContaining([ScoreType.ALTMAN_Z, ScoreType.PIOTROSKI_F, ScoreType.BENEISH_M])
    );
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement score-store.ts**

```typescript
// packages/core/src/screener/score-store.ts
import type { DatabaseConnection } from '../data/db.js';
import type { Score, ScoreType } from '../models/score.js';

interface ScoreRow {
  id: string;
  investment_id: string;
  score_type: string;
  value: number;
  calculated_at: string;
  inputs_json: string;
  financials_version_id: string | null;
  data_staleness_hours: number;
  stale_warning: number;
}

function rowToScore(row: ScoreRow): Score {
  return {
    id: row.id,
    investmentId: row.investment_id,
    scoreType: row.score_type as ScoreType,
    value: row.value,
    calculatedAt: new Date(row.calculated_at),
    inputsJson: JSON.parse(row.inputs_json || '{}'),
    financialsVersionId: row.financials_version_id,
    dataStalenessHours: row.data_staleness_hours,
    staleWarning: row.stale_warning === 1,
  };
}

export interface SaveScoreInput {
  investmentId: string;
  scoreType: ScoreType;
  value: number;
  inputs: Record<string, unknown>;
  financialsVersionId: string | null;
  dataStalenessHours: number;
}

/**
 * Persist a computed score to the `scores` table.
 *
 * The `staleWarning` flag is automatically set when `dataStalenessHours > 72`
 * (the decision-quality threshold from the spec).
 *
 * @param db - Active database connection.
 * @param input - Score data to save.
 * @returns The ID of the new score row.
 */
export function saveScore(db: DatabaseConnection, input: SaveScoreInput): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const staleWarning = input.dataStalenessHours > 72 ? 1 : 0;

  db.run(
    `INSERT INTO scores
       (id, investment_id, score_type, value, calculated_at, inputs_json,
        financials_version_id, data_staleness_hours, stale_warning)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.investmentId,
    input.scoreType,
    input.value,
    now,
    JSON.stringify(input.inputs),
    input.financialsVersionId,
    input.dataStalenessHours,
    staleWarning,
  );

  return id;
}

/**
 * Retrieve the most recently calculated score for a given investment and type.
 *
 * @param db - Active database connection.
 * @param investmentId - The investment to query.
 * @param scoreType - The specific score type.
 * @returns The latest {@link Score}, or `undefined` if none exists.
 */
export function getLatestScore(
  db: DatabaseConnection,
  investmentId: string,
  scoreType: ScoreType,
): Score | undefined {
  const row = db.get<ScoreRow>(
    `SELECT * FROM scores
     WHERE investment_id = ? AND score_type = ?
     ORDER BY calculated_at DESC
     LIMIT 1`,
    investmentId,
    scoreType,
  );
  return row ? rowToScore(row) : undefined;
}

/**
 * List all scores for an investment across all score types, ordered newest first.
 *
 * @param db - Active database connection.
 * @param investmentId - The investment to query.
 * @returns Array of {@link Score} objects.
 */
export function listScoresForInvestment(
  db: DatabaseConnection,
  investmentId: string,
): Score[] {
  const rows = db.all<ScoreRow>(
    `SELECT * FROM scores
     WHERE investment_id = ?
     ORDER BY calculated_at DESC`,
    investmentId,
  );
  return rows.map(rowToScore);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): score persistence store with staleness detection`

---

## Task 8: Screener Pipeline

**Files:**
- Create: `packages/core/src/screener/pipeline.ts`
- Create: `packages/core/src/__tests__/screener/pipeline.test.ts`
- Create: `packages/core/src/screener/index.ts`

The pipeline orchestrates the full screener flow for a single investment:
1. Accepts pre-fetched `Financial` records (current + prior year) and a `priceData` object (marketCap, sharePrice)
2. Calculates Z, F, M scores and composite score using the pure scoring functions
3. Calculates valuation metrics (EV/EBITDA, P/E, P/B, FCF Yield, Owner Earnings)
4. Persists all scores to the `scores` table via `score-store`
5. Constructs the rules engine context from the computed metrics
6. Runs the rules engine and returns an `EngineResult`
7. Returns a `ScreenerOutput`-compatible result

The pipeline does not fetch data itself — callers supply financials. This keeps the function pure enough to test without mocking API clients.

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/screener/pipeline.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../data/db.js';
import { runScreenerPipeline, type ScreenerPipelineInput, type ScreenerPipelineResult } from '../../screener/pipeline.js';
import type { Financial } from '../../models/financial.js';

let db: DatabaseConnection;

const INVESTMENT_ID = 'inv-pipeline-test';

beforeEach(() => {
  db = createDatabase(':memory:');
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    INVESTMENT_ID, 'listed_stock', 'Test Mining Co', 'screening', 'manual', 'solo-investor', now, now,
  );
});

function makeFinancial(overrides: Partial<Financial> = {}): Financial {
  return {
    id: 'fin-001',
    investmentId: INVESTMENT_ID,
    source: 'manual',
    period: 'annual',
    year: 2024,
    quarter: null,
    revenue: 1000,
    netIncome: 120,
    ebitda: 200,
    totalAssets: 1500,
    totalDebt: 300,
    cash: 100,
    capex: 50,
    fcf: 150,
    workingCapital: 300,
    autoUpdated: false,
    lastRefresh: null,
    apiSource: null,
    ...overrides,
  };
}

const CURRENT_FINANCIAL = makeFinancial({ id: 'fin-current', year: 2024 });
const PRIOR_FINANCIAL = makeFinancial({
  id: 'fin-prior',
  year: 2023,
  revenue: 900,
  netIncome: 100,
  ebitda: 180,
  totalAssets: 1400,
  totalDebt: 350,
  cash: 90,
  capex: 55,
  fcf: 120,
  workingCapital: 250,
});

const PRICE_DATA = {
  marketCap: 1200,
  sharePrice: 12,
  sharesOutstanding: 100,
  retainedEarnings: 400,
  totalLiabilities: 600,
  grossProfit: 450,
  sgaExpenses: 120,
  accountsReceivable: 110,
  ppAndE: 400,
  depreciation: 80,
  operatingCashFlow: 140,
  totalCurrentLiabilities: 200,
  longTermDebtCurrent: 200,
  currentAssets: 500,
  ebit: 180,
};

describe('runScreenerPipeline', () => {
  it('returns a result with scores populated', () => {
    const result = runScreenerPipeline(db, {
      investmentId: INVESTMENT_ID,
      currentFinancials: CURRENT_FINANCIAL,
      priorFinancials: PRIOR_FINANCIAL,
      priceData: PRICE_DATA,
      rules: [],
    });
    expect(result.altmanZ).toBeDefined();
    expect(result.piotroskiF).toBeDefined();
    expect(result.beneishM).toBeDefined();
    expect(result.compositeScore).toBeDefined();
  });

  it('persists all four score types to the database', () => {
    runScreenerPipeline(db, {
      investmentId: INVESTMENT_ID,
      currentFinancials: CURRENT_FINANCIAL,
      priorFinancials: PRIOR_FINANCIAL,
      priceData: PRICE_DATA,
      rules: [],
    });
    const rows = db.all<{ score_type: string }>(
      `SELECT score_type FROM scores WHERE investment_id = ?`,
      INVESTMENT_ID,
    );
    const types = rows.map((r) => r.score_type);
    expect(types).toContain('altman_z');
    expect(types).toContain('piotroski_f');
    expect(types).toContain('beneish_m');
    expect(types).toContain('composite');
  });

  it('composite score is within [0, 100]', () => {
    const result = runScreenerPipeline(db, {
      investmentId: INVESTMENT_ID,
      currentFinancials: CURRENT_FINANCIAL,
      priorFinancials: PRIOR_FINANCIAL,
      priceData: PRICE_DATA,
      rules: [],
    });
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
  });

  it('includes valuation metrics', () => {
    const result = runScreenerPipeline(db, {
      investmentId: INVESTMENT_ID,
      currentFinancials: CURRENT_FINANCIAL,
      priorFinancials: PRIOR_FINANCIAL,
      priceData: PRICE_DATA,
      rules: [],
    });
    expect(result.valuation.evEbitda).toBeDefined();
    expect(result.valuation.pe).toBeDefined();
    expect(result.valuation.pb).toBeDefined();
    expect(result.valuation.fcfYield).toBeDefined();
    expect(result.valuation.ownerEarnings).toBeDefined();
  });

  it('rules engine blocked flag is false when no rules are supplied', () => {
    const result = runScreenerPipeline(db, {
      investmentId: INVESTMENT_ID,
      currentFinancials: CURRENT_FINANCIAL,
      priorFinancials: PRIOR_FINANCIAL,
      priceData: PRICE_DATA,
      rules: [],
    });
    expect(result.engineResult.blocked).toBe(false);
  });

  it('propagates a hard gate failure from the rules engine', () => {
    const hardGateRule = {
      id: 'rule-z-check',
      name: 'Z-Score Distress Gate',
      version: 1,
      category: 'risk' as const,
      type: 'hard_gate' as const,
      sourceType: 'book' as const,
      sourceDetail: 'Altman 1968',
      description: 'Block investments in distress zone',
      conditions: [{ metric: 'altman_z', operator: 'gte' as const, value: 10, weight: 1.0 }],
      weight: 1.0,
      active: true,
      activeFrom: new Date(),
      activeTo: null,
      createdAt: new Date(),
      timesFired: 0,
      timesCorrect: 0,
      believabilityScore: 0.5,
    };
    const result = runScreenerPipeline(db, {
      investmentId: INVESTMENT_ID,
      currentFinancials: CURRENT_FINANCIAL,
      priorFinancials: PRIOR_FINANCIAL,
      priceData: PRICE_DATA,
      rules: [hardGateRule],
    });
    // Z will be well below 10 for these inputs; hard gate should fail → blocked=true
    expect(result.engineResult.blocked).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -60
```

- [ ] **Step 3: Implement pipeline.ts**

```typescript
// packages/core/src/screener/pipeline.ts
import type { DatabaseConnection } from '../data/db.js';
import type { Financial } from '../models/financial.js';
import type { Rule } from '../models/rule.js';
import type { EngineResult } from '../rules-engine/engine.js';
import { runEngine } from '../rules-engine/engine.js';
import { ScoreType } from '../models/score.js';
import {
  calculateAltmanZ,
  type AltmanZResult,
} from '../scoring/altman-z.js';
import {
  calculatePiotroskiF,
  type PiotroskiFResult,
} from '../scoring/piotroski-f.js';
import {
  calculateBeneishM,
  type BeneishMResult,
} from '../scoring/beneish-m.js';
import { calculateCompositeScore } from '../scoring/composite.js';
import {
  calculateEvEbitda,
  calculatePE,
  calculatePB,
  calculateFcfYield,
  calculateOwnerEarnings,
} from '../scoring/valuation.js';
import { saveScore } from './score-store.js';

/**
 * Supplementary market and balance sheet data that the API layer provides
 * alongside the core Financial record. These fields are not stored in the
 * `financials` table but are required for certain score calculations.
 */
export interface PriceData {
  marketCap: number;
  sharePrice: number;
  sharesOutstanding: number;
  retainedEarnings: number;
  totalLiabilities: number;
  grossProfit: number;
  sgaExpenses: number;
  accountsReceivable: number;
  ppAndE: number;
  depreciation: number;
  operatingCashFlow: number;
  totalCurrentLiabilities: number;
  longTermDebtCurrent: number;
  currentAssets: number;
  ebit: number;
}

export interface ScreenerPipelineInput {
  investmentId: string;
  currentFinancials: Financial;
  priorFinancials: Financial;
  priceData: PriceData;
  /** Active rules to run through the rules engine. Pass [] to skip rule evaluation. */
  rules: Rule[];
}

export interface ValuationMetrics {
  evEbitda: number | null;
  pe: number | null;
  pb: number | null;
  fcfYield: number | null;
  ownerEarnings: number;
}

export interface ScreenerPipelineResult {
  investmentId: string;
  altmanZ: AltmanZResult;
  piotroskiF: PiotroskiFResult;
  beneishM: BeneishMResult;
  compositeScore: number;
  valuation: ValuationMetrics;
  engineResult: EngineResult;
}

/**
 * Run the full screener pipeline for a single investment.
 *
 * Pipeline stages:
 * 1. Calculate Altman Z-Score from financials + price data
 * 2. Calculate Piotroski F-Score from current + prior year financials
 * 3. Calculate Beneish M-Score from current + prior year financials
 * 4. Calculate composite score (weighted 0.35/0.35/0.30)
 * 5. Calculate valuation metrics (EV/EBITDA, P/E, P/B, FCF Yield, Owner Earnings)
 * 6. Persist all scores to the database
 * 7. Build rules engine context from computed metrics
 * 8. Run the rules engine and return combined result
 *
 * The function is deliberately synchronous — callers handle async data
 * fetching before calling this function, keeping the pipeline testable
 * without mocking API clients.
 *
 * @param db - Active database connection for score persistence.
 * @param input - Pre-fetched financials, price data, and active rules.
 * @returns Full {@link ScreenerPipelineResult}.
 */
export function runScreenerPipeline(
  db: DatabaseConnection,
  input: ScreenerPipelineInput,
): ScreenerPipelineResult {
  const { investmentId, currentFinancials: c, priorFinancials: p, priceData: pd, rules } = input;

  // --- 1. Altman Z-Score ---
  const altmanZ = calculateAltmanZ({
    workingCapital:    c.workingCapital   ?? 0,
    totalAssets:       c.totalAssets      ?? 1,   // safe default prevents division by zero
    retainedEarnings:  pd.retainedEarnings,
    ebit:              pd.ebit,
    marketCapEquity:   pd.marketCap,
    totalLiabilities:  pd.totalLiabilities,
    revenue:           c.revenue          ?? 0,
  });

  // --- 2. Piotroski F-Score ---
  const piotroskiF = calculatePiotroskiF({
    current: {
      netIncome:             c.netIncome        ?? 0,
      operatingCashFlow:     pd.operatingCashFlow,
      totalAssets:           c.totalAssets      ?? 0,
      totalAssetsLastYear:   p.totalAssets      ?? 0,
      longTermDebt:          pd.longTermDebtCurrent,
      currentAssets:         pd.currentAssets,
      currentLiabilities:    pd.totalCurrentLiabilities,
      sharesOutstanding:     pd.sharesOutstanding,
      grossProfit:           pd.grossProfit,
      revenue:               c.revenue          ?? 0,
    },
    prior: {
      netIncome:             p.netIncome        ?? 0,
      operatingCashFlow:     pd.operatingCashFlow * 0.9, // approximation if prior OCF not available
      totalAssets:           p.totalAssets      ?? 0,
      longTermDebt:          p.totalDebt        ?? 0,
      currentAssets:         pd.currentAssets   * (p.totalAssets ?? 0) / (c.totalAssets ?? 1),
      currentLiabilities:    pd.totalCurrentLiabilities * (p.totalAssets ?? 0) / (c.totalAssets ?? 1),
      sharesOutstanding:     pd.sharesOutstanding,
      grossProfit:           pd.grossProfit * ((p.revenue ?? 0) / (c.revenue ?? 1)),
      revenue:               p.revenue          ?? 0,
    },
  });

  // --- 3. Beneish M-Score ---
  const priorRevSafe = p.revenue ?? 1;
  const curRevSafe   = c.revenue ?? 1;
  const beneishM = calculateBeneishM({
    current: {
      accountsReceivable:      pd.accountsReceivable,
      revenue:                 c.revenue            ?? 0,
      grossProfit:             pd.grossProfit,
      currentAssets:           pd.currentAssets,
      ppAndE:                  pd.ppAndE,
      totalAssets:             c.totalAssets        ?? 0,
      depreciation:            pd.depreciation,
      sgaExpenses:             pd.sgaExpenses,
      netIncome:               c.netIncome          ?? 0,
      totalCurrentLiabilities: pd.totalCurrentLiabilities,
      longTermDebt:            pd.longTermDebtCurrent,
      operatingCashFlow:       pd.operatingCashFlow,
    },
    prior: {
      accountsReceivable:      pd.accountsReceivable * (priorRevSafe / curRevSafe),
      revenue:                 p.revenue             ?? 0,
      grossProfit:             pd.grossProfit        * (priorRevSafe / curRevSafe),
      currentAssets:           pd.currentAssets      * ((p.totalAssets ?? 0) / (c.totalAssets ?? 1)),
      ppAndE:                  pd.ppAndE             * 0.9,
      totalAssets:             p.totalAssets         ?? 0,
      depreciation:            pd.depreciation       * 0.9,
      sgaExpenses:             pd.sgaExpenses        * (priorRevSafe / curRevSafe),
      netIncome:               p.netIncome           ?? 0,
      totalCurrentLiabilities: pd.totalCurrentLiabilities * ((p.totalAssets ?? 0) / (c.totalAssets ?? 1)),
      longTermDebt:            p.totalDebt           ?? 0,
    },
  });

  // --- 4. Composite Score ---
  const compositeScore = calculateCompositeScore({
    z: altmanZ.z,
    f: piotroskiF.score,
    m: beneishM.mScore,
  });

  // --- 5. Valuation Metrics ---
  const valuationInputs = {
    marketCap:        pd.marketCap,
    totalDebt:        c.totalDebt          ?? 0,
    cash:             c.cash               ?? 0,
    ebitda:           c.ebitda             ?? 0,
    netIncome:        c.netIncome          ?? 0,
    sharesOutstanding: pd.sharesOutstanding,
    sharePrice:       pd.sharePrice,
    totalAssets:      c.totalAssets        ?? 0,
    totalLiabilities: pd.totalLiabilities,
    fcf:              c.fcf                ?? 0,
    depreciation:     pd.depreciation,
    capex:            c.capex              ?? 0,
  };

  const evEbitda = (() => {
    try { return calculateEvEbitda(valuationInputs); } catch { return null; }
  })();
  const pe = (() => {
    try { return calculatePE(valuationInputs); } catch { return null; }
  })();
  const pb = (() => {
    try { return calculatePB(valuationInputs); } catch { return null; }
  })();
  const fcfYield = (() => {
    try { return calculateFcfYield(valuationInputs); } catch { return null; }
  })();
  const ownerEarnings = calculateOwnerEarnings(valuationInputs);

  const valuation: ValuationMetrics = { evEbitda, pe, pb, fcfYield, ownerEarnings };

  // --- 6. Persist Scores ---
  saveScore(db, { investmentId, scoreType: ScoreType.ALTMAN_Z,    value: altmanZ.z,          inputs: { ...altmanZ.components, zone: altmanZ.zone }, financialsVersionId: c.id, dataStalenessHours: 0 });
  saveScore(db, { investmentId, scoreType: ScoreType.PIOTROSKI_F, value: piotroskiF.score,    inputs: { signals: piotroskiF.signals }, financialsVersionId: c.id, dataStalenessHours: 0 });
  saveScore(db, { investmentId, scoreType: ScoreType.BENEISH_M,   value: beneishM.mScore,     inputs: { indices: beneishM.indices, flag: beneishM.manipulationFlag }, financialsVersionId: c.id, dataStalenessHours: 0 });
  saveScore(db, { investmentId, scoreType: ScoreType.COMPOSITE,   value: compositeScore,      inputs: { z: altmanZ.z, f: piotroskiF.score, m: beneishM.mScore }, financialsVersionId: c.id, dataStalenessHours: 0 });

  // --- 7. Build Rules Engine Context ---
  const engineContext: Record<string, number> = {
    altman_z:       altmanZ.z,
    piotroski_f:    piotroskiF.score,
    beneish_m:      beneishM.mScore,
    composite:      compositeScore,
    ev_ebitda:      evEbitda  ?? 0,
    pe:             pe        ?? 0,
    pb:             pb        ?? 0,
    fcf_yield:      fcfYield  ?? 0,
    owner_earnings: ownerEarnings,
    debt_ebitda:    (c.ebitda ?? 0) !== 0 ? (c.totalDebt ?? 0) / (c.ebitda ?? 1) : 0,
    capex_intensity: (c.revenue ?? 0) !== 0 ? (c.capex ?? 0) / (c.revenue ?? 1) : 0,
  };

  // --- 8. Run Rules Engine ---
  const engineResult = runEngine(rules, engineContext);

  return {
    investmentId,
    altmanZ,
    piotroskiF,
    beneishM,
    compositeScore,
    valuation,
    engineResult,
  };
}
```

- [ ] **Step 4: Create screener/index.ts barrel**

```typescript
// packages/core/src/screener/index.ts
export * from './pipeline.js';
export * from './watchlist.js';
export * from './score-store.js';
export * from './super-investor-store.js';
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): screener pipeline orchestrating scoring, rules engine, and persistence`

---

## Task 9: Update Core Package Exports and Run Full Test Suite

**Files:**
- Modify: `packages/core/src/index.ts`

Wire the new `scoring/` and `screener/` modules into the core package's public API, run the full test suite, and confirm all tests pass.

- [ ] **Step 1: Update src/index.ts**

```typescript
// Add to the bottom of packages/core/src/index.ts
export * from './scoring/index.js';
export * from './screener/index.js';
```

- [ ] **Step 2: Verify the existing index.ts before editing**

Read `packages/core/src/index.ts` first to understand what is already exported, then append the two new export lines without removing anything.

- [ ] **Step 3: Run the full test suite**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

All tests across Phase 1, Phase 2, and Phase 3 should pass. Fix any type errors surfaced by the new strict exports before committing.

- [ ] **Step 4: Type-check the entire core package**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core exec tsc --noEmit
```

- [ ] **Step 5: Verify test count**

The combined test suite should include at minimum:
- 5 test files from Phase 1
- 7 test files from Phase 2
- 8 test files from Phase 3 (5 scoring + 3 screener)

**Commit:** `feat(core): export scoring and screener modules from core public API`

---

## Summary

| Task | Module | Key Deliverable |
|------|--------|-----------------|
| 1 | `scoring/altman-z.ts` | Pure Z-Score calculator, zone interpretation |
| 2 | `scoring/piotroski-f.ts` | Pure F-Score with 9 binary signals |
| 3 | `scoring/beneish-m.ts` | Pure M-Score with 8 manipulation indices |
| 4 | `scoring/composite.ts` + `scoring/valuation.ts` | Composite 0-100 score + EV/EBITDA, P/E, P/B, FCF Yield, Owner Earnings |
| 5 | `screener/super-investor-store.ts` | Upsert positions, threshold-based convergence query |
| 6 | `screener/watchlist.ts` | Add/remove investments, pipeline status advancement |
| 7 | `screener/score-store.ts` | Persist and retrieve scores with staleness detection |
| 8 | `screener/pipeline.ts` | Full orchestration: financials → scores → rules → result |
| 9 | `src/index.ts` | Public API wiring + full suite green |

**Design decisions carried through this phase:**

- **Pure scoring functions** — all calculators in `scoring/` are pure (inputs → output, no side effects). This makes them trivially testable and reusable in the Distress Radar (Phase 4) without coupling to the database.
- **Pipeline takes pre-fetched data** — `runScreenerPipeline` is synchronous and accepts already-fetched `Financial` objects. Async API fetching stays in the caller (CLI or Electron app), keeping the core function deterministic and fast to test.
- **Graceful valuation fallbacks** — EV/EBITDA, P/E, and P/B can throw for degenerate inputs (zero denominators). The pipeline wraps these in try/catch and stores `null`, so a single missing metric does not abort the entire screen.
- **Staleness flag at 72 hours** — matches the spec's decision-quality threshold; scores saved from data older than 72 hours carry `staleWarning: true`.
- **Watchlist is a view, not a separate table** — the `investments` table is the source of truth; status drives pipeline position. Soft-delete to `rejected` preserves audit history.
