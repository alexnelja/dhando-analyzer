import { describe, it, expect } from 'vitest';
import { assessEmRisk, type EmRiskInput } from '../../src/private-markets/em-risk.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_LOW: EmRiskInput = {
  currencyRisk: 1,
  politicalRisk: 2,
  regulatoryRisk: 1.5,
  liquidityRisk: 2.5,
};

const ALL_HIGH: EmRiskInput = {
  currencyRisk: 8,
  politicalRisk: 9,
  regulatoryRisk: 7.5,
  liquidityRisk: 8.5,
};

const MIXED: EmRiskInput = {
  currencyRisk: 2,     // low
  politicalRisk: 5,    // medium
  regulatoryRisk: 7,   // high
  liquidityRisk: 3,    // low
};

// ---------------------------------------------------------------------------
// All-low scenario
// ---------------------------------------------------------------------------

describe('assessEmRisk — all low scores', () => {
  it('overall risk level is low', () => {
    const result = assessEmRisk(ALL_LOW);
    expect(result.riskLevel).toBe('low');
  });

  it('overallRisk is average of four inputs', () => {
    const result = assessEmRisk(ALL_LOW);
    const expected = (1 + 2 + 1.5 + 2.5) / 4;
    expect(result.overallRisk).toBeCloseTo(expected, 5);
  });

  it('each factor is classified as low', () => {
    const result = assessEmRisk(ALL_LOW);
    for (const factor of result.factors) {
      expect(factor.level).toBe('low');
    }
  });

  it('returns 4 factor entries', () => {
    const result = assessEmRisk(ALL_LOW);
    expect(result.factors).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// All-high scenario
// ---------------------------------------------------------------------------

describe('assessEmRisk — all high scores', () => {
  it('overall risk level is high', () => {
    const result = assessEmRisk(ALL_HIGH);
    expect(result.riskLevel).toBe('high');
  });

  it('overallRisk is average of four inputs', () => {
    const result = assessEmRisk(ALL_HIGH);
    const expected = (8 + 9 + 7.5 + 8.5) / 4;
    expect(result.overallRisk).toBeCloseTo(expected, 5);
  });

  it('each factor is classified as high', () => {
    const result = assessEmRisk(ALL_HIGH);
    for (const factor of result.factors) {
      expect(factor.level).toBe('high');
    }
  });
});

// ---------------------------------------------------------------------------
// Mixed scenario
// ---------------------------------------------------------------------------

describe('assessEmRisk — mixed scores', () => {
  it('classifies individual factors correctly', () => {
    const result = assessEmRisk(MIXED);
    const levels = result.factors.map((f) => f.level);
    // currencyRisk=2 low, politicalRisk=5 medium, regulatoryRisk=7 high, liquidityRisk=3 low
    expect(levels[0]).toBe('low');
    expect(levels[1]).toBe('medium');
    expect(levels[2]).toBe('high');
    expect(levels[3]).toBe('low');
  });

  it('overall average is (2+5+7+3)/4 = 4.25 → medium', () => {
    const result = assessEmRisk(MIXED);
    expect(result.overallRisk).toBeCloseTo(4.25, 5);
    expect(result.riskLevel).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// Boundary values
// ---------------------------------------------------------------------------

describe('assessEmRisk — boundary values', () => {
  it('score of exactly 3.5 classifies as medium (not low)', () => {
    const input: EmRiskInput = {
      currencyRisk: 3.5,
      politicalRisk: 3.5,
      regulatoryRisk: 3.5,
      liquidityRisk: 3.5,
    };
    const result = assessEmRisk(input);
    expect(result.riskLevel).toBe('medium');
    for (const factor of result.factors) {
      expect(factor.level).toBe('medium');
    }
  });

  it('score just below 3.5 classifies as low', () => {
    const input: EmRiskInput = {
      currencyRisk: 3.49,
      politicalRisk: 3.49,
      regulatoryRisk: 3.49,
      liquidityRisk: 3.49,
    };
    const result = assessEmRisk(input);
    expect(result.riskLevel).toBe('low');
  });

  it('score of exactly 6.5 classifies as medium (not high)', () => {
    const input: EmRiskInput = {
      currencyRisk: 6.5,
      politicalRisk: 6.5,
      regulatoryRisk: 6.5,
      liquidityRisk: 6.5,
    };
    const result = assessEmRisk(input);
    expect(result.riskLevel).toBe('medium');
  });

  it('score just above 6.5 classifies as high', () => {
    const input: EmRiskInput = {
      currencyRisk: 6.51,
      politicalRisk: 6.51,
      regulatoryRisk: 6.51,
      liquidityRisk: 6.51,
    };
    const result = assessEmRisk(input);
    expect(result.riskLevel).toBe('high');
  });

  it('accepts boundary values 0 and 10', () => {
    expect(() =>
      assessEmRisk({ currencyRisk: 0, politicalRisk: 0, regulatoryRisk: 0, liquidityRisk: 0 }),
    ).not.toThrow();
    expect(() =>
      assessEmRisk({ currencyRisk: 10, politicalRisk: 10, regulatoryRisk: 10, liquidityRisk: 10 }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('assessEmRisk — validation', () => {
  it.each([
    ['currencyRisk', { ...ALL_LOW, currencyRisk: -0.1 }],
    ['politicalRisk', { ...ALL_LOW, politicalRisk: 10.1 }],
    ['regulatoryRisk', { ...ALL_LOW, regulatoryRisk: NaN }],
    ['liquidityRisk', { ...ALL_LOW, liquidityRisk: Infinity }],
  ] as [string, EmRiskInput][])(
    'throws RangeError when %s is out of range',
    (_, input) => {
      expect(() => assessEmRisk(input)).toThrow(RangeError);
    },
  );
});

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('assessEmRisk — result structure', () => {
  it('factor names include currency, political, regulatory, liquidity', () => {
    const result = assessEmRisk(ALL_LOW);
    const names = result.factors.map((f) => f.name.toLowerCase());
    expect(names.some((n) => n.includes('currency'))).toBe(true);
    expect(names.some((n) => n.includes('political'))).toBe(true);
    expect(names.some((n) => n.includes('regulatory'))).toBe(true);
    expect(names.some((n) => n.includes('liquidity'))).toBe(true);
  });

  it('each factor has name, score, and level fields', () => {
    const result = assessEmRisk(MIXED);
    for (const factor of result.factors) {
      expect(typeof factor.name).toBe('string');
      expect(typeof factor.score).toBe('number');
      expect(['low', 'medium', 'high']).toContain(factor.level);
    }
  });
});
