/**
 * Distress Radar Pipeline.
 *
 * Orchestrates all distress analysis layers into a single `DistressRadarResult`.
 *
 * Steps:
 *   1. Calculate composite distress score (6-factor).
 *   2. Classify distress (7-factor permanence framework).
 *   3. Optionally aggregate news sentiment and compute trend.
 *   4. Optionally match geopolitical event patterns.
 *   5. Determine turnaround candidate status.
 *   6. Optionally persist to database.
 *   7. Return DistressRadarResult.
 *
 * Turnaround candidate criteria (all three must hold):
 *   - classification === 'temporary'
 *   - piotroskiFCurrent > piotroskiFPrior  (F-Score improving)
 *   - compositeDistressScore > 60          (significant but not terminal distress)
 */

import {
  calculateCompositeDistress,
  type CompositeDistressInput,
} from './composite-distress.js';
import { classifyDistress, type DistressFactors } from './classification.js';
import {
  aggregateDailySentiment,
  computeSentimentTrend,
  type HeadlinePrediction,
} from './sentiment-aggregation.js';
import {
  matchGeopoliticalEvents,
  type GeopoliticalEventRule,
  type GeopoliticalMatch,
} from './geopolitical-matcher.js';
import {
  saveDistressComponents,
  saveDistressSummary,
  saveSentiment,
} from './distress-store.js';
import type { DatabaseConnection } from '../data/db.js';

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

/**
 * Full set of inputs for the distress radar pipeline.
 */
export interface DistressRadarInput {
  /** ID of an existing investment row in the database (required for persistence). */
  investmentId: string;

  // ── Financial inputs (composite distress) ───────────────────────────────

  /** Raw Altman Z-Score. */
  altmanZ: number;
  /** Piotroski F-Score for the current reporting period (0–9). */
  piotroskiFCurrent: number;
  /** Piotroski F-Score for the prior reporting period (0–9). */
  piotroskiFPrior: number;
  /** Beneish M-Score. */
  beneishM: number;
  /** Free cash flow for the current period. */
  fcfCurrent: number;
  /** Free cash flow for the prior period. */
  fcfPrior: number;
  /** Debt / EBITDA leverage ratio. */
  debtToEbitda: number;
  /** Working capital for the current period. */
  workingCapitalCurrent: number;
  /** Working capital for the prior period. */
  workingCapitalPrior: number;

  // ── Qualitative distress factors (classification) ────────────────────────

  /** Seven qualitative distress factors, each scored 0–10. */
  distressFactors: DistressFactors;

  // ── Optional: Sentiment ─────────────────────────────────────────────────

  /**
   * Raw headline sentiment predictions (from FinBERT or similar).
   * When provided, daily sentiment aggregation and trend computation are run.
   */
  headlines?: HeadlinePrediction[];

  // ── Optional: Geopolitical ──────────────────────────────────────────────

  /**
   * News articles from GDELT for geopolitical pattern matching.
   * When provided alongside `geopoliticalRules`, geopolitical matching is run.
   */
  articles?: { title: string; tone: number }[];

  /**
   * Geopolitical event rules to match against the `articles`.
   * When omitted or empty, geopolitical matching is skipped.
   */
  geopoliticalRules?: GeopoliticalEventRule[];
}

/**
 * Complete output of the distress radar pipeline.
 */
export interface DistressRadarResult {
  /**
   * Composite distress score (0–100).
   * Higher = more financial distress.
   */
  compositeDistressScore: number;

  /**
   * Per-component breakdown of the composite score.
   * Keys: altmanZ, piotroskiTrend, beneishM, fcfDeterioration, leverage, workingCapital.
   */
  compositeComponents: Record<string, number>;

  /**
   * Three-way classification of distress permanence.
   */
  classification: 'temporary' | 'uncertain' | 'permanent';

  /**
   * Weighted permanence score (0–10) from the 7-factor framework.
   */
  permanenceScore: number;

  /**
   * Sentiment trend result, present when headlines were provided.
   */
  sentimentTrend?: { trend: 'improving' | 'deteriorating' | 'stable'; avgScore: number };

  /**
   * Geopolitical match results, present when articles and rules were provided.
   */
  geopoliticalMatches?: GeopoliticalMatch[];

  /**
   * True when all three turnaround candidate criteria are met:
   * - classification === 'temporary'
   * - piotroskiFCurrent > piotroskiFPrior
   * - compositeDistressScore > 60
   */
  isTurnaroundCandidate: boolean;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full distress radar pipeline.
 *
 * All computation is deterministic given the same input. The optional `db`
 * parameter enables persistence of distress components, summary, and
 * sentiment rows.
 *
 * @param input - Complete distress radar inputs.
 * @param db - Optional database connection for persistence.
 * @returns {@link DistressRadarResult} with all analysis layers populated.
 */
export function runDistressRadar(
  input: DistressRadarInput,
  db?: DatabaseConnection,
): DistressRadarResult {
  const {
    investmentId,
    altmanZ,
    piotroskiFCurrent,
    piotroskiFPrior,
    beneishM,
    fcfCurrent,
    fcfPrior,
    debtToEbitda,
    workingCapitalCurrent,
    workingCapitalPrior,
    distressFactors,
    headlines,
    articles,
    geopoliticalRules,
  } = input;

  // ── Step 1: Composite distress score ──────────────────────────────────────
  const financialInput: CompositeDistressInput = {
    altmanZ,
    piotroskiFCurrent,
    piotroskiFPrior,
    beneishM,
    fcfCurrent,
    fcfPrior,
    debtToEbitda,
    workingCapitalCurrent,
    workingCapitalPrior,
  };
  const { score: compositeDistressScore, components: compositeComponents } =
    calculateCompositeDistress(financialInput);

  // ── Step 2: Distress classification ───────────────────────────────────────
  const { permanenceScore, classification } = classifyDistress(distressFactors);

  // ── Step 3: Sentiment trend (optional) ────────────────────────────────────
  let sentimentTrend: DistressRadarResult['sentimentTrend'];

  if (headlines && headlines.length > 0) {
    const daily = aggregateDailySentiment(headlines);
    sentimentTrend = computeSentimentTrend(daily);
  }

  // ── Step 4: Geopolitical matching (optional) ──────────────────────────────
  let geopoliticalMatches: GeopoliticalMatch[] | undefined;

  if (articles && articles.length > 0 && geopoliticalRules && geopoliticalRules.length > 0) {
    geopoliticalMatches = matchGeopoliticalEvents(articles, geopoliticalRules);
  }

  // ── Step 5: Turnaround candidate detection ────────────────────────────────
  const isTurnaroundCandidate =
    classification === 'temporary' &&
    piotroskiFCurrent > piotroskiFPrior &&
    compositeDistressScore > 60;

  // ── Step 6: Persistence (optional) ────────────────────────────────────────
  if (db) {
    saveDistressComponents(db, investmentId, distressFactors);
    saveDistressSummary(db, investmentId, compositeDistressScore, permanenceScore, classification);

    if (headlines && headlines.length > 0) {
      saveSentiment(
        db,
        investmentId,
        headlines.map((h) => ({
          headline: `sentiment-${h.date}`,
          score: h.score,
          confidence: h.confidence,
          date: h.date,
          source: 'finbert',
        })),
      );
    }
  }

  return {
    compositeDistressScore,
    compositeComponents,
    classification,
    permanenceScore,
    sentimentTrend,
    geopoliticalMatches,
    isTurnaroundCandidate,
  };
}
