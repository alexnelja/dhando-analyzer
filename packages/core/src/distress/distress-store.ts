/**
 * Distress Persistence Store.
 *
 * Persists and retrieves distress assessment data to/from SQLite using the
 * `distress_components`, `distress_summary`, and `sentiment` tables defined
 * in the schema.
 *
 * All writes are idempotent with respect to the investment ID — repeated saves
 * for the same investment append new rows rather than overwriting, so callers
 * can maintain a full audit history of how assessments change over time.
 *
 * Use `getDistressSummary` / `getDistressComponents` to retrieve the most
 * recent assessment; query the table directly for historical analysis.
 */

import { randomUUID } from 'crypto';
import type { DatabaseConnection } from '../data/db.js';
import type { DistressFactors } from './classification.js';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

/**
 * Raw row from the `distress_components` table.
 */
export interface DistressComponentRow {
  id: string;
  investment_id: string;
  component: string;
  factor_score: number;
  calculated_at: string;
}

/**
 * Raw row from the `distress_summary` table.
 */
export interface DistressSummaryRow {
  id: string;
  investment_id: string;
  composite_score: number;
  permanence_score: number;
  classification: string;
  calculated_at: string;
}

/**
 * Raw row from the `sentiment` table.
 */
export interface SentimentRow {
  id: string;
  investment_id: string;
  source: string;
  headline: string;
  score: number;
  confidence: number;
  date: string;
}

// ---------------------------------------------------------------------------
// Distress components
// ---------------------------------------------------------------------------

/**
 * Persist all seven distress factor scores for an investment.
 *
 * Each factor in `factors` is saved as an individual row in `distress_components`.
 * Multiple calls for the same investment append new rows — no deletion occurs.
 *
 * @param db - Active database connection.
 * @param investmentId - ID of an existing investment row.
 * @param factors - Seven qualitative distress factor scores (0–10 each).
 */
export function saveDistressComponents(
  db: DatabaseConnection,
  investmentId: string,
  factors: DistressFactors,
): void {
  const now = new Date().toISOString();

  const entries: Array<[string, number]> = [
    ['cause', factors.cause],
    ['industry', factors.industry],
    ['balance_sheet', factors.balanceSheet],
    ['management', factors.management],
    ['competition', factors.competition],
    ['revenue_base', factors.revenueBase],
    ['asset_value', factors.assetValue],
  ];

  for (const [component, score] of entries) {
    db.run(
      `INSERT INTO distress_components (id, investment_id, component, factor_score, calculated_at)
       VALUES (?, ?, ?, ?, ?)`,
      randomUUID(),
      investmentId,
      component,
      score,
      now,
    );
  }
}

/**
 * Retrieve all distress component rows for an investment, ordered
 * by `calculated_at` descending (most recent first).
 *
 * @param db - Active database connection.
 * @param investmentId - Investment to query.
 * @returns All distress component rows for the investment.
 */
export function getDistressComponents(
  db: DatabaseConnection,
  investmentId: string,
): DistressComponentRow[] {
  return db.all<DistressComponentRow>(
    `SELECT * FROM distress_components
     WHERE investment_id = ?
     ORDER BY calculated_at DESC`,
    investmentId,
  );
}

// ---------------------------------------------------------------------------
// Distress summary
// ---------------------------------------------------------------------------

/**
 * Persist the distress summary verdict for an investment.
 *
 * @param db - Active database connection.
 * @param investmentId - ID of an existing investment row.
 * @param compositeScore - Composite distress score (0–100).
 * @param permanenceScore - Permanence score from the 7-factor classification (0–10).
 * @param classification - 'temporary' | 'uncertain' | 'permanent'.
 */
export function saveDistressSummary(
  db: DatabaseConnection,
  investmentId: string,
  compositeScore: number,
  permanenceScore: number,
  classification: 'temporary' | 'uncertain' | 'permanent',
): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO distress_summary (id, investment_id, composite_score, permanence_score, classification, calculated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    investmentId,
    compositeScore,
    permanenceScore,
    classification,
    now,
  );
}

/**
 * Retrieve the most recent distress summary for an investment.
 *
 * "Most recent" is determined by `calculated_at` descending.
 *
 * @param db - Active database connection.
 * @param investmentId - Investment to query.
 * @returns The latest {@link DistressSummaryRow}, or `undefined` if none exists.
 */
export function getDistressSummary(
  db: DatabaseConnection,
  investmentId: string,
): DistressSummaryRow | undefined {
  return db.get<DistressSummaryRow>(
    `SELECT * FROM distress_summary
     WHERE investment_id = ?
     ORDER BY calculated_at DESC
     LIMIT 1`,
    investmentId,
  );
}

// ---------------------------------------------------------------------------
// Sentiment
// ---------------------------------------------------------------------------

/**
 * A raw headline with all fields required for sentiment persistence.
 */
export interface SentimentHeadlineInput {
  headline: string;
  score: number;
  confidence: number;
  date: string;
  /** Sentiment data source identifier, e.g. 'eodhd' or 'gdelt'. */
  source?: string;
}

/**
 * Persist one or more headline sentiment records for an investment.
 *
 * @param db - Active database connection.
 * @param investmentId - ID of an existing investment row.
 * @param headlines - Sentiment records to persist.
 */
export function saveSentiment(
  db: DatabaseConnection,
  investmentId: string,
  headlines: SentimentHeadlineInput[],
): void {
  const now = new Date().toISOString();
  for (const h of headlines) {
    db.run(
      `INSERT INTO sentiment (id, investment_id, source, headline, score, confidence, date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      investmentId,
      h.source ?? 'manual',
      h.headline,
      h.score,
      h.confidence,
      h.date ?? now.slice(0, 10),
    );
  }
}

/**
 * Retrieve sentiment rows for an investment.
 *
 * @param db - Active database connection.
 * @param investmentId - Investment to query.
 * @param days - Optional number of days to look back from today.
 *   When provided, only rows with `date >= today - days` are returned.
 *   When omitted, all rows are returned.
 * @returns Sentiment rows ordered by date descending.
 */
export function getDailySentiment(
  db: DatabaseConnection,
  investmentId: string,
  days?: number,
): SentimentRow[] {
  if (days !== undefined) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return db.all<SentimentRow>(
      `SELECT * FROM sentiment
       WHERE investment_id = ? AND date >= ?
       ORDER BY date DESC`,
      investmentId,
      cutoffStr,
    );
  }

  return db.all<SentimentRow>(
    `SELECT * FROM sentiment
     WHERE investment_id = ?
     ORDER BY date DESC`,
    investmentId,
  );
}
