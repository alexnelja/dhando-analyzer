/**
 * Sentiment Aggregation.
 *
 * Aggregates raw FinBERT headline predictions into per-day median scores
 * and computes a rolling trend signal.
 *
 * Design choices:
 * - Only predictions with confidence >= threshold contribute to a day's median.
 * - Days with fewer than 2 qualifying predictions are marked insufficient
 *   (unreliable median from a single data point).
 * - Trend compares the average score of the most recent `windowDays` days vs
 *   the previous `windowDays` days.
 *
 * Source: Dhando Analyzer Design Spec §9.
 */

/**
 * A raw headline sentiment prediction, as produced by FinBERT or a similar
 * sentiment model.
 */
export interface HeadlinePrediction {
  /**
   * Sentiment score, typically in [-1.0, 1.0].
   * Negative = bearish, positive = bullish.
   */
  score: number;
  /**
   * Model confidence in the prediction, in [0, 1].
   * Predictions with confidence below the threshold are excluded.
   */
  confidence: number;
  /**
   * ISO-8601 date string (YYYY-MM-DD). Intra-day timestamps are truncated
   * to the date portion before grouping.
   */
  date: string;
}

/**
 * Aggregated median sentiment for a single calendar day.
 */
export interface DailySentiment {
  /** The date this entry covers (YYYY-MM-DD format). */
  date: string;
  /**
   * Median sentiment score across all qualifying predictions for this day.
   * 0 when `sufficient` is false.
   */
  medianScore: number;
  /**
   * Number of qualifying predictions (confidence >= threshold) for this day.
   */
  predictionCount: number;
  /**
   * False when fewer than 2 qualifying predictions exist for this day.
   * Insufficient days should be treated as missing data, not as neutral.
   */
  sufficient: boolean;
}

/**
 * A rolling trend signal derived from daily sentiment scores.
 */
export interface SentimentTrendResult {
  /**
   * Direction of the trend compared to the prior window.
   * - improving    : recent avg > prior avg by more than epsilon
   * - deteriorating: recent avg < prior avg by more than epsilon
   * - stable       : difference is within epsilon (±0.05)
   */
  trend: 'improving' | 'deteriorating' | 'stable';
  /**
   * Average sentiment score across all `sufficient` days in the recent window.
   * 0 when no sufficient days are available.
   */
  avgScore: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Minimum trend delta to be considered non-stable. */
const TREND_EPSILON = 0.05;

/**
 * Compute the median of an array of numbers.
 * Returns 0 for an empty array.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Truncate an ISO-8601 date/datetime string to YYYY-MM-DD.
 */
function toDateString(dateOrDatetime: string): string {
  return dateOrDatetime.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Aggregate raw headline sentiment predictions into per-day median scores.
 *
 * Steps:
 * 1. Filter predictions to those with confidence >= `confidenceThreshold`.
 * 2. Group by date (YYYY-MM-DD).
 * 3. Compute the median score per day.
 * 4. Mark days with fewer than 2 qualifying predictions as insufficient.
 *
 * Days are returned sorted ascending by date.
 *
 * @param headlines - Raw headline predictions from FinBERT or similar.
 * @param confidenceThreshold - Minimum confidence to include a prediction. Default 0.75.
 * @returns Per-day sentiment aggregates sorted by date ascending.
 */
export function aggregateDailySentiment(
  headlines: HeadlinePrediction[],
  confidenceThreshold: number = 0.75,
): DailySentiment[] {
  if (headlines.length === 0) return [];

  // Filter by confidence threshold.
  const qualified = headlines.filter((h) => h.confidence >= confidenceThreshold);

  // Group by date.
  const byDate = new Map<string, number[]>();
  for (const h of qualified) {
    const date = toDateString(h.date);
    const existing = byDate.get(date);
    if (existing) {
      existing.push(h.score);
    } else {
      byDate.set(date, [h.score]);
    }
  }

  // Collect all unique dates from the original input (not just qualified).
  // Days where all predictions were filtered out still appear with count=0.
  const allDates = new Set<string>(headlines.map((h) => toDateString(h.date)));

  const results: DailySentiment[] = [];
  for (const date of allDates) {
    const scores = byDate.get(date) ?? [];
    const sufficient = scores.length >= 2;
    results.push({
      date,
      medianScore: sufficient ? median(scores) : 0,
      predictionCount: scores.length,
      sufficient,
    });
  }

  // Sort ascending by date.
  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}

/**
 * Compute a rolling sentiment trend by comparing the average score of the
 * most recent `windowDays` sufficient days to the previous `windowDays`
 * sufficient days.
 *
 * Only days where `sufficient === true` contribute to the averages.
 *
 * Classification:
 * - recent avg − prior avg > +0.05  → improving
 * - recent avg − prior avg < −0.05  → deteriorating
 * - otherwise                        → stable
 *
 * When fewer than `windowDays` sufficient days are available in total,
 * all available sufficient days are compared against a prior average of 0.
 *
 * @param dailyScores - Per-day aggregates, as produced by {@link aggregateDailySentiment}.
 * @param windowDays - Look-back window size for each half of the comparison. Default 7.
 * @returns Trend direction and average score of the recent window.
 */
export function computeSentimentTrend(
  dailyScores: DailySentiment[],
  windowDays: number = 7,
): SentimentTrendResult {
  const sufficient = dailyScores.filter((d) => d.sufficient);

  if (sufficient.length === 0) {
    return { trend: 'stable', avgScore: 0 };
  }

  // Most recent window.
  const recentWindow = sufficient.slice(-windowDays);
  const recentAvg =
    recentWindow.reduce((sum, d) => sum + d.medianScore, 0) / recentWindow.length;

  // Prior window (the windowDays before the recent window).
  const priorWindow = sufficient.slice(
    Math.max(0, sufficient.length - windowDays * 2),
    Math.max(0, sufficient.length - windowDays),
  );

  const priorAvg =
    priorWindow.length > 0
      ? priorWindow.reduce((sum, d) => sum + d.medianScore, 0) / priorWindow.length
      : 0;

  const delta = recentAvg - priorAvg;

  const trend: 'improving' | 'deteriorating' | 'stable' =
    delta > TREND_EPSILON
      ? 'improving'
      : delta < -TREND_EPSILON
        ? 'deteriorating'
        : 'stable';

  return { trend, avgScore: recentAvg };
}
