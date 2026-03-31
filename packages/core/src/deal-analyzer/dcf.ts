/**
 * Two-stage Discounted Cash Flow (DCF) calculator.
 *
 * Stage 1 — explicit period: owner earnings grow at a constant rate for
 *   `projectionYears` years, discounted back to present value.
 * Stage 2 — terminal value: a Gordon Growth Model perpetuity anchored to the
 *   final year's cash flow, discounted back to present value.
 *
 * Also provides a WACC helper for assembling the discount rate from its
 * component capital structure inputs.
 */

/** Inputs for a two-stage DCF valuation. */
export interface DcfInput {
  /** Year-0 owner earnings (free cash flow to equity or FCFF). */
  ownerEarnings: number;
  /** Growth rate during the explicit projection period, e.g. 0.08 for 8 %. */
  growthRate: number;
  /** Long-run terminal growth rate, e.g. 0.03 for 3 %. */
  terminalGrowthRate: number;
  /** Discount rate (WACC or required return), e.g. 0.10 for 10 %. */
  discountRate: number;
  /** Length of the explicit projection period in years. */
  projectionYears: number;
}

/** Result of a two-stage DCF valuation. */
export interface DcfResult {
  /** Total intrinsic value: explicitPeriodValue + terminalValue (present values). */
  intrinsicValue: number;
  /** Present value of the explicit-period cash flows. */
  explicitPeriodValue: number;
  /** Present value of the terminal value. */
  terminalValue: number;
  /**
   * Margin of safety as a fraction: (intrinsicValue − currentPrice) / intrinsicValue.
   * Null when no current price is supplied.
   */
  marginOfSafety: number | null;
  /** Year-by-year cash flow detail for the explicit period. */
  yearlyFlows: { year: number; cashFlow: number; discounted: number }[];
}

/**
 * Run a two-stage DCF valuation on a stream of owner earnings.
 *
 * @param input - DCF inputs; discountRate must exceed terminalGrowthRate.
 * @param currentPrice - Optional current market price used to compute the
 *   margin of safety.
 * @returns {@link DcfResult} with intrinsic value and supporting detail.
 * @throws {Error} If discountRate ≤ terminalGrowthRate (Gordon Growth would be
 *   undefined or negative).
 * @throws {Error} If any rate is outside [0, 1].
 */
export function calculateDcf(input: DcfInput, currentPrice?: number): DcfResult {
  const { ownerEarnings, growthRate, terminalGrowthRate, discountRate, projectionYears } = input;

  for (const [name, value] of [
    ['growthRate', growthRate],
    ['terminalGrowthRate', terminalGrowthRate],
    ['discountRate', discountRate],
  ] as const) {
    if (value < 0 || value > 1) {
      throw new Error(`calculateDcf: ${name} must be between 0 and 1 (got ${value})`);
    }
  }

  if (discountRate <= terminalGrowthRate) {
    throw new Error(
      `calculateDcf: discountRate (${discountRate}) must be greater than terminalGrowthRate (${terminalGrowthRate})`,
    );
  }

  // Stage 1: explicit period.
  const yearlyFlows: DcfResult['yearlyFlows'] = [];
  let explicitPeriodValue = 0;

  for (let year = 1; year <= projectionYears; year++) {
    const cashFlow = ownerEarnings * Math.pow(1 + growthRate, year);
    const discounted = cashFlow / Math.pow(1 + discountRate, year);
    yearlyFlows.push({ year, cashFlow, discounted });
    explicitPeriodValue += discounted;
  }

  // Stage 2: terminal value (Gordon Growth Model).
  const finalYearEarnings = ownerEarnings * Math.pow(1 + growthRate, projectionYears);
  const terminalCashFlow = finalYearEarnings * (1 + terminalGrowthRate);
  const terminalValueAtEnd = terminalCashFlow / (discountRate - terminalGrowthRate);
  const terminalValue = terminalValueAtEnd / Math.pow(1 + discountRate, projectionYears);

  const intrinsicValue = explicitPeriodValue + terminalValue;

  const marginOfSafety =
    currentPrice !== undefined ? (intrinsicValue - currentPrice) / intrinsicValue : null;

  return { intrinsicValue, explicitPeriodValue, terminalValue, marginOfSafety, yearlyFlows };
}

/**
 * Calculate the Weighted Average Cost of Capital (WACC).
 *
 * Formula: WACC = (E/V × Re) + (D/V × Rd × (1 − T))
 *
 * @param equityWeight - E/V, the equity proportion of total capital.
 * @param debtWeight - D/V, the debt proportion of total capital.
 * @param costOfEquity - Re, the required return on equity.
 * @param costOfDebt - Rd, the pre-tax cost of debt.
 * @param taxRate - T, the marginal corporate tax rate.
 * @returns WACC as a decimal, e.g. 0.0875 for 8.75 %.
 */
export function calculateWacc(
  equityWeight: number,
  debtWeight: number,
  costOfEquity: number,
  costOfDebt: number,
  taxRate: number,
): number {
  return equityWeight * costOfEquity + debtWeight * costOfDebt * (1 - taxRate);
}
