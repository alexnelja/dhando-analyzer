import type { DatabaseConnection } from '../data/db.js';

/**
 * Calculate exponential decay weight based on a set of outcome timestamps.
 *
 * Each timestamp contributes a weight of `2^(-age / halfLifeDays)`. The
 * aggregate weight is the average of individual weights, so the result is
 * always in the range (0, 1]. Timestamps in the future are clamped to the
 * current moment (weight = 1).
 *
 * @param timestamps - Array of Date objects representing past outcome events.
 * @param halfLifeDays - Number of days after which an outcome has half its original weight.
 * @returns A recency weight in the range (0, 1]. Returns 1.0 for an empty array.
 */
export function applyExponentialDecay(timestamps: Date[], halfLifeDays: number): number {
  if (timestamps.length === 0) return 1.0;

  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  let totalWeight = 0;
  for (const ts of timestamps) {
    const ageDays = Math.max(0, (now - ts.getTime()) / msPerDay);
    totalWeight += Math.pow(2, -ageDays / halfLifeDays);
  }

  return totalWeight / timestamps.length;
}

/**
 * Calculate the Bayesian believability score for a rule based on its firing history.
 *
 * Uses Bayesian shrinkage toward a neutral prior of 0.5, then optionally
 * applies exponential decay to weight recent outcomes more heavily.
 *
 * - When `timesFired < 5`, returns 0.5 (not enough data to form a view).
 * - The prior weight parameter controls how aggressively the estimate is
 *   pulled toward 0.5 for small samples. A value of 5 means a fresh rule
 *   starts near 0.5 and moves away only as evidence accumulates.
 *
 * @param timesCorrect - Number of times the rule's prediction was correct.
 * @param timesFired - Total number of times the rule has fired.
 * @param outcomeTimestamps - Optional array of Dates for each recorded outcome, used for decay weighting.
 * @param priorWeight - Strength of the neutral 0.5 prior (default 5). Higher = more conservative.
 * @returns Believability score in [0, 1].
 */
export function calculateBelievability(
  timesCorrect: number,
  timesFired: number,
  outcomeTimestamps?: Date[],
  priorWeight: number = 5,
): number {
  if (timesFired < 5) return 0.5;

  const baseRate = timesCorrect / timesFired;
  const bayesian =
    (baseRate * timesFired + 0.5 * priorWeight) / (timesFired + priorWeight);

  if (!outcomeTimestamps || outcomeTimestamps.length === 0) {
    return bayesian;
  }

  const recencyWeight = applyExponentialDecay(outcomeTimestamps, 365);
  return bayesian * recencyWeight;
}

/**
 * Read the current `times_fired` and `times_correct` counters for a rule,
 * recalculate its believability score, and persist the result.
 *
 * This is the primary entry point for refreshing a rule's score after new
 * outcomes are recorded via `recordOutcome`.
 *
 * @param db - Active database connection.
 * @param ruleId - ID of the rule to update.
 */
export function updateRuleBelievability(db: DatabaseConnection, ruleId: string): void {
  const row = db.get<{ times_fired: number; times_correct: number }>(
    `SELECT times_fired, times_correct FROM rules WHERE id = ?`,
    ruleId,
  );

  if (!row) {
    throw new Error(`Rule not found: ${ruleId}`);
  }

  const score = calculateBelievability(row.times_correct, row.times_fired);

  db.run(
    `UPDATE rules SET believability_score = ? WHERE id = ?`,
    score,
    ruleId,
  );
}
