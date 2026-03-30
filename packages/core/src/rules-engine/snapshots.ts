import type { DatabaseConnection } from '../data/db.js';

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
import type { Rule } from '../models/rule.js';
import type { EvaluationResult } from './evaluator.js';

/**
 * A single scenario entry captured inside a decision snapshot.
 *
 * Mirrors the `scenarios` table columns that are relevant for forensic replay.
 */
export interface SnapshotScenario {
  scenarioCase: string;
  revenueGrowth?: number | null;
  margin?: number | null;
  multiple?: number | null;
  probabilityWeight?: number | null;
  targetPrice?: number | null;
  expectedValue?: number | null;
}

/**
 * The fully hydrated form of a decision snapshot as returned from the DB.
 */
export interface DecisionSnapshot {
  id: string;
  investmentId: string;
  snapshotAt: Date;
  activeRules: Rule[];
  scores: EvaluationResult[];
  kellyPosition: number | null;
  scenarios: SnapshotScenario[];
}

/** Raw row shape returned from the `decision_snapshots` table. */
interface SnapshotRow {
  id: string;
  investment_id: string;
  snapshot_at: string;
  active_rules_json: string;
  scores_json: string;
  kelly_position: number | null;
  scenario_json: string | null;
}

/** Convert a raw DB row to a {@link DecisionSnapshot}. */
function rowToSnapshot(row: SnapshotRow): DecisionSnapshot {
  return {
    id: row.id,
    investmentId: row.investment_id,
    snapshotAt: new Date(row.snapshot_at),
    activeRules: safeParse(row.active_rules_json, [] as Rule[]),
    scores: safeParse(row.scores_json, [] as EvaluationResult[]),
    kellyPosition: row.kelly_position,
    scenarios: row.scenario_json ? safeParse(row.scenario_json, [] as SnapshotScenario[]) : [],
  };
}

/**
 * Freeze the current decision state as an immutable snapshot.
 *
 * Serializes all active rules, evaluation scores, the Kelly position, and
 * scenario projections to JSON and inserts a new row in `decision_snapshots`.
 * This provides a deterministic audit trail for post-mortem replay.
 *
 * @param db - Active database connection.
 * @param investmentId - The investment this snapshot belongs to.
 * @param activeRules - Active rules at the time of the decision.
 * @param scores - Evaluation results produced by the rules engine.
 * @param kellyPosition - Suggested position size (Kelly fraction), or null.
 * @param scenarios - Array of scenario projections for the investment.
 * @returns The UUID of the newly created snapshot.
 */
export function captureDecisionSnapshot(
  db: DatabaseConnection,
  investmentId: string,
  activeRules: Rule[],
  scores: EvaluationResult[],
  kellyPosition: number | null,
  scenarios: SnapshotScenario[],
): string {
  const id = crypto.randomUUID();
  const snapshotAt = new Date().toISOString();

  db.run(
    `INSERT INTO decision_snapshots
       (id, investment_id, snapshot_at, active_rules_json, scores_json, kelly_position, scenario_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    investmentId,
    snapshotAt,
    JSON.stringify(activeRules),
    JSON.stringify(scores),
    kellyPosition,
    JSON.stringify(scenarios),
  );

  return id;
}

/**
 * Retrieve a single decision snapshot by its ID.
 *
 * @param db - Active database connection.
 * @param id - UUID of the snapshot.
 * @returns The {@link DecisionSnapshot} if found, or `undefined`.
 */
export function getDecisionSnapshot(
  db: DatabaseConnection,
  id: string,
): DecisionSnapshot | undefined {
  const row = db.get<SnapshotRow>(
    `SELECT * FROM decision_snapshots WHERE id = ?`,
    id,
  );
  return row ? rowToSnapshot(row) : undefined;
}

/**
 * Return all decision snapshots for a given investment, newest first.
 *
 * @param db - Active database connection.
 * @param investmentId - ID of the investment to query.
 * @returns Array of {@link DecisionSnapshot} objects ordered by `snapshot_at` DESC.
 */
export function listDecisionSnapshots(
  db: DatabaseConnection,
  investmentId: string,
): DecisionSnapshot[] {
  const rows = db.all<SnapshotRow>(
    `SELECT * FROM decision_snapshots WHERE investment_id = ? ORDER BY snapshot_at DESC`,
    investmentId,
  );
  return rows.map(rowToSnapshot);
}
