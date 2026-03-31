/**
 * Position metrics calculator.
 *
 * Derives per-position performance and portfolio-weight metrics from raw
 * position data. All computations are pure — no side effects, no I/O.
 *
 * Kelly drift is signed: positive means the position is overweight relative
 * to the Kelly-optimal allocation; negative means underweight.
 */

/** Raw inputs needed to compute metrics for a single held position. */
export interface PositionInput {
  /** Average price paid per share (entry cost basis). */
  costBasis: number;
  /** Current market price per share. */
  currentPrice: number;
  /** Number of shares held. */
  shares: number;
  /** Total market value of the entire portfolio (sum of all positions). */
  totalPortfolioValue: number;
  /** Half-Kelly recommended weight for this position (0–1). */
  kellyOptimal: number;
}

/** Computed metrics derived from a single position. */
export interface PositionMetrics {
  /** Current market value: shares × currentPrice. */
  marketValue: number;
  /** Percentage return: (currentPrice − costBasis) / costBasis. */
  returnPct: number;
  /** Absolute P&L: (currentPrice − costBasis) × shares. */
  returnAbsolute: number;
  /** Position weight in the portfolio: marketValue / totalPortfolioValue. */
  currentWeight: number;
  /** Half-Kelly optimal weight, passed through unchanged. */
  kellyOptimal: number;
  /**
   * Signed drift from Kelly-optimal: currentWeight − kellyOptimal.
   * Positive = overweight; negative = underweight.
   */
  driftFromOptimal: number;
  /** Absolute value of driftFromOptimal. */
  driftAbsolute: number;
  /** True when currentWeight exceeds kellyOptimal. */
  overweight: boolean;
}

/**
 * Compute metrics for a single portfolio position.
 *
 * @param input - Raw position data.
 * @returns Derived position metrics.
 * @throws {Error} When totalPortfolioValue ≤ 0, shares ≤ 0, or costBasis ≤ 0.
 */
export function computePositionMetrics(input: PositionInput): PositionMetrics {
  const { costBasis, currentPrice, shares, totalPortfolioValue, kellyOptimal } = input;

  if (totalPortfolioValue <= 0) {
    throw new Error(
      `totalPortfolioValue must be > 0, received: ${totalPortfolioValue}`,
    );
  }
  if (shares <= 0) {
    throw new Error(`shares must be > 0, received: ${shares}`);
  }
  if (costBasis <= 0) {
    throw new Error(`costBasis must be > 0, received: ${costBasis}`);
  }

  const marketValue = shares * currentPrice;
  const returnPct = (currentPrice - costBasis) / costBasis;
  const returnAbsolute = (currentPrice - costBasis) * shares;
  const currentWeight = marketValue / totalPortfolioValue;
  const driftFromOptimal = currentWeight - kellyOptimal;
  const driftAbsolute = Math.abs(driftFromOptimal);
  const overweight = currentWeight > kellyOptimal;

  return {
    marketValue,
    returnPct,
    returnAbsolute,
    currentWeight,
    kellyOptimal,
    driftFromOptimal,
    driftAbsolute,
    overweight,
  };
}
