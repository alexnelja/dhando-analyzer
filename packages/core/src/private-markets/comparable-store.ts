/**
 * Comparable Transaction Store — persists and queries the M&A comparable
 * transaction database used for private-market valuation benchmarks.
 *
 * All operations target the `comparable_transactions` table defined in
 * {@link module:data/schema}. Rows are keyed by a UUID generated at insert
 * time. Callers never need to supply an `id`.
 *
 * @see {@link module:data/schema} — `comparableTransactions` table definition.
 */

import { randomUUID } from 'crypto';
import type { DatabaseConnection } from '../data/db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input required to persist a new comparable transaction.
 * All fields except `dealType` are optional to accommodate partial data.
 */
export interface ComparableTransactionInsert {
  /** Category of transaction, e.g. 'acquisition', 'buyout', 'minority_stake'. */
  dealType: string;
  /** Broad industry sector, e.g. 'technology', 'healthcare'. */
  sector?: string | null;
  /** More specific industry classification. */
  industry?: string | null;
  /** The metric the multiple is expressed on, e.g. 'EV/EBITDA', 'EV/Revenue'. */
  valuationMetric?: string | null;
  /** Numeric valuation multiple, e.g. 8.5 for 8.5× EBITDA. */
  valuationMultiple?: number | null;
  /** ISO-8601 date of the transaction. */
  date?: string | null;
  /** Any additional context, e.g. strategic rationale, seller type. */
  notes?: string | null;
}

/**
 * Raw database row shape for a comparable transaction.
 * Column names use the snake_case convention of the SQLite schema.
 */
export interface ComparableTransactionRow {
  id: string;
  deal_type: string;
  sector: string | null;
  industry: string | null;
  valuation_metric: string | null;
  valuation_multiple: number | null;
  date: string | null;
  notes: string | null;
}

/** Optional filters for {@link listComparables}. */
export interface ComparableFilters {
  /** Restrict results to a specific sector. */
  sector?: string;
  /** Restrict results to a specific deal type. */
  dealType?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Persist a new comparable transaction and return its generated id.
 *
 * @param db - Active database connection.
 * @param transaction - Data to insert.
 * @returns UUID of the newly created row.
 */
export function saveComparable(
  db: DatabaseConnection,
  transaction: ComparableTransactionInsert,
): string {
  const id = randomUUID();

  db.run(
    `INSERT INTO comparable_transactions
       (id, deal_type, sector, industry, valuation_metric, valuation_multiple, date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    transaction.dealType,
    transaction.sector ?? null,
    transaction.industry ?? null,
    transaction.valuationMetric ?? null,
    transaction.valuationMultiple ?? null,
    transaction.date ?? null,
    transaction.notes ?? null,
  );

  return id;
}

/**
 * List comparable transactions, with optional filtering.
 *
 * Rows are returned in insertion order (ascending `rowid`).
 *
 * @param db - Active database connection.
 * @param filters - Optional sector and/or deal-type filters.
 * @returns Array of matching rows.
 */
export function listComparables(
  db: DatabaseConnection,
  filters?: ComparableFilters,
): ComparableTransactionRow[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.sector !== undefined) {
    conditions.push('sector = ?');
    params.push(filters.sector);
  }

  if (filters?.dealType !== undefined) {
    conditions.push('deal_type = ?');
    params.push(filters.dealType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM comparable_transactions ${where} ORDER BY rowid ASC`;

  return db.all<ComparableTransactionRow>(sql, ...params);
}

/**
 * Retrieve a single comparable transaction by its id.
 *
 * @param db - Active database connection.
 * @param id - UUID of the transaction.
 * @returns The matching row, or `undefined` if not found.
 */
export function getComparableById(
  db: DatabaseConnection,
  id: string,
): ComparableTransactionRow | undefined {
  return db.get<ComparableTransactionRow>(
    `SELECT * FROM comparable_transactions WHERE id = ?`,
    id,
  );
}

/**
 * Compute the median `valuation_multiple` for all transactions in a given
 * sector that match a specific valuation metric.
 *
 * Rows with a null `valuation_multiple` are excluded from the calculation.
 * Returns `null` when no matching rows exist.
 *
 * @param db - Active database connection.
 * @param sector - Sector to filter on (exact match).
 * @param metric - Valuation metric to filter on, e.g. 'EV/EBITDA'.
 * @returns Median valuation multiple, or `null` when no data exists.
 *
 * @example
 * ```ts
 * const median = getMedianMultiple(db, 'technology', 'EV/EBITDA');
 * // Returns e.g. 12.5 — the median EV/EBITDA for tech transactions.
 * ```
 */
export function getMedianMultiple(
  db: DatabaseConnection,
  sector: string,
  metric: string,
): number | null {
  const rows = db.all<{ valuation_multiple: number }>(
    `SELECT valuation_multiple
     FROM comparable_transactions
     WHERE sector = ?
       AND valuation_metric = ?
       AND valuation_multiple IS NOT NULL
     ORDER BY valuation_multiple ASC`,
    sector,
    metric,
  );

  if (rows.length === 0) return null;

  const values = rows.map((r) => r.valuation_multiple);
  const mid = Math.floor(values.length / 2);

  // Even count: average the two middle values.
  if (values.length % 2 === 0) {
    return (values[mid - 1]! + values[mid]!) / 2;
  }

  // Odd count: return the middle value.
  return values[mid]!;
}
