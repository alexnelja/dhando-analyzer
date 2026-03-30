import type { DatabaseConnection } from '../data/db.js';
import type { RuleAuditEntry } from '../models/rule.js';

/** Raw row shape returned from the `rule_audit_log` table. */
interface AuditRow {
  id: string;
  investment_id: string;
  rule_id: string;
  rule_version: number;
  fired_at: string;
  result: string;
  override: number;
  override_reason: string | null;
}

/** Input shape for logging a single rule firing. */
export interface RuleFireEntry {
  id?: string;
  investmentId: string;
  ruleId: string;
  ruleVersion: number;
  result: 'pass' | 'fail' | 'warn';
  override?: boolean;
  overrideReason?: string | null;
}

/** Convert a database row to the domain {@link RuleAuditEntry} model. */
function rowToEntry(row: AuditRow): RuleAuditEntry {
  return {
    id: row.id,
    investmentId: row.investment_id,
    ruleId: row.rule_id,
    ruleVersion: row.rule_version,
    firedAt: new Date(row.fired_at),
    result: row.result as RuleAuditEntry['result'],
    override: row.override === 1,
    overrideReason: row.override_reason ?? null,
  };
}

/**
 * Record a rule firing in the audit log and increment `times_fired` on the rule.
 *
 * Generates a UUID via `crypto.randomUUID()` unless `entry.id` is provided.
 *
 * @param db - Active database connection.
 * @param entry - Details of the rule firing to log.
 * @returns The ID of the newly created audit log entry.
 */
export function logRuleFiring(db: DatabaseConnection, entry: RuleFireEntry): string {
  const auditId = entry.id ?? crypto.randomUUID();
  const firedAt = new Date().toISOString();

  db.run(
    `INSERT INTO rule_audit_log
       (id, investment_id, rule_id, rule_version, fired_at, result, override, override_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    auditId,
    entry.investmentId,
    entry.ruleId,
    entry.ruleVersion,
    firedAt,
    entry.result,
    entry.override ? 1 : 0,
    entry.overrideReason ?? null,
  );

  db.run(
    `UPDATE rules SET times_fired = times_fired + 1 WHERE id = ?`,
    entry.ruleId,
  );

  return auditId;
}

/**
 * Record the outcome of a previously logged rule firing.
 *
 * When `correct` is true, increments `times_correct` on the rule that
 * was referenced by the given audit entry.
 *
 * @param db - Active database connection.
 * @param auditId - ID of the audit log entry whose outcome is being recorded.
 * @param correct - Whether the rule's prediction turned out to be correct.
 */
export function recordOutcome(db: DatabaseConnection, auditId: string, correct: boolean): void {
  if (!correct) return;

  const entry = db.get<{ rule_id: string }>(
    `SELECT rule_id FROM rule_audit_log WHERE id = ?`,
    auditId,
  );
  if (!entry) {
    throw new Error(`Audit entry not found: ${auditId}`);
  }

  db.run(
    `UPDATE rules SET times_correct = times_correct + 1 WHERE id = ?`,
    entry.rule_id,
  );
}

/**
 * Retrieve all audit log entries for a given investment.
 *
 * Results are ordered by `fired_at` ascending.
 *
 * @param db - Active database connection.
 * @param investmentId - ID of the investment to query.
 * @returns Array of {@link RuleAuditEntry} objects.
 */
export function getAuditEntriesForInvestment(
  db: DatabaseConnection,
  investmentId: string,
): RuleAuditEntry[] {
  const rows = db.all<AuditRow>(
    `SELECT * FROM rule_audit_log WHERE investment_id = ? ORDER BY fired_at ASC`,
    investmentId,
  );
  return rows.map(rowToEntry);
}
