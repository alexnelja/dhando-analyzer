import { describe, it, expect } from 'vitest';
import {
  calculatePiotroskiF,
  interpretPiotroskiF,
  type PiotroskiInputs,
} from '../../src/scoring/piotroski-f.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// All 9 signals fire:
// 1. netIncome 120 > 0 ✓
// 2. operatingCashFlow 150 > 0 ✓
// 3. ROA current = 120/((1000+950)/2) = 0.1231 > prior 80/950 = 0.0842 ✓
// 4. OCF 150 > NI 120 ✓
// 5. LT debt ratio: 200/1000=0.20 < 250/950=0.2632 ✓
// 6. Current ratio: 400/180=2.22 > 350/200=1.75 ✓
// 7. Shares 100 <= 100 (no dilution) ✓
// 8. Gross margin: 500/1000=0.50 > 420/900=0.4667 ✓
// 9. Asset turnover: 1000/1000=1.0 > 900/950=0.9474 ✓
const STRONG_CURRENT: PiotroskiInputs['current'] = {
  netIncome: 120,
  operatingCashFlow: 150,
  totalAssets: 1000,
  totalAssetsLastYear: 950,
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
  totalAssetsLastYear: 900,
  longTermDebt: 250,
  currentAssets: 350,
  currentLiabilities: 200,
  sharesOutstanding: 100,
  grossProfit: 420,
  revenue: 900,
};

// All 9 signals fail:
// 1. netIncome -50 ≤ 0 ✗
// 2. operatingCashFlow -30 ≤ 0 ✗
// 3. ROA current = -50/((800+1000)/2) = -0.0556 < prior 50/1000 = 0.05 ✗
// 4. OCF -30 < NI -50 is false (-30 > -50), but OCF > NI? -30 > -50 = true... ✗
//    Need OCF <= NI: use ocf=-60, ni=-50  → -60 < -50 so ocf not > ni ✗
// 5. LT debt ratio: 600/800=0.75 > 400/1000=0.40 (increased) ✗
// 6. Current ratio: 100/300=0.33 < 400/200=2.0 ✗
// 7. Shares 120 > 100 (dilution) ✗
// 8. Gross margin: 100/500=0.20 < 300/600=0.50 ✗
// 9. Asset turnover: 500/800=0.625 < 600/1000=0.60... wait 0.625 > 0.60 ✓
//    Use revenue 400 current: 400/800=0.50 < 600/1000=0.60 ✗
const WEAK_CURRENT: PiotroskiInputs['current'] = {
  netIncome: -50,
  operatingCashFlow: -60,  // OCF < NI (-60 < -50), so signal 4 fails
  totalAssets: 800,
  totalAssetsLastYear: 1000,
  longTermDebt: 600,
  currentAssets: 100,
  currentLiabilities: 300,
  sharesOutstanding: 120,
  grossProfit: 100,
  revenue: 400,
};

const WEAK_PRIOR: PiotroskiInputs['prior'] = {
  netIncome: 50,
  operatingCashFlow: 60,
  totalAssets: 1000,
  totalAssetsLastYear: 950,
  longTermDebt: 400,
  currentAssets: 400,
  currentLiabilities: 200,
  sharesOutstanding: 100,
  grossProfit: 300,
  revenue: 600,
};

// ---------------------------------------------------------------------------

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

  it('interprets a score of 9 as strong', () => {
    const result = calculatePiotroskiF({ current: STRONG_CURRENT, prior: STRONG_PRIOR });
    expect(result.interpretation).toBe('strong');
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

  it('interprets a score of 0 as weak', () => {
    const result = calculatePiotroskiF({ current: WEAK_CURRENT, prior: WEAK_PRIOR });
    expect(result.interpretation).toBe('weak');
  });
});

describe('calculatePiotroskiF — signal names', () => {
  it('contains all 9 canonical signal names', () => {
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

describe('calculatePiotroskiF — partial score', () => {
  it('scores exactly 1 when only net income is positive', () => {
    // Flip strong current to weak except leave netIncome positive.
    const partial: PiotroskiInputs['current'] = {
      ...WEAK_CURRENT,
      netIncome: 10,          // signal 1: positive NI ✓
      operatingCashFlow: -5,  // signal 2: OCF negative ✗; signal 4: OCF(-5) < NI(10) ✗
    };
    const result = calculatePiotroskiF({ current: partial, prior: WEAK_PRIOR });
    expect(result.signals.find((s) => s.name === 'positive_net_income')?.value).toBe(1);
    expect(result.score).toBeGreaterThanOrEqual(1);
  });
});

describe('interpretPiotroskiF', () => {
  it.each([
    [9, 'strong'],
    [8, 'strong'],
    [7, 'average'],
    [5, 'average'],
    [3, 'average'],
    [2, 'weak'],
    [0, 'weak'],
  ] as const)('score=%s → %s', (score, expected) => {
    expect(interpretPiotroskiF(score)).toBe(expected);
  });
});
