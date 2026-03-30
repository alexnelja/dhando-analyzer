import { describe, it, expect } from 'vitest';
import {
  normalizeAltmanZ,
  normalizePiotroskiF,
  normalizeBeneishM,
  calculateCompositeScore,
} from '../../src/scoring/composite.js';

// ---------------------------------------------------------------------------

describe('normalizeAltmanZ', () => {
  it('maps Z=10 (top of range) to 100', () => {
    expect(normalizeAltmanZ(10)).toBe(100);
  });

  it('maps Z=-5 (bottom of range) to 0', () => {
    expect(normalizeAltmanZ(-5)).toBe(0);
  });

  it('maps Z=2.5 (grey zone) to a value between 40 and 75', () => {
    const n = normalizeAltmanZ(2.5);
    expect(n).toBeGreaterThan(40);
    expect(n).toBeLessThan(75);
  });

  it('clamps values above MAX to 100', () => {
    expect(normalizeAltmanZ(100)).toBe(100);
    expect(normalizeAltmanZ(11)).toBe(100);
  });

  it('clamps values below MIN to 0', () => {
    expect(normalizeAltmanZ(-100)).toBe(0);
    expect(normalizeAltmanZ(-6)).toBe(0);
  });

  it('maps Z=0 (distress boundary) to the midpoint between 0 and safe', () => {
    // Z=0 is at position (0 - (-5)) / (10 - (-5)) = 5/15 = 33.33%
    expect(normalizeAltmanZ(0)).toBeCloseTo(33.33, 1);
  });
});

describe('normalizePiotroskiF', () => {
  it('maps F=9 to 100', () => {
    expect(normalizePiotroskiF(9)).toBeCloseTo(100, 1);
  });

  it('maps F=0 to 0', () => {
    expect(normalizePiotroskiF(0)).toBe(0);
  });

  it('maps F=5 to ~55.56', () => {
    expect(normalizePiotroskiF(5)).toBeCloseTo(55.56, 1);
  });

  it('clamps values above 9', () => {
    expect(normalizePiotroskiF(10)).toBeCloseTo(100, 1);
  });

  it('clamps values below 0', () => {
    expect(normalizePiotroskiF(-1)).toBe(0);
  });
});

describe('normalizeBeneishM', () => {
  it('maps M=-3 (cleanest end of range) to 100', () => {
    expect(normalizeBeneishM(-3)).toBe(100);
  });

  it('maps M=2 (manipulator end of range) to 0', () => {
    expect(normalizeBeneishM(2)).toBe(0);
  });

  it('maps M=-1.78 (manipulation threshold) to ~75.6 (closer to clean end)', () => {
    // Range [-3, 2] → span 5. (-1.78 - (-3)) = 1.22 from bottom of distress end.
    // Inverted: (2 - (-1.78)) / 5 * 100 = 3.78 / 5 * 100 = 75.6
    const n = normalizeBeneishM(-1.78);
    expect(n).toBeCloseTo(75.6, 1);
    expect(n).toBeGreaterThan(50); // threshold is in the cleaner half
  });

  it('clamps values below -3 to 100', () => {
    expect(normalizeBeneishM(-100)).toBe(100);
    expect(normalizeBeneishM(-3.1)).toBe(100);
  });

  it('clamps values above 2 to 0', () => {
    expect(normalizeBeneishM(100)).toBe(0);
    expect(normalizeBeneishM(2.1)).toBe(0);
  });
});

describe('calculateCompositeScore', () => {
  it('returns 100 when all scores are perfect (Z=10, F=9, M=-3)', () => {
    const score = calculateCompositeScore({ z: 10, f: 9, m: -3 });
    expect(score).toBeCloseTo(100, 1);
  });

  it('returns 0 when all scores are worst case (Z=-5, F=0, M=2)', () => {
    const score = calculateCompositeScore({ z: -5, f: 0, m: 2 });
    expect(score).toBeCloseTo(0, 1);
  });

  it('applies weights 0.35/0.35/0.30 correctly', () => {
    // Z=10 → 100, F=0 → 0, M at midpoint (-0.5) → 50
    // composite = 0.35*100 + 0.35*0 + 0.30*50 = 35 + 0 + 15 = 50
    const mMidpoint = -3 + (2 - -3) * 0.5; // = -0.5
    const score = calculateCompositeScore({ z: 10, f: 0, m: mMidpoint });
    expect(score).toBeCloseTo(50, 1);
  });

  it('returns a value in [0, 100] for typical inputs', () => {
    const score = calculateCompositeScore({ z: 2.5, f: 5, m: -2.0 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns a value in [0, 100] for extreme out-of-range inputs', () => {
    const score = calculateCompositeScore({ z: 100, f: 100, m: -100 });
    expect(score).toBeCloseTo(100, 1);
  });
});
