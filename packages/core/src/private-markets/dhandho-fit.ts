/**
 * Dhandho Fit Scoring — encodes Mohnish Pabrai's 9 investment principles as
 * a weighted numeric score.
 *
 * Each principle is scored 0–10 (0 = completely violated, 10 = perfectly
 * aligns). Principles #4 (durable competitive advantage), #7 (margin of
 * safety), and #8 (low risk / high uncertainty) carry a 1.5× weight because
 * they are the core pillars that differentiate Dhandho investing from generic
 * value investing.
 *
 * Formula:
 *   dhandho_fit = (p1 + p2 + p3 + p5 + p6 + p9) + 1.5 × (p4 + p7 + p8)
 *   Maximum score: 6 × 10 + 1.5 × 3 × 10 = 60 + 45 = 105
 *
 * Investment gate: totalScore >= 54 (approximately 51.4% of 105, calibrated
 * to the original "sum >= 54 out of 90" threshold when 1× weighted).
 *
 * Source: Pabrai, M. (2007). "The Dhandho Investor." Wiley.
 */

import type { DhandhoFitResult } from '../contracts/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Raw 0–10 scores for each of Pabrai's 9 Dhandho principles.
 * Out-of-range values will cause {@link calculateDhandhoFit} to throw.
 */
export interface DhandhoFitInput {
  /** Principle 1: Existing business (not a startup). */
  existingBusiness: number;
  /** Principle 2: Simple business in a slow-change industry. */
  simpleBusiness: number;
  /** Principle 3: Distressed business in a distressed industry. */
  distressedBusiness: number;
  /** Principle 4: Durable competitive advantage. (1.5× weight) */
  durableAdvantage: number;
  /** Principle 5: Bet heavily when odds are strongly in your favour. */
  betHeavily: number;
  /** Principle 6: Arbitrage opportunity present. */
  arbitrageOpportunity: number;
  /** Principle 7: Significant margin of safety. (1.5× weight) */
  marginOfSafety: number;
  /** Principle 8: Low risk, high uncertainty (not high risk). (1.5× weight) */
  lowRiskHighUncertainty: number;
  /** Principle 9: Copycat model, not first-mover innovation. */
  copycatNotInnovator: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Metadata for each of the 9 Dhandho principles.
 * Order matches principle numbering in the source material.
 */
const PRINCIPLES: ReadonlyArray<{
  field: keyof DhandhoFitInput;
  name: string;
  weight: number;
}> = [
  { field: 'existingBusiness', name: 'Existing business (not startup)', weight: 1 },
  { field: 'simpleBusiness', name: 'Simple business in slow-change industry', weight: 1 },
  { field: 'distressedBusiness', name: 'Distressed business in distressed industry', weight: 1 },
  { field: 'durableAdvantage', name: 'Durable competitive advantage', weight: 1.5 },
  { field: 'betHeavily', name: 'Bet heavily when odds favour', weight: 1 },
  { field: 'arbitrageOpportunity', name: 'Arbitrage opportunity', weight: 1 },
  { field: 'marginOfSafety', name: 'Significant margin of safety', weight: 1.5 },
  { field: 'lowRiskHighUncertainty', name: 'Low risk, high uncertainty', weight: 1.5 },
  { field: 'copycatNotInnovator', name: 'Copycat, not innovator', weight: 1 },
];

/**
 * Maximum achievable score: 6 unweighted principles × 10 + 3 weighted × 15 = 105.
 */
export const DHANDHO_FIT_MAX_SCORE = 105;

/**
 * Minimum score required to pass the Dhandho fit gate.
 * Derived from the original "sum >= 54 of 90" threshold, scaled to the
 * weighted maximum of 105.
 */
export const DHANDHO_FIT_GATE = 54;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Calculate the weighted Dhandho fit score for a prospective investment.
 *
 * @param input - Raw 0–10 scores for all 9 Dhandho principles.
 * @returns {@link DhandhoFitResult} with per-principle breakdown, total score,
 *   and gate pass/fail.
 * @throws {RangeError} If any principle score is outside the [0, 10] range.
 *
 * @example
 * ```ts
 * const result = calculateDhandhoFit({
 *   existingBusiness: 9,
 *   simpleBusiness: 8,
 *   distressedBusiness: 7,
 *   durableAdvantage: 8,
 *   betHeavily: 6,
 *   arbitrageOpportunity: 5,
 *   marginOfSafety: 9,
 *   lowRiskHighUncertainty: 8,
 *   copycatNotInnovator: 7,
 * });
 * // result.passesGate === true
 * ```
 */
export function calculateDhandhoFit(input: DhandhoFitInput): DhandhoFitResult {
  // Validate all inputs are within [0, 10].
  for (const { field, name } of PRINCIPLES) {
    const value = input[field];
    if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 10) {
      throw new RangeError(
        `Dhandho fit: "${name}" score must be a finite number in [0, 10], got ${value}`,
      );
    }
  }

  const principleScores = PRINCIPLES.map(({ field, name, weight }) => {
    const score = input[field];
    return {
      principle: name,
      score,
      weight,
      weighted: score * weight,
    };
  });

  const totalScore = principleScores.reduce((sum, p) => sum + p.weighted, 0);

  return {
    principleScores,
    totalScore,
    passesGate: totalScore >= DHANDHO_FIT_GATE,
  };
}
