/**
 * Piotroski F-Score calculator.
 *
 * Source: Piotroski (2000), "Value Investing: The Use of Historical Financial
 * Statement Information to Separate Winners from Losers."
 *
 * Nine binary signals (1 point each) grouped across three dimensions:
 * Profitability (4), Leverage & Liquidity (3), Operating Efficiency (2).
 */

import type { Financial } from '../models/financial.js';
import { collectMissing, type InsufficientResult } from './insufficient.js';

/** Financial data for a single reporting period used by the F-Score. */
export interface PiotroskiPeriodInputs {
  netIncome: number;
  operatingCashFlow: number;
  totalAssets: number;
  /** Total assets from the year before this period — used as denominator for ROA delta. */
  totalAssetsLastYear: number;
  longTermDebt: number;
  currentAssets: number;
  currentLiabilities: number;
  sharesOutstanding: number;
  grossProfit: number;
  revenue: number;
}

export interface PiotroskiInputs {
  current: PiotroskiPeriodInputs;
  prior: PiotroskiPeriodInputs;
}

/** One of the nine binary Piotroski signals. */
export interface PiotroskiSignal {
  /** Canonical snake_case name identifying this signal. */
  name: string;
  /** 1 if the signal fires (positive indicator), 0 otherwise. */
  value: 0 | 1;
}

export type PiotroskiInterpretation = 'strong' | 'average' | 'weak';

export interface PiotroskiFResult {
  /** Total F-Score: sum of all 9 signal values (0–9). */
  score: number;
  /** All nine individual signals with their 0/1 values. */
  signals: PiotroskiSignal[];
  /** Textual interpretation of the score. */
  interpretation: PiotroskiInterpretation;
}

/**
 * Map a raw F-Score to its qualitative interpretation.
 *
 * - 8–9 → strong  (buy signal among cheap stocks)
 * - 3–7 → average
 * - 0–2 → weak    (avoid or investigate further)
 *
 * @param score - Integer F-Score in range [0, 9].
 */
export function interpretPiotroskiF(score: number): PiotroskiInterpretation {
  if (score < 0 || score > 9 || !Number.isInteger(score)) {
    throw new RangeError(`Piotroski F-Score must be an integer in [0, 9], got ${score}`);
  }
  if (score >= 8) return 'strong';
  if (score >= 3) return 'average';
  return 'weak';
}

/**
 * Calculate the Piotroski F-Score using current and prior year financials.
 *
 * Each of the 9 binary signals contributes 1 point. The score ranges from 0
 * (worst) to 9 (best). Requires two consecutive annual periods.
 *
 * @param inputs - Current and prior year financial data.
 * @returns {@link PiotroskiFResult} with score, signals, and interpretation.
 */
export function calculatePiotroskiF(inputs: PiotroskiInputs): PiotroskiFResult {
  const { current: c, prior: p } = inputs;

  // Safe division helper — returns 0 when denominator is zero.
  const safe = (n: number, d: number): number => (d === 0 ? 0 : n / d);

  // --- Profitability (4 signals) ---

  // 1. Net income > 0
  const s1: PiotroskiSignal = {
    name: 'positive_net_income',
    value: c.netIncome > 0 ? 1 : 0,
  };

  // 2. Operating cash flow > 0
  const s2: PiotroskiSignal = {
    name: 'positive_operating_cash_flow',
    value: c.operatingCashFlow > 0 ? 1 : 0,
  };

  // 3. Return on assets increasing (ROA = net income / avg total assets)
  const roaCurrent = safe(
    c.netIncome,
    c.totalAssetsLastYear > 0 ? (c.totalAssets + c.totalAssetsLastYear) / 2 : c.totalAssets,
  );
  const roaPrior = safe(p.netIncome, p.totalAssets);
  const s3: PiotroskiSignal = {
    name: 'increasing_roa',
    value: roaCurrent > roaPrior ? 1 : 0,
  };

  // 4. Operating cash flow > net income (accruals / earnings quality check)
  const s4: PiotroskiSignal = {
    name: 'cash_flow_exceeds_net_income',
    value: c.operatingCashFlow > c.netIncome ? 1 : 0,
  };

  // --- Leverage & Liquidity (3 signals) ---

  // 5. Long-term debt ratio decreasing (LT debt / total assets)
  const leverageCurrent = safe(c.longTermDebt, c.totalAssets);
  const leveragePrior = safe(p.longTermDebt, p.totalAssets);
  const s5: PiotroskiSignal = {
    name: 'decreasing_leverage',
    value: leverageCurrent < leveragePrior ? 1 : 0,
  };

  // 6. Current ratio increasing (current assets / current liabilities)
  const currentRatioCurrent = safe(c.currentAssets, c.currentLiabilities);
  const currentRatioPrior = safe(p.currentAssets, p.currentLiabilities);
  const s6: PiotroskiSignal = {
    name: 'increasing_current_ratio',
    value: currentRatioCurrent > currentRatioPrior ? 1 : 0,
  };

  // 7. No new shares issued (dilution check)
  const s7: PiotroskiSignal = {
    name: 'no_new_shares',
    value: c.sharesOutstanding <= p.sharesOutstanding ? 1 : 0,
  };

  // --- Operating Efficiency (2 signals) ---

  // 8. Gross margin increasing
  const grossMarginCurrent = safe(c.grossProfit, c.revenue);
  const grossMarginPrior = safe(p.grossProfit, p.revenue);
  const s8: PiotroskiSignal = {
    name: 'increasing_gross_margin',
    value: grossMarginCurrent > grossMarginPrior ? 1 : 0,
  };

  // 9. Asset turnover increasing (revenue / total assets)
  const assetTurnoverCurrent = safe(c.revenue, c.totalAssets);
  const assetTurnoverPrior = safe(p.revenue, p.totalAssets);
  const s9: PiotroskiSignal = {
    name: 'increasing_asset_turnover',
    value: assetTurnoverCurrent > assetTurnoverPrior ? 1 : 0,
  };

  const signals: PiotroskiSignal[] = [s1, s2, s3, s4, s5, s6, s7, s8, s9];
  const score = signals.reduce((sum, s) => sum + s.value, 0);

  return { score, signals, interpretation: interpretPiotroskiF(score) };
}

/** Fields each annual period must supply for the F-Score. */
const PIOTROSKI_FIELDS = [
  'netIncome',
  'cashFromOps',
  'totalAssets',
  'longTermDebt',
  'currentAssets',
  'currentLiabilities',
  'sharesOutstanding',
  'grossProfit',
  'revenue',
] as const;

/**
 * Compute the Piotroski F-Score from two consecutive annual {@link Financial}
 * rows. Returns {@link InsufficientResult} (listing `prior` and/or
 * `current.<field>` / `prior.<field>` names) when data is missing.
 */
export function calculatePiotroskiFFromFinancials(
  current: Financial,
  prior: Financial | null,
): PiotroskiFResult | InsufficientResult {
  if (!prior) {
    return { status: 'insufficient', missingFields: ['prior'] };
  }

  const pick = (fin: Financial): Record<string, number | null> =>
    Object.fromEntries(PIOTROSKI_FIELDS.map((k) => [k, fin[k] as number | null]));

  const missingFields = [
    ...collectMissing(pick(current)).map((n) => `current.${n}`),
    ...collectMissing(pick(prior)).map((n) => `prior.${n}`),
  ];
  if (missingFields.length > 0) {
    return { status: 'insufficient', missingFields };
  }

  return calculatePiotroskiF({
    current: {
      netIncome: current.netIncome!,
      operatingCashFlow: current.cashFromOps!,
      totalAssets: current.totalAssets!,
      totalAssetsLastYear: prior.totalAssets!,
      longTermDebt: current.longTermDebt!,
      currentAssets: current.currentAssets!,
      currentLiabilities: current.currentLiabilities!,
      sharesOutstanding: current.sharesOutstanding!,
      grossProfit: current.grossProfit!,
      revenue: current.revenue!,
    },
    prior: {
      netIncome: prior.netIncome!,
      operatingCashFlow: prior.cashFromOps!,
      totalAssets: prior.totalAssets!,
      totalAssetsLastYear: prior.totalAssets!,
      longTermDebt: prior.longTermDebt!,
      currentAssets: prior.currentAssets!,
      currentLiabilities: prior.currentLiabilities!,
      sharesOutstanding: prior.sharesOutstanding!,
      grossProfit: prior.grossProfit!,
      revenue: prior.revenue!,
    },
  });
}
