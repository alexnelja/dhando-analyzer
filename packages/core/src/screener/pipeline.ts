import { calculateAltmanZ, type AltmanZResult } from '../scoring/altman-z.js';
import { calculatePiotroskiF, type PiotroskiFResult } from '../scoring/piotroski-f.js';
import { calculateBeneishM, type BeneishMResult } from '../scoring/beneish-m.js';
import { calculateCompositeScore } from '../scoring/composite.js';
import {
  calculateEvEbitda,
  calculatePE,
  calculatePB,
  calculateFcfYield,
  calculateOwnerEarnings,
} from '../scoring/valuation.js';
import { runEngine, type EngineResult } from '../rules-engine/engine.js';
import type { Rule } from '../models/rule.js';

/**
 * Financial data for a single reporting period used by the pipeline.
 * Fields are a superset of what all three scoring models require.
 */
export interface PipelineFinancials {
  /** Net revenue. */
  revenue: number;
  /** Net income (bottom line). */
  netIncome: number;
  /** Gross profit (revenue − COGS). */
  grossProfit: number;
  /** EBITDA. */
  ebitda: number;
  /** Earnings before interest and taxes. */
  ebit: number;
  /** Balance sheet total assets. */
  totalAssets: number;
  /** Total current assets. */
  currentAssets: number;
  /** Total current liabilities. */
  currentLiabilities: number;
  /** Total liabilities (current + long-term). */
  totalLiabilities: number;
  /** Long-term debt. */
  longTermDebt: number;
  /** Cash and cash equivalents. */
  cash: number;
  /** Capital expenditure. */
  capex: number;
  /** Free cash flow. */
  fcf: number;
  /** Net property, plant & equipment. */
  ppAndE: number;
  /** Accumulated retained earnings on the balance sheet. */
  retainedEarnings: number;
  /** Operating cash flow. */
  operatingCashFlow: number;
  /** Trade accounts receivable. */
  accountsReceivable: number;
  /** Depreciation and amortisation. */
  depreciation: number;
  /** Selling, general & administrative expenses. */
  sgaExpenses: number;
  /** Diluted shares outstanding. */
  sharesOutstanding: number;
  /** Working capital (current assets − current liabilities). */
  workingCapital: number;
  /**
   * Total assets from the year before this period.
   * Used in Piotroski ROA delta calculation.
   */
  totalAssetsLastYear: number;
}

/** Investment identity passed into the pipeline. */
export interface PipelineInvestment {
  id: string;
  name: string;
  ticker: string;
}

/** Market price data required for Z-Score and valuation metrics. */
export interface PipelinePriceData {
  /** Current share price. */
  price: number;
  /** Market capitalisation. */
  marketCap: number;
}

/**
 * All inputs consumed by {@link runScreenerPipeline}.
 */
export interface ScreenerPipelineInput {
  /** Investment identity (no financial data). */
  investment: PipelineInvestment;
  financials: {
    /** Current period financials. */
    current: PipelineFinancials;
    /** Prior period financials for YoY comparison. */
    prior: PipelineFinancials;
  };
  /** Market price data. */
  price: PipelinePriceData;
}

/**
 * Aggregated output from a full screener pipeline run.
 */
export interface ScreenerPipelineResult {
  /** Altman Z-Score result. */
  altmanZ: AltmanZResult;
  /** Piotroski F-Score result. */
  piotroskiF: PiotroskiFResult;
  /** Beneish M-Score result. */
  beneishM: BeneishMResult;
  /** Composite score (0–100) blending Z, F, M. */
  compositeScore: number;
  /** Standard valuation metrics — `null` where mathematically undefined. */
  valuation: {
    evEbitda: number | null;
    pe: number | null;
    pb: number | null;
    fcfYield: number | null;
    ownerEarnings: number;
  };
  /**
   * Rules engine result, or `null` when no rules were supplied.
   * Use the `blocked` field at the top level instead of reaching in here.
   */
  rulesResult: EngineResult | null;
  /**
   * True when any hard_gate rule fails.
   * Always false when no rules are supplied.
   */
  blocked: boolean;
}

/**
 * Run the full screener pipeline for a single investment.
 *
 * This is a pure synchronous function. All data must be fetched by the caller
 * and passed in via `input`. No database calls or HTTP requests are made.
 *
 * Steps:
 * 1. Calculate Altman Z from financials + market price.
 * 2. Calculate Piotroski F from current + prior financials.
 * 3. Calculate Beneish M from current + prior financials.
 * 4. Derive composite score from normalised Z / F / M.
 * 5. Calculate standard valuation metrics (null-safe where invalid).
 * 6. If rules are provided, build a flat context map and run the rules engine.
 * 7. Return {@link ScreenerPipelineResult}.
 *
 * @param input - Full set of financial and price inputs.
 * @param rules - Optional array of rules to evaluate against the computed scores.
 * @returns {@link ScreenerPipelineResult} with all scores, metrics, and rules output.
 */
export function runScreenerPipeline(
  input: ScreenerPipelineInput,
  rules?: Rule[],
): ScreenerPipelineResult {
  const { financials, price } = input;
  const { current: c, prior: p } = financials;

  // Step 1: Altman Z-Score.
  const altmanZ = calculateAltmanZ({
    workingCapital: c.workingCapital,
    totalAssets: c.totalAssets,
    retainedEarnings: c.retainedEarnings,
    ebit: c.ebit,
    marketCapEquity: price.marketCap,
    totalLiabilities: c.totalLiabilities,
    revenue: c.revenue,
  });

  // Step 2: Piotroski F-Score.
  const piotroskiF = calculatePiotroskiF({
    current: {
      netIncome: c.netIncome,
      operatingCashFlow: c.operatingCashFlow,
      totalAssets: c.totalAssets,
      totalAssetsLastYear: c.totalAssetsLastYear,
      longTermDebt: c.longTermDebt,
      currentAssets: c.currentAssets,
      currentLiabilities: c.currentLiabilities,
      sharesOutstanding: c.sharesOutstanding,
      grossProfit: c.grossProfit,
      revenue: c.revenue,
    },
    prior: {
      netIncome: p.netIncome,
      operatingCashFlow: p.operatingCashFlow,
      totalAssets: p.totalAssets,
      totalAssetsLastYear: p.totalAssetsLastYear,
      longTermDebt: p.longTermDebt,
      currentAssets: p.currentAssets,
      currentLiabilities: p.currentLiabilities,
      sharesOutstanding: p.sharesOutstanding,
      grossProfit: p.grossProfit,
      revenue: p.revenue,
    },
  });

  // Step 3: Beneish M-Score.
  const beneishM = calculateBeneishM({
    current: {
      accountsReceivable: c.accountsReceivable,
      revenue: c.revenue,
      grossProfit: c.grossProfit,
      currentAssets: c.currentAssets,
      ppAndE: c.ppAndE,
      totalAssets: c.totalAssets,
      depreciation: c.depreciation,
      sgaExpenses: c.sgaExpenses,
      netIncome: c.netIncome,
      totalCurrentLiabilities: c.currentLiabilities,
      longTermDebt: c.longTermDebt,
      operatingCashFlow: c.operatingCashFlow,
    },
    prior: {
      accountsReceivable: p.accountsReceivable,
      revenue: p.revenue,
      grossProfit: p.grossProfit,
      currentAssets: p.currentAssets,
      ppAndE: p.ppAndE,
      totalAssets: p.totalAssets,
      depreciation: p.depreciation,
      sgaExpenses: p.sgaExpenses,
      netIncome: p.netIncome,
      totalCurrentLiabilities: p.currentLiabilities,
      longTermDebt: p.longTermDebt,
    },
  });

  // Step 4: Composite score.
  const compositeScore = calculateCompositeScore({
    z: altmanZ.z,
    f: piotroskiF.score,
    m: beneishM.mScore,
  });

  // Step 5: Valuation metrics — null-safe.
  const valuationInputs = {
    marketCap: price.marketCap,
    totalDebt: c.longTermDebt,
    cash: c.cash,
    ebitda: c.ebitda,
    netIncome: c.netIncome,
    sharesOutstanding: c.sharesOutstanding,
    sharePrice: price.price,
    totalAssets: c.totalAssets,
    totalLiabilities: c.totalLiabilities,
    fcf: c.fcf,
    depreciation: c.depreciation,
    capex: c.capex,
  };

  const safeCalc = <T>(fn: () => T): T | null => {
    try {
      return fn();
    } catch {
      return null;
    }
  };

  const valuation = {
    evEbitda: safeCalc(() => calculateEvEbitda(valuationInputs)),
    pe: safeCalc(() => calculatePE(valuationInputs)),
    pb: safeCalc(() => calculatePB(valuationInputs)),
    fcfYield: safeCalc(() => calculateFcfYield(valuationInputs)),
    ownerEarnings: calculateOwnerEarnings(valuationInputs),
  };

  // Step 6: Rules engine (optional).
  let rulesResult: EngineResult | null = null;

  if (rules && rules.length > 0) {
    // Build flat context map from all computed scores and key ratios.
    const context: Record<string, number> = {
      altman_z: altmanZ.z,
      piotroski_f: piotroskiF.score,
      beneish_m: beneishM.mScore,
      composite_score: compositeScore,
      ...(valuation.evEbitda !== null ? { ev_ebitda: valuation.evEbitda } : {}),
      ...(valuation.pe !== null ? { pe: valuation.pe } : {}),
      ...(valuation.pb !== null ? { pb: valuation.pb } : {}),
      ...(valuation.fcfYield !== null ? { fcf_yield: valuation.fcfYield } : {}),
      owner_earnings: valuation.ownerEarnings,
    };

    rulesResult = runEngine(rules, context);
  }

  return {
    altmanZ,
    piotroskiF,
    beneishM,
    compositeScore,
    valuation,
    rulesResult,
    blocked: rulesResult?.blocked ?? false,
  };
}
