import { describe, it, expect } from 'vitest';
import { generateMemo, type MemoInput } from '../../src/deal-analyzer/memo.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEALTHY_INPUT: MemoInput = {
  name: 'Acme Corp',
  ticker: 'ACME',
  sector: 'Industrials',
  intrinsicValue: 100,
  currentPrice: 60,
  marginOfSafety: 40,
  moatScore: 4,
  managementScore: 4,
  compositeScore: 75,
  altmanZZone: 'safe',
  beneishManipulator: false,
  expectedValue: 95,
  kellyPosition: 0.12,
  scenarios: [
    { case: 'bear', targetPrice: 55, probabilityWeight: 0.25 },
    { case: 'base', targetPrice: 95, probabilityWeight: 0.50 },
    { case: 'bull', targetPrice: 140, probabilityWeight: 0.25 },
  ],
};

const DISTRESSED_INPUT: MemoInput = {
  ...HEALTHY_INPUT,
  altmanZZone: 'distress',
  beneishManipulator: true,
  managementScore: 2,
  moatScore: 1,
  compositeScore: 35,
};

const GREY_ZONE_INPUT: MemoInput = {
  ...HEALTHY_INPUT,
  altmanZZone: 'grey',
};

const NO_TICKER_INPUT: MemoInput = {
  ...HEALTHY_INPUT,
  ticker: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateMemo — all fields populated', () => {
  it('returns all required fields', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.thesis).toBeTruthy();
    expect(memo.moatAnalysis).toBeTruthy();
    expect(memo.keyRisks.length).toBeGreaterThan(0);
    expect(memo.valuation).toBeTruthy();
    expect(memo.exitCriteria.length).toBeGreaterThan(0);
  });

  it('thesis contains name and ticker', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.thesis).toContain('Acme Corp');
    expect(memo.thesis).toContain('ACME');
  });

  it('thesis contains margin of safety', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.thesis).toContain('40.0%');
  });

  it('thesis contains intrinsic value', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.thesis).toContain('100.00');
  });

  it('thesis contains composite score', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.thesis).toContain('75/100');
  });

  it('thesis contains Kelly position', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.thesis).toContain('12.0%');
  });

  it('thesis labels safe zone correctly', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.thesis).toContain('Safe zone');
  });
});

describe('generateMemo — moat analysis', () => {
  it.each([
    [1, 'No moat'],
    [2, 'Weak moat'],
    [3, 'Narrow moat'],
    [4, 'Solid moat'],
    [5, 'Wide moat'],
  ] as const)('moatScore %i → label contains "%s"', (score, label) => {
    const memo = generateMemo({ ...HEALTHY_INPUT, moatScore: score });
    expect(memo.moatAnalysis).toContain(label);
  });

  it('moat analysis contains score out of 5', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.moatAnalysis).toContain('4/5');
  });
});

describe('generateMemo — risk auto-detection', () => {
  it('detects Beneish manipulator flag', () => {
    const memo = generateMemo({ ...HEALTHY_INPUT, beneishManipulator: true });
    const hasBeneish = memo.keyRisks.some((r) => r.toLowerCase().includes('beneish'));
    expect(hasBeneish).toBe(true);
  });

  it('does NOT flag Beneish when manipulator is false', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    const hasBeneish = memo.keyRisks.some((r) => r.toLowerCase().includes('beneish'));
    expect(hasBeneish).toBe(false);
  });

  it('detects Altman Z distress zone', () => {
    const memo = generateMemo({ ...HEALTHY_INPUT, altmanZZone: 'distress' });
    const hasDistress = memo.keyRisks.some((r) => r.toLowerCase().includes('distress'));
    expect(hasDistress).toBe(true);
  });

  it('detects Altman Z grey zone', () => {
    const memo = generateMemo(GREY_ZONE_INPUT);
    const hasGrey = memo.keyRisks.some((r) => r.toLowerCase().includes('grey'));
    expect(hasGrey).toBe(true);
  });

  it('does NOT flag Altman Z when in safe zone', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    const hasAltman = memo.keyRisks.some(
      (r) => r.toLowerCase().includes('distress') || r.toLowerCase().includes('grey zone'),
    );
    expect(hasAltman).toBe(false);
  });

  it('detects low management score', () => {
    const memo = generateMemo({ ...HEALTHY_INPUT, managementScore: 2 });
    const hasManagement = memo.keyRisks.some((r) => r.toLowerCase().includes('management'));
    expect(hasManagement).toBe(true);
  });

  it('does NOT flag management when score >= 3', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    const hasManagement = memo.keyRisks.some((r) => r.toLowerCase().includes('management'));
    expect(hasManagement).toBe(false);
  });

  it('detects low composite score', () => {
    const memo = generateMemo({ ...HEALTHY_INPUT, compositeScore: 35 });
    const hasComposite = memo.keyRisks.some((r) => r.toLowerCase().includes('composite'));
    expect(hasComposite).toBe(true);
  });

  it('caps key risks at 5', () => {
    const memo = generateMemo(DISTRESSED_INPUT);
    expect(memo.keyRisks.length).toBeLessThanOrEqual(5);
  });

  it('always includes DCF sensitivity risk', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    const hasDcf = memo.keyRisks.some((r) => r.toLowerCase().includes('dcf'));
    expect(hasDcf).toBe(true);
  });
});

describe('generateMemo — valuation', () => {
  it('contains intrinsic value', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.valuation).toContain('100.00');
  });

  it('contains current price', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.valuation).toContain('60.00');
  });

  it('contains margin of safety', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.valuation).toContain('40.0%');
  });

  it('contains expected value', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.valuation).toContain('95.00');
  });

  it('contains scenario breakdown', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.valuation).toContain('bear');
    expect(memo.valuation).toContain('base');
    expect(memo.valuation).toContain('bull');
  });
});

describe('generateMemo — exit criteria', () => {
  it('includes at least 3 exit criteria', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    expect(memo.exitCriteria.length).toBeGreaterThanOrEqual(3);
  });

  it('exit criteria include price-exceeds-intrinsic-value condition', () => {
    const memo = generateMemo(HEALTHY_INPUT);
    const hasPriceExceeds = memo.exitCriteria.some((c) =>
      c.toLowerCase().includes('intrinsic value'),
    );
    expect(hasPriceExceeds).toBe(true);
  });
});

describe('generateMemo — no ticker', () => {
  it('omits ticker from thesis when ticker is null', () => {
    const memo = generateMemo(NO_TICKER_INPUT);
    expect(memo.thesis).toContain('Acme Corp');
    expect(memo.thesis).not.toContain('(ACME)');
  });
});

describe('generateMemo — determinism', () => {
  it('produces identical output for identical input', () => {
    const memo1 = generateMemo(HEALTHY_INPUT);
    const memo2 = generateMemo(HEALTHY_INPUT);
    expect(memo1).toEqual(memo2);
  });
});
