/**
 * Scenario Store — CRUD operations for the `scenarios` table.
 *
 * Scenarios are linked to an investment by `investmentId` (foreign key).
 * All three operations (save, get, delete) are synchronous via better-sqlite3.
 */

import type { DatabaseConnection } from '../data/db.js';

/** A single scenario row as stored in the database. */
export interface ScenarioRow {
  id: string;
  investmentId: string;
  scenarioCase: string;
  revenueGrowth: number | null;
  margin: number | null;
  multiple: number | null;
  probabilityWeight: number | null;
  targetPrice: number | null;
  expectedValue: number | null;
}

/** The shape expected when inserting a scenario. */
export interface ScenarioInsert {
  case: string;
  revenueGrowth?: number | null;
  margin?: number | null;
  multiple?: number | null;
  probabilityWeight?: number | null;
  targetPrice?: number | null;
  expectedValue?: number | null;
}

/** Raw row shape returned from the database. */
interface DbScenarioRow {
  id: string;
  investment_id: string;
  scenario_case: string;
  revenue_growth: number | null;
  margin: number | null;
  multiple: number | null;
  probability_weight: number | null;
  target_price: number | null;
  expected_value: number | null;
}

function rowToScenario(row: DbScenarioRow): ScenarioRow {
  return {
    id: row.id,
    investmentId: row.investment_id,
    scenarioCase: row.scenario_case,
    revenueGrowth: row.revenue_growth,
    margin: row.margin,
    multiple: row.multiple,
    probabilityWeight: row.probability_weight,
    targetPrice: row.target_price,
    expectedValue: row.expected_value,
  };
}

/**
 * Bulk-insert scenarios for an investment.
 *
 * Each scenario gets a fresh `crypto.randomUUID()` primary key.
 * All scenarios share the same `investmentId` (foreign key).
 *
 * @param db - Active database connection.
 * @param investmentId - ID of the parent investment.
 * @param scenarios - Array of scenario data to insert.
 */
export function saveScenarios(
  db: DatabaseConnection,
  investmentId: string,
  scenarios: ScenarioInsert[],
): void {
  for (const s of scenarios) {
    const id = crypto.randomUUID();
    db.run(
      `INSERT INTO scenarios
         (id, investment_id, scenario_case, revenue_growth, margin, multiple,
          probability_weight, target_price, expected_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      investmentId,
      s.case,
      s.revenueGrowth ?? null,
      s.margin ?? null,
      s.multiple ?? null,
      s.probabilityWeight ?? null,
      s.targetPrice ?? null,
      s.expectedValue ?? null,
    );
  }
}

/**
 * Retrieve all scenarios for an investment, ordered by rowid (insertion order).
 *
 * @param db - Active database connection.
 * @param investmentId - ID of the investment to query.
 * @returns Array of {@link ScenarioRow} objects.
 */
export function getScenariosForInvestment(
  db: DatabaseConnection,
  investmentId: string,
): ScenarioRow[] {
  const rows = db.all<DbScenarioRow>(
    `SELECT * FROM scenarios WHERE investment_id = ? ORDER BY rowid`,
    investmentId,
  );
  return rows.map(rowToScenario);
}

/**
 * Delete all scenarios for an investment.
 *
 * Useful when re-running analysis and replacing stale scenario data.
 *
 * @param db - Active database connection.
 * @param investmentId - ID of the investment whose scenarios should be removed.
 */
export function deleteScenarios(db: DatabaseConnection, investmentId: string): void {
  db.run(`DELETE FROM scenarios WHERE investment_id = ?`, investmentId);
}
