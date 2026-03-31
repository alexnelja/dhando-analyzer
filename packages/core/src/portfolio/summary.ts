/**
 * Portfolio-level aggregate summary.
 *
 * Aggregates individual position data into a single portfolio snapshot.
 * Computes a value-weighted composite score, traffic-light distribution,
 * overall risk classification, and optionally surfaces the Brier calibration
 * skill score.
 *
 * Risk thresholds (proportion of red positions):
 *   > 30%  → high
 *   > 10%  → medium
 *   else   → low
 *
 * All logic is pure — no side effects, no I/O.
 */

import type { BrierCalibrationResult } from './brier.js';

/** One entry per position in the portfolio. */
export interface PortfolioPositionSummaryInput {
  /** Current market value of this position (shares × price). */
  marketValue: number;
  /** Composite score for this position (higher = better quality). */
  compositeScore: number;
  /** Traffic-light status for this position. */
  trafficLight: 'green' | 'amber' | 'red';
}

/** All inputs required to compute the portfolio-level summary. */
export interface PortfolioSummaryInput {
  /** Array of individual position summaries. May be empty. */
  positions: PortfolioPositionSummaryInput[];
  /**
   * Optional Brier calibration result for the investor's prediction history.
   * When provided, surfaces the skill score and calibration flag.
   */
  calibration?: BrierCalibrationResult;
}

/** Aggregate portfolio summary. */
export interface PortfolioSummary {
  /** Total number of positions in the portfolio. */
  totalPositions: number;
  /** Sum of all position market values. */
  totalValue: number;
  /**
   * Value-weighted average composite score.
   * = Σ(marketValue × compositeScore) / Σ(marketValue).
   * 0 when the portfolio is empty.
   */
  weightedCompositeScore: number;
  /** Number of positions with 'green' traffic-light status. */
  greenCount: number;
  /** Number of positions with 'amber' traffic-light status. */
  amberCount: number;
  /** Number of positions with 'red' traffic-light status. */
  redCount: number;
  /**
   * Overall portfolio risk level based on the proportion of red positions:
   * - 'high'   if redCount / totalPositions > 0.30
   * - 'medium' if redCount / totalPositions > 0.10
   * - 'low'    otherwise (including empty portfolio)
   */
  overallRisk: 'low' | 'medium' | 'high';
  /**
   * Brier skill score from the calibration result, or null if not provided.
   */
  calibrationScore: number | null;
  /**
   * Whether the investor's predictions are well-calibrated, or null if
   * no calibration data was provided.
   */
  isWellCalibrated: boolean | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function classifyRisk(redCount: number, total: number): 'low' | 'medium' | 'high' {
  if (total === 0) return 'low';
  const redProportion = redCount / total;
  if (redProportion > 0.3) return 'high';
  if (redProportion > 0.1) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute an aggregate summary for a portfolio of positions.
 *
 * @param input - Position array and optional Brier calibration data.
 * @returns {@link PortfolioSummary} with value-weighted score and risk level.
 */
export function computePortfolioSummary(input: PortfolioSummaryInput): PortfolioSummary {
  const { positions, calibration } = input;

  const totalPositions = positions.length;

  let totalValue = 0;
  let sumWeightedScore = 0;
  let greenCount = 0;
  let amberCount = 0;
  let redCount = 0;

  for (const p of positions) {
    totalValue += p.marketValue;
    sumWeightedScore += p.marketValue * p.compositeScore;

    switch (p.trafficLight) {
      case 'green':
        greenCount++;
        break;
      case 'amber':
        amberCount++;
        break;
      case 'red':
        redCount++;
        break;
    }
  }

  const weightedCompositeScore = totalValue > 0 ? sumWeightedScore / totalValue : 0;
  const overallRisk = classifyRisk(redCount, totalPositions);

  const calibrationScore = calibration != null ? calibration.skillScore : null;
  const isWellCalibrated = calibration != null ? calibration.isWellCalibrated : null;

  return {
    totalPositions,
    totalValue,
    weightedCompositeScore,
    greenCount,
    amberCount,
    redCount,
    overallRisk,
    calibrationScore,
    isWellCalibrated,
  };
}
