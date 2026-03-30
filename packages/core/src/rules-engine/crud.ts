import { dump, load } from 'js-yaml';
import type { DatabaseConnection } from '../data/db.js';
import type { Rule } from '../models/rule.js';
import type { RuleDocument } from './yaml-parser.js';

/** Raw row shape returned from the `rules` table. */
interface RuleRow {
  id: string;
  name: string;
  version: number;
  category: string;
  type: string;
  source_type: string;
  source_detail: string;
  description: string;
  conditions_yaml: string;
  weight: number;
  active: number;
  active_from: string;
  active_to: string | null;
  created_at: string;
  times_fired: number;
  times_correct: number;
  believability_score: number;
}

/** Fields that may be updated on an existing rule. */
export interface RuleUpdates {
  name?: string;
  category?: Rule['category'];
  type?: Rule['type'];
  sourceType?: Rule['sourceType'];
  sourceDetail?: string;
  description?: string;
  conditions?: Rule['conditions'];
  weight?: number;
}

/** Convert a database row to the domain {@link Rule} model. */
function rowToRule(row: RuleRow): Rule {
  const conditions = load(row.conditions_yaml) as Rule['conditions'];
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    category: row.category as Rule['category'],
    type: row.type as Rule['type'],
    sourceType: row.source_type as Rule['sourceType'],
    sourceDetail: row.source_detail,
    description: row.description,
    conditions,
    weight: row.weight,
    active: row.active === 1,
    activeFrom: new Date(row.active_from),
    activeTo: row.active_to ? new Date(row.active_to) : null,
    createdAt: new Date(row.created_at),
    timesFired: row.times_fired,
    timesCorrect: row.times_correct,
    believabilityScore: row.believability_score,
  };
}

/**
 * Insert a new rule derived from a parsed YAML document.
 *
 * Generates a UUID via `crypto.randomUUID()` unless `id` is provided.
 * Sets version=1, active=true, and active_from/created_at to now.
 *
 * @param db - Active database connection.
 * @param ruleDoc - Validated rule document from the YAML parser.
 * @param id - Optional explicit ID; a UUID is generated when omitted.
 * @returns The ID of the inserted rule.
 */
export function createRule(db: DatabaseConnection, ruleDoc: RuleDocument, id?: string): string {
  const ruleId = id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const conditionsYaml = dump(ruleDoc.conditions);

  db.run(
    `INSERT INTO rules
       (id, name, version, category, type, source_type, source_detail, description,
        conditions_yaml, weight, active, active_from, active_to, created_at,
        times_fired, times_correct, believability_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ruleId,
    ruleDoc.name,
    1,
    ruleDoc.category,
    ruleDoc.type,
    ruleDoc.source_type,
    ruleDoc.source_detail,
    ruleDoc.description,
    conditionsYaml,
    ruleDoc.weight ?? 1.0,
    1,
    now,
    null,
    now,
    0,
    0,
    0.5,
  );

  return ruleId;
}

/**
 * Update an existing rule in place.
 *
 * Always increments `version`. If `conditions` are part of the update
 * (a semantic change), resets `believability_score` to 0.5. Sets
 * `active_from` to now to mark the start of the new version.
 *
 * @param db - Active database connection.
 * @param id - ID of the rule to update.
 * @param updates - Partial field set to apply.
 */
export function updateRule(db: DatabaseConnection, id: string, updates: RuleUpdates): void {
  const existing = getRuleById(db, id);
  if (!existing) {
    throw new Error(`Rule not found: ${id}`);
  }

  const now = new Date().toISOString();
  const isSemanticChange = updates.conditions !== undefined;
  const newBelieva = isSemanticChange ? 0.5 : existing.believabilityScore;
  const newConditionsYaml = updates.conditions !== undefined
    ? dump(updates.conditions)
    : dump(existing.conditions);

  db.run(
    `UPDATE rules SET
       name               = ?,
       version            = version + 1,
       category           = ?,
       type               = ?,
       source_type        = ?,
       source_detail      = ?,
       description        = ?,
       conditions_yaml    = ?,
       weight             = ?,
       active_from        = ?,
       believability_score = ?
     WHERE id = ?`,
    updates.name        ?? existing.name,
    updates.category    ?? existing.category,
    updates.type        ?? existing.type,
    updates.sourceType  ?? existing.sourceType,
    updates.sourceDetail ?? existing.sourceDetail,
    updates.description ?? existing.description,
    newConditionsYaml,
    updates.weight      ?? existing.weight,
    now,
    newBelieva,
    id,
  );
}

/**
 * Soft-delete a rule by setting `active_to` to now and `active` to false.
 *
 * Rules are never hard-deleted to preserve audit history.
 *
 * @param db - Active database connection.
 * @param id - ID of the rule to deactivate.
 */
export function softDeleteRule(db: DatabaseConnection, id: string): void {
  const now = new Date().toISOString();
  db.run(`UPDATE rules SET active = 0, active_to = ? WHERE id = ?`, now, id);
}

/**
 * Return all rules that are currently active (active=1 and active_to IS NULL).
 *
 * @param db - Active database connection.
 * @returns Array of active {@link Rule} domain objects.
 */
export function listActiveRules(db: DatabaseConnection): Rule[] {
  const rows = db.all<RuleRow>(
    `SELECT * FROM rules WHERE active = 1 AND active_to IS NULL`,
  );
  return rows.map(rowToRule);
}

/**
 * Retrieve a single rule by its ID.
 *
 * @param db - Active database connection.
 * @param id - Rule ID.
 * @returns The {@link Rule} if found, or `undefined` when absent.
 */
export function getRuleById(db: DatabaseConnection, id: string): Rule | undefined {
  const row = db.get<RuleRow>(`SELECT * FROM rules WHERE id = ?`, id);
  return row ? rowToRule(row) : undefined;
}
