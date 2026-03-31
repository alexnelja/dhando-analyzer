/**
 * Scenario Modeler — bear / base / bull case projections.
 *
 * Each scenario projects future revenue, applies a margin and a valuation
 * multiple, and divides by shares outstanding to derive a per-share target
 * price.  A probability-weighted expected value is computed across all
 * supplied scenarios.
 */

/** Input definition for a single scenario case. */
export interface ScenarioInput {
  /** The scenario label. */
  case: 'bear' | 'base' | 'bull';
  /** Annual revenue growth rate, e.g. -0.10 for −10 %. */
  revenueGrowth: number;
  /** EBITDA margin, e.g. 0.15 for 15 %. */
  margin: number;
  /** Valuation multiple, e.g. 8 for 8× EV/EBITDA. */
  multiple: number;
  /** Probability weight for this case, e.g. 0.25 for 25 %. */
  probabilityWeight: number;
}

/** Result for a single scenario case. */
export interface ScenarioResult {
  /** The scenario label. */
  case: 'bear' | 'base' | 'bull';
  /** Derived per-share target price. */
  targetPrice: number;
  /** Probability weight as supplied. */
  probabilityWeight: number;
  /** targetPrice × probabilityWeight. */
  weightedValue: number;
}

/** Aggregated result across all scenario cases. */
export interface ScenarioModelResult {
  /** Individual scenario results. */
  scenarios: ScenarioResult[];
  /** Sum of all weightedValues — the probability-weighted expected value. */
  expectedValue: number;
  /** Target price from the bear-case scenario (maximum downside). */
  maxDownside: number;
  /** Target price from the bull-case scenario (maximum upside). */
  maxUpside: number;
}

/**
 * Model bear / base / bull scenarios and compute a probability-weighted
 * expected value per share.
 *
 * Target price formula per scenario:
 *   targetPrice = (baseRevenue × (1 + growth)^years × margin × multiple) / sharesOutstanding
 *
 * @param baseRevenue - Current-year (year 0) revenue.
 * @param sharesOutstanding - Shares outstanding used to convert enterprise
 *   value to a per-share price.
 * @param years - Number of projection years.
 * @param inputs - Array of scenario inputs; probability weights must sum to
 *   1.0 within a ±0.05 tolerance.
 * @returns {@link ScenarioModelResult} containing per-scenario details and
 *   aggregated statistics.
 * @throws {Error} If probability weights do not sum to approximately 1.0.
 * @throws {Error} If sharesOutstanding is zero.
 */
export function modelScenarios(
  baseRevenue: number,
  sharesOutstanding: number,
  years: number,
  inputs: ScenarioInput[],
): ScenarioModelResult {
  if (sharesOutstanding === 0) {
    throw new Error('modelScenarios: sharesOutstanding must not be zero');
  }

  const weightSum = inputs.reduce((acc, s) => acc + s.probabilityWeight, 0);
  if (Math.abs(weightSum - 1.0) > 0.05) {
    throw new Error(
      `modelScenarios: probability weights must sum to ~1.0 (got ${weightSum.toFixed(4)})`,
    );
  }

  const scenarios: ScenarioResult[] = inputs.map((input) => {
    const projectedRevenue = baseRevenue * Math.pow(1 + input.revenueGrowth, years);
    const enterpriseValue = projectedRevenue * input.margin * input.multiple;
    const targetPrice = enterpriseValue / sharesOutstanding;
    const weightedValue = targetPrice * input.probabilityWeight;

    return {
      case: input.case,
      targetPrice,
      probabilityWeight: input.probabilityWeight,
      weightedValue,
    };
  });

  const expectedValue = scenarios.reduce((acc, s) => acc + s.weightedValue, 0);

  const bearScenario = scenarios.find((s) => s.case === 'bear');
  const bullScenario = scenarios.find((s) => s.case === 'bull');

  // Fall back to min/max across all scenarios if bear/bull are not present.
  const maxDownside =
    bearScenario?.targetPrice ?? Math.min(...scenarios.map((s) => s.targetPrice));
  const maxUpside = bullScenario?.targetPrice ?? Math.max(...scenarios.map((s) => s.targetPrice));

  return { scenarios, expectedValue, maxDownside, maxUpside };
}
