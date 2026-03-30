import { randomUUID } from 'crypto';
import type { DatabaseConnection } from '../data/db.js';
import { InvestmentStatus } from '../models/investment.js';

/**
 * Minimal shape required to add an investment to the watchlist.
 * All nullable fields in the full Investment model are optional here.
 */
export interface WatchlistEntry {
  id?: string;
  type: string;
  name: string;
  ticker?: string | null;
  exchange?: string | null;
  sector?: string | null;
  industry?: string | null;
  dataSource?: string;
  userId?: string;
}

/**
 * Raw row shape returned by the investments table for watchlist queries.
 */
export interface InvestmentRow {
  id: string;
  type: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  status: string;
  pe_deal_stage: string | null;
  data_source: string;
  intrinsic_value: number | null;
  intrinsic_value_calculated_at: string | null;
  moat_score: number | null;
  management_score: number | null;
  circle_of_competence_fit: number | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

/** Ordered list of pipeline statuses that an investment can advance through. */
const PIPELINE: readonly string[] = [
  InvestmentStatus.SCREENING,
  InvestmentStatus.RESEARCHING,
  InvestmentStatus.DEEP_DIVE,
  InvestmentStatus.READY_TO_BUY,
  InvestmentStatus.HELD,
];

/** Statuses from which advancement is not permitted. */
const TERMINAL_STATUSES = new Set<string>([
  InvestmentStatus.HELD,
  InvestmentStatus.EXITED,
  InvestmentStatus.REJECTED,
]);

/**
 * Add an investment to the watchlist with status `screening`.
 *
 * If the entry has no `id`, a fresh UUID is generated. Returns the id so
 * callers can reference the row without a follow-up query.
 *
 * @param db - Active database connection.
 * @param investment - Investment data to persist.
 * @returns The id of the newly created row.
 */
export function addToWatchlist(db: DatabaseConnection, investment: WatchlistEntry): string {
  const id = investment.id ?? randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO investments
       (id, type, name, ticker, exchange, sector, industry, status,
        data_source, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'screening', ?, ?, ?, ?)`,
    id,
    investment.type,
    investment.name,
    investment.ticker ?? null,
    investment.exchange ?? null,
    investment.sector ?? null,
    investment.industry ?? null,
    investment.dataSource ?? 'manual',
    investment.userId ?? 'solo-investor',
    now,
    now,
  );

  return id;
}

/**
 * Remove an investment from the watchlist by setting its status to `rejected`.
 *
 * Hard-deletes are avoided so the record remains auditable. The investment
 * will no longer appear in default watchlist queries.
 *
 * @param db - Active database connection.
 * @param id - ID of the investment to reject.
 */
export function removeFromWatchlist(db: DatabaseConnection, id: string): void {
  db.run(
    `UPDATE investments SET status = 'rejected', updated_at = ? WHERE id = ?`,
    new Date().toISOString(),
    id,
  );
}

/**
 * Advance an investment to the next stage in the pipeline.
 *
 * Valid progression: screening → researching → deep_dive → ready_to_buy → held.
 *
 * @param db - Active database connection.
 * @param id - ID of the investment to advance.
 * @throws {Error} If the investment is not found.
 * @throws {Error} If the investment is already at a terminal state (held/exited/rejected).
 */
export function advancePipelineStatus(db: DatabaseConnection, id: string): void {
  const row = db.get<{ status: string }>(
    `SELECT status FROM investments WHERE id = ?`,
    id,
  );

  if (!row) {
    throw new Error(`Investment not found: ${id}`);
  }

  const current = row.status;

  if (TERMINAL_STATUSES.has(current)) {
    throw new Error(
      `Cannot advance investment '${id}' from terminal status '${current}'`,
    );
  }

  const currentIndex = PIPELINE.indexOf(current);
  if (currentIndex === -1) {
    throw new Error(`Unknown status '${current}' for investment '${id}'`);
  }

  const nextStatus = PIPELINE[currentIndex + 1];
  if (!nextStatus) {
    // Should not happen given TERMINAL_STATUSES guard above, but be explicit.
    throw new Error(`Investment '${id}' is already at the final pipeline stage`);
  }

  db.run(
    `UPDATE investments SET status = ?, updated_at = ? WHERE id = ?`,
    nextStatus,
    new Date().toISOString(),
    id,
  );
}

/**
 * Return all investments on the watchlist, optionally filtered by status.
 *
 * @param db - Active database connection.
 * @param status - Optional status filter. If omitted, all investments are returned.
 * @returns Array of investment rows ordered by created_at descending.
 */
export function getWatchlist(
  db: DatabaseConnection,
  status?: string,
): InvestmentRow[] {
  if (status !== undefined) {
    return db.all<InvestmentRow>(
      `SELECT * FROM investments WHERE status = ? ORDER BY created_at DESC`,
      status,
    );
  }
  return db.all<InvestmentRow>(`SELECT * FROM investments ORDER BY created_at DESC`);
}

/**
 * Return a single investment by its ID.
 *
 * @param db - Active database connection.
 * @param id - The investment ID to look up.
 * @returns The investment row, or `undefined` if not found.
 */
export function getInvestmentById(
  db: DatabaseConnection,
  id: string,
): InvestmentRow | undefined {
  return db.get<InvestmentRow>(`SELECT * FROM investments WHERE id = ?`, id);
}
