import { describe, it, expect } from 'vitest';
import {
  analyzePrivateMarket,
  type PrivateMarketsInput,
} from '../../src/private-markets/pipeline.js';
import type { DhandhoFitInput } from '../../src/private-markets/dhandho-fit.js';
import type { EmRiskInput } from '../../src/private-markets/em-risk.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A Dhandho fit input that easily passes the gate (all 10s → score 105). */
const PASSING_DHANDHO: DhandhoFitInput = {
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

/** A Dhandho fit input that fails the gate (all 0s → score 0). */
const FAILING_DHANDHO: DhandhoFitInput = {
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

/** EM risk input that results in a 'medium' overall level (all 5s). */
const MEDIUM_EM_RISK: EmRiskInput = {
  currencyRisk: 5,
  politicalRisk: 5,
  regulatoryRisk: 5,
  liquidityRisk: 5,
};

/** EM risk input that results in a 'high' overall level (all 8s). */
const HIGH_EM_RISK: EmRiskInput = {
  currencyRisk: 8,
  politicalRisk: 8,
  regulatoryRisk: 8,
  liquidityRisk: 8,
};

function baseInput(overrides: Partial<PrivateMarketsInput> = {}): PrivateMarketsInput {
  return {
    investmentId: 'deal-test-001',
    dhandhoFit: PASSING_DHANDHO,
    netIncome: 1_000_000,
    depreciation: 200_000,
    capex: 300_000,
    currentDealStage: 'screening',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Passing deal (no EM risk)
// ---------------------------------------------------------------------------

describe('analyzePrivateMarket — passing deal, domestic', () => {
  it('passesGate is true when dhandho fit passes and no EM risk', () => {
    const result = analyzePrivateMarket(baseInput());
    expect(result.passesGate).toBe(true);
  });

  it('emRisk is null for domestic deal', () => {
    const result = analyzePrivateMarket(baseInput());
    expect(result.emRisk).toBeNull();
  });

  it('dhandhoFit result is populated', () => {
    const result = analyzePrivateMarket(baseInput());
    expect(result.dhandhoFit.totalScore).toBe(105);
    expect(result.dhandhoFit.passesGate).toBe(true);
    expect(result.dhandhoFit.principleScores).toHaveLength(9);
  });

  it('ownerEarnings = netIncome + depreciation - capex', () => {
    const result = analyzePrivateMarket(baseInput());
    // 1_000_000 + 200_000 - 300_000 = 900_000
    expect(result.ownerEarnings).toBe(900_000);
  });

  it('dealStage is passed through from input', () => {
    const result = analyzePrivateMarket(baseInput({ currentDealStage: 'deep_dd' }));
    expect(result.dealStage).toBe('deep_dd');
  });
});

// ---------------------------------------------------------------------------
// Blocked by Dhandho fit
// ---------------------------------------------------------------------------

describe('analyzePrivateMarket — blocked by Dhandho fit', () => {
  it('passesGate is false when dhandho fit fails', () => {
    const result = analyzePrivateMarket(baseInput({ dhandhoFit: FAILING_DHANDHO }));
    expect(result.passesGate).toBe(false);
  });

  it('dhandhoFit.passesGate is false', () => {
    const result = analyzePrivateMarket(baseInput({ dhandhoFit: FAILING_DHANDHO }));
    expect(result.dhandhoFit.passesGate).toBe(false);
  });

  it('overall gate fails even if EM risk is null', () => {
    const result = analyzePrivateMarket(baseInput({ dhandhoFit: FAILING_DHANDHO }));
    expect(result.emRisk).toBeNull();
    expect(result.passesGate).toBe(false);
  });

  it('overall gate fails even if EM risk is low', () => {
    const result = analyzePrivateMarket(
      baseInput({
        dhandhoFit: FAILING_DHANDHO,
        emRisk: { currencyRisk: 1, politicalRisk: 1, regulatoryRisk: 1, liquidityRisk: 1 },
      }),
    );
    expect(result.passesGate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Blocked by EM risk
// ---------------------------------------------------------------------------

describe('analyzePrivateMarket — blocked by EM risk', () => {
  it('passesGate is false when EM risk is high', () => {
    const result = analyzePrivateMarket(baseInput({ emRisk: HIGH_EM_RISK }));
    expect(result.passesGate).toBe(false);
  });

  it('emRisk.riskLevel is high', () => {
    const result = analyzePrivateMarket(baseInput({ emRisk: HIGH_EM_RISK }));
    expect(result.emRisk?.riskLevel).toBe('high');
  });

  it('dhandhoFit still passes even though overall gate fails', () => {
    const result = analyzePrivateMarket(baseInput({ emRisk: HIGH_EM_RISK }));
    expect(result.dhandhoFit.passesGate).toBe(true);
    expect(result.passesGate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Passing deal with EM risk (medium)
// ---------------------------------------------------------------------------

describe('analyzePrivateMarket — passing deal with medium EM risk', () => {
  it('passesGate is true when EM risk is medium', () => {
    const result = analyzePrivateMarket(baseInput({ emRisk: MEDIUM_EM_RISK }));
    expect(result.passesGate).toBe(true);
  });

  it('emRisk is populated', () => {
    const result = analyzePrivateMarket(baseInput({ emRisk: MEDIUM_EM_RISK }));
    expect(result.emRisk).not.toBeNull();
    expect(result.emRisk!.riskLevel).toBe('medium');
    expect(result.emRisk!.factors).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Owner earnings pass-through
// ---------------------------------------------------------------------------

describe('analyzePrivateMarket — owner earnings', () => {
  it.each([
    [500_000, 100_000, 50_000, 550_000],
    [0, 0, 0, 0],
    [-200_000, 300_000, 150_000, -50_000],
    [1_000, 500, 2_000, -500],
  ] as [number, number, number, number][])(
    'netIncome=%d + depreciation=%d - capex=%d = ownerEarnings=%d',
    (netIncome, depreciation, capex, expected) => {
      const result = analyzePrivateMarket(
        baseInput({ netIncome, depreciation, capex }),
      );
      expect(result.ownerEarnings).toBeCloseTo(expected, 5);
    },
  );
});

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe('analyzePrivateMarket — result structure', () => {
  it('returns all required fields', () => {
    const result = analyzePrivateMarket(baseInput({ emRisk: MEDIUM_EM_RISK }));
    expect(result).toHaveProperty('dhandhoFit');
    expect(result).toHaveProperty('emRisk');
    expect(result).toHaveProperty('ownerEarnings');
    expect(result).toHaveProperty('dealStage');
    expect(result).toHaveProperty('passesGate');
  });
});
