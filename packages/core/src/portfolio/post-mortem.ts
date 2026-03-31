/**
 * Post-mortem generator.
 *
 * Applies the Tetlock process-outcome framework to evaluate a closed investment.
 * Produces a structured post-mortem with quadrant classification, lessons learned,
 * Brier contribution, and moat change commentary.
 *
 * Tetlock quadrants:
 *   - Good Process + Good Outcome:  "Skill confirmed."
 *   - Good Process + Poor Outcome:  "Bad luck."
 *   - Poor Process + Good Outcome:  "Got lucky."
 *   - Poor Process + Poor Outcome:  "Double failure."
 *
 * Process quality is measured by calibration: |predictedProbability − actualOutcome| < 0.3
 * means the prediction was well-calibrated (good process).
 *
 * All logic is pure — no side effects, no I/O.
 */

/** Quality classification along a single axis. */
export type ProcessQuality = 'good' | 'poor';

/** Quality classification for the investment outcome. */
export type OutcomeQuality = 'good' | 'poor';

/** All inputs required to generate a post-mortem for a closed investment. */
export interface PostMortemInput {
  /** Human-readable name for the investment. */
  name: string;
  /** The original investment thesis captured in the decision journal. */
  originalThesis: string;
  /** Probability of success assigned at entry (0–1). */
  predictedProbability: number;
  /** Actual outcome: 1 (win/success) or 0 (loss/failure). */
  actualOutcome: number;
  /** Entry price per share (cost basis). */
  entryPrice: number;
  /** Exit price per share. */
  exitPrice: number;
  /** How long the position was held, in calendar days. */
  holdingPeriodDays: number;
  /** Economic moat score at the time of entry (1–5). */
  moatScoreAtEntry: number;
  /** Economic moat score at the time of exit (1–5). */
  moatScoreAtExit: number;
  /**
   * Key assumptions captured at entry, e.g. `{ "revenueGrowth": "15%", "multiple": 12 }`.
   * Stored for reference; not evaluated programmatically.
   */
  keyAssumptions: Record<string, unknown>;
}

/** The structured post-mortem produced for a closed investment. */
export interface PostMortemResult {
  /** Investment name, passed through. */
  name: string;
  /** Percentage return: (exitPrice − entryPrice) / entryPrice. */
  returnPct: number;
  /** Number of days the position was held. */
  holdingPeriodDays: number;
  /**
   * Process quality:
   * - 'good' if |predictedProbability − actualOutcome| < 0.3 (well-calibrated).
   * - 'poor' otherwise.
   */
  processQuality: ProcessQuality;
  /**
   * Outcome quality:
   * - 'good' if returnPct > 0.
   * - 'poor' if returnPct ≤ 0.
   */
  outcomeQuality: OutcomeQuality;
  /**
   * Tetlock quadrant label, e.g. "Good Process, Good Outcome".
   */
  quadrant: string;
  /** (predictedProbability − actualOutcome)² — the Brier score for this single prediction. */
  brierContribution: number;
  /** Summary sentence referencing the original thesis and actual outcome. */
  thesisReview: string;
  /** Plain-English description of the moat score change between entry and exit. */
  moatChange: string;
  /** Actionable lessons derived from the Tetlock quadrant. */
  lessons: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CALIBRATION_THRESHOLD = 0.3;

function classifyProcess(predicted: number, actual: number): ProcessQuality {
  return Math.abs(predicted - actual) < CALIBRATION_THRESHOLD ? 'good' : 'poor';
}

function classifyOutcome(returnPct: number): OutcomeQuality {
  return returnPct > 0 ? 'good' : 'poor';
}

function quadrantLabel(process: ProcessQuality, outcome: OutcomeQuality): string {
  const processStr = process === 'good' ? 'Good Process' : 'Poor Process';
  const outcomeStr = outcome === 'good' ? 'Good Outcome' : 'Poor Outcome';
  return `${processStr}, ${outcomeStr}`;
}

function deriveLessons(process: ProcessQuality, outcome: OutcomeQuality): string {
  if (process === 'good' && outcome === 'good') {
    return 'Skill confirmed. The analysis was sound and the market agreed.';
  }
  if (process === 'good' && outcome === 'poor') {
    return 'Bad luck. The process was correct but the outcome didn\'t materialize. Review assumptions, don\'t change the process.';
  }
  if (process === 'poor' && outcome === 'good') {
    return 'Got lucky. The analysis was weak but the outcome was positive. Don\'t let this reinforce bad habits.';
  }
  // poor + poor
  return 'Double failure. Both the analysis and outcome were poor. Deep review needed.';
}

function buildThesisReview(thesis: string, actualOutcome: number): string {
  const outcomeLabel = actualOutcome === 1 ? 'win' : 'loss';
  return `Original thesis: ${thesis}. Outcome: ${outcomeLabel}.`;
}

function buildMoatChange(entry: number, exit: number): string {
  return `Moat score changed from ${entry} to ${exit}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a structured post-mortem for a closed investment position.
 *
 * @param input - All data required to produce the post-mortem.
 * @returns {@link PostMortemResult} with quadrant, lessons, and metrics.
 */
export function generatePostMortem(input: PostMortemInput): PostMortemResult {
  const {
    name,
    originalThesis,
    predictedProbability,
    actualOutcome,
    entryPrice,
    exitPrice,
    holdingPeriodDays,
    moatScoreAtEntry,
    moatScoreAtExit,
  } = input;

  const returnPct = (exitPrice - entryPrice) / entryPrice;
  const processQuality = classifyProcess(predictedProbability, actualOutcome);
  const outcomeQuality = classifyOutcome(returnPct);
  const quadrant = quadrantLabel(processQuality, outcomeQuality);
  const brierContribution = Math.pow(predictedProbability - actualOutcome, 2);
  const thesisReview = buildThesisReview(originalThesis, actualOutcome);
  const moatChange = buildMoatChange(moatScoreAtEntry, moatScoreAtExit);
  const lessons = deriveLessons(processQuality, outcomeQuality);

  return {
    name,
    returnPct,
    holdingPeriodDays,
    processQuality,
    outcomeQuality,
    quadrant,
    brierContribution,
    thesisReview,
    moatChange,
    lessons,
  };
}
