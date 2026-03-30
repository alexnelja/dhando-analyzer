import { randomUUID } from 'crypto';
import type { DatabaseConnection } from '../data/db.js';
import type { SuperInvestorPosition } from '../models/super-investor.js';

/**
 * Row shape returned by the super_investor_positions table.
 */
interface PositionRow {
  id: string;
  investor_name: string;
  ticker: string;
  action: string;
  quarter: string;
  shares: number | null;
  value: number | null;
}

/**
 * Convergence signal derived from the local super_investor_positions store.
 * A ticker held by multiple super investors indicates broad conviction.
 */
export interface SuperInvestorConvergenceSignal {
  /** Stock ticker. */
  ticker: string;
  /** Distinct investor names that hold this ticker. */
  investors: string[];
  /** Number of distinct investors (same as investors.length). */
  count: number;
}

/**
 * Insert or update super investor positions idempotently.
 *
 * The natural key is (investor_name, ticker, quarter). If a row with the same
 * key already exists it is overwritten in-place; otherwise a new row is created
 * with a fresh UUID. This makes repeated imports of the same 13F dataset safe.
 *
 * @param db - Active database connection.
 * @param positions - Array of positions to persist.
 */
export function upsertSuperInvestorPositions(
  db: DatabaseConnection,
  positions: Omit<SuperInvestorPosition, 'id'>[],
): void {
  for (const pos of positions) {
    const existing = db.get<PositionRow>(
      `SELECT id FROM super_investor_positions
       WHERE investor_name = ? AND ticker = ? AND quarter = ?`,
      pos.investorName,
      pos.ticker,
      pos.quarter,
    );

    const id = existing?.id ?? randomUUID();

    db.run(
      `INSERT INTO super_investor_positions (id, investor_name, ticker, action, quarter, shares, value)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         action  = excluded.action,
         shares  = excluded.shares,
         value   = excluded.value`,
      id,
      pos.investorName,
      pos.ticker,
      pos.action,
      pos.quarter,
      pos.shares ?? null,
      pos.value ?? null,
    );
  }
}

/**
 * Query the positions table and return tickers where at least `threshold`
 * distinct investors hold a position.
 *
 * Convergence is measured across all quarters — the signal indicates that
 * multiple independent investors have, at some point, chosen to own the same
 * ticker. Filter by quarter in the caller if recency matters.
 *
 * @param db - Active database connection.
 * @param threshold - Minimum number of distinct investors required (default 3).
 * @returns Array of {@link ConvergenceSignal} sorted by count descending.
 */
export function getConvergenceSignals(
  db: DatabaseConnection,
  threshold = 3,
): SuperInvestorConvergenceSignal[] {
  const rows = db.all<{ ticker: string; investor_name: string }>(
    `SELECT ticker, investor_name FROM super_investor_positions`,
  );

  // Group by ticker → set of distinct investor names.
  const byTicker = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!byTicker.has(row.ticker)) {
      byTicker.set(row.ticker, new Set());
    }
    byTicker.get(row.ticker)!.add(row.investor_name);
  }

  const signals: SuperInvestorConvergenceSignal[] = [];
  for (const [ticker, investorSet] of byTicker) {
    if (investorSet.size >= threshold) {
      signals.push({
        ticker,
        investors: Array.from(investorSet).sort(),
        count: investorSet.size,
      });
    }
  }

  return signals.sort((a, b) => b.count - a.count);
}
