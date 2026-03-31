/**
 * Emerging Market (EM) Risk Overlay — quantifies four orthogonal risk dimensions
 * for investments in developing or frontier markets.
 *
 * Each factor is scored 0–10 (higher = more risk). The overall risk is the
 * equal-weighted average of the four factors. Individual factors and the
 * overall score share the same classification thresholds:
 *
 *   < 3.5  → 'low'
 *   3.5–6.5 → 'medium'
 *   > 6.5  → 'high'
 *
 * A 'high' overall EM risk blocks an investment in the private-markets
 * pipeline gate (see {@link module:pipeline}).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Raw 0–10 risk scores for the four EM risk dimensions.
 * Out-of-range values will cause {@link assessEmRisk} to throw.
 */
export interface EmRiskInput {
  /** Currency devaluation / exchange rate volatility risk (0–10). */
  currencyRisk: number;
  /** Expropriation, sanctions, geopolitical instability risk (0–10). */
  politicalRisk: number;
  /** Rule-of-law, licensing, policy-reversal risk (0–10). */
  regulatoryRisk: number;
  /** Ability to exit the position at fair value within a reasonable time (0–10). */
  liquidityRisk: number;
}

/** Classification level for a single risk dimension or the overall EM risk. */
export type RiskLevel = 'low' | 'medium' | 'high';

/** Result of the EM risk assessment. */
export interface EmRiskResult {
  /** Equal-weighted average of the four factor scores (0–10). */
  overallRisk: number;
  /** Classification of the overall risk level. */
  riskLevel: RiskLevel;
  /** Per-factor breakdown with individual classifications. */
  factors: {
    name: string;
    score: number;
    level: RiskLevel;
  }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Thresholds that divide the [0, 10] risk scale into three bands. */
const LOW_THRESHOLD = 3.5;
const HIGH_THRESHOLD = 6.5;

const FACTORS: ReadonlyArray<{ field: keyof EmRiskInput; name: string }> = [
  { field: 'currencyRisk', name: 'Currency risk' },
  { field: 'politicalRisk', name: 'Political risk' },
  { field: 'regulatoryRisk', name: 'Regulatory risk' },
  { field: 'liquidityRisk', name: 'Liquidity risk' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Classify a numeric risk score into a {@link RiskLevel}.
 * @internal
 */
function classifyRisk(score: number): RiskLevel {
  if (score < LOW_THRESHOLD) return 'low';
  if (score <= HIGH_THRESHOLD) return 'medium';
  return 'high';
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Assess the emerging market risk for a given investment.
 *
 * @param input - Raw 0–10 scores for each of the four EM risk dimensions.
 * @returns {@link EmRiskResult} with per-factor breakdown and overall
 *   classification.
 * @throws {RangeError} If any factor score is outside the [0, 10] range.
 *
 * @example
 * ```ts
 * const result = assessEmRisk({
 *   currencyRisk: 7,
 *   politicalRisk: 8,
 *   regulatoryRisk: 6,
 *   liquidityRisk: 5,
 * });
 * // result.riskLevel === 'high'
 * ```
 */
export function assessEmRisk(input: EmRiskInput): EmRiskResult {
  // Validate all inputs are within [0, 10].
  for (const { field, name } of FACTORS) {
    const value = input[field];
    if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 10) {
      throw new RangeError(
        `EM risk: "${name}" score must be a finite number in [0, 10], got ${value}`,
      );
    }
  }

  const factors = FACTORS.map(({ field, name }) => {
    const score = input[field];
    return { name, score, level: classifyRisk(score) };
  });

  const overallRisk =
    factors.reduce((sum, f) => sum + f.score, 0) / factors.length;

  return {
    overallRisk,
    riskLevel: classifyRisk(overallRisk),
    factors,
  };
}
