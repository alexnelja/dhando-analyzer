/**
 * Journal Store — CRUD operations for the `decision_journal` table.
 *
 * The decision journal captures the investment thesis and confidence at the
 * time of a decision.  When the outcome is known, `updateJournalOutcome`
 * records the actual result and auto-calculates the Brier score.
 *
 * Brier score: (predictedProbability − actualOutcome)²
 *   - Lower is better; 0 = perfect, 1 = maximally wrong.
 *   - actualOutcome is 1 (win) or 0 (loss).
 */

import type { DatabaseConnection } from '../data/db.js';

/** A single journal entry as stored in the database. */
export interface JournalRow {
  id: string;
  investmentId: string;
  entryType: string;
  thesis: string | null;
  confidence: number | null;
  keyAssumptions: Record<string, unknown>;
  predictedProbability: number | null;
  actualOutcome: number | null;
  brierScore: number | null;
  lessons: string | null;
  createdAt: string;
}

/** Data required to create a new journal entry. */
export interface JournalEntryInsert {
  investmentId: string;
  entryType: string;
  thesis?: string | null;
  confidence?: number | null;
  keyAssumptions?: Record<string, unknown>;
  predictedProbability?: number | null;
  lessons?: string | null;
}

/** Raw row shape returned from the database. */
interface DbJournalRow {
  id: string;
  investment_id: string;
  entry_type: string;
  thesis: string | null;
  confidence: number | null;
  key_assumptions_json: string;
  predicted_probability: number | null;
  actual_outcome: number | null;
  brier_score: number | null;
  lessons: string | null;
  created_at: string;
}

function rowToJournal(row: DbJournalRow): JournalRow {
  let keyAssumptions: Record<string, unknown> = {};
  try {
    keyAssumptions = JSON.parse(row.key_assumptions_json ?? '{}');
  } catch {
    // fall back to empty object on malformed JSON
  }

  return {
    id: row.id,
    investmentId: row.investment_id,
    entryType: row.entry_type,
    thesis: row.thesis,
    confidence: row.confidence,
    keyAssumptions,
    predictedProbability: row.predicted_probability,
    actualOutcome: row.actual_outcome,
    brierScore: row.brier_score,
    lessons: row.lessons,
    createdAt: row.created_at,
  };
}

/**
 * Insert a new decision journal entry.
 *
 * @param db - Active database connection.
 * @param entry - Entry data; `investmentId` and `entryType` are required.
 * @returns The UUID of the newly created entry.
 */
export function createJournalEntry(db: DatabaseConnection, entry: JournalEntryInsert): string {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.run(
    `INSERT INTO decision_journal
       (id, investment_id, entry_type, thesis, confidence, key_assumptions_json,
        predicted_probability, actual_outcome, brier_score, lessons, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    id,
    entry.investmentId,
    entry.entryType,
    entry.thesis ?? null,
    entry.confidence ?? null,
    JSON.stringify(entry.keyAssumptions ?? {}),
    entry.predictedProbability ?? null,
    entry.lessons ?? null,
    createdAt,
  );

  return id;
}

/**
 * Record the actual outcome of a decision and compute the Brier score.
 *
 * Brier score = (predictedProbability − actualOutcome)²
 * `actualOutcome` should be 1 (investment succeeded) or 0 (failed).
 *
 * If `predictedProbability` is null in the stored row the Brier score is
 * stored as null.
 *
 * @param db - Active database connection.
 * @param id - UUID of the journal entry to update.
 * @param actualOutcome - 1 for a win, 0 for a loss.
 */
export function updateJournalOutcome(
  db: DatabaseConnection,
  id: string,
  actualOutcome: number,
): void {
  // Fetch the existing row to derive the Brier score.
  const row = db.get<DbJournalRow>(`SELECT * FROM decision_journal WHERE id = ?`, id);

  if (!row) {
    throw new Error(`updateJournalOutcome: journal entry "${id}" not found`);
  }

  const predicted = row.predicted_probability;
  const brierScore =
    predicted !== null ? Math.pow(predicted - actualOutcome, 2) : null;

  db.run(
    `UPDATE decision_journal
     SET actual_outcome = ?, brier_score = ?
     WHERE id = ?`,
    actualOutcome,
    brierScore,
    id,
  );
}

/**
 * Retrieve all journal entries for a given investment, newest first.
 *
 * @param db - Active database connection.
 * @param investmentId - ID of the investment to query.
 * @returns Array of {@link JournalRow} objects ordered by `created_at` DESC.
 */
export function getJournalEntriesForInvestment(
  db: DatabaseConnection,
  investmentId: string,
): JournalRow[] {
  const rows = db.all<DbJournalRow>(
    `SELECT * FROM decision_journal WHERE investment_id = ? ORDER BY created_at DESC`,
    investmentId,
  );
  return rows.map(rowToJournal);
}

/**
 * Retrieve the most recent journal entry of a given type for an investment.
 *
 * Useful for fetching the latest "buy" or "review" entry without loading the
 * entire journal.
 *
 * @param db - Active database connection.
 * @param investmentId - ID of the investment to query.
 * @param entryType - The entry type to filter by (e.g. `'buy'`, `'review'`).
 * @returns The most recent matching {@link JournalRow}, or `undefined`.
 */
export function getLatestJournalEntry(
  db: DatabaseConnection,
  investmentId: string,
  entryType: string,
): JournalRow | undefined {
  const row = db.get<DbJournalRow>(
    `SELECT * FROM decision_journal
     WHERE investment_id = ? AND entry_type = ?
     ORDER BY created_at DESC, rowid DESC
     LIMIT 1`,
    investmentId,
    entryType,
  );
  return row ? rowToJournal(row) : undefined;
}
