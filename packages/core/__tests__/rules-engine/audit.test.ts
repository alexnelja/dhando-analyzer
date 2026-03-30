import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import { logRuleFiring, recordOutcome, getAuditEntriesForInvestment } from '../../src/rules-engine/audit.js';

let db: DatabaseConnection;

/** Insert a minimal investment row required by the FK constraint. */
function seedInvestment(id: string): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    'listed_stock',
    'Test Company',
    'screening',
    'manual',
    'solo-investor',
    now,
    now,
  );
}

/** Insert a minimal rule row required by the FK constraint. */
function seedRule(id: string): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO rules
       (id, name, version, category, type, source_type, source_detail, description,
        conditions_yaml, weight, active, active_from, created_at,
        times_fired, times_correct, believability_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    'Test Rule',
    1,
    'valuation',
    'hard_gate',
    'book',
    'test',
    'test rule',
    '- metric: mos\n  operator: gte\n  value: 0.3\n  weight: 1.0\n',
    1.0,
    1,
    now,
    now,
    0,
    0,
    0.5,
  );
}

beforeEach(() => {
  db = createDatabase(':memory:');
  seedInvestment('inv-1');
  seedInvestment('inv-2');
  seedRule('rule-1');
  seedRule('rule-2');
});

afterEach(() => {
  db.close();
});

describe('logRuleFiring', () => {
  it('stores the audit entry and returns its id', () => {
    const auditId = logRuleFiring(db, {
      investmentId: 'inv-1',
      ruleId: 'rule-1',
      ruleVersion: 1,
      result: 'pass',
    });

    expect(typeof auditId).toBe('string');
    expect(auditId.length).toBeGreaterThan(0);

    const entry = db.get<{ id: string; result: string }>(
      `SELECT id, result FROM rule_audit_log WHERE id = ?`,
      auditId,
    );
    expect(entry).toBeDefined();
    expect(entry!.result).toBe('pass');
  });

  it('increments times_fired on the rule', () => {
    const before = db.get<{ times_fired: number }>(
      `SELECT times_fired FROM rules WHERE id = ?`,
      'rule-1',
    );
    expect(before!.times_fired).toBe(0);

    logRuleFiring(db, {
      investmentId: 'inv-1',
      ruleId: 'rule-1',
      ruleVersion: 1,
      result: 'fail',
    });

    const after = db.get<{ times_fired: number }>(
      `SELECT times_fired FROM rules WHERE id = ?`,
      'rule-1',
    );
    expect(after!.times_fired).toBe(1);
  });

  it('increments times_fired by 1 for each firing', () => {
    logRuleFiring(db, { investmentId: 'inv-1', ruleId: 'rule-1', ruleVersion: 1, result: 'pass' });
    logRuleFiring(db, { investmentId: 'inv-1', ruleId: 'rule-1', ruleVersion: 1, result: 'warn' });

    const row = db.get<{ times_fired: number }>(
      `SELECT times_fired FROM rules WHERE id = ?`,
      'rule-1',
    );
    expect(row!.times_fired).toBe(2);
  });

  it('stores override flag and reason', () => {
    const auditId = logRuleFiring(db, {
      investmentId: 'inv-1',
      ruleId: 'rule-1',
      ruleVersion: 1,
      result: 'fail',
      override: true,
      overrideReason: 'special circumstances',
    });

    const entry = db.get<{ override: number; override_reason: string }>(
      `SELECT override, override_reason FROM rule_audit_log WHERE id = ?`,
      auditId,
    );
    expect(entry!.override).toBe(1);
    expect(entry!.override_reason).toBe('special circumstances');
  });
});

describe('recordOutcome', () => {
  it('increments times_correct when outcome is correct', () => {
    const auditId = logRuleFiring(db, {
      investmentId: 'inv-1',
      ruleId: 'rule-1',
      ruleVersion: 1,
      result: 'pass',
    });

    recordOutcome(db, auditId, true);

    const row = db.get<{ times_correct: number }>(
      `SELECT times_correct FROM rules WHERE id = ?`,
      'rule-1',
    );
    expect(row!.times_correct).toBe(1);
  });

  it('does NOT increment times_correct when outcome is incorrect', () => {
    const auditId = logRuleFiring(db, {
      investmentId: 'inv-1',
      ruleId: 'rule-1',
      ruleVersion: 1,
      result: 'fail',
    });

    recordOutcome(db, auditId, false);

    const row = db.get<{ times_correct: number }>(
      `SELECT times_correct FROM rules WHERE id = ?`,
      'rule-1',
    );
    expect(row!.times_correct).toBe(0);
  });

  it('throws when the audit entry id does not exist', () => {
    expect(() => recordOutcome(db, 'nonexistent-audit-id', true)).toThrow();
  });
});

describe('getAuditEntriesForInvestment', () => {
  it('returns all audit entries for the given investment', () => {
    logRuleFiring(db, { investmentId: 'inv-1', ruleId: 'rule-1', ruleVersion: 1, result: 'pass' });
    logRuleFiring(db, { investmentId: 'inv-1', ruleId: 'rule-2', ruleVersion: 1, result: 'warn' });
    // Entry for a different investment — should not appear
    logRuleFiring(db, { investmentId: 'inv-2', ruleId: 'rule-1', ruleVersion: 1, result: 'fail' });

    const entries = getAuditEntriesForInvestment(db, 'inv-1');
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.investmentId === 'inv-1')).toBe(true);
  });

  it('returns an empty array when no entries exist for the investment', () => {
    const entries = getAuditEntriesForInvestment(db, 'inv-1');
    expect(entries).toHaveLength(0);
  });

  it('maps domain fields correctly', () => {
    const auditId = logRuleFiring(db, {
      id: 'audit-fixed-id',
      investmentId: 'inv-1',
      ruleId: 'rule-1',
      ruleVersion: 2,
      result: 'fail',
    });

    const entries = getAuditEntriesForInvestment(db, 'inv-1');
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.id).toBe('audit-fixed-id');
    expect(e.ruleId).toBe('rule-1');
    expect(e.ruleVersion).toBe(2);
    expect(e.result).toBe('fail');
    expect(e.firedAt).toBeInstanceOf(Date);
    expect(e.override).toBe(false);
    expect(e.overrideReason).toBeNull();
  });
});
