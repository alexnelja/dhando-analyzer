/**
 * Beneish M-Score calculator.
 *
 * Source: Beneish (1999), "The Detection of Earnings Manipulation."
 *
 * Formula:
 *   M = -4.84 + 0.92*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI
 *       + 0.115*DEPI - 0.172*SGAI + 4.679*TATA - 0.327*LVGI
 *
 * A score > -1.78 flags likely earnings manipulation. All index components
 * are ratios comparing the current period to the prior period; values near 1.0
 * are neutral, values materially above 1.0 indicate deterioration (except
 * SGI, which merely reflects growth and is only flagged in conjunction with
 * other signals).
 */

import type { Financial } from '../models/financial.js';
import { collectMissing, type InsufficientResult } from './insufficient.js';

/**
 * Financial inputs for one annual period required for the Beneish M-Score.
 */
export interface BeneishPeriodInputs {
  /** Trade accounts receivable (net). */
  accountsReceivable: number;
  /** Net revenue / turnover. */
  revenue: number;
  /** Gross profit (revenue − cost of goods sold). */
  grossProfit: number;
  /** Total current assets. */
  currentAssets: number;
  /** Net property, plant & equipment. */
  ppAndE: number;
  /** Balance sheet total assets. */
  totalAssets: number;
  /** Depreciation and amortisation charge. */
  depreciation: number;
  /** Selling, general & administrative expenses. */
  sgaExpenses: number;
  /** Net income (bottom line). */
  netIncome: number;
  /** Total current liabilities. */
  totalCurrentLiabilities: number;
  /** Long-term debt. */
  longTermDebt: number;
  /**
   * Operating cash flow — required for the current period (TATA index).
   * Optional on the prior period input type; the calculation only uses it
   * from the current period.
   */
  operatingCashFlow?: number;
}

export interface BeneishInputs {
  /** Current reporting period. Must supply operatingCashFlow. */
  current: BeneishPeriodInputs & { operatingCashFlow: number };
  /** Prior reporting period. operatingCashFlow not required. */
  prior: Omit<BeneishPeriodInputs, 'operatingCashFlow'>;
}

/** The eight Beneish manipulation indices. */
export interface BeneishIndices {
  /** Days Sales in Receivables Index — receivables growing faster than revenue signals channel-stuffing. */
  DSRI: number;
  /** Gross Margin Index — deteriorating margins indicate revenue pressure or cost manipulation. */
  GMI: number;
  /** Asset Quality Index — off-balance-sheet asset inflation. */
  AQI: number;
  /** Sales Growth Index — rapid growth can incentivise manipulation; contextual signal. */
  SGI: number;
  /** Depreciation Index — slowing depreciation rate inflates reported earnings. */
  DEPI: number;
  /** SGA Expense Index — overhead growth exceeding sales growth can signal hidden pressure. */
  SGAI: number;
  /** Total Accruals to Total Assets — accrual-based income vs cash income (Sloan accruals). */
  TATA: number;
  /** Leverage Index — rising debt load increases incentive to manipulate. */
  LVGI: number;
}

export type BeneishLabel = 'likely_manipulator' | 'unlikely_manipulator';

export interface BeneishInterpretation {
  manipulationFlag: boolean;
  label: BeneishLabel;
}

export interface BeneishMResult {
  /** The raw Beneish M-Score. */
  mScore: number;
  /** All eight intermediate indices. */
  indices: BeneishIndices;
  /** True when mScore > -1.78. */
  manipulationFlag: boolean;
}

/**
 * Interpret a raw M-Score.
 *
 * - M > -1.78 → likely manipulator (red flag — further investigation warranted)
 * - M <= -1.78 → unlikely manipulator
 *
 * @param mScore - The raw Beneish M-Score.
 */
export function interpretBeneishM(mScore: number): BeneishInterpretation {
  const manipulationFlag = mScore > -1.78;
  return {
    manipulationFlag,
    label: manipulationFlag ? 'likely_manipulator' : 'unlikely_manipulator',
  };
}

/**
 * Calculate the Beneish M-Score using current and prior year financials.
 *
 * All index denominators are guarded against zero; a zero denominator returns
 * 0 for that index (neutral contribution), which is the conservative choice
 * since the numerator is also likely zero in that edge case.
 *
 * @param inputs - Current and prior year financial data.
 * @returns {@link BeneishMResult} with M-Score, eight indices, and manipulation flag.
 */
export function calculateBeneishM(inputs: BeneishInputs): BeneishMResult {
  const { current: c, prior: p } = inputs;

  // Safe division helper — returns 0 when denominator is zero.
  const safe = (n: number, d: number): number => (d === 0 ? 0 : n / d);

  // DSRI = (AR_t / Rev_t) / (AR_t-1 / Rev_t-1)
  // Days-sales-in-receivables ratio current vs prior.
  const DSRI = safe(
    safe(c.accountsReceivable, c.revenue),
    safe(p.accountsReceivable, p.revenue),
  );

  // GMI = GrossMargin_t-1 / GrossMargin_t
  // Index > 1 when prior margins exceeded current (deterioration).
  const gmCurrent = safe(c.grossProfit, c.revenue);
  const gmPrior = safe(p.grossProfit, p.revenue);
  const GMI = safe(gmPrior, gmCurrent);

  // AQI = (1 - (CA_t + PPE_t) / TA_t) / (1 - (CA_t-1 + PPE_t-1) / TA_t-1)
  // Measures change in proportion of "other" (less tangible) assets.
  const aqiCurrent = 1 - safe(c.currentAssets + c.ppAndE, c.totalAssets);
  const aqiPrior = 1 - safe(p.currentAssets + p.ppAndE, p.totalAssets);
  const AQI = safe(aqiCurrent, aqiPrior);

  // SGI = Revenue_t / Revenue_t-1
  const SGI = safe(c.revenue, p.revenue);

  // DEPI = (Dep_t-1 / (Dep_t-1 + PPE_t-1)) / (Dep_t / (Dep_t + PPE_t))
  // Index > 1 when depreciation rate slowed (inflates book value of assets).
  const depiPrior = safe(p.depreciation, p.depreciation + p.ppAndE);
  const depiCurrent = safe(c.depreciation, c.depreciation + c.ppAndE);
  const DEPI = safe(depiPrior, depiCurrent);

  // SGAI = (SGA_t / Rev_t) / (SGA_t-1 / Rev_t-1)
  const SGAI = safe(
    safe(c.sgaExpenses, c.revenue),
    safe(p.sgaExpenses, p.revenue),
  );

  // TATA = (Net Income_t - Operating Cash Flow_t) / Total Assets_t
  // High positive TATA signals income inflation via accruals.
  const TATA = safe(c.netIncome - c.operatingCashFlow, c.totalAssets);

  // LVGI = ((LTD_t + CL_t) / TA_t) / ((LTD_t-1 + CL_t-1) / TA_t-1)
  const lvgiCurrent = safe(c.longTermDebt + c.totalCurrentLiabilities, c.totalAssets);
  const lvgiPrior = safe(p.longTermDebt + p.totalCurrentLiabilities, p.totalAssets);
  const LVGI = safe(lvgiCurrent, lvgiPrior);

  const mScore =
    -4.84 +
    0.92 * DSRI +
    0.528 * GMI +
    0.404 * AQI +
    0.892 * SGI +
    0.115 * DEPI -
    0.172 * SGAI +
    4.679 * TATA -
    0.327 * LVGI;

  const { manipulationFlag } = interpretBeneishM(mScore);

  return {
    mScore,
    indices: { DSRI, GMI, AQI, SGI, DEPI, SGAI, TATA, LVGI },
    manipulationFlag,
  };
}

/**
 * Map `Financial` snake/camel fields to the {@link BeneishPeriodInputs} a single
 * period needs. `cashFromOps` is only required for the current period (TATA).
 */
const BENEISH_PRIOR_FIELDS = [
  'receivables',
  'revenue',
  'grossProfit',
  'currentAssets',
  'ppe',
  'totalAssets',
  'depreciation',
  'sga',
  'netIncome',
  'currentLiabilities',
  'longTermDebt',
] as const;

/**
 * Compute the Beneish M-Score from two consecutive annual {@link Financial}
 * rows. All eight indices compare current to prior, so both years are required;
 * `cashFromOps` is additionally required on the current year for the TATA index.
 * Returns {@link InsufficientResult} when any required field is missing.
 */
export function calculateBeneishMFromFinancials(
  current: Financial,
  prior: Financial | null,
): BeneishMResult | InsufficientResult {
  if (!prior) {
    return { status: 'insufficient', missingFields: ['prior'] };
  }

  const pickPrior = (fin: Financial): Record<string, number | null> =>
    Object.fromEntries(BENEISH_PRIOR_FIELDS.map((k) => [k, fin[k] as number | null]));

  const missingFields = [
    ...collectMissing({ ...pickPrior(current), cashFromOps: current.cashFromOps }).map(
      (n) => `current.${n}`,
    ),
    ...collectMissing(pickPrior(prior)).map((n) => `prior.${n}`),
  ];
  if (missingFields.length > 0) {
    return { status: 'insufficient', missingFields };
  }

  return calculateBeneishM({
    current: {
      accountsReceivable: current.receivables!,
      revenue: current.revenue!,
      grossProfit: current.grossProfit!,
      currentAssets: current.currentAssets!,
      ppAndE: current.ppe!,
      totalAssets: current.totalAssets!,
      depreciation: current.depreciation!,
      sgaExpenses: current.sga!,
      netIncome: current.netIncome!,
      totalCurrentLiabilities: current.currentLiabilities!,
      longTermDebt: current.longTermDebt!,
      operatingCashFlow: current.cashFromOps!,
    },
    prior: {
      accountsReceivable: prior.receivables!,
      revenue: prior.revenue!,
      grossProfit: prior.grossProfit!,
      currentAssets: prior.currentAssets!,
      ppAndE: prior.ppe!,
      totalAssets: prior.totalAssets!,
      depreciation: prior.depreciation!,
      sgaExpenses: prior.sga!,
      netIncome: prior.netIncome!,
      totalCurrentLiabilities: prior.currentLiabilities!,
      longTermDebt: prior.longTermDebt!,
    },
  });
}
