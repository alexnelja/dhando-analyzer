import { randomUUID } from 'crypto';
import type { DatabaseConnection } from '../data/db.js';

/** Stale data threshold in hours — scores older than this get a warning flag. */
const STALE_THRESHOLD_HOURS = 72;

/**
 * Input shape for saving a score. The `staleWarning` field is auto-computed
 * from `dataStalenessHours` when not explicitly supplied.
 */
export interface ScoreInput {
  /** Investment this score belongs to — must already exist in the investments table. */
  investmentId: string;
  /**
   * Score category, e.g. `'altman_z'`, `'piotroski_f'`, `'composite'`.
   * Free-form string to allow future score types without a schema change.
   */
  scoreType: string;
  /** The numeric score value. */
  value: number;
  /** ISO-8601 string for when this score was calculated. Defaults to now. */
  calculatedAt?: string;
  /** Arbitrary serialisable inputs used to produce this score. */
  inputsJson?: Record<string, unknown>;
  /** Version ID of the financials row(s) used — for traceability. */
  financialsVersionId?: string | null;
  /**
   * How many hours old the underlying data is.
   * When this exceeds 72 hours, `staleWarning` is automatically set to true.
   */
  dataStalenessHours?: number;
  /** Explicit override for the stale warning. When omitted, auto-derived. */
  staleWarning?: boolean;
}

/**
 * Raw row shape returned by the scores table.
 */
export interface ScoreRow {
  id: string;
  investment_id: string;
  score_type: string;
  value: number;
  calculated_at: string;
  inputs_json: string;
  financials_version_id: string | null;
  data_staleness_hours: number;
  stale_warning: number;
}

/**
 * Persist a score row for an investment.
 *
 * The `staleWarning` flag is automatically set to `true` when
 * `dataStalenessHours > 72`, unless explicitly overridden by the caller.
 *
 * @param db - Active database connection.
 * @param score - Score data to persist.
 * @returns The id of the newly created score row.
 */
export function saveScore(db: DatabaseConnection, score: ScoreInput): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  const calculatedAt = score.calculatedAt ?? now;
  const dataStalenessHours = score.dataStalenessHours ?? 0;

  const staleWarning =
    score.staleWarning !== undefined
      ? score.staleWarning
      : dataStalenessHours > STALE_THRESHOLD_HOURS;

  db.run(
    `INSERT INTO scores
       (id, investment_id, score_type, value, calculated_at,
        inputs_json, financials_version_id, data_staleness_hours, stale_warning)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    score.investmentId,
    score.scoreType,
    score.value,
    calculatedAt,
    JSON.stringify(score.inputsJson ?? {}),
    score.financialsVersionId ?? null,
    dataStalenessHours,
    staleWarning ? 1 : 0,
  );

  return id;
}

/**
 * Return the most recent score of a given type for an investment.
 *
 * "Most recent" is determined by `calculated_at` descending.
 *
 * @param db - Active database connection.
 * @param investmentId - Investment to query.
 * @param scoreType - Score category to filter by.
 * @returns The latest {@link ScoreRow}, or `undefined` if none exists.
 */
export function getLatestScore(
  db: DatabaseConnection,
  investmentId: string,
  scoreType: string,
): ScoreRow | undefined {
  return db.get<ScoreRow>(
    `SELECT * FROM scores
     WHERE investment_id = ? AND score_type = ?
     ORDER BY calculated_at DESC
     LIMIT 1`,
    investmentId,
    scoreType,
  );
}

/**
 * Return all scores for an investment ordered by calculated_at descending.
 *
 * @param db - Active database connection.
 * @param investmentId - Investment to query.
 * @returns Array of {@link ScoreRow} ordered newest-first.
 */
export function listScoresForInvestment(
  db: DatabaseConnection,
  investmentId: string,
): ScoreRow[] {
  return db.all<ScoreRow>(
    `SELECT * FROM scores
     WHERE investment_id = ?
     ORDER BY calculated_at DESC`,
    investmentId,
  );
}
