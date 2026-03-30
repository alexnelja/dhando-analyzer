import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import {
  createRule,
  updateRule,
  softDeleteRule,
  listActiveRules,
  getRuleById,
} from '../../src/rules-engine/crud.js';
import type { RuleDocument } from '../../src/rules-engine/yaml-parser.js';

const BASE_RULE_DOC: RuleDocument = {
  name: 'Margin of Safety Gate',
  category: 'valuation',
  type: 'hard_gate',
  source_type: 'book',
  source_detail: 'Pabrai - Dhandho Investor, Ch. 7',
  description: 'Never buy without significant margin of safety',
  weight: 1.0,
  conditions: [
    { metric: 'intrinsic_value_discount', operator: 'gte', value: 0.3, weight: 1.0 },
  ],
};

let db: DatabaseConnection;

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

describe('createRule', () => {
  it('inserts a rule and returns its id', () => {
    const id = createRule(db, BASE_RULE_DOC);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('rule can be retrieved by id after creation', () => {
    const id = createRule(db, BASE_RULE_DOC);
    const rule = getRuleById(db, id);
    expect(rule).toBeDefined();
    expect(rule!.name).toBe('Margin of Safety Gate');
    expect(rule!.version).toBe(1);
    expect(rule!.active).toBe(true);
    expect(rule!.activeTo).toBeNull();
    expect(rule!.believabilityScore).toBe(0.5);
    expect(rule!.conditions).toHaveLength(1);
    expect(rule!.conditions[0].metric).toBe('intrinsic_value_discount');
  });

  it('uses provided id when supplied', () => {
    const id = createRule(db, BASE_RULE_DOC, 'my-fixed-id');
    expect(id).toBe('my-fixed-id');
    expect(getRuleById(db, 'my-fixed-id')).toBeDefined();
  });
});

describe('updateRule', () => {
  it('increments version on non-semantic update', () => {
    const id = createRule(db, BASE_RULE_DOC);
    updateRule(db, id, { name: 'Updated Name' });
    const rule = getRuleById(db, id);
    expect(rule!.version).toBe(2);
    expect(rule!.name).toBe('Updated Name');
  });

  it('increments version on semantic (conditions) update', () => {
    const id = createRule(db, BASE_RULE_DOC);
    updateRule(db, id, {
      conditions: [{ metric: 'pe_ratio', operator: 'lte', value: 10, weight: 1.0 }],
    });
    const rule = getRuleById(db, id);
    expect(rule!.version).toBe(2);
  });

  it('resets believabilityScore to 0.5 when conditions change', () => {
    const id = createRule(db, BASE_RULE_DOC);
    // Manually bump believability above 0.5 to confirm reset
    db.run('UPDATE rules SET believability_score = 0.8 WHERE id = ?', id);

    updateRule(db, id, {
      conditions: [{ metric: 'pe_ratio', operator: 'lte', value: 10, weight: 1.0 }],
    });
    const rule = getRuleById(db, id);
    expect(rule!.believabilityScore).toBe(0.5);
  });

  it('does NOT reset believabilityScore for non-semantic updates', () => {
    const id = createRule(db, BASE_RULE_DOC);
    db.run('UPDATE rules SET believability_score = 0.8 WHERE id = ?', id);

    updateRule(db, id, { name: 'New Name Only' });
    const rule = getRuleById(db, id);
    expect(rule!.believabilityScore).toBe(0.8);
  });

  it('throws when the rule id does not exist', () => {
    expect(() => updateRule(db, 'nonexistent-id', { name: 'X' })).toThrow();
  });
});

describe('softDeleteRule', () => {
  it('sets active=false and active_to is not null', () => {
    const id = createRule(db, BASE_RULE_DOC);
    softDeleteRule(db, id);
    const rule = getRuleById(db, id);
    expect(rule!.active).toBe(false);
    expect(rule!.activeTo).not.toBeNull();
  });

  it('deleted rule no longer appears in listActiveRules', () => {
    const id = createRule(db, BASE_RULE_DOC);
    softDeleteRule(db, id);
    const active = listActiveRules(db);
    expect(active.find((r) => r.id === id)).toBeUndefined();
  });
});

describe('listActiveRules', () => {
  it('returns only active rules', () => {
    const id1 = createRule(db, BASE_RULE_DOC, 'rule-1');
    const id2 = createRule(db, { ...BASE_RULE_DOC, name: 'Rule 2' }, 'rule-2');
    softDeleteRule(db, id2);

    const active = listActiveRules(db);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(id1);
  });

  it('returns empty array when no active rules exist', () => {
    expect(listActiveRules(db)).toHaveLength(0);
  });
});

describe('getRuleById', () => {
  it('returns undefined for a missing id', () => {
    const rule = getRuleById(db, 'does-not-exist');
    expect(rule).toBeUndefined();
  });

  it('returns the rule when it exists', () => {
    const id = createRule(db, BASE_RULE_DOC);
    const rule = getRuleById(db, id);
    expect(rule).toBeDefined();
    expect(rule!.id).toBe(id);
  });
});
