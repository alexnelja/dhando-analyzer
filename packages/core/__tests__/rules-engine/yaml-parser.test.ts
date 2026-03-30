import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRulesFromDirectory, parseRuleYaml, RuleYamlParseError } from '../../src/rules-engine/yaml-parser.js';

const TMP = join(tmpdir(), 'dhando-yaml-test');

const VALID_RULE_YAML = `
name: Margin of Safety Gate
category: valuation
type: hard_gate
source_type: book
source_detail: "Pabrai - Dhandho Investor, Ch. 7"
description: Never buy without significant margin of safety
weight: 1.0
conditions:
  - metric: intrinsic_value_discount
    operator: gte
    value: 0.30
    weight: 1.0
  - metric: bear_case_loss
    operator: lte
    value: 0.15
    weight: 0.8
`;

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('parseRuleYaml', () => {
  it('parses a valid rule document', () => {
    const rule = parseRuleYaml(VALID_RULE_YAML, 'test.yaml');
    expect(rule.name).toBe('Margin of Safety Gate');
    expect(rule.type).toBe('hard_gate');
    expect(rule.conditions).toHaveLength(2);
    expect(rule.conditions[0].operator).toBe('gte');
  });

  it('throws RuleYamlParseError when name is missing', () => {
    const bad = VALID_RULE_YAML.replace('name: Margin of Safety Gate\n', '');
    expect(() => parseRuleYaml(bad, 'bad.yaml')).toThrow(RuleYamlParseError);
  });

  it('throws RuleYamlParseError for unknown rule type', () => {
    const bad = VALID_RULE_YAML.replace('type: hard_gate', 'type: unknown_type');
    expect(() => parseRuleYaml(bad, 'bad.yaml')).toThrow(RuleYamlParseError);
  });

  it('throws RuleYamlParseError for unknown operator', () => {
    const bad = VALID_RULE_YAML.replace('operator: gte', 'operator: fuzzy');
    expect(() => parseRuleYaml(bad, 'bad.yaml')).toThrow(RuleYamlParseError);
  });

  it('parses between operator with array value', () => {
    const yaml = `
name: Z-Score Range
category: risk
type: scoring
source_type: book
source_detail: Altman 1968
description: Z-score in grey zone
weight: 0.5
conditions:
  - metric: altman_z
    operator: between
    value: [1.81, 2.99]
    weight: 1.0
`;
    const rule = parseRuleYaml(yaml, 'range.yaml');
    expect(rule.conditions[0].value).toEqual([1.81, 2.99]);
  });
});

describe('loadRulesFromDirectory', () => {
  it('loads all .yaml files in a directory', () => {
    writeFileSync(join(TMP, 'rule1.yaml'), VALID_RULE_YAML);
    writeFileSync(join(TMP, 'rule2.yaml'), VALID_RULE_YAML.replace('Margin of Safety Gate', 'Second Rule'));
    const rules = loadRulesFromDirectory(TMP);
    expect(rules).toHaveLength(2);
  });

  it('skips non-.yaml files', () => {
    writeFileSync(join(TMP, 'notes.txt'), 'ignore me');
    writeFileSync(join(TMP, 'rule.yaml'), VALID_RULE_YAML);
    const rules = loadRulesFromDirectory(TMP);
    expect(rules).toHaveLength(1);
  });

  it('skips invalid files and emits a warning, does not throw', () => {
    writeFileSync(join(TMP, 'good.yaml'), VALID_RULE_YAML);
    writeFileSync(join(TMP, 'bad.yaml'), 'name: only name, nothing else');
    const rules = loadRulesFromDirectory(TMP);
    expect(rules).toHaveLength(1);
  });

  it('returns empty array when directory is empty', () => {
    const rules = loadRulesFromDirectory(TMP);
    expect(rules).toHaveLength(0);
  });
});
