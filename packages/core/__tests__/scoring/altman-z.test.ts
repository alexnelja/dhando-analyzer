import { describe, it, expect } from 'vitest';
import { calculateAltmanZ, interpretAltmanZ, type AltmanZInputs } from '../../src/scoring/altman-z.js';

// ---------------------------------------------------------------------------
// Reference fixtures — all expected values are hand-verified against the formula.
// These serve as regression anchors: if the formula coefficients change, tests break.
// ---------------------------------------------------------------------------

// Z = 1.2*(500/1000) + 1.4*(300/1000) + 3.3*(200/1000) + 0.6*(800/400) + 1.0*(1200/1000)
//   = 0.60 + 0.42 + 0.66 + 1.20 + 1.20 = 4.08
const SAFE_INPUTS: AltmanZInputs = {
  workingCapital: 500,
  totalAssets: 1000,
  retainedEarnings: 300,
  ebit: 200,
  marketCapEquity: 800,
  totalLiabilities: 400,
  revenue: 1200,
};
const SAFE_EXPECTED_Z = 4.08;

// Z = 1.2*(-0.10) + 1.4*(-0.05) + 3.3*(0.02) + 0.6*(200/900) + 1.0*(0.60)
//   = -0.12 + -0.07 + 0.066 + 0.1333 + 0.60 = 0.6093
const DISTRESS_INPUTS: AltmanZInputs = {
  workingCapital: -100,
  totalAssets: 1000,
  retainedEarnings: -50,
  ebit: 20,
  marketCapEquity: 200,
  totalLiabilities: 900,
  revenue: 600,
};
const DISTRESS_EXPECTED_Z = 0.6093;

// Grey zone: Z should land between 1.81 and 2.99
// Z = 1.2*(200/1000) + 1.4*(100/1000) + 3.3*(80/1000) + 0.6*(300/500) + 1.0*(700/1000)
//   = 0.24 + 0.14 + 0.264 + 0.36 + 0.70 = 1.704  → actually distress at 1.704
// Adjusted to push into grey: use slightly higher market cap / less debt
// Z = 1.2*(0.20) + 1.4*(0.15) + 3.3*(0.10) + 0.6*(600/400) + 1.0*(0.80)
//   = 0.24 + 0.21 + 0.33 + 0.90 + 0.80 = 2.48
const GREY_INPUTS: AltmanZInputs = {
  workingCapital: 200,
  totalAssets: 1000,
  retainedEarnings: 150,
  ebit: 100,
  marketCapEquity: 600,
  totalLiabilities: 400,
  revenue: 800,
};
const GREY_EXPECTED_Z = 2.48;

// ---------------------------------------------------------------------------

describe('calculateAltmanZ — safe company', () => {
  it('returns the correct Z-Score (4.08)', () => {
    const result = calculateAltmanZ(SAFE_INPUTS);
    expect(result.z).toBeCloseTo(SAFE_EXPECTED_Z, 2);
  });

  it('classifies the zone as safe', () => {
    const result = calculateAltmanZ(SAFE_INPUTS);
    expect(result.zone).toBe('safe');
  });

  it('includes all five component ratios with correct values', () => {
    const result = calculateAltmanZ(SAFE_INPUTS);
    expect(result.components.A).toBeCloseTo(0.5, 4);
    expect(result.components.B).toBeCloseTo(0.3, 4);
    expect(result.components.C).toBeCloseTo(0.2, 4);
    expect(result.components.D).toBeCloseTo(2.0, 4);
    expect(result.components.E).toBeCloseTo(1.2, 4);
  });
});

describe('calculateAltmanZ — distressed company', () => {
  it('returns the correct Z-Score (~0.61)', () => {
    const result = calculateAltmanZ(DISTRESS_INPUTS);
    expect(result.z).toBeCloseTo(DISTRESS_EXPECTED_Z, 3);
  });

  it('classifies the zone as distress', () => {
    const result = calculateAltmanZ(DISTRESS_INPUTS);
    expect(result.zone).toBe('distress');
  });
});

describe('calculateAltmanZ — grey zone company', () => {
  it('returns a Z-Score in the grey range (1.81–2.99)', () => {
    const result = calculateAltmanZ(GREY_INPUTS);
    expect(result.z).toBeCloseTo(GREY_EXPECTED_Z, 2);
  });

  it('classifies the zone as grey', () => {
    const result = calculateAltmanZ(GREY_INPUTS);
    expect(result.zone).toBe('grey');
  });
});

describe('calculateAltmanZ — zero denominator guards', () => {
  it('throws when totalAssets is zero', () => {
    expect(() => calculateAltmanZ({ ...SAFE_INPUTS, totalAssets: 0 })).toThrow(
      'totalAssets must not be zero',
    );
  });

  it('throws when totalLiabilities is zero', () => {
    expect(() => calculateAltmanZ({ ...SAFE_INPUTS, totalLiabilities: 0 })).toThrow(
      'totalLiabilities must not be zero',
    );
  });
});

describe('interpretAltmanZ', () => {
  it.each([
    [4.08, 'safe'],
    [3.00, 'safe'],   // boundary — just above 2.99 rounds to safe
    [2.99, 'grey'],   // exactly 2.99 → grey (not > 2.99)
    [2.5, 'grey'],
    [1.81, 'grey'],   // lower grey boundary (inclusive)
    [1.80, 'distress'], // just below 1.81
    [0.61, 'distress'],
    [-1.0, 'distress'],
  ] as const)('Z=%s → %s zone', (z, expected) => {
    expect(interpretAltmanZ(z)).toBe(expected);
  });
});
