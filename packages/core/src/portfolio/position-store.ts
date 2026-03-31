/**
 * Position Store — CRUD operations for the `portfolio_positions` table.
 *
 * Tracks the lifecycle of a held investment position from entry through to exit.
 * Active positions have a null `exited_at`; closed positions have a recorded
 * exit price and timestamp.
 *
 * Upsert semantics: if a row with the given `investmentId` already exists,
 * it is replaced in full; otherwise a new row is created.
 */

import type { DatabaseConnection } from '../data/db.js';

/** A single portfolio position row as stored in the database. */
export interface PortfolioPositionRow {
  /** UUID primary key. */
  id: string;
  /** Foreign key to the `investments` table. */
  investmentId: string;
  /** Average cost per share paid at entry (local currency). */
  costBasis: number;
  /** Number of shares held. */
  shares: number;
  /** ISO 8601 date-time the position was opened. */
  enteredAt: string;
  /** ISO 8601 date-time the position was closed, or null if still active. */
  exitedAt: string | null;
  /** Exit price per share, or null if the position is still active. */
  exitPrice: number | null;
}

/** Data required to insert or replace a portfolio position. */
export interface PortfolioPositionInsert {
  /** Foreign key to the `investments` table. */
  investmentId: string;
  /** Average cost per share. */
  costBasis: number;
  /** Number of shares held. */
  shares: number;
  /**
   * ISO 8601 date-time of entry.
   * Defaults to the current instant if not provided.
   */
  enteredAt?: string;
}

/** Raw DB row shape (snake_case columns). */
interface DbPositionRow {
  id: string;
  investment_id: string;
  cost_basis: number;
  shares: number;
  entered_at: string;
  exited_at: string | null;
  exit_price: number | null;
}

function rowToPosition(row: DbPositionRow): PortfolioPositionRow {
  return {
    id: row.id,
    investmentId: row.investment_id,
    costBasis: row.cost_basis,
    shares: row.shares,
    enteredAt: row.entered_at,
    exitedAt: row.exited_at,
    exitPrice: row.exit_price,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Insert or replace the portfolio position for an investment.
 *
 * Uses `INSERT OR REPLACE` so that calling this again with the same
 * `investmentId` updates the existing record. The returned `id` is either
 * freshly generated (new row) or the id from the replaced row.
 *
 * @param db - Active database connection.
 * @param position - Position data to persist.
 * @returns The UUID of the inserted/replaced row.
 */
export function upsertPosition(
  db: DatabaseConnection,
  position: PortfolioPositionInsert,
): string {
  const existing = getPosition(db, position.investmentId);
  const id = existing?.id ?? crypto.randomUUID();
  const enteredAt = position.enteredAt ?? new Date().toISOString();

  db.run(
    `INSERT OR REPLACE INTO portfolio_positions
       (id, investment_id, cost_basis, shares, entered_at, exited_at, exit_price)
     VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    id,
    position.investmentId,
    position.costBasis,
    position.shares,
    enteredAt,
  );

  return id;
}

/**
 * Retrieve the portfolio position for a given investment, or undefined if none.
 *
 * @param db - Active database connection.
 * @param investmentId - The investment to look up.
 * @returns The {@link PortfolioPositionRow}, or `undefined`.
 */
export function getPosition(
  db: DatabaseConnection,
  investmentId: string,
): PortfolioPositionRow | undefined {
  const row = db.get<DbPositionRow>(
    `SELECT * FROM portfolio_positions WHERE investment_id = ? LIMIT 1`,
    investmentId,
  );
  return row ? rowToPosition(row) : undefined;
}

/**
 * List all active (not-yet-exited) portfolio positions.
 *
 * @param db - Active database connection.
 * @returns Array of {@link PortfolioPositionRow} where `exitedAt` is null.
 */
export function listActivePositions(db: DatabaseConnection): PortfolioPositionRow[] {
  const rows = db.all<DbPositionRow>(
    `SELECT * FROM portfolio_positions WHERE exited_at IS NULL ORDER BY entered_at ASC`,
  );
  return rows.map(rowToPosition);
}

/**
 * Close a portfolio position by recording the exit price and timestamp.
 *
 * @param db - Active database connection.
 * @param investmentId - The investment whose position should be closed.
 * @param exitPrice - The price per share at exit.
 * @throws {Error} If no position exists for `investmentId`.
 */
export function closePosition(
  db: DatabaseConnection,
  investmentId: string,
  exitPrice: number,
): void {
  const existing = getPosition(db, investmentId);
  if (!existing) {
    throw new Error(`closePosition: no position found for investment "${investmentId}"`);
  }

  db.run(
    `UPDATE portfolio_positions
     SET exited_at = ?, exit_price = ?
     WHERE investment_id = ?`,
    new Date().toISOString(),
    exitPrice,
    investmentId,
  );
}
