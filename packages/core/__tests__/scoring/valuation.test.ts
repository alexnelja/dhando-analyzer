import { describe, it, expect } from 'vitest';
import {
  calculateEvEbitda,
  calculatePE,
  calculatePB,
  calculateFcfYield,
  calculateOwnerEarnings,
  type ValuationInputs,
} from '../../src/scoring/valuation.js';

// ---------------------------------------------------------------------------
// Base fixture — all values are hand-verified in the test assertions below.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------

describe('calculateEvEbitda', () => {
  it('computes EV/EBITDA correctly', () => {
    // EV = 1000 + 300 - 100 = 1200; EV/EBITDA = 1200/200 = 6.0
    expect(calculateEvEbitda(BASE)).toBeCloseTo(6.0, 4);
  });

  it('handles negative EBITDA (debt-laden company)', () => {
    // Negative EBITDA is not zero, so should compute without throwing.
    const result = calculateEvEbitda({ ...BASE, ebitda: -50 });
    expect(result).toBeLessThan(0);
  });

  it('includes cash in EV calculation (higher cash → lower EV)', () => {
    const highCash = calculateEvEbitda({ ...BASE, cash: 900 });
    const lowCash = calculateEvEbitda({ ...BASE, cash: 0 });
    expect(highCash).toBeLessThan(lowCash);
  });

  it('throws when ebitda is zero', () => {
    expect(() => calculateEvEbitda({ ...BASE, ebitda: 0 })).toThrow('EBITDA must not be zero');
  });

  it('accepts negative EV (cash-rich company where cash > market cap + debt)', () => {
    // Should not throw — negative EV is a valid (unusual) result.
    expect(() =>
      calculateEvEbitda({ ...BASE, cash: 2000, marketCap: 100, totalDebt: 50 }),
    ).not.toThrow();
  });
});

describe('calculatePE', () => {
  it('computes P/E correctly', () => {
    // EPS = 120/100 = 1.2; P/E = 10/1.2 = 8.333...
    expect(calculatePE(BASE)).toBeCloseTo(8.333, 2);
  });

  it('throws when netIncome is zero', () => {
    expect(() => calculatePE({ ...BASE, netIncome: 0 })).toThrow('net income must be positive');
  });

  it('throws when netIncome is negative (loss-making)', () => {
    expect(() => calculatePE({ ...BASE, netIncome: -10 })).toThrow('net income must be positive');
  });

  it('increases when share price rises with same earnings', () => {
    const lowPrice = calculatePE({ ...BASE, sharePrice: 5 });
    const highPrice = calculatePE({ ...BASE, sharePrice: 20 });
    expect(highPrice).toBeGreaterThan(lowPrice);
  });

  it('decreases as earnings per share increase', () => {
    const lowEPS = calculatePE({ ...BASE, netIncome: 50 });
    const highEPS = calculatePE({ ...BASE, netIncome: 500 });
    expect(highEPS).toBeLessThan(lowEPS);
  });
});

describe('calculatePB', () => {
  it('computes P/B correctly', () => {
    // Book value = 1500 - 600 = 900; BV per share = 900/100 = 9.0; P/B = 10/9 ≈ 1.111
    expect(calculatePB(BASE)).toBeCloseTo(1.111, 2);
  });

  it('throws when book value per share is zero (total assets = total liabilities)', () => {
    expect(() => calculatePB({ ...BASE, totalAssets: 600, totalLiabilities: 600 })).toThrow(
      'book value per share must be positive',
    );
  });

  it('throws when book value per share is negative (insolvent)', () => {
    expect(() => calculatePB({ ...BASE, totalAssets: 400, totalLiabilities: 600 })).toThrow(
      'book value per share must be positive',
    );
  });

  it('returns P/B > 1 when price exceeds book value per share', () => {
    expect(calculatePB(BASE)).toBeGreaterThan(1);
  });

  it('returns P/B < 1 when trading below book (deep value)', () => {
    const result = calculatePB({ ...BASE, sharePrice: 5 });
    expect(result).toBeLessThan(1);
  });
});

describe('calculateFcfYield', () => {
  it('computes FCF Yield correctly', () => {
    // FCF Yield = 150/1000 = 0.15 = 15%
    expect(calculateFcfYield(BASE)).toBeCloseTo(0.15, 4);
  });

  it('returns a negative yield when FCF is negative', () => {
    expect(calculateFcfYield({ ...BASE, fcf: -50 })).toBeLessThan(0);
  });

  it('throws when marketCap is zero', () => {
    expect(() => calculateFcfYield({ ...BASE, marketCap: 0 })).toThrow(
      'market cap must not be zero',
    );
  });

  it('increases as FCF increases with the same market cap', () => {
    const low = calculateFcfYield({ ...BASE, fcf: 50 });
    const high = calculateFcfYield({ ...BASE, fcf: 200 });
    expect(high).toBeGreaterThan(low);
  });
});

describe('calculateOwnerEarnings', () => {
  it('computes Owner Earnings = net income + depreciation - capex', () => {
    // 120 + 80 - 50 = 150
    expect(calculateOwnerEarnings(BASE)).toBeCloseTo(150, 4);
  });

  it('can return negative when capex exceeds income + depreciation', () => {
    const result = calculateOwnerEarnings({ ...BASE, capex: 300 });
    // 120 + 80 - 300 = -100
    expect(result).toBeCloseTo(-100, 4);
  });

  it('equals net income when depreciation = capex', () => {
    const result = calculateOwnerEarnings({ ...BASE, depreciation: 80, capex: 80 });
    expect(result).toBeCloseTo(BASE.netIncome, 4);
  });

  it('exceeds net income when depreciation > capex', () => {
    const result = calculateOwnerEarnings({ ...BASE, depreciation: 200, capex: 50 });
    expect(result).toBeGreaterThan(BASE.netIncome);
  });

  it('is never affected by market price (pure earnings metric)', () => {
    const result1 = calculateOwnerEarnings(BASE);
    const result2 = calculateOwnerEarnings({ ...BASE, sharePrice: 9999, marketCap: 9999 });
    expect(result1).toBe(result2);
  });
});
