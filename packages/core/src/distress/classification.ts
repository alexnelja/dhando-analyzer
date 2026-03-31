/**
 * Temporary vs Permanent Distress Classification.
 *
 * Seven factors — each scored 0–10 — are combined with fixed weights
 * to produce a permanence score. The score drives a three-way classification:
 *
 *   < 3.5  → temporary  (turnaround candidate — distress is cyclical/external)
 *   3.5–6.5 → uncertain (requires deeper analysis; soft investment gate)
 *   > 6.5  → permanent  (structural impairment — avoid or short)
 *
 * Weight vector (sums to 1.0):
 *   f1 (cause)         0.20
 *   f2 (industry)      0.15
 *   f3 (balanceSheet)  0.20
 *   f4 (management)    0.15
 *   f5 (competition)   0.10
 *   f6 (revenueBase)   0.10
 *   f7 (assetValue)    0.10
 *
 * Source: Dhando Analyzer Design Spec §3, Component 4.
 */

/**
 * Seven qualitative distress factor scores, each in the range 0–10.
 *
 * 0 = strongest recovery / temporary signal.
 * 10 = permanent impairment signal.
 */
export interface DistressFactors {
  /**
   * Cause of distress.
   * 0 = purely external / cyclical (e.g. commodity downturn, COVID).
   * 10 = structural / secular decline (e.g. obsoleted technology).
   */
  cause: number;

  /**
   * Industry dynamics.
   * 0 = growing or stable industry.
   * 10 = terminal decline (e.g. physical newspapers, print directories).
   */
  industry: number;

  /**
   * Balance sheet strength.
   * 0 = net cash / low debt, strong liquidity.
   * 10 = insolvent or approaching insolvency.
   */
  balanceSheet: number;

  /**
   * Management quality and response to distress.
   * 0 = proven turnaround team with a credible plan.
   * 10 = incompetent, misaligned, or absent management.
   */
  management: number;

  /**
   * Competitive position during distress.
   * 0 = gaining market share while competitors struggle.
   * 10 = rapidly losing share to competitors.
   */
  competition: number;

  /**
   * Revenue base durability.
   * 0 = 80%+ revenue is recurring or contracted.
   * 10 = entirely one-time or highly discretionary spending.
   */
  revenueBase: number;

  /**
   * Tangible asset value vs liabilities.
   * 0 = hard assets comfortably exceed liabilities.
   * 10 = negative tangible book value.
   */
  assetValue: number;
}

/** Classification result from the 7-factor distress framework. */
export interface DistressClassificationResult {
  /**
   * Weighted permanence score on a 0–10 scale.
   * Higher score = greater evidence of permanent impairment.
   */
  permanenceScore: number;

  /**
   * Three-way classification derived from the permanence score.
   * - temporary  : score < 3.5
   * - uncertain  : score 3.5–6.5 (inclusive)
   * - permanent  : score > 6.5
   */
  classification: 'temporary' | 'uncertain' | 'permanent';
}

/**
 * Weight vector that maps each DistressFactors key to its weight.
 * Weights sum to exactly 1.0.
 */
const WEIGHTS: Record<keyof DistressFactors, number> = {
  cause: 0.20,
  industry: 0.15,
  balanceSheet: 0.20,
  management: 0.15,
  competition: 0.10,
  revenueBase: 0.10,
  assetValue: 0.10,
};

/**
 * Classify distress as temporary, uncertain, or permanent using the 7-factor
 * weighted framework.
 *
 * Formula:
 * ```
 * permanence = cause*0.20 + industry*0.15 + balanceSheet*0.20
 *            + management*0.15 + competition*0.10 + revenueBase*0.10
 *            + assetValue*0.10
 * ```
 *
 * @param factors - Seven qualitative distress factors, each scored 0–10.
 * @returns Permanence score and three-way classification.
 * @throws {RangeError} If any factor falls outside the [0, 10] range.
 */
export function classifyDistress(factors: DistressFactors): DistressClassificationResult {
  for (const [key, value] of Object.entries(factors)) {
    if (value < 0 || value > 10) {
      throw new RangeError(
        `classifyDistress: factor '${key}' must be in [0, 10], got ${value}`,
      );
    }
  }

  const permanenceScore =
    factors.cause * WEIGHTS.cause +
    factors.industry * WEIGHTS.industry +
    factors.balanceSheet * WEIGHTS.balanceSheet +
    factors.management * WEIGHTS.management +
    factors.competition * WEIGHTS.competition +
    factors.revenueBase * WEIGHTS.revenueBase +
    factors.assetValue * WEIGHTS.assetValue;

  const rounded = Math.round(permanenceScore * 1000) / 1000;

  const classification: 'temporary' | 'uncertain' | 'permanent' =
    rounded < 3.5 ? 'temporary' : rounded > 6.5 ? 'permanent' : 'uncertain';

  return { permanenceScore: rounded, classification };
}
