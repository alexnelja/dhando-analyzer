import { describe, it, expect } from 'vitest';
import { calculateDcf, calculateWacc, type DcfInput } from '../../src/deal-analyzer/dcf.js';

// ---------------------------------------------------------------------------
// Reference fixtures — hand-verified.
//
// BASE_INPUT:
//   ownerEarnings=100, growthRate=0.08, terminalGrowthRate=0.03,
//   discountRate=0.10, projectionYears=5
//
// Explicit period (years 1–5):
//   y1: cf=108.00,  pv=98.1818
//   y2: cf=116.64,  pv=96.3967
//   y3: cf=125.97,  pv=94.6440
//   y4: cf=136.05,  pv=92.9232
//   y5: cf=146.93,  pv=91.2337
//   explicitPeriodValue ≈ 473.3795
//
// Terminal value:
//   finalEarnings = 100 * 1.08^5 = 146.9328
//   tvEnd = 146.9328 * 1.03 / (0.10 - 0.03) = 2161.2519
//   tvPV  = 2161.2519 / 1.10^5 ≈ 1342.4389
//
// intrinsicValue ≈ 473.3795 + 1342.4389 = 1815.8184
//
// WACC:
//   E/V=0.70, D/V=0.30, Re=0.12, Rd=0.05, T=0.25
//   WACC = 0.70*0.12 + 0.30*0.05*(1−0.25) = 0.084 + 0.01125 = 0.09525
//
// Margin of safety at currentPrice=800:
//   MOS = (1815.8184 − 800) / 1815.8184 ≈ 0.5594
// ---------------------------------------------------------------------------

const BASE_INPUT: DcfInput = {
  ownerEarnings: 100,
  growthRate: 0.08,
  terminalGrowthRate: 0.03,
  discountRate: 0.10,
  projectionYears: 5,
};

describe('calculateDcf — known inputs', () => {
  it('explicitPeriodValue ≈ 473.38', () => {
    const result = calculateDcf(BASE_INPUT);
    expect(result.explicitPeriodValue).toBeCloseTo(473.3795, 2);
  });

  it('terminalValue ≈ 1342.44', () => {
    const result = calculateDcf(BASE_INPUT);
    expect(result.terminalValue).toBeCloseTo(1342.4389, 2);
  });

  it('intrinsicValue ≈ 1815.82', () => {
    const result = calculateDcf(BASE_INPUT);
    expect(result.intrinsicValue).toBeCloseTo(1815.8184, 1);
  });

  it('intrinsicValue = explicitPeriodValue + terminalValue', () => {
    const result = calculateDcf(BASE_INPUT);
    expect(result.intrinsicValue).toBeCloseTo(
      result.explicitPeriodValue + result.terminalValue,
      8,
    );
  });

  it('marginOfSafety is null when no currentPrice provided', () => {
    expect(calculateDcf(BASE_INPUT).marginOfSafety).toBeNull();
  });
});

describe('calculateDcf — yearly flows', () => {
  it('returns exactly projectionYears entries in yearlyFlows', () => {
    const result = calculateDcf(BASE_INPUT);
    expect(result.yearlyFlows).toHaveLength(5);
  });

  it('year-1 cashFlow ≈ 108.00', () => {
    const result = calculateDcf(BASE_INPUT);
    expect(result.yearlyFlows[0].cashFlow).toBeCloseTo(108.0, 4);
  });

  it('year-1 discounted ≈ 98.18', () => {
    const result = calculateDcf(BASE_INPUT);
    expect(result.yearlyFlows[0].discounted).toBeCloseTo(98.1818, 3);
  });

  it('year-5 cashFlow ≈ 146.93', () => {
    const result = calculateDcf(BASE_INPUT);
    expect(result.yearlyFlows[4].cashFlow).toBeCloseTo(146.9328, 3);
  });

  it('sum of discounted flows equals explicitPeriodValue', () => {
    const result = calculateDcf(BASE_INPUT);
    const sum = result.yearlyFlows.reduce((acc, f) => acc + f.discounted, 0);
    expect(sum).toBeCloseTo(result.explicitPeriodValue, 6);
  });

  it('year labels are 1-indexed', () => {
    const result = calculateDcf(BASE_INPUT);
    expect(result.yearlyFlows.map((f) => f.year)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('calculateDcf — margin of safety', () => {
  it('marginOfSafety ≈ 0.5594 at currentPrice=800', () => {
    const result = calculateDcf(BASE_INPUT, 800);
    expect(result.marginOfSafety).not.toBeNull();
    expect(result.marginOfSafety!).toBeCloseTo(0.5594, 3);
  });

  it('marginOfSafety is negative when currentPrice > intrinsicValue', () => {
    const result = calculateDcf(BASE_INPUT, 2000);
    expect(result.marginOfSafety).not.toBeNull();
    expect(result.marginOfSafety!).toBeLessThan(0);
  });

  it('marginOfSafety = 0 when currentPrice = intrinsicValue', () => {
    const iv = calculateDcf(BASE_INPUT).intrinsicValue;
    const result = calculateDcf(BASE_INPUT, iv);
    expect(result.marginOfSafety!).toBeCloseTo(0, 8);
  });
});

describe('calculateDcf — validation errors', () => {
  it('throws when discountRate equals terminalGrowthRate', () => {
    expect(() =>
      calculateDcf({ ...BASE_INPUT, discountRate: 0.03, terminalGrowthRate: 0.03 }),
    ).toThrow(/discountRate.*must be greater than terminalGrowthRate/);
  });

  it('throws when discountRate < terminalGrowthRate', () => {
    expect(() =>
      calculateDcf({ ...BASE_INPUT, discountRate: 0.02, terminalGrowthRate: 0.03 }),
    ).toThrow(/discountRate.*must be greater than terminalGrowthRate/);
  });

  it('throws when growthRate > 1', () => {
    expect(() => calculateDcf({ ...BASE_INPUT, growthRate: 1.5 })).toThrow(
      /growthRate.*between 0 and 1/,
    );
  });

  it('throws when discountRate > 1', () => {
    expect(() => calculateDcf({ ...BASE_INPUT, discountRate: 1.5 })).toThrow(
      /discountRate.*between 0 and 1/,
    );
  });
});

// ---------------------------------------------------------------------------
// calculateWacc
// ---------------------------------------------------------------------------

describe('calculateWacc', () => {
  it.each([
    // [E/V, D/V, Re, Rd, T, expected]
    [0.70, 0.30, 0.12, 0.05, 0.25, 0.09525],
    [1.00, 0.00, 0.10, 0.05, 0.30, 0.10000],  // all-equity firm
    [0.50, 0.50, 0.12, 0.06, 0.21, 0.08370],  // 0.5*0.12 + 0.5*0.06*0.79
    [0.60, 0.40, 0.15, 0.07, 0.30, 0.10960],  // 0.6*0.15 + 0.4*0.07*0.70
  ] as const)(
    'WACC(%s, %s, %s, %s, %s) ≈ %s',
    (eW, dW, re, rd, t, expected) => {
      expect(calculateWacc(eW, dW, re, rd, t)).toBeCloseTo(expected, 5);
    },
  );
});
