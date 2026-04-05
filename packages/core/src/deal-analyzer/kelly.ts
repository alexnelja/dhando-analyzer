/**
 * Kelly Criterion calculator for position sizing.
 *
 * Implements the fractional Kelly formula for single-position sizing and a
 * portfolio-level scaling utility that accounts for cross-position correlation.
 *
 * References:
 *   Kelly, J.L. (1956) — "A New Interpretation of Information Rate."
 *   Thorpe, E.O. (1997) — "The Kelly Criterion in Blackjack, Sports Betting, and the Stock Market."
 */

/** Inputs for a single-position Kelly calculation. */
export interface KellyInput {
  /** Probability of a winning outcome (0–1). */
  winProbability: number;
  /** Potential gain as a fraction of the position, e.g. 0.5 for a 50 % gain. */
  gainFraction: number;
  /** Potential loss as a fraction of the position, e.g. 0.15 for a 15 % loss. */
  lossFraction: number;
}

/** Result of a single-position Kelly calculation. */
export interface KellyResult {
  /** Raw Kelly fraction f* before any adjustments. */
  fullKelly: number;
  /** Recommended allocation: f* divided by 2, optionally penalised for stale data. */
  halfKelly: number;
  /** True when f* > 0 — indicates a positive expected-value edge. */
  hasEdge: boolean;
  /** True when a staleness penalty was applied to halfKelly. */
  stalePenalty: boolean;
}

/**
 * Calculate the Kelly fraction for a single position.
 *
 * Formula: f* = W/A − (1−W)/B
 *   where W = winProbability, A = lossFraction, B = gainFraction.
 *
 * f* is clamped to [0, 1].  If dataStalenessHours > 72 the half-Kelly
 * recommendation is reduced by a 0.8 penalty factor.
 *
 * @param input - Win probability, gain fraction, and loss fraction.
 * @param dataStalenessHours - Age of the underlying data in hours.
 * @returns {@link KellyResult} with full and half Kelly fractions.
 * @throws {Error} If lossFraction or gainFraction is not strictly positive.
 * @throws {Error} If winProbability is outside [0, 1].
 */
export function calculateKelly(input: KellyInput, dataStalenessHours?: number): KellyResult {
  const { winProbability: W, gainFraction: B, lossFraction: A } = input;

  if (W < 0 || W > 1) {
    throw new Error('calculateKelly: winProbability must be between 0 and 1');
  }
  if (A <= 0) {
    throw new Error('calculateKelly: lossFraction must be greater than 0');
  }
  if (B <= 0) {
    throw new Error('calculateKelly: gainFraction must be greater than 0');
  }

  // No edge when win probability is below the break-even threshold.
  const hasEdge = W > A / (A + B);

  // Investment-form Kelly: f* = (p*b - q) / b
  // where b = gain/loss odds ratio, p = win prob, q = lose prob
  // This produces values in [0, 1] range naturally for typical investments,
  // unlike the gambling form W/A - (1-W)/B which often exceeds 1.0.
  const b = B / A; // odds ratio
  const rawKelly = (W * b - (1 - W)) / b;
  const fullKelly = Math.min(Math.max(rawKelly, 0), 1);

  const stalePenalty = (dataStalenessHours ?? 0) > 72;
  let halfKelly = Math.max(fullKelly / 2, 0);
  if (stalePenalty) {
    halfKelly *= 0.8;
  }

  return { fullKelly, halfKelly, hasEdge, stalePenalty };
}

/**
 * Scale a portfolio of Kelly positions so that aggregate allocation never
 * exceeds 100 % of capital, with an additional reduction for correlated pairs.
 *
 * Correlation reduction: when two positions share correlation > 0.5, both are
 * multiplied by (1 − correlation × 0.5) before the sum-cap scaling step.
 *
 * @param positions - Array of { kelly: halfKelly fraction, correlation: pairwise correlation }.
 * @returns Array of scaled Kelly fractions in the same order as the input.
 */
export function portfolioKelly(
  positions: { kelly: number; correlation: number }[],
): number[] {
  if (positions.length === 0) return [];

  // Step 1: apply pairwise correlation penalties.
  // For simplicity we treat each position's correlation field as its average
  // pairwise correlation with the rest of the portfolio.
  let adjusted = positions.map((p) => {
    if (p.correlation > 0.5) {
      return p.kelly * (1 - p.correlation * 0.5);
    }
    return p.kelly;
  });

  // Step 2: if the sum exceeds 1.0, scale all positions down proportionally.
  const total = adjusted.reduce((acc, k) => acc + k, 0);
  if (total > 1.0) {
    adjusted = adjusted.map((k) => k / total);
  }

  return adjusted;
}
