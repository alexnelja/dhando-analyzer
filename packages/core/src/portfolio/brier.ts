/**
 * Brier score calibration engine.
 *
 * Computes the mean Brier score, a skill score relative to random guessing,
 * and a 10-bucket calibration curve that shows whether predicted probabilities
 * match actual hit rates. Useful for auditing forecast quality over a history
 * of investment predictions.
 *
 * Brier score: (predicted − actual)² — lower is better, 0 = perfect.
 * Skill score: 1 − (meanBrier / 0.25) — positive = better than chance.
 *
 * All logic is pure — no side effects, no I/O.
 */

/** A single prediction/outcome pair for Brier scoring. */
export interface BrierPrediction {
  /** Predicted probability of success (0–1). */
  predictedProbability: number;
  /** Actual outcome: 1 for success, 0 for failure. */
  actualOutcome: number;
}

/** Input to the calibration engine. */
export interface BrierCalibrationInput {
  /** Array of resolved predictions to evaluate. May be empty. */
  predictions: BrierPrediction[];
}

/** Statistics for a single 10% probability bucket. */
export interface CalibrationBucket {
  /** Human-readable range label, e.g. "0.60-0.70". */
  range: string;
  /** Number of predictions falling in this bucket. */
  count: number;
  /** Mean predicted probability across predictions in this bucket. */
  avgPredicted: number;
  /** Actual hit rate (proportion of outcomes that were 1). */
  avgActual: number;
  /** avgActual − avgPredicted. Positive = underconfident; negative = overconfident. */
  deviation: number;
}

/** Full result from the Brier calibration engine. */
export interface BrierCalibrationResult {
  /** Average of (predicted − actual)² across all predictions. Lower is better. */
  meanBrierScore: number;
  /**
   * Skill score relative to random guessing (Brier = 0.25 for a 50/50 coin flip).
   * Clamped at 0 min. 1 = perfect, 0 = no better than chance, negative = worse than chance
   * (clamped to 0).
   */
  skillScore: number;
  /**
   * 10 calibration buckets: [0,0.1), [0.1,0.2), …, [0.9,1.0].
   * Empty buckets (count = 0) are included with zeroed numeric fields.
   */
  calibrationCurve: CalibrationBucket[];
  /**
   * Mean of (avgPredicted − avgActual) across non-empty buckets.
   * Positive = overconfident (predictions too high); negative = underconfident.
   */
  overconfidenceBias: number;
  /** Total number of predictions evaluated. */
  totalPredictions: number;
  /** True when every non-empty bucket has |deviation| < 0.15. */
  isWellCalibrated: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const BUCKET_COUNT = 10;
const RANDOM_BRIER = 0.25;
const CALIBRATION_THRESHOLD = 0.15;

/** Build the range label for bucket index i (0-based). */
function bucketLabel(i: number): string {
  const lo = (i / BUCKET_COUNT).toFixed(2);
  const hi = ((i + 1) / BUCKET_COUNT).toFixed(2);
  return `${lo}-${hi}`;
}

/** Return the bucket index (0–9) for a given probability. Clamps 1.0 → bucket 9. */
function bucketIndex(p: number): number {
  return Math.min(Math.floor(p * BUCKET_COUNT), BUCKET_COUNT - 1);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute Brier score calibration statistics for a set of resolved predictions.
 *
 * When the input array is empty, all numeric results are 0 and
 * `isWellCalibrated` is true (vacuously).
 *
 * @param input - Resolved predictions with predicted probability and actual outcome.
 * @returns {@link BrierCalibrationResult} with score, skill, curve, and bias.
 */
export function computeBrierCalibration(input: BrierCalibrationInput): BrierCalibrationResult {
  const { predictions } = input;

  // Initialise 10 accumulator buckets.
  const buckets: { sumPredicted: number; sumActual: number; count: number }[] = Array.from(
    { length: BUCKET_COUNT },
    () => ({ sumPredicted: 0, sumActual: 0, count: 0 }),
  );

  let sumBrier = 0;

  for (const { predictedProbability: p, actualOutcome: o } of predictions) {
    sumBrier += Math.pow(p - o, 2);
    const idx = bucketIndex(p);
    buckets[idx].sumPredicted += p;
    buckets[idx].sumActual += o;
    buckets[idx].count += 1;
  }

  const totalPredictions = predictions.length;
  const meanBrierScore = totalPredictions > 0 ? sumBrier / totalPredictions : 0;
  const rawSkill = 1 - meanBrierScore / RANDOM_BRIER;
  const skillScore = Math.max(0, rawSkill);

  // Build calibration curve.
  const calibrationCurve: CalibrationBucket[] = buckets.map((b, i) => {
    if (b.count === 0) {
      return {
        range: bucketLabel(i),
        count: 0,
        avgPredicted: 0,
        avgActual: 0,
        deviation: 0,
      };
    }

    const avgPredicted = b.sumPredicted / b.count;
    const avgActual = b.sumActual / b.count;
    const deviation = avgActual - avgPredicted;

    return {
      range: bucketLabel(i),
      count: b.count,
      avgPredicted,
      avgActual,
      deviation,
    };
  });

  // Overconfidence bias: mean of (avgPredicted - avgActual) across non-empty buckets.
  const nonEmpty = calibrationCurve.filter((b) => b.count > 0);
  const overconfidenceBias =
    nonEmpty.length > 0
      ? nonEmpty.reduce((sum, b) => sum + (b.avgPredicted - b.avgActual), 0) / nonEmpty.length
      : 0;

  // Well-calibrated: all non-empty buckets have |deviation| < threshold.
  const isWellCalibrated = nonEmpty.every((b) => Math.abs(b.deviation) < CALIBRATION_THRESHOLD);

  return {
    meanBrierScore,
    skillScore,
    calibrationCurve,
    overconfidenceBias,
    totalPredictions,
    isWellCalibrated,
  };
}
