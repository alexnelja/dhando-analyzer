import { describe, it, expect } from 'vitest';
import { calculateKelly, portfolioKelly, type KellyInput } from '../../src/deal-analyzer/kelly.js';

// ---------------------------------------------------------------------------
// Reference fixtures — hand-verified using investment-form Kelly.
//
// Investment Kelly: f* = (W*b - q) / b   where b = B/A, q = 1-W
//
// Standard case: W=0.6, A=0.20 (loss), B=0.50 (gain)
//   b = 0.50/0.20 = 2.5
//   f* = (0.6*2.5 - 0.4) / 2.5 = (1.5 - 0.4) / 2.5 = 0.44
//   halfKelly = 0.22
//
// Small edge: W=0.45, A=0.20, B=0.30
//   b = 0.30/0.20 = 1.5
//   f* = (0.45*1.5 - 0.55) / 1.5 = (0.675 - 0.55) / 1.5 = 0.0833
//   halfKelly = 0.0417
//
// No-edge case: W=0.20, A=0.30, B=0.40
//   break-even W_be = 0.30/(0.30+0.40) = 0.4286; W=0.20 < 0.4286 → f*=0
//
// Balanced: W=0.50, A=0.20, B=0.20
//   b = 1.0; f* = (0.50 - 0.50) / 1.0 = 0 → no edge
// ---------------------------------------------------------------------------

describe('calculateKelly — standard case (W=0.6, A=0.20, B=0.50)', () => {
  const input: KellyInput = { winProbability: 0.6, gainFraction: 0.5, lossFraction: 0.2 };

  it('fullKelly ≈ 0.44', () => {
    expect(calculateKelly(input).fullKelly).toBeCloseTo(0.44, 2);
  });

  it('halfKelly ≈ 0.22', () => {
    expect(calculateKelly(input).halfKelly).toBeCloseTo(0.22, 2);
  });

  it('hasEdge is true', () => {
    expect(calculateKelly(input).hasEdge).toBe(true);
  });

  it('stalePenalty is false when no staleness argument provided', () => {
    expect(calculateKelly(input).stalePenalty).toBe(false);
  });
});

describe('calculateKelly — small positive edge (W=0.45, A=0.20, B=0.30)', () => {
  const input: KellyInput = { winProbability: 0.45, gainFraction: 0.30, lossFraction: 0.20 };

  it('fullKelly ≈ 0.0833', () => {
    expect(calculateKelly(input).fullKelly).toBeCloseTo(0.0833, 3);
  });

  it('halfKelly ≈ 0.0417', () => {
    expect(calculateKelly(input).halfKelly).toBeCloseTo(0.0417, 3);
  });

  it('hasEdge is true', () => {
    expect(calculateKelly(input).hasEdge).toBe(true);
  });
});

describe('calculateKelly — no edge (W=0.20, A=0.30, B=0.40)', () => {
  const input: KellyInput = { winProbability: 0.20, gainFraction: 0.40, lossFraction: 0.30 };

  it('fullKelly is 0', () => {
    expect(calculateKelly(input).fullKelly).toBe(0);
  });

  it('halfKelly is 0', () => {
    expect(calculateKelly(input).halfKelly).toBe(0);
  });

  it('hasEdge is false', () => {
    expect(calculateKelly(input).hasEdge).toBe(false);
  });
});

describe('calculateKelly — stale data penalty (> 72 hours)', () => {
  const input: KellyInput = { winProbability: 0.45, gainFraction: 0.30, lossFraction: 0.20 };

  it('stalePenalty is true when dataStalenessHours > 72', () => {
    expect(calculateKelly(input, 96).stalePenalty).toBe(true);
  });

  it('halfKelly is reduced by 0.8× when stale', () => {
    const base = calculateKelly(input);
    const stale = calculateKelly(input, 96);
    expect(stale.halfKelly).toBeCloseTo(base.halfKelly * 0.8, 6);
  });

  it('stalePenalty is false when dataStalenessHours = 72 (boundary is strictly > 72)', () => {
    expect(calculateKelly(input, 72).stalePenalty).toBe(false);
  });

  it('stalePenalty is true when dataStalenessHours = 73', () => {
    expect(calculateKelly(input, 73).stalePenalty).toBe(true);
  });
});

describe('calculateKelly — validation errors', () => {
  it('throws when lossFraction is 0', () => {
    expect(() =>
      calculateKelly({ winProbability: 0.6, gainFraction: 0.3, lossFraction: 0 }),
    ).toThrow(/lossFraction must be greater than 0/);
  });

  it('throws when gainFraction is 0', () => {
    expect(() =>
      calculateKelly({ winProbability: 0.6, gainFraction: 0, lossFraction: 0.2 }),
    ).toThrow(/gainFraction must be greater than 0/);
  });

  it('throws when winProbability > 1', () => {
    expect(() =>
      calculateKelly({ winProbability: 1.1, gainFraction: 0.3, lossFraction: 0.2 }),
    ).toThrow(/winProbability must be between 0 and 1/);
  });

  it('throws when winProbability < 0', () => {
    expect(() =>
      calculateKelly({ winProbability: -0.1, gainFraction: 0.3, lossFraction: 0.2 }),
    ).toThrow(/winProbability must be between 0 and 1/);
  });
});

// ---------------------------------------------------------------------------
// portfolioKelly
// ---------------------------------------------------------------------------

describe('portfolioKelly — sum capping', () => {
  it('returns empty array for empty input', () => {
    expect(portfolioKelly([])).toEqual([]);
  });

  it('does not scale when sum ≤ 1.0', () => {
    const positions = [
      { kelly: 0.2, correlation: 0 },
      { kelly: 0.3, correlation: 0 },
    ];
    const result = portfolioKelly(positions);
    expect(result[0]).toBeCloseTo(0.2, 6);
    expect(result[1]).toBeCloseTo(0.3, 6);
  });

  it('scales all positions down proportionally when sum > 1.0', () => {
    const positions = [
      { kelly: 0.4, correlation: 0 },
      { kelly: 0.4, correlation: 0 },
      { kelly: 0.4, correlation: 0 },
    ];
    const result = portfolioKelly(positions);
    const total = result.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 6);
    // All equal inputs → all equal outputs.
    expect(result[0]).toBeCloseTo(result[1], 6);
    expect(result[1]).toBeCloseTo(result[2], 6);
  });
});

describe('portfolioKelly — correlated positions', () => {
  it('reduces allocations when correlation > 0.5', () => {
    const highCorr = [
      { kelly: 0.3, correlation: 0.8 },
      { kelly: 0.3, correlation: 0.8 },
    ];
    const lowCorr = [
      { kelly: 0.3, correlation: 0.0 },
      { kelly: 0.3, correlation: 0.0 },
    ];
    const highResult = portfolioKelly(highCorr);
    const lowResult = portfolioKelly(lowCorr);
    // Correlated allocations should be smaller than uncorrelated.
    expect(highResult[0]).toBeLessThan(lowResult[0]);
    expect(highResult[1]).toBeLessThan(lowResult[1]);
  });

  it('applies (1 - corr * 0.5) reduction factor', () => {
    const positions = [{ kelly: 0.4, correlation: 0.8 }];
    const result = portfolioKelly(positions);
    // reduction = 1 - 0.8 * 0.5 = 0.60; adjusted = 0.4 * 0.60 = 0.24 (sum ≤ 1 so no scaling)
    expect(result[0]).toBeCloseTo(0.24, 6);
  });
});
