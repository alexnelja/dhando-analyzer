/**
 * Standard valuation metric calculators.
 *
 * All functions are pure: they take a {@link ValuationInputs} object and
 * return a number. Functions throw descriptive errors rather than returning
 * NaN or Infinity when denominators are invalid — callers must handle these
 * cases explicitly (e.g. loss-making companies have no meaningful P/E).
 *
 * Sources:
 * - Graham (1934), "Security Analysis"
 * - Graham (1949), "The Intelligent Investor"
 * - Buffett, Berkshire Hathaway Annual Letter (1986) — Owner Earnings
 * - Greenblatt (2005), "The Little Book That Beats the Market"
 * - Carlisle (2017), "The Acquirer's Multiple"
 */

/**
 * Inputs needed to calculate all standard valuation metrics.
 * All monetary values must be in a consistent unit (e.g. thousands, millions).
 */
export interface ValuationInputs {
  /** Market capitalisation (shares outstanding × price). */
  marketCap: number;
  /** Total debt (current + long-term). */
  totalDebt: number;
  /** Cash and cash equivalents. */
  cash: number;
  /** EBITDA for the period. */
  ebitda: number;
  /** Net income (bottom line). */
  netIncome: number;
  /** Diluted shares outstanding. */
  sharesOutstanding: number;
  /** Current share price. */
  sharePrice: number;
  /** Total assets. */
  totalAssets: number;
  /** Total liabilities. */
  totalLiabilities: number;
  /** Free cash flow (operating cash flow minus maintenance capex). */
  fcf: number;
  /** Depreciation and amortisation. */
  depreciation: number;
  /** Capital expenditure (total, including growth capex — conservative upper bound). */
  capex: number;
}

/**
 * Calculate EV/EBITDA — "The Acquirer's Multiple."
 *
 * Formula: `EV = Market Cap + Total Debt − Cash; EV/EBITDA = EV / EBITDA`
 *
 * A lower ratio indicates a potentially undervalued company relative to its
 * operating earnings. Typically used as a capital-structure-neutral alternative
 * to P/E.
 *
 * @param inputs - See {@link ValuationInputs}.
 * @returns EV/EBITDA ratio.
 * @throws {Error} If EBITDA is zero (undefined multiple).
 */
export function calculateEvEbitda(inputs: ValuationInputs): number {
  if (inputs.ebitda === 0) {
    throw new Error('EV/EBITDA: EBITDA must not be zero');
  }
  const ev = inputs.marketCap + inputs.totalDebt - inputs.cash;
  return ev / inputs.ebitda;
}

/**
 * Calculate P/E ratio.
 *
 * Formula: `EPS = Net Income / Shares Outstanding; P/E = Share Price / EPS`
 *
 * @param inputs - See {@link ValuationInputs}.
 * @returns Price-to-earnings ratio.
 * @throws {Error} If net income is zero or negative (loss-making companies
 *   have no meaningful P/E — use EV/EBITDA or P/B instead).
 */
export function calculatePE(inputs: ValuationInputs): number {
  if (inputs.netIncome <= 0) {
    throw new Error(
      'P/E: net income must be positive (loss-making companies have no meaningful P/E)',
    );
  }
  const eps = inputs.netIncome / inputs.sharesOutstanding;
  return inputs.sharePrice / eps;
}

/**
 * Calculate P/B ratio.
 *
 * Formula:
 *   `Book Value = Total Assets − Total Liabilities`
 *   `BV per Share = Book Value / Shares Outstanding`
 *   `P/B = Share Price / BV per Share`
 *
 * @param inputs - See {@link ValuationInputs}.
 * @returns Price-to-book ratio.
 * @throws {Error} If book value per share is zero or negative (insolvent company).
 */
export function calculatePB(inputs: ValuationInputs): number {
  const bookValue = inputs.totalAssets - inputs.totalLiabilities;
  const bvPerShare = bookValue / inputs.sharesOutstanding;
  if (bvPerShare <= 0) {
    throw new Error('P/B: book value per share must be positive');
  }
  return inputs.sharePrice / bvPerShare;
}

/**
 * Calculate FCF Yield.
 *
 * Formula: `FCF Yield = FCF / Market Cap`
 *
 * Returns the yield as a decimal (e.g. `0.12` = 12%). A higher yield implies
 * the company generates more free cash flow relative to its market price —
 * a key metric in Greenblatt's Magic Formula.
 *
 * @param inputs - See {@link ValuationInputs}.
 * @returns FCF yield as a decimal.
 * @throws {Error} If market cap is zero.
 */
export function calculateFcfYield(inputs: ValuationInputs): number {
  if (inputs.marketCap === 0) {
    throw new Error('FCF Yield: market cap must not be zero');
  }
  return inputs.fcf / inputs.marketCap;
}

/**
 * Calculate Owner Earnings (Buffett's true economic earnings proxy).
 *
 * Formula: `Owner Earnings = Net Income + Depreciation/Amortisation − CapEx`
 *
 * This approximation uses total capex as a conservative upper bound. For
 * greater precision, separate maintenance capex from growth capex and use
 * only the maintenance portion.
 *
 * Can return a negative value when capex significantly exceeds the sum of net
 * income and depreciation — this is meaningful information (the business
 * requires more capital than it earns).
 *
 * @param inputs - See {@link ValuationInputs}.
 * @returns Owner earnings in the same unit as the input values.
 */
export function calculateOwnerEarnings(inputs: ValuationInputs): number {
  return inputs.netIncome + inputs.depreciation - inputs.capex;
}
