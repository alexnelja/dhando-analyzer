import { describe, it, expect } from 'vitest';
import {
  calculateBeneishM,
  interpretBeneishM,
  type BeneishInputs,
} from '../../src/scoring/beneish-m.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Clean company — all indices near 1.0, TATA near zero (cash-based income).
const CLEAN_CURRENT: BeneishInputs['current'] = {
  accountsReceivable: 100,
  revenue: 1000,
  grossProfit: 400,
  currentAssets: 500,
  ppAndE: 300,
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

// Manipulator — receivables spiking vs revenue, margins collapsing, high accruals.
// DSRI = (300/1100) / (100/1000) = 0.2727 / 0.10 = 2.727 (large — AR growing 3× faster)
// GMI = (420/1000) / (250/1100) = 0.42 / 0.2273 = 1.848 (prior margins >> current)
// TATA = (150 - 20) / 1200 = 130/1200 = 0.1083 (large positive accruals)
// These three alone will push M well above -1.78.
const MANIP_CURRENT: BeneishInputs['current'] = {
  accountsReceivable: 300,
  revenue: 1100,
  grossProfit: 250,
  currentAssets: 700,
  ppAndE: 500,
  totalAssets: 1200,
  depreciation: 30,
  sgaExpenses: 200,
  netIncome: 150,
  totalCurrentLiabilities: 350,
  longTermDebt: 400,
  operatingCashFlow: 20,
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

// ---------------------------------------------------------------------------

describe('calculateBeneishM — clean company', () => {
  it('returns M-Score below -1.78 (unlikely manipulator)', () => {
    const result = calculateBeneishM({ current: CLEAN_CURRENT, prior: CLEAN_PRIOR });
    expect(result.mScore).toBeLessThan(-1.78);
  });

  it('sets manipulationFlag to false', () => {
    const result = calculateBeneishM({ current: CLEAN_CURRENT, prior: CLEAN_PRIOR });
    expect(result.manipulationFlag).toBe(false);
  });

  it('includes all 8 index components', () => {
    const result = calculateBeneishM({ current: CLEAN_CURRENT, prior: CLEAN_PRIOR });
    expect(Object.keys(result.indices)).toEqual(
      expect.arrayContaining(['DSRI', 'GMI', 'AQI', 'SGI', 'DEPI', 'SGAI', 'TATA', 'LVGI']),
    );
  });

  it('DSRI is close to 1.0 when receivables grow proportionally with revenue', () => {
    const result = calculateBeneishM({ current: CLEAN_CURRENT, prior: CLEAN_PRIOR });
    // AR/Rev current = 100/1000 = 0.10; prior = 95/950 = 0.10 → DSRI ≈ 1.0
    expect(result.indices.DSRI).toBeCloseTo(1.0, 1);
  });
});

describe('calculateBeneishM — manipulator', () => {
  it('returns M-Score above -1.78 (likely manipulator)', () => {
    const result = calculateBeneishM({ current: MANIP_CURRENT, prior: MANIP_PRIOR });
    expect(result.mScore).toBeGreaterThan(-1.78);
  });

  it('sets manipulationFlag to true', () => {
    const result = calculateBeneishM({ current: MANIP_CURRENT, prior: MANIP_PRIOR });
    expect(result.manipulationFlag).toBe(true);
  });

  it('DSRI > 1 when receivables grow faster than revenue', () => {
    const result = calculateBeneishM({ current: MANIP_CURRENT, prior: MANIP_PRIOR });
    // AR/Rev: 300/1100=0.2727 vs 100/1000=0.10 → DSRI = 2.727
    expect(result.indices.DSRI).toBeGreaterThan(1);
    expect(result.indices.DSRI).toBeCloseTo(2.727, 2);
  });

  it('TATA is large and positive (high accruals)', () => {
    const result = calculateBeneishM({ current: MANIP_CURRENT, prior: MANIP_PRIOR });
    // TATA = (150 - 20) / 1200 = 0.1083
    expect(result.indices.TATA).toBeCloseTo(0.1083, 3);
  });
});

describe('calculateBeneishM — zero denominator safety', () => {
  it('does not throw when prior revenue is zero (DSRI falls back to 0)', () => {
    expect(() =>
      calculateBeneishM({
        current: CLEAN_CURRENT,
        prior: { ...CLEAN_PRIOR, revenue: 0 },
      }),
    ).not.toThrow();
  });

  it('does not throw when current totalAssets is zero', () => {
    expect(() =>
      calculateBeneishM({
        current: { ...CLEAN_CURRENT, totalAssets: 0 },
        prior: CLEAN_PRIOR,
      }),
    ).not.toThrow();
  });
});

describe('interpretBeneishM', () => {
  it.each([
    [-2.5, false, 'unlikely_manipulator'],
    [-1.78, false, 'unlikely_manipulator'], // exactly -1.78 is NOT flagged (> is strict)
    [-1.77, true, 'likely_manipulator'],
    [0, true, 'likely_manipulator'],
    [1.5, true, 'likely_manipulator'],
  ] as const)('M=%s → flag=%s, label=%s', (m, flag, label) => {
    const r = interpretBeneishM(m);
    expect(r.manipulationFlag).toBe(flag);
    expect(r.label).toBe(label);
  });
});
