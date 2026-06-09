/**
 * CRUD repository for the `financials` table.
 *
 * All scoring pages (DistressRadar, Screener, DealAnalyzer, …) read their
 * per-period figures through this single module so there is exactly one
 * source of truth for a company's financial statements.
 *
 * Persistence notes:
 * - `quarter` is nullable (annual rows have `quarter = NULL`). Upsert keying
 *   therefore uses the `IS` operator, which compares NULLs correctly, paired
 *   with the `IFNULL(quarter, -1)` unique index defined in `db.ts`.
 * - Booleans are stored as `0/1` integers; `Date` is stored as an ISO string.
 */

import type { DatabaseConnection } from './db.js';
import type { Financial } from '../models/financial.js';

/** Raw snake_case row shape as stored in SQLite. */
interface FinancialRow {
  id: string;
  investment_id: string;
  source: string;
  period: string;
  year: number;
  quarter: number | null;
  revenue: number | null;
  net_income: number | null;
  ebitda: number | null;
  total_assets: number | null;
  total_debt: number | null;
  cash: number | null;
  capex: number | null;
  fcf: number | null;
  working_capital: number | null;
  retained_earnings: number | null;
  ebit: number | null;
  total_liabilities: number | null;
  long_term_debt: number | null;
  current_assets: number | null;
  current_liabilities: number | null;
  shares_outstanding: number | null;
  gross_profit: number | null;
  receivables: number | null;
  ppe: number | null;
  depreciation: number | null;
  sga: number | null;
  cash_from_ops: number | null;
  api_values_json: string | null;
  overridden_fields: string | null;
  auto_updated: number | null;
  last_refresh: string | null;
  api_source: string | null;
}

/** Convert a stored snake_case row into a camelCase {@link Financial}. */
function mapRow(row: FinancialRow): Financial {
  return {
    id: row.id,
    investmentId: row.investment_id,
    source: row.source as Financial['source'],
    period: row.period as Financial['period'],
    year: row.year,
    quarter: row.quarter,
    revenue: row.revenue,
    netIncome: row.net_income,
    ebitda: row.ebitda,
    totalAssets: row.total_assets,
    totalDebt: row.total_debt,
    cash: row.cash,
    capex: row.capex,
    fcf: row.fcf,
    workingCapital: row.working_capital,
    retainedEarnings: row.retained_earnings,
    ebit: row.ebit,
    totalLiabilities: row.total_liabilities,
    longTermDebt: row.long_term_debt,
    currentAssets: row.current_assets,
    currentLiabilities: row.current_liabilities,
    sharesOutstanding: row.shares_outstanding,
    grossProfit: row.gross_profit,
    receivables: row.receivables,
    ppe: row.ppe,
    depreciation: row.depreciation,
    sga: row.sga,
    cashFromOps: row.cash_from_ops,
    apiValuesJson: row.api_values_json,
    overriddenFields: row.overridden_fields,
    autoUpdated: row.auto_updated === 1,
    lastRefresh: row.last_refresh ? new Date(row.last_refresh) : null,
    apiSource: row.api_source,
  };
}

/**
 * Insert or replace a financial row.
 *
 * Uniqueness is on `(investmentId, period, year, quarter)`. An existing row
 * with the same key is deleted first (within a transaction) so the new row's
 * values — including a possibly different `id` — fully replace it.
 */
export function saveFinancial(db: DatabaseConnection, f: Financial): void {
  const tx = db.sqlite.transaction(() => {
    db.run(
      `DELETE FROM financials
         WHERE investment_id = ? AND period = ? AND year = ? AND quarter IS ?`,
      f.investmentId,
      f.period,
      f.year,
      f.quarter,
    );
    db.run(
      `INSERT INTO financials (
         id, investment_id, source, period, year, quarter,
         revenue, net_income, ebitda, total_assets, total_debt, cash, capex, fcf, working_capital,
         retained_earnings, ebit, total_liabilities, long_term_debt, current_assets,
         current_liabilities, shares_outstanding, gross_profit, receivables, ppe,
         depreciation, sga, cash_from_ops, api_values_json, overridden_fields,
         auto_updated, last_refresh, api_source
       ) VALUES (
         ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?
       )`,
      f.id,
      f.investmentId,
      f.source,
      f.period,
      f.year,
      f.quarter,
      f.revenue,
      f.netIncome,
      f.ebitda,
      f.totalAssets,
      f.totalDebt,
      f.cash,
      f.capex,
      f.fcf,
      f.workingCapital,
      f.retainedEarnings,
      f.ebit,
      f.totalLiabilities,
      f.longTermDebt,
      f.currentAssets,
      f.currentLiabilities,
      f.sharesOutstanding,
      f.grossProfit,
      f.receivables,
      f.ppe,
      f.depreciation,
      f.sga,
      f.cashFromOps,
      f.apiValuesJson,
      f.overriddenFields,
      f.autoUpdated ? 1 : 0,
      f.lastRefresh ? f.lastRefresh.toISOString() : null,
      f.apiSource,
    );
  });
  tx();
}

/**
 * Return every financial row for an investment, most recent period first
 * (year descending, then quarter descending with annual rows last).
 */
export function getFinancialsForInvestment(
  db: DatabaseConnection,
  investmentId: string,
): Financial[] {
  const rows = db.all<FinancialRow>(
    `SELECT * FROM financials
       WHERE investment_id = ?
       ORDER BY year DESC, IFNULL(quarter, 0) DESC`,
    investmentId,
  );
  return rows.map(mapRow);
}

/**
 * Return the two most recent annual periods for an investment. Quarterly rows
 * are ignored — the dual-period scores (Piotroski, Beneish) compare full years.
 */
export function getCurrentAndPrior(
  db: DatabaseConnection,
  investmentId: string,
): { current: Financial | null; prior: Financial | null } {
  const rows = db.all<FinancialRow>(
    `SELECT * FROM financials
       WHERE investment_id = ? AND period = 'annual'
       ORDER BY year DESC
       LIMIT 2`,
    investmentId,
  );
  const mapped = rows.map(mapRow);
  return { current: mapped[0] ?? null, prior: mapped[1] ?? null };
}
