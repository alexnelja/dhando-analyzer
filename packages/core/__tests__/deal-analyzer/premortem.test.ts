import { describe, it, expect } from 'vitest';
import { runPreMortem, type PreMortemInput } from '../../src/deal-analyzer/premortem.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ALL_GREEN: PreMortemInput = {
  winProbability: 0.75,
  altmanZZone: 'safe',
  beneishManipulator: false,
  debtToEbitda: 1.5,
  managementScore: 5,
  moatScore: 5,
  compositeScore: 80,
};

const DISTRESSED: PreMortemInput = {
  winProbability: 0.6,
  altmanZZone: 'distress',
  beneishManipulator: false,
  debtToEbitda: 6.0,
  managementScore: 3,
  moatScore: 3,
  compositeScore: 55,
};

const MANIPULATOR: PreMortemInput = {
  ...ALL_GREEN,
  beneishManipulator: true,
};

const LOW_MANAGEMENT: PreMortemInput = {
  ...ALL_GREEN,
  managementScore: 2,
};

const WEAK_MOAT: PreMortemInput = {
  ...ALL_GREEN,
  moatScore: 2,
};

const LOW_COMPOSITE: PreMortemInput = {
  ...ALL_GREEN,
  compositeScore: 35,
};

// ---------------------------------------------------------------------------
// Structure tests
// ---------------------------------------------------------------------------

describe('runPreMortem — structure', () => {
  it('returns exactly 5 categories', () => {
    const result = runPreMortem(ALL_GREEN);
    expect(result.categories).toHaveLength(5);
  });

  it('all five category names are present', () => {
    const result = runPreMortem(ALL_GREEN);
    const names = result.categories.map((c) => c.category);
    expect(names).toContain('Valuation errors');
    expect(names).toContain('Leverage risks');
    expect(names).toContain('Management / ownership');
    expect(names).toContain('Moat deterioration');
    expect(names).toContain('Personal biases');
  });

  it('each category has question and evidence populated', () => {
    const result = runPreMortem(ALL_GREEN);
    for (const cat of result.categories) {
      expect(cat.question.length).toBeGreaterThan(0);
      expect(cat.evidence.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// All-green input
// ---------------------------------------------------------------------------

describe('runPreMortem — all-green input', () => {
  it('overall risk is low', () => {
    const result = runPreMortem(ALL_GREEN);
    // Personal biases is always medium — so overall should be medium at best
    expect(['low', 'medium']).toContain(result.overallRiskLevel);
  });

  it('valuation category is low risk', () => {
    const result = runPreMortem(ALL_GREEN);
    const cat = result.categories.find((c) => c.category === 'Valuation errors')!;
    expect(cat.riskLevel).toBe('low');
  });

  it('leverage category is low risk', () => {
    const result = runPreMortem(ALL_GREEN);
    const cat = result.categories.find((c) => c.category === 'Leverage risks')!;
    expect(cat.riskLevel).toBe('low');
  });

  it('management category is low risk', () => {
    const result = runPreMortem(ALL_GREEN);
    const cat = result.categories.find((c) => c.category === 'Management / ownership')!;
    expect(cat.riskLevel).toBe('low');
  });

  it('moat category is low risk', () => {
    const result = runPreMortem(ALL_GREEN);
    const cat = result.categories.find((c) => c.category === 'Moat deterioration')!;
    expect(cat.riskLevel).toBe('low');
  });

  it('personal biases is always medium', () => {
    const result = runPreMortem(ALL_GREEN);
    const cat = result.categories.find((c) => c.category === 'Personal biases')!;
    expect(cat.riskLevel).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// Distressed company
// ---------------------------------------------------------------------------

describe('runPreMortem — distressed company', () => {
  it('leverage category is high risk', () => {
    const result = runPreMortem(DISTRESSED);
    const cat = result.categories.find((c) => c.category === 'Leverage risks')!;
    expect(cat.riskLevel).toBe('high');
  });

  it('overall risk is high', () => {
    const result = runPreMortem(DISTRESSED);
    expect(result.overallRiskLevel).toBe('high');
  });

  it('leverage evidence mentions distress zone', () => {
    const result = runPreMortem(DISTRESSED);
    const cat = result.categories.find((c) => c.category === 'Leverage risks')!;
    expect(cat.evidence.toLowerCase()).toContain('distress');
  });
});

// ---------------------------------------------------------------------------
// Manipulator detection
// ---------------------------------------------------------------------------

describe('runPreMortem — Beneish manipulator', () => {
  it('valuation category is high risk when manipulator flag is set', () => {
    const result = runPreMortem(MANIPULATOR);
    const cat = result.categories.find((c) => c.category === 'Valuation errors')!;
    expect(cat.riskLevel).toBe('high');
  });

  it('overall risk is high when manipulator is detected', () => {
    const result = runPreMortem(MANIPULATOR);
    expect(result.overallRiskLevel).toBe('high');
  });

  it('valuation evidence mentions manipulation', () => {
    const result = runPreMortem(MANIPULATOR);
    const cat = result.categories.find((c) => c.category === 'Valuation errors')!;
    expect(cat.evidence.toLowerCase()).toContain('manipulation');
  });
});

// ---------------------------------------------------------------------------
// Management red flag
// ---------------------------------------------------------------------------

describe('runPreMortem — low management score', () => {
  it('management category is high risk when score <= 2', () => {
    const result = runPreMortem(LOW_MANAGEMENT);
    const cat = result.categories.find((c) => c.category === 'Management / ownership')!;
    expect(cat.riskLevel).toBe('high');
  });

  it('overall risk is high with low management', () => {
    const result = runPreMortem(LOW_MANAGEMENT);
    expect(result.overallRiskLevel).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Moat red flag
// ---------------------------------------------------------------------------

describe('runPreMortem — weak moat', () => {
  it('moat category is high risk when moatScore <= 2', () => {
    const result = runPreMortem(WEAK_MOAT);
    const cat = result.categories.find((c) => c.category === 'Moat deterioration')!;
    expect(cat.riskLevel).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Low composite score
// ---------------------------------------------------------------------------

describe('runPreMortem — low composite score', () => {
  it('valuation category is high when compositeScore < 40', () => {
    const result = runPreMortem(LOW_COMPOSITE);
    const cat = result.categories.find((c) => c.category === 'Valuation errors')!;
    expect(cat.riskLevel).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Overall risk level logic
// ---------------------------------------------------------------------------

describe('runPreMortem — overallRiskLevel', () => {
  it('is medium when only personal biases fires', () => {
    const result = runPreMortem(ALL_GREEN);
    expect(result.overallRiskLevel).toBe('medium');
  });

  it('is high when any category is high', () => {
    const result = runPreMortem(DISTRESSED);
    expect(result.overallRiskLevel).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Overconfidence correction
// ---------------------------------------------------------------------------

describe('runPreMortem — adjustedWinProbability', () => {
  it('shrinks probability toward 0.5 from above', () => {
    const result = runPreMortem({ ...ALL_GREEN, winProbability: 0.8 });
    // corrected = 0.8 * 0.7 + 0.5 * 0.3 = 0.56 + 0.15 = 0.71
    expect(result.adjustedWinProbability).toBeCloseTo(0.71, 5);
  });

  it('shrinks probability toward 0.5 from below', () => {
    const result = runPreMortem({ ...ALL_GREEN, winProbability: 0.3 });
    // corrected = 0.3 * 0.7 + 0.5 * 0.3 = 0.21 + 0.15 = 0.36
    expect(result.adjustedWinProbability).toBeCloseTo(0.36, 5);
  });

  it('leaves 0.5 unchanged', () => {
    const result = runPreMortem({ ...ALL_GREEN, winProbability: 0.5 });
    expect(result.adjustedWinProbability).toBeCloseTo(0.5, 5);
  });

  it('adjustedWinProbability is less extreme than raw input for high confidence', () => {
    const result = runPreMortem({ ...ALL_GREEN, winProbability: 0.9 });
    expect(result.adjustedWinProbability).toBeLessThan(0.9);
    expect(result.adjustedWinProbability).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// Null debtToEbitda
// ---------------------------------------------------------------------------

describe('runPreMortem — null debtToEbitda', () => {
  it('does not throw when debtToEbitda is null', () => {
    expect(() => runPreMortem({ ...ALL_GREEN, debtToEbitda: null })).not.toThrow();
  });

  it('leverage risk is low when null debtToEbitda and safe zone', () => {
    const result = runPreMortem({ ...ALL_GREEN, debtToEbitda: null });
    const cat = result.categories.find((c) => c.category === 'Leverage risks')!;
    expect(cat.riskLevel).toBe('low');
  });
});
