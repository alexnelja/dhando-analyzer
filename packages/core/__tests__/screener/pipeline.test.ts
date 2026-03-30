import { describe, it, expect } from 'vitest';
import { runScreenerPipeline, type ScreenerPipelineInput } from '../../src/screener/pipeline.js';
import type { Rule } from '../../src/models/rule.js';

/**
 * A healthy company with strong financials.
 * All Piotroski signals should fire (score 9/9).
 * Altman Z well above 2.99 (safe zone).
 * Beneish M below -1.78 (clean).
 */
const HEALTHY_CURRENT = {
  revenue: 1000,
  netIncome: 120,
  grossProfit: 500,
  ebitda: 220,
  ebit: 200,
  totalAssets: 1000,
  currentAssets: 400,
  currentLiabilities: 180,
  totalLiabilities: 400,
  longTermDebt: 200,
  cash: 150,
  capex: 60,
  fcf: 140,
  ppAndE: 300,
  retainedEarnings: 300,
  operatingCashFlow: 150,
  accountsReceivable: 100,
  depreciation: 50,
  sgaExpenses: 100,
  sharesOutstanding: 100,
  workingCapital: 220,        // 400 - 180
  totalAssetsLastYear: 950,
};

const HEALTHY_PRIOR = {
  revenue: 900,
  netIncome: 80,
  grossProfit: 420,
  ebitda: 170,
  ebit: 150,
  totalAssets: 950,
  currentAssets: 350,
  currentLiabilities: 200,
  totalLiabilities: 450,
  longTermDebt: 250,
  cash: 120,
  capex: 70,
  fcf: 110,
  ppAndE: 280,
  retainedEarnings: 250,
  operatingCashFlow: 110,
  accountsReceivable: 95,
  depreciation: 45,
  sgaExpenses: 95,
  sharesOutstanding: 100,
  workingCapital: 150,
  totalAssetsLastYear: 900,
};

const HEALTHY_INPUT: ScreenerPipelineInput = {
  investment: { id: 'inv-1', name: 'TestCo', ticker: 'TEST' },
  financials: { current: HEALTHY_CURRENT, prior: HEALTHY_PRIOR },
  price: { price: 50, marketCap: 5000 },
};

/** A hard_gate rule that fails when altman_z < 1.81 (distress zone). */
const DISTRESS_GATE_RULE: Rule = {
  id: 'rule-distress',
  name: 'Altman Z Distress Gate',
  version: 1,
  category: 'risk',
  type: 'hard_gate',
  sourceType: 'book',
  sourceDetail: 'Altman (1968)',
  description: 'Block investments in distress zone',
  conditions: [{ metric: 'altman_z', operator: 'gte', value: 1.81, weight: 1.0 }],
  weight: 1.0,
  active: true,
  activeFrom: new Date('2025-01-01'),
  activeTo: null,
  createdAt: new Date('2025-01-01'),
  timesFired: 0,
  timesCorrect: 0,
  believabilityScore: 0.5,
};

describe('runScreenerPipeline — full pipeline with healthy company', () => {
  it('returns all four scoring results', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT);
    expect(result.altmanZ).toBeDefined();
    expect(result.piotroskiF).toBeDefined();
    expect(result.beneishM).toBeDefined();
    expect(typeof result.compositeScore).toBe('number');
  });

  it('Altman Z is in safe zone for a healthy company', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT);
    expect(result.altmanZ.z).toBeGreaterThan(2.99);
    expect(result.altmanZ.zone).toBe('safe');
  });

  it('Piotroski F is strong for a healthy company', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT);
    // ROA current: 120/((1000+950)/2)=0.123; prior: 80/950=0.084 → increasing ✓
    // OCF 150 > NI 120 ✓; LT debt 200/1000=0.20 < 250/950=0.263 ✓
    // Current ratio 400/180=2.22 > 350/200=1.75 ✓; shares same ✓
    // Gross margin 500/1000=0.50 > 420/900=0.467 ✓
    // Asset turnover 1000/1000=1.0 > 900/950=0.947 ✓
    expect(result.piotroskiF.score).toBe(9);
    expect(result.piotroskiF.interpretation).toBe('strong');
  });

  it('Beneish M indicates clean reporting for a healthy company', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT);
    expect(result.beneishM.manipulationFlag).toBe(false);
  });

  it('composite score is between 0 and 100', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT);
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
  });

  it('valuation metrics are populated for a profitable company', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT);
    expect(result.valuation.evEbitda).not.toBeNull();
    expect(result.valuation.pe).not.toBeNull();
    expect(result.valuation.pb).not.toBeNull();
    expect(result.valuation.fcfYield).not.toBeNull();
    expect(typeof result.valuation.ownerEarnings).toBe('number');
  });

  it('owner earnings equals net income + depreciation − capex', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT);
    // 120 + 50 - 60 = 110
    expect(result.valuation.ownerEarnings).toBeCloseTo(110, 5);
  });
});

describe('runScreenerPipeline — without rules', () => {
  it('rulesResult is null when no rules supplied', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT);
    expect(result.rulesResult).toBeNull();
  });

  it('blocked is false when no rules supplied', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT);
    expect(result.blocked).toBe(false);
  });
});

describe('runScreenerPipeline — with rules that pass', () => {
  it('rulesResult is populated when rules are supplied', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT, [DISTRESS_GATE_RULE]);
    expect(result.rulesResult).not.toBeNull();
  });

  it('blocked is false when hard_gate passes for a healthy company', () => {
    const result = runScreenerPipeline(HEALTHY_INPUT, [DISTRESS_GATE_RULE]);
    expect(result.blocked).toBe(false);
  });
});

describe('runScreenerPipeline — rules block a distressed company', () => {
  // Distressed company: negative working capital, high debt, low EBIT.
  const DISTRESSED_INPUT: ScreenerPipelineInput = {
    investment: { id: 'inv-distress', name: 'BadCo', ticker: 'BAD' },
    financials: {
      current: {
        ...HEALTHY_CURRENT,
        workingCapital: -100,
        totalLiabilities: 900,
        ebit: 20,
        revenue: 600,
        netIncome: -50,
        operatingCashFlow: -30,
      },
      prior: HEALTHY_PRIOR,
    },
    price: { price: 5, marketCap: 200 },
  };

  it('Altman Z is in distress zone for a distressed company', () => {
    const result = runScreenerPipeline(DISTRESSED_INPUT);
    expect(result.altmanZ.zone).toBe('distress');
  });

  it('hard_gate blocks a distressed company', () => {
    const result = runScreenerPipeline(DISTRESSED_INPUT, [DISTRESS_GATE_RULE]);
    expect(result.blocked).toBe(true);
    expect(result.rulesResult!.hardGateFails).toHaveLength(1);
  });
});

describe('runScreenerPipeline — valuation null-safety', () => {
  it('pe is null for a loss-making company', () => {
    const lossInput: ScreenerPipelineInput = {
      ...HEALTHY_INPUT,
      financials: {
        ...HEALTHY_INPUT.financials,
        current: { ...HEALTHY_CURRENT, netIncome: -10 },
      },
    };
    const result = runScreenerPipeline(lossInput);
    expect(result.valuation.pe).toBeNull();
  });

  it('evEbitda is null when ebitda is zero', () => {
    const zeroEbitdaInput: ScreenerPipelineInput = {
      ...HEALTHY_INPUT,
      financials: {
        ...HEALTHY_INPUT.financials,
        current: { ...HEALTHY_CURRENT, ebitda: 0 },
      },
    };
    const result = runScreenerPipeline(zeroEbitdaInput);
    expect(result.valuation.evEbitda).toBeNull();
  });
});
