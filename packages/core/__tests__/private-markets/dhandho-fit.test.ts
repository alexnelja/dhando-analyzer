import { describe, it, expect } from 'vitest';
import {
  calculateDhandhoFit,
  DHANDHO_FIT_MAX_SCORE,
  DHANDHO_FIT_GATE,
  type DhandhoFitInput,
} from '../../src/private-markets/dhandho-fit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All 9 principles at maximum score (10). */
const ALL_TENS: DhandhoFitInput = {
  existingBusiness: 10,
  simpleBusiness: 10,
  distressedBusiness: 10,
  durableAdvantage: 10,
  betHeavily: 10,
  arbitrageOpportunity: 10,
  marginOfSafety: 10,
  lowRiskHighUncertainty: 10,
  copycatNotInnovator: 10,
};

/** All 9 principles at minimum score (0). */
const ALL_ZEROS: DhandhoFitInput = {
  existingBusiness: 0,
  simpleBusiness: 0,
  distressedBusiness: 0,
  durableAdvantage: 0,
  betHeavily: 0,
  arbitrageOpportunity: 0,
  marginOfSafety: 0,
  lowRiskHighUncertainty: 0,
  copycatNotInnovator: 0,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('DHANDHO_FIT_MAX_SCORE', () => {
  it('is 105', () => {
    expect(DHANDHO_FIT_MAX_SCORE).toBe(105);
  });
});

describe('DHANDHO_FIT_GATE', () => {
  it('is 54', () => {
    expect(DHANDHO_FIT_GATE).toBe(54);
  });
});

// ---------------------------------------------------------------------------
// Perfect score
// ---------------------------------------------------------------------------

describe('calculateDhandhoFit — perfect 10s', () => {
  it('returns totalScore of 105', () => {
    const result = calculateDhandhoFit(ALL_TENS);
    expect(result.totalScore).toBe(105);
  });

  it('passes gate', () => {
    const result = calculateDhandhoFit(ALL_TENS);
    expect(result.passesGate).toBe(true);
  });

  it('returns 9 principle score entries', () => {
    const result = calculateDhandhoFit(ALL_TENS);
    expect(result.principleScores).toHaveLength(9);
  });

  it('each entry has principle, score, weight, weighted fields', () => {
    const result = calculateDhandhoFit(ALL_TENS);
    for (const entry of result.principleScores) {
      expect(typeof entry.principle).toBe('string');
      expect(entry.principle.length).toBeGreaterThan(0);
      expect(typeof entry.score).toBe('number');
      expect(typeof entry.weight).toBe('number');
      expect(typeof entry.weighted).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// All zeros
// ---------------------------------------------------------------------------

describe('calculateDhandhoFit — all zeros', () => {
  it('returns totalScore of 0', () => {
    const result = calculateDhandhoFit(ALL_ZEROS);
    expect(result.totalScore).toBe(0);
  });

  it('fails gate', () => {
    const result = calculateDhandhoFit(ALL_ZEROS);
    expect(result.passesGate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Weighted principle verification
// ---------------------------------------------------------------------------

describe('calculateDhandhoFit — individual principle weights', () => {
  it('durableAdvantage (p4) has weight 1.5', () => {
    const result = calculateDhandhoFit(ALL_TENS);
    const p4 = result.principleScores.find((p) =>
      p.principle.toLowerCase().includes('durable'),
    );
    expect(p4).toBeDefined();
    expect(p4!.weight).toBe(1.5);
    expect(p4!.weighted).toBe(15);
  });

  it('marginOfSafety (p7) has weight 1.5', () => {
    const result = calculateDhandhoFit(ALL_TENS);
    const p7 = result.principleScores.find((p) =>
      p.principle.toLowerCase().includes('margin of safety'),
    );
    expect(p7).toBeDefined();
    expect(p7!.weight).toBe(1.5);
    expect(p7!.weighted).toBe(15);
  });

  it('lowRiskHighUncertainty (p8) has weight 1.5', () => {
    const result = calculateDhandhoFit(ALL_TENS);
    const p8 = result.principleScores.find((p) =>
      p.principle.toLowerCase().includes('low risk'),
    );
    expect(p8).toBeDefined();
    expect(p8!.weight).toBe(1.5);
    expect(p8!.weighted).toBe(15);
  });

  it('existingBusiness (p1) has weight 1', () => {
    const result = calculateDhandhoFit(ALL_TENS);
    const p1 = result.principleScores.find((p) =>
      p.principle.toLowerCase().includes('existing'),
    );
    expect(p1).toBeDefined();
    expect(p1!.weight).toBe(1);
    expect(p1!.weighted).toBe(10);
  });

  it('copycatNotInnovator (p9) has weight 1', () => {
    const result = calculateDhandhoFit(ALL_TENS);
    const p9 = result.principleScores.find((p) =>
      p.principle.toLowerCase().includes('copycat'),
    );
    expect(p9).toBeDefined();
    expect(p9!.weight).toBe(1);
    expect(p9!.weighted).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Boundary at gate threshold
// ---------------------------------------------------------------------------

describe('calculateDhandhoFit — gate boundary', () => {
  it('score exactly at gate (54) passes', () => {
    // Weighted: p4=6×1.5=9, p7=6×1.5=9, p8=6×1.5=9 → 27
    // Unweighted 6 remaining: need 54-27=27; 6 principles × 4.5 each = 27
    const input: DhandhoFitInput = {
      existingBusiness: 4.5,
      simpleBusiness: 4.5,
      distressedBusiness: 4.5,
      durableAdvantage: 6,
      betHeavily: 4.5,
      arbitrageOpportunity: 4.5,
      marginOfSafety: 6,
      lowRiskHighUncertainty: 6,
      copycatNotInnovator: 4.5,
    };
    const result = calculateDhandhoFit(input);
    expect(result.totalScore).toBeCloseTo(54, 5);
    expect(result.passesGate).toBe(true);
  });

  it('score just below gate (53.9) fails', () => {
    // All 1×-weighted principles at 4.4 = 26.4; all 1.5×-weighted at 6 = 27
    // Total = 26.4 + 27 = 53.4 → fails
    const input: DhandhoFitInput = {
      existingBusiness: 4.4,
      simpleBusiness: 4.4,
      distressedBusiness: 4.4,
      durableAdvantage: 6,
      betHeavily: 4.4,
      arbitrageOpportunity: 4.4,
      marginOfSafety: 6,
      lowRiskHighUncertainty: 6,
      copycatNotInnovator: 4.4,
    };
    const result = calculateDhandhoFit(input);
    expect(result.totalScore).toBeLessThan(54);
    expect(result.passesGate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Formula correctness
// ---------------------------------------------------------------------------

describe('calculateDhandhoFit — formula spot check', () => {
  it('applies formula: (p1+p2+p3+p5+p6+p9) + 1.5*(p4+p7+p8)', () => {
    const input: DhandhoFitInput = {
      existingBusiness: 5,
      simpleBusiness: 6,
      distressedBusiness: 4,
      durableAdvantage: 8,
      betHeavily: 3,
      arbitrageOpportunity: 7,
      marginOfSafety: 9,
      lowRiskHighUncertainty: 7,
      copycatNotInnovator: 6,
    };
    // (5+6+4+3+7+6) + 1.5*(8+9+7) = 31 + 1.5*24 = 31 + 36 = 67
    const result = calculateDhandhoFit(input);
    expect(result.totalScore).toBeCloseTo(67, 5);
    expect(result.passesGate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('calculateDhandhoFit — validation', () => {
  it.each([
    ['existingBusiness', { ...ALL_ZEROS, existingBusiness: -1 }],
    ['simpleBusiness', { ...ALL_ZEROS, simpleBusiness: 11 }],
    ['distressedBusiness', { ...ALL_ZEROS, distressedBusiness: 10.001 }],
    ['durableAdvantage', { ...ALL_ZEROS, durableAdvantage: -0.01 }],
    ['betHeavily', { ...ALL_ZEROS, betHeavily: NaN }],
    ['arbitrageOpportunity', { ...ALL_ZEROS, arbitrageOpportunity: Infinity }],
    ['marginOfSafety', { ...ALL_ZEROS, marginOfSafety: -Infinity }],
    ['lowRiskHighUncertainty', { ...ALL_ZEROS, lowRiskHighUncertainty: 10.5 }],
    ['copycatNotInnovator', { ...ALL_ZEROS, copycatNotInnovator: 100 }],
  ] as [string, DhandhoFitInput][])(
    'throws RangeError when %s is out of range',
    (_, input) => {
      expect(() => calculateDhandhoFit(input)).toThrow(RangeError);
    },
  );

  it('accepts boundary values 0 and 10 without throwing', () => {
    expect(() => calculateDhandhoFit(ALL_ZEROS)).not.toThrow();
    expect(() => calculateDhandhoFit(ALL_TENS)).not.toThrow();
  });
});
