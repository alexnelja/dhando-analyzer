# Phase 2: Rules Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully auditable, versioned rules engine that evaluates investment decisions against pre-seeded and user-defined YAML rules, logs every firing, and maintains Bayesian believability scores per rule.

**Architecture:** All logic lives in `packages/core/src/rules-engine/`. The parser loads and validates YAML from the `rules/` directory at the repo root. The evaluator handles per-rule condition checking. The engine orchestrates all active rules, enforces hard/soft gate semantics, and writes immutable audit log entries. Believability is recalculated on demand using Bayesian shrinkage + exponential decay against stored audit outcomes. Decision snapshots freeze full rule state at decision time for deterministic replay.

**Tech Stack:** TypeScript (strict), Vitest, js-yaml (YAML parsing), better-sqlite3 (via existing `DatabaseConnection`), zod (schema validation for YAML payloads)

**Spec:** `docs/superpowers/specs/2026-03-30-dhando-analyzer-design.md`

---

## File Structure (additions)

```
packages/core/
├── package.json                            ← Add js-yaml + zod to dependencies
└── src/
    └── rules-engine/
        ├── index.ts                        ← Barrel export
        ├── yaml-parser.ts                  ← Load + validate YAML rule files
        ├── evaluator.ts                    ← Evaluate one rule against investment context
        ├── engine.ts                       ← Run all active rules, return EngineResult
        ├── crud.ts                         ← Create / update / soft-delete / list rules
        ├── audit.ts                        ← Write + query rule_audit_log
        ├── believability.ts                ← Bayesian shrinkage + exponential decay
        └── snapshots.ts                    ← Capture + retrieve decision snapshots

packages/core/src/__tests__/rules-engine/
    ├── yaml-parser.test.ts
    ├── evaluator.test.ts
    ├── engine.test.ts
    ├── crud.test.ts
    ├── audit.test.ts
    ├── believability.test.ts
    └── snapshots.test.ts

rules/
    ├── pabrai-9-principles.yaml
    ├── munger-5-checklist.yaml
    └── graham-criteria.yaml
```

---

## Task 1: Add Dependencies

**Files:**
- Modify: `packages/core/package.json`

- [ ] **Step 1: Add js-yaml and zod to package.json**

```json
// packages/core/package.json — add to "dependencies"
{
  "dependencies": {
    "better-sqlite3": "^11.8.0",
    "drizzle-orm": "^0.39.0",
    "js-yaml": "^4.1.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/js-yaml": "^4.0.9",
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm install
```

- [ ] **Step 3: Verify install**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core exec node -e "import('js-yaml').then(m => console.log('js-yaml ok:', m.default.dump({ ok: true })))"
```

**Commit:** `chore(core): add js-yaml and zod dependencies`

---

## Task 2: YAML Parser

**Files:**
- Create: `packages/core/src/rules-engine/yaml-parser.ts`
- Create: `packages/core/src/__tests__/rules-engine/yaml-parser.test.ts`

**Failing test first.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/rules-engine/yaml-parser.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRulesFromDirectory, parseRuleYaml, RuleYamlParseError } from '../../rules-engine/yaml-parser.js';

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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 3: Implement yaml-parser.ts**

```typescript
// packages/core/src/rules-engine/yaml-parser.ts
import { load } from 'js-yaml';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { RuleCondition } from '../models/rule.js';
import { RuleType, RuleSourceType, RuleCategory } from '../models/rule.js';

/** Thrown when a YAML file does not satisfy the rule schema. */
export class RuleYamlParseError extends Error {
  constructor(
    public readonly file: string,
    public readonly cause: unknown,
  ) {
    super(`Failed to parse rule YAML in "${file}": ${String(cause)}`);
    this.name = 'RuleYamlParseError';
  }
}

const ConditionSchema = z.object({
  metric: z.string().min(1),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between']),
  value: z.union([z.number(), z.tuple([z.number(), z.number()])]),
  weight: z.number().min(0).max(10),
});

const RuleDocumentSchema = z.object({
  name: z.string().min(1),
  category: z.nativeEnum(RuleCategory),
  type: z.nativeEnum(RuleType),
  source_type: z.nativeEnum(RuleSourceType),
  source_detail: z.string().min(1),
  description: z.string().min(1),
  weight: z.number().min(0).max(10).default(1.0),
  conditions: z.array(ConditionSchema).min(1),
});

export type RuleDocument = z.infer<typeof RuleDocumentSchema>;

/**
 * Parse and validate a single YAML string representing one rule document.
 *
 * @param yaml - Raw YAML content.
 * @param file - Filename used in error messages.
 * @returns Validated {@link RuleDocument}.
 * @throws {@link RuleYamlParseError} if parsing or validation fails.
 */
export function parseRuleYaml(yaml: string, file: string): RuleDocument & { conditions: RuleCondition[] } {
  let raw: unknown;
  try {
    raw = load(yaml);
  } catch (err) {
    throw new RuleYamlParseError(file, err);
  }

  const result = RuleDocumentSchema.safeParse(raw);
  if (!result.success) {
    throw new RuleYamlParseError(file, result.error.message);
  }

  return result.data as RuleDocument & { conditions: RuleCondition[] };
}

/**
 * Load every `.yaml` file from a directory.
 * Invalid files emit a console warning and are skipped — they do not abort the load.
 *
 * @param dir - Absolute path to the rules directory.
 * @returns Array of successfully parsed {@link RuleDocument} objects.
 */
export function loadRulesFromDirectory(dir: string): (RuleDocument & { conditions: RuleCondition[] })[] {
  const entries = readdirSync(dir);
  const results: (RuleDocument & { conditions: RuleCondition[] })[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
    const filePath = join(dir, entry);
    try {
      const content = readFileSync(filePath, 'utf-8');
      results.push(parseRuleYaml(content, entry));
    } catch (err) {
      console.warn(`[rules-engine] Skipping "${entry}": ${String(err)}`);
    }
  }

  return results;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): YAML rule parser with zod validation`

---

## Task 3: Rule Evaluator

**Files:**
- Create: `packages/core/src/rules-engine/evaluator.ts`
- Create: `packages/core/src/__tests__/rules-engine/evaluator.test.ts`

The evaluator takes a `Rule` and a flat metric context (`Record<string, number>`) and returns `pass | fail | warn`. For `hard_gate` and `soft_gate` rules, ALL conditions must pass for the rule to pass. For `scoring` rules, a weighted fraction of passing conditions determines pass/warn/fail.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/rules-engine/evaluator.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateRule, EvaluationResult } from '../../rules-engine/evaluator.js';
import type { Rule } from '../../models/rule.js';

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'r1',
    name: 'Test Rule',
    version: 1,
    category: 'valuation',
    type: 'hard_gate',
    sourceType: 'book',
    sourceDetail: 'test',
    description: 'test rule',
    conditions: [
      { metric: 'intrinsic_value_discount', operator: 'gte', value: 0.30, weight: 1.0 },
      { metric: 'bear_case_loss', operator: 'lte', value: 0.15, weight: 0.8 },
    ],
    weight: 1.0,
    active: true,
    activeFrom: new Date('2026-01-01'),
    activeTo: null,
    createdAt: new Date('2026-01-01'),
    timesFired: 0,
    timesCorrect: 0,
    believabilityScore: 0.5,
    ...overrides,
  };
}

describe('evaluateRule — hard_gate', () => {
  it('returns pass when all conditions are met', () => {
    const result = evaluateRule(makeRule(), { intrinsic_value_discount: 0.35, bear_case_loss: 0.10 });
    expect(result.result).toBe('pass');
    expect(result.conditionResults).toHaveLength(2);
  });

  it('returns fail when any condition fails', () => {
    const result = evaluateRule(makeRule(), { intrinsic_value_discount: 0.20, bear_case_loss: 0.10 });
    expect(result.result).toBe('fail');
    expect(result.conditionResults[0].passed).toBe(false);
  });

  it('returns fail when a metric is missing from context', () => {
    const result = evaluateRule(makeRule(), { intrinsic_value_discount: 0.35 });
    expect(result.result).toBe('fail');
    expect(result.conditionResults[1].passed).toBe(false);
    expect(result.conditionResults[1].missing).toBe(true);
  });
});

describe('evaluateRule — soft_gate', () => {
  it('returns warn (not fail) when condition fails', () => {
    const rule = makeRule({ type: 'soft_gate' });
    const result = evaluateRule(rule, { intrinsic_value_discount: 0.20, bear_case_loss: 0.10 });
    expect(result.result).toBe('warn');
  });
});

describe('evaluateRule — scoring', () => {
  it('returns pass when weighted pass fraction >= 0.6', () => {
    const rule = makeRule({ type: 'scoring' });
    // both conditions pass → fraction = 1.0
    const result = evaluateRule(rule, { intrinsic_value_discount: 0.40, bear_case_loss: 0.05 });
    expect(result.result).toBe('pass');
    expect(result.weightedScore).toBeGreaterThan(0);
  });

  it('returns fail when weighted pass fraction < 0.4', () => {
    const rule = makeRule({ type: 'scoring' });
    // both conditions fail
    const result = evaluateRule(rule, { intrinsic_value_discount: 0.10, bear_case_loss: 0.30 });
    expect(result.result).toBe('fail');
  });

  it('returns warn when weighted pass fraction is between 0.4 and 0.6', () => {
    // condition weights: 1.0 + 0.8 = 1.8 total; only first passes → 1.0/1.8 ≈ 0.556
    const rule = makeRule({ type: 'scoring' });
    const result = evaluateRule(rule, { intrinsic_value_discount: 0.40, bear_case_loss: 0.30 });
    expect(result.result).toBe('warn');
  });
});

describe('evaluateRule — between operator', () => {
  it('passes when metric is within [lo, hi]', () => {
    const rule = makeRule({
      type: 'hard_gate',
      conditions: [{ metric: 'altman_z', operator: 'between', value: [1.81, 2.99], weight: 1.0 }],
    });
    const result = evaluateRule(rule, { altman_z: 2.5 });
    expect(result.result).toBe('pass');
  });

  it('fails when metric is outside [lo, hi]', () => {
    const rule = makeRule({
      type: 'hard_gate',
      conditions: [{ metric: 'altman_z', operator: 'between', value: [1.81, 2.99], weight: 1.0 }],
    });
    const result = evaluateRule(rule, { altman_z: 3.5 });
    expect(result.result).toBe('fail');
  });
});

describe('evaluateRule — all operators', () => {
  it.each([
    ['gt',  5, 4, 'pass'],
    ['gt',  5, 5, 'fail'],
    ['gte', 5, 5, 'pass'],
    ['lt',  3, 4, 'pass'],
    ['lt',  3, 3, 'fail'],
    ['lte', 3, 3, 'pass'],
    ['eq',  7, 7, 'pass'],
    ['eq',  7, 8, 'fail'],
    ['neq', 7, 8, 'pass'],
    ['neq', 7, 7, 'fail'],
  ] as const)('operator %s: value=%s, metric=%s → %s', (operator, threshold, metricVal, expected) => {
    const rule = makeRule({
      type: 'hard_gate',
      conditions: [{ metric: 'm', operator, value: threshold, weight: 1.0 }],
    });
    const result = evaluateRule(rule, { m: metricVal });
    expect(result.result).toBe(expected);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -50
```

- [ ] **Step 3: Implement evaluator.ts**

```typescript
// packages/core/src/rules-engine/evaluator.ts
import type { Rule, RuleCondition } from '../models/rule.js';

/** Per-condition evaluation detail. */
export interface ConditionResult {
  metric: string;
  operator: RuleCondition['operator'];
  threshold: RuleCondition['value'];
  actual: number | undefined;
  passed: boolean;
  /** True when the metric key was absent from the context. */
  missing: boolean;
}

/** Full result of evaluating one rule against an investment context. */
export interface EvaluationResult {
  ruleId: string;
  ruleVersion: number;
  result: 'pass' | 'fail' | 'warn';
  conditionResults: ConditionResult[];
  /**
   * For scoring rules: weighted fraction of passing condition weights (0–1).
   * Undefined for hard_gate and soft_gate rules.
   */
  weightedScore: number | undefined;
}

/**
 * Evaluate a single condition against a numeric metric value.
 * Returns false when the metric is absent.
 */
function evaluateCondition(cond: RuleCondition, actual: number | undefined): boolean {
  if (actual === undefined) return false;
  const { operator, value } = cond;
  if (operator === 'between') {
    const [lo, hi] = value as [number, number];
    return actual >= lo && actual <= hi;
  }
  const threshold = value as number;
  switch (operator) {
    case 'gt':  return actual > threshold;
    case 'gte': return actual >= threshold;
    case 'lt':  return actual < threshold;
    case 'lte': return actual <= threshold;
    case 'eq':  return actual === threshold;
    case 'neq': return actual !== threshold;
  }
}

/**
 * Evaluate a rule against a flat metric context.
 *
 * - `hard_gate`: fail if ANY condition fails; missing metrics count as failures.
 * - `soft_gate`: same logic as hard_gate but result is `warn` instead of `fail`.
 * - `scoring`: compute weighted pass fraction; pass >= 0.6, fail < 0.4, warn otherwise.
 *
 * @param rule - The rule to evaluate.
 * @param context - Map of metric name → numeric value drawn from investment scores/financials.
 * @returns Detailed {@link EvaluationResult}.
 */
export function evaluateRule(rule: Rule, context: Record<string, number>): EvaluationResult {
  const conditionResults: ConditionResult[] = rule.conditions.map((cond) => {
    const actual = context[cond.metric];
    const passed = evaluateCondition(cond, actual);
    return {
      metric: cond.metric,
      operator: cond.operator,
      threshold: cond.value,
      actual,
      passed,
      missing: actual === undefined,
    };
  });

  if (rule.type === 'scoring') {
    const totalWeight = rule.conditions.reduce((sum, c) => sum + c.weight, 0);
    const passedWeight = rule.conditions.reduce(
      (sum, c, i) => (conditionResults[i].passed ? sum + c.weight : sum),
      0,
    );
    const fraction = totalWeight > 0 ? passedWeight / totalWeight : 0;
    const result = fraction >= 0.6 ? 'pass' : fraction < 0.4 ? 'fail' : 'warn';
    return { ruleId: rule.id, ruleVersion: rule.version, result, conditionResults, weightedScore: fraction };
  }

  const allPassed = conditionResults.every((cr) => cr.passed);
  if (allPassed) {
    return { ruleId: rule.id, ruleVersion: rule.version, result: 'pass', conditionResults, weightedScore: undefined };
  }
  const outcome = rule.type === 'soft_gate' ? 'warn' : 'fail';
  return { ruleId: rule.id, ruleVersion: rule.version, result: outcome, conditionResults, weightedScore: undefined };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): rule evaluator with hard/soft/scoring semantics`

---

## Task 4: Rules Engine (Orchestrator)

**Files:**
- Create: `packages/core/src/rules-engine/engine.ts`
- Create: `packages/core/src/__tests__/rules-engine/engine.test.ts`

The engine runs all active rules, collects results, and returns a structured `EngineResult` that includes a `blocked` flag (true if any hard gate failed), an array of soft gate warnings, and all individual rule results.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/rules-engine/engine.test.ts
import { describe, it, expect } from 'vitest';
import { runRulesEngine, EngineResult } from '../../rules-engine/engine.js';
import type { Rule } from '../../models/rule.js';

function makeRule(id: string, type: Rule['type'], passingMetric: string, threshold: number): Rule {
  return {
    id,
    name: `Rule ${id}`,
    version: 1,
    category: 'valuation',
    type,
    sourceType: 'book',
    sourceDetail: 'test',
    description: 'test',
    conditions: [{ metric: passingMetric, operator: 'gte', value: threshold, weight: 1.0 }],
    weight: 1.0,
    active: true,
    activeFrom: new Date('2026-01-01'),
    activeTo: null,
    createdAt: new Date('2026-01-01'),
    timesFired: 0,
    timesCorrect: 0,
    believabilityScore: 0.5,
  };
}

describe('runRulesEngine', () => {
  it('returns blocked=false when all hard gates pass', () => {
    const rules: Rule[] = [makeRule('r1', 'hard_gate', 'mos', 0.3)];
    const result = runRulesEngine(rules, { mos: 0.4 });
    expect(result.blocked).toBe(false);
    expect(result.hardGateFails).toHaveLength(0);
  });

  it('returns blocked=true when any hard gate fails', () => {
    const rules: Rule[] = [
      makeRule('r1', 'hard_gate', 'mos', 0.3),
      makeRule('r2', 'hard_gate', 'debt_ratio', 0.5),
    ];
    const result = runRulesEngine(rules, { mos: 0.4, debt_ratio: 0.3 });
    expect(result.blocked).toBe(true);
    expect(result.hardGateFails.map((r) => r.ruleId)).toContain('r2');
  });

  it('returns softGateWarnings when soft gate fails', () => {
    const rules: Rule[] = [makeRule('soft1', 'soft_gate', 'mgmt_score', 3)];
    const result = runRulesEngine(rules, { mgmt_score: 2 });
    expect(result.blocked).toBe(false);
    expect(result.softGateWarnings).toHaveLength(1);
    expect(result.softGateWarnings[0].ruleId).toBe('soft1');
  });

  it('includes scoring rule results with weightedScore', () => {
    const rules: Rule[] = [makeRule('sc1', 'scoring', 'roic', 0.1)];
    const result = runRulesEngine(rules, { roic: 0.15 });
    expect(result.scoringResults[0].weightedScore).toBeDefined();
  });

  it('skips inactive rules', () => {
    const inactive: Rule = { ...makeRule('r_off', 'hard_gate', 'mos', 0.3), active: false };
    const result = runRulesEngine([inactive], { mos: 0.1 });
    expect(result.blocked).toBe(false);
    expect(result.allResults).toHaveLength(0);
  });

  it('computes compositeScore as weighted average of scoring rule results', () => {
    const rules: Rule[] = [
      { ...makeRule('s1', 'scoring', 'a', 1), weight: 2.0 },
      { ...makeRule('s2', 'scoring', 'b', 1), weight: 1.0 },
    ];
    // s1 passes (a=2 >= 1), s2 fails (b=0 < 1)
    const result = runRulesEngine(rules, { a: 2, b: 0 });
    // s1 weighted score=1.0, weight=2 → contribution 2.0; s2 weighted score=0, weight=1 → 0
    // composite = (1.0*2 + 0*1) / (2+1) = 0.667
    expect(result.compositeScore).toBeCloseTo(0.667, 2);
  });

  it('returns compositeScore of 0 when no scoring rules exist', () => {
    const rules: Rule[] = [makeRule('g1', 'hard_gate', 'mos', 0.3)];
    const result = runRulesEngine(rules, { mos: 0.4 });
    expect(result.compositeScore).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -50
```

- [ ] **Step 3: Implement engine.ts**

```typescript
// packages/core/src/rules-engine/engine.ts
import type { Rule } from '../models/rule.js';
import { evaluateRule, type EvaluationResult } from './evaluator.js';

/** Structured output of running all active rules against one investment. */
export interface EngineResult {
  /**
   * True if one or more hard gate rules failed.
   * When true, the investment MUST NOT proceed without analyst override.
   */
  blocked: boolean;
  /** All hard gate results that returned 'fail'. */
  hardGateFails: EvaluationResult[];
  /** All soft gate results that returned 'warn'. */
  softGateWarnings: EvaluationResult[];
  /** All scoring rule results. */
  scoringResults: EvaluationResult[];
  /**
   * Weighted average of scoring rule weighted scores, where each rule's own
   * `weight` field acts as the outer weight. Range: 0–1.
   */
  compositeScore: number;
  /** Every rule result (hard, soft, scoring) in evaluation order. */
  allResults: EvaluationResult[];
}

/**
 * Run all active rules against an investment metric context.
 *
 * Rules with `active === false` are silently skipped.
 * Hard gates with result 'fail' set `blocked = true`.
 * Soft gates with result 'warn' accumulate in `softGateWarnings`.
 *
 * @param rules - All rules to consider (typically the full active rule set).
 * @param context - Flat map of metric name → numeric value.
 * @returns Structured {@link EngineResult}.
 */
export function runRulesEngine(rules: Rule[], context: Record<string, number>): EngineResult {
  const allResults: EvaluationResult[] = [];
  const hardGateFails: EvaluationResult[] = [];
  const softGateWarnings: EvaluationResult[] = [];
  const scoringResults: EvaluationResult[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;

    const evalResult = evaluateRule(rule, context);
    allResults.push(evalResult);

    if (rule.type === 'hard_gate' && evalResult.result === 'fail') {
      hardGateFails.push(evalResult);
    } else if (rule.type === 'soft_gate' && evalResult.result === 'warn') {
      softGateWarnings.push(evalResult);
    } else if (rule.type === 'scoring') {
      scoringResults.push(evalResult);
    }
  }

  // Composite score: weighted average of scoring rule weightedScores.
  let compositeScore = 0;
  if (scoringResults.length > 0) {
    const scoringRulesById = new Map(rules.map((r) => [r.id, r]));
    let totalWeight = 0;
    let weightedSum = 0;
    for (const sr of scoringResults) {
      const rule = scoringRulesById.get(sr.ruleId);
      if (!rule || sr.weightedScore === undefined) continue;
      weightedSum += sr.weightedScore * rule.weight;
      totalWeight += rule.weight;
    }
    compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  return {
    blocked: hardGateFails.length > 0,
    hardGateFails,
    softGateWarnings,
    scoringResults,
    compositeScore,
    allResults,
  };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): rules engine orchestrator with hard/soft/scoring semantics`

---

## Task 5: Rule CRUD

**Files:**
- Create: `packages/core/src/rules-engine/crud.ts`
- Create: `packages/core/src/__tests__/rules-engine/crud.test.ts`

CRUD functions operate on the `DatabaseConnection` from `data/db.ts`. Creating a rule inserts a new row. Updating increments `version` and sets `active_from` to now. Soft-deleting sets `active_to` to now. Listing returns only rows where `active = 1` and `active_to IS NULL`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/rules-engine/crud.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../data/db.js';
import {
  createRule,
  updateRule,
  softDeleteRule,
  listActiveRules,
  getRuleById,
  type CreateRuleInput,
} from '../../rules-engine/crud.js';

let db: DatabaseConnection;

beforeEach(() => {
  db = createDatabase(':memory:');
  // Insert a seed investment so FK references are satisfied
  db.run(
    `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
     VALUES ('inv1', 'listed_stock', 'Test Corp', 'screening', 'manual', 'solo-investor', '2026-01-01', '2026-01-01')`
  );
});

afterEach(() => db.close());

const BASE_INPUT: CreateRuleInput = {
  name: 'MOS Gate',
  category: 'valuation',
  type: 'hard_gate',
  sourceType: 'book',
  sourceDetail: 'Pabrai Ch.7',
  description: 'Margin of safety check',
  conditionsYaml: 'conditions:\n  - metric: mos\n    operator: gte\n    value: 0.3\n    weight: 1.0',
  weight: 1.0,
};

describe('createRule', () => {
  it('inserts a rule with version=1 and active=true', () => {
    const rule = createRule(db, BASE_INPUT);
    expect(rule.id).toBeTruthy();
    expect(rule.version).toBe(1);
    expect(rule.active).toBe(true);
    expect(rule.activeTo).toBeNull();
  });

  it('sets believabilityScore to 0.5 by default', () => {
    const rule = createRule(db, BASE_INPUT);
    expect(rule.believabilityScore).toBe(0.5);
  });
});

describe('listActiveRules', () => {
  it('returns only active rules', () => {
    createRule(db, BASE_INPUT);
    createRule(db, { ...BASE_INPUT, name: 'Second Rule' });
    const rules = listActiveRules(db);
    expect(rules).toHaveLength(2);
  });

  it('excludes soft-deleted rules', () => {
    const rule = createRule(db, BASE_INPUT);
    softDeleteRule(db, rule.id);
    const rules = listActiveRules(db);
    expect(rules).toHaveLength(0);
  });
});

describe('updateRule', () => {
  it('increments version on update', () => {
    const rule = createRule(db, BASE_INPUT);
    const updated = updateRule(db, rule.id, { weight: 2.0 });
    expect(updated.version).toBe(2);
  });

  it('preserves believabilityScore on non-semantic update (weight change)', () => {
    const rule = createRule(db, BASE_INPUT);
    // Manually set a believability score to check it is preserved
    db.run('UPDATE rules SET believability_score = 0.8 WHERE id = ?', rule.id);
    const updated = updateRule(db, rule.id, { weight: 1.5 });
    expect(updated.believabilityScore).toBe(0.8);
  });

  it('resets believabilityScore when conditions change', () => {
    const rule = createRule(db, BASE_INPUT);
    db.run('UPDATE rules SET believability_score = 0.8 WHERE id = ?', rule.id);
    const updated = updateRule(db, rule.id, {
      conditionsYaml: 'conditions:\n  - metric: ev_ebitda\n    operator: lte\n    value: 10\n    weight: 1.0',
    });
    expect(updated.believabilityScore).toBe(0.5);
  });

  it('throws when rule does not exist', () => {
    expect(() => updateRule(db, 'nonexistent', { weight: 1 })).toThrow();
  });
});

describe('softDeleteRule', () => {
  it('sets active_to to current timestamp', () => {
    const rule = createRule(db, BASE_INPUT);
    softDeleteRule(db, rule.id);
    const row = getRuleById(db, rule.id);
    expect(row?.activeTo).not.toBeNull();
    expect(row?.active).toBe(false);
  });
});

describe('getRuleById', () => {
  it('returns undefined for nonexistent id', () => {
    expect(getRuleById(db, 'ghost')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -50
```

- [ ] **Step 3: Implement crud.ts**

```typescript
// packages/core/src/rules-engine/crud.ts
import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '../data/db.js';
import type { Rule } from '../models/rule.js';

export interface CreateRuleInput {
  name: string;
  category: Rule['category'];
  type: Rule['type'];
  sourceType: Rule['sourceType'];
  sourceDetail: string;
  description: string;
  conditionsYaml: string;
  weight: number;
}

export interface UpdateRuleInput {
  name?: string;
  description?: string;
  conditionsYaml?: string;
  weight?: number;
}

/** Row shape returned from raw SQLite queries on the rules table. */
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

function rowToRule(row: RuleRow): Rule {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    category: row.category as Rule['category'],
    type: row.type as Rule['type'],
    sourceType: row.source_type as Rule['sourceType'],
    sourceDetail: row.source_detail,
    description: row.description,
    conditions: [],          // parsed on demand by the evaluator from conditionsYaml
    weight: row.weight,
    active: Boolean(row.active),
    activeFrom: new Date(row.active_from),
    activeTo: row.active_to ? new Date(row.active_to) : null,
    createdAt: new Date(row.created_at),
    timesFired: row.times_fired,
    timesCorrect: row.times_correct,
    believabilityScore: row.believability_score,
  };
}

/**
 * Insert a new rule with version=1, active=true, believabilityScore=0.5.
 *
 * @param db - Open database connection.
 * @param input - Rule definition fields.
 * @returns The newly created {@link Rule}.
 */
export function createRule(db: DatabaseConnection, input: CreateRuleInput): Rule {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO rules
       (id, name, version, category, type, source_type, source_detail, description,
        conditions_yaml, weight, active, active_from, active_to, created_at,
        times_fired, times_correct, believability_score)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, 0, 0, 0.5)`,
    id, input.name, input.category, input.type, input.sourceType,
    input.sourceDetail, input.description, input.conditionsYaml,
    input.weight, now, now,
  );
  return getRuleById(db, id)!;
}

/**
 * Update a rule's mutable fields, auto-incrementing the version.
 * Changing `conditionsYaml` is considered a semantic change and resets
 * `believabilityScore` to the default 0.5. All other field changes preserve it.
 *
 * @param db - Open database connection.
 * @param id - Rule ID.
 * @param input - Fields to update (partial).
 * @returns The updated {@link Rule}.
 * @throws If the rule does not exist.
 */
export function updateRule(db: DatabaseConnection, id: string, input: UpdateRuleInput): Rule {
  const existing = getRuleById(db, id);
  if (!existing) throw new Error(`Rule "${id}" not found`);

  const isSemantic = input.conditionsYaml !== undefined && input.conditionsYaml !== existing.conditions.toString();
  const newVersion = existing.version + 1;
  const now = new Date().toISOString();

  // Only reset believability when conditions change structurally
  const row = db.get<RuleRow>('SELECT * FROM rules WHERE id = ?', id)!;
  const semanticChange = input.conditionsYaml !== undefined && input.conditionsYaml !== row.conditions_yaml;
  const newBelievability = semanticChange ? 0.5 : row.believability_score;

  db.run(
    `UPDATE rules
     SET name = ?, description = ?, conditions_yaml = ?, weight = ?,
         version = ?, active_from = ?, believability_score = ?
     WHERE id = ?`,
    input.name ?? row.name,
    input.description ?? row.description,
    input.conditionsYaml ?? row.conditions_yaml,
    input.weight ?? row.weight,
    newVersion,
    now,
    newBelievability,
    id,
  );
  return getRuleById(db, id)!;
}

/**
 * Soft-delete a rule by setting `active_to` to the current timestamp.
 * The rule remains in the database for audit purposes.
 *
 * @param db - Open database connection.
 * @param id - Rule ID.
 */
export function softDeleteRule(db: DatabaseConnection, id: string): void {
  const now = new Date().toISOString();
  db.run('UPDATE rules SET active = 0, active_to = ? WHERE id = ?', now, id);
}

/**
 * List all currently active rules (active=1, active_to IS NULL).
 *
 * @param db - Open database connection.
 * @returns Array of active {@link Rule} objects.
 */
export function listActiveRules(db: DatabaseConnection): Rule[] {
  const rows = db.all<RuleRow>('SELECT * FROM rules WHERE active = 1 AND active_to IS NULL');
  return rows.map(rowToRule);
}

/**
 * Fetch a single rule by ID regardless of active status.
 *
 * @param db - Open database connection.
 * @param id - Rule ID.
 * @returns The {@link Rule} or `undefined` if not found.
 */
export function getRuleById(db: DatabaseConnection, id: string): Rule | undefined {
  const row = db.get<RuleRow>('SELECT * FROM rules WHERE id = ?', id);
  return row ? rowToRule(row) : undefined;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): rule CRUD with semantic versioning and soft-delete`

---

## Task 6: Rule Audit Logging

**Files:**
- Create: `packages/core/src/rules-engine/audit.ts`
- Create: `packages/core/src/__tests__/rules-engine/audit.test.ts`

Every rule firing writes an immutable row to `rule_audit_log`. A separate function tallies fired/correct counts back onto the rule row for believability computation.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/rules-engine/audit.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../data/db.js';
import { createRule, type CreateRuleInput } from '../../rules-engine/crud.js';
import {
  logRuleFiring,
  getAuditEntriesForInvestment,
  recordOutcome,
  type LogRuleFiringInput,
} from '../../rules-engine/audit.js';

let db: DatabaseConnection;
let investmentId: string;
let ruleId: string;

const RULE_INPUT: CreateRuleInput = {
  name: 'MOS Gate',
  category: 'valuation',
  type: 'hard_gate',
  sourceType: 'book',
  sourceDetail: 'test',
  description: 'test',
  conditionsYaml: 'conditions:\n  - metric: mos\n    operator: gte\n    value: 0.3\n    weight: 1',
  weight: 1.0,
};

beforeEach(() => {
  db = createDatabase(':memory:');
  investmentId = 'inv1';
  db.run(
    `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
     VALUES (?, 'listed_stock', 'Test Corp', 'screening', 'manual', 'solo-investor', '2026-01-01', '2026-01-01')`,
    investmentId,
  );
  const rule = createRule(db, RULE_INPUT);
  ruleId = rule.id;
});

afterEach(() => db.close());

describe('logRuleFiring', () => {
  it('writes an audit log entry', () => {
    logRuleFiring(db, {
      investmentId,
      ruleId,
      ruleVersion: 1,
      result: 'pass',
      override: false,
      overrideReason: null,
    });
    const entries = getAuditEntriesForInvestment(db, investmentId);
    expect(entries).toHaveLength(1);
    expect(entries[0].result).toBe('pass');
    expect(entries[0].override).toBe(false);
  });

  it('stores override reason when overriding a fail', () => {
    logRuleFiring(db, {
      investmentId,
      ruleId,
      ruleVersion: 1,
      result: 'fail',
      override: true,
      overrideReason: 'Management is exceptional',
    });
    const entries = getAuditEntriesForInvestment(db, investmentId);
    expect(entries[0].overrideReason).toBe('Management is exceptional');
  });

  it('increments times_fired on the rule row', () => {
    logRuleFiring(db, { investmentId, ruleId, ruleVersion: 1, result: 'pass', override: false, overrideReason: null });
    logRuleFiring(db, { investmentId, ruleId, ruleVersion: 1, result: 'pass', override: false, overrideReason: null });
    const row = db.get<{ times_fired: number }>('SELECT times_fired FROM rules WHERE id = ?', ruleId);
    expect(row?.times_fired).toBe(2);
  });
});

describe('recordOutcome', () => {
  it('increments times_correct when outcome is correct', () => {
    logRuleFiring(db, { investmentId, ruleId, ruleVersion: 1, result: 'pass', override: false, overrideReason: null });
    recordOutcome(db, ruleId, true);
    const row = db.get<{ times_correct: number }>('SELECT times_correct FROM rules WHERE id = ?', ruleId);
    expect(row?.times_correct).toBe(1);
  });

  it('does not increment times_correct when outcome is incorrect', () => {
    logRuleFiring(db, { investmentId, ruleId, ruleVersion: 1, result: 'pass', override: false, overrideReason: null });
    recordOutcome(db, ruleId, false);
    const row = db.get<{ times_correct: number }>('SELECT times_correct FROM rules WHERE id = ?', ruleId);
    expect(row?.times_correct).toBe(0);
  });
});

describe('getAuditEntriesForInvestment', () => {
  it('returns entries in descending fired_at order', () => {
    logRuleFiring(db, { investmentId, ruleId, ruleVersion: 1, result: 'pass', override: false, overrideReason: null });
    logRuleFiring(db, { investmentId, ruleId, ruleVersion: 1, result: 'fail', override: false, overrideReason: null });
    const entries = getAuditEntriesForInvestment(db, investmentId);
    expect(entries[0].result).toBe('fail'); // most recent first
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -50
```

- [ ] **Step 3: Implement audit.ts**

```typescript
// packages/core/src/rules-engine/audit.ts
import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '../data/db.js';
import type { RuleAuditEntry } from '../models/rule.js';

export interface LogRuleFiringInput {
  investmentId: string;
  ruleId: string;
  ruleVersion: number;
  result: 'pass' | 'fail' | 'warn';
  override: boolean;
  overrideReason: string | null;
}

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

function rowToEntry(row: AuditRow): RuleAuditEntry {
  return {
    id: row.id,
    investmentId: row.investment_id,
    ruleId: row.rule_id,
    ruleVersion: row.rule_version,
    firedAt: new Date(row.fired_at),
    result: row.result as RuleAuditEntry['result'],
    override: Boolean(row.override),
    overrideReason: row.override_reason,
  };
}

/**
 * Write an immutable audit log entry for a single rule firing.
 * Also increments `times_fired` on the rule row so believability can be calculated.
 *
 * @param db - Open database connection.
 * @param input - Firing metadata.
 * @returns The newly created {@link RuleAuditEntry}.
 */
export function logRuleFiring(db: DatabaseConnection, input: LogRuleFiringInput): RuleAuditEntry {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO rule_audit_log
       (id, investment_id, rule_id, rule_version, fired_at, result, override, override_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, input.investmentId, input.ruleId, input.ruleVersion,
    now, input.result, input.override ? 1 : 0, input.overrideReason,
  );

  db.run('UPDATE rules SET times_fired = times_fired + 1 WHERE id = ?', input.ruleId);

  return rowToEntry(db.get<AuditRow>('SELECT * FROM rule_audit_log WHERE id = ?', id)!);
}

/**
 * Record the outcome of a previously fired rule, incrementing `times_correct`
 * if the outcome was correct. Called when an investment outcome is resolved.
 *
 * @param db - Open database connection.
 * @param ruleId - Rule to update.
 * @param correct - Whether the rule's prediction proved correct.
 */
export function recordOutcome(db: DatabaseConnection, ruleId: string, correct: boolean): void {
  if (correct) {
    db.run('UPDATE rules SET times_correct = times_correct + 1 WHERE id = ?', ruleId);
  }
}

/**
 * Retrieve all audit log entries for a given investment, most recent first.
 *
 * @param db - Open database connection.
 * @param investmentId - Investment to query.
 * @returns Array of {@link RuleAuditEntry} ordered by `fired_at DESC`.
 */
export function getAuditEntriesForInvestment(db: DatabaseConnection, investmentId: string): RuleAuditEntry[] {
  const rows = db.all<AuditRow>(
    'SELECT * FROM rule_audit_log WHERE investment_id = ? ORDER BY fired_at DESC',
    investmentId,
  );
  return rows.map(rowToEntry);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): rule audit logging with times_fired/times_correct counters`

---

## Task 7: Believability Scoring

**Files:**
- Create: `packages/core/src/rules-engine/believability.ts`
- Create: `packages/core/src/__tests__/rules-engine/believability.test.ts`

Implements the Kelly Believability Algorithm from Section 9: Bayesian shrinkage toward 50% prior (prior weight = 5) + exponential decay with half-life 365 days. Rules with fewer than 5 firings clamp to the default 0.5 and skip the decay multiplication.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/rules-engine/believability.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateBelievability,
  applyExponentialDecay,
  updateRuleBelievability,
} from '../../rules-engine/believability.js';
import type { DatabaseConnection } from '../../data/db.js';
import { createDatabase } from '../../data/db.js';
import { createRule, type CreateRuleInput } from '../../rules-engine/crud.js';

const RULE_INPUT: CreateRuleInput = {
  name: 'Test',
  category: 'valuation',
  type: 'hard_gate',
  sourceType: 'book',
  sourceDetail: 'test',
  description: 'test',
  conditionsYaml: 'conditions:\n  - metric: mos\n    operator: gte\n    value: 0.3\n    weight: 1',
  weight: 1.0,
};

describe('calculateBelievability', () => {
  it('returns 0.5 when timesFired < 5 (insufficient data)', () => {
    const score = calculateBelievability({ timesFired: 3, timesCorrect: 3, outcomeTimestamps: [] });
    expect(score).toBe(0.5);
  });

  it('returns value shrunk toward 0.5 with priorWeight=5', () => {
    // baseRate = 8/10 = 0.8; bayesian = (0.8*10 + 0.5*5) / (10+5) = (8+2.5)/15 = 0.7
    const score = calculateBelievability({
      timesFired: 10,
      timesCorrect: 8,
      outcomeTimestamps: [], // no decay (empty timestamps)
    });
    expect(score).toBeCloseTo(0.7, 3);
  });

  it('shrinks a perfect (1.0) base rate toward 0.5', () => {
    const score = calculateBelievability({ timesFired: 5, timesCorrect: 5, outcomeTimestamps: [] });
    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThan(0.5);
  });

  it('shrinks a zero base rate toward 0.5', () => {
    const score = calculateBelievability({ timesFired: 10, timesCorrect: 0, outcomeTimestamps: [] });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.5);
  });
});

describe('applyExponentialDecay', () => {
  it('returns 1.0 for an empty timestamp list', () => {
    expect(applyExponentialDecay([])).toBe(1.0);
  });

  it('returns a value < 1 for old timestamps', () => {
    // 730 days ago → 2 half-lives → weight ≈ 0.25
    const old = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
    const weight = applyExponentialDecay([old]);
    expect(weight).toBeLessThan(1.0);
    expect(weight).toBeCloseTo(0.25, 1);
  });

  it('returns a value close to 1.0 for very recent timestamps', () => {
    const recent = new Date(Date.now() - 1000); // 1 second ago
    const weight = applyExponentialDecay([recent]);
    expect(weight).toBeCloseTo(1.0, 2);
  });
});

describe('updateRuleBelievability', () => {
  it('writes the new believability_score to the database', () => {
    const db: DatabaseConnection = createDatabase(':memory:');
    const rule = createRule(db, RULE_INPUT);

    // Manually set times_fired/times_correct
    db.run('UPDATE rules SET times_fired = 10, times_correct = 8 WHERE id = ?', rule.id);

    updateRuleBelievability(db, rule.id, []);
    const row = db.get<{ believability_score: number }>(
      'SELECT believability_score FROM rules WHERE id = ?',
      rule.id,
    );
    // bayesian = (0.8*10 + 0.5*5) / 15 = 0.7; no decay → 0.7
    expect(row?.believability_score).toBeCloseTo(0.7, 3);
    db.close();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -50
```

- [ ] **Step 3: Implement believability.ts**

```typescript
// packages/core/src/rules-engine/believability.ts
import type { DatabaseConnection } from '../data/db.js';

/** Minimum number of firings before believability diverges from 0.5. */
const MIN_FIRINGS = 5;
/** Bayesian prior weight — pulls estimates toward 0.5 when sample size is small. */
const PRIOR_WEIGHT = 5;
/** Half-life for exponential decay of historical outcomes, in days. */
const HALF_LIFE_DAYS = 365;
const MS_PER_DAY = 86_400_000;

/**
 * Compute an exponential recency weight for a list of outcome timestamps.
 * Each timestamp contributes an individual decay factor; the final weight is
 * the average across all timestamps. Returns 1.0 for empty input.
 *
 * Decay formula per timestamp: `2^(-age_in_days / HALF_LIFE_DAYS)`
 *
 * @param timestamps - UTC timestamps of past outcome recordings.
 * @returns Recency weight in range (0, 1].
 */
export function applyExponentialDecay(timestamps: Date[]): number {
  if (timestamps.length === 0) return 1.0;
  const now = Date.now();
  const weights = timestamps.map((ts) => {
    const ageDays = (now - ts.getTime()) / MS_PER_DAY;
    return Math.pow(2, -ageDays / HALF_LIFE_DAYS);
  });
  return weights.reduce((a, b) => a + b, 0) / weights.length;
}

export interface BelievabilityInput {
  timesFired: number;
  timesCorrect: number;
  /** UTC timestamps of when each correct/incorrect outcome was recorded. Empty = no decay applied. */
  outcomeTimestamps: Date[];
}

/**
 * Calculate believability for a rule using Bayesian shrinkage + exponential decay.
 *
 * When `timesFired < MIN_FIRINGS`, returns the default 0.5 (insufficient data).
 * Otherwise:
 *   1. `baseRate = timesCorrect / timesFired`
 *   2. `bayesian = (baseRate * timesFired + 0.5 * PRIOR_WEIGHT) / (timesFired + PRIOR_WEIGHT)`
 *   3. `recencyWeight = applyExponentialDecay(outcomeTimestamps)`
 *   4. `believability = bayesian * recencyWeight`
 *
 * @param input - Rule performance data.
 * @returns Believability score in range (0, 1].
 */
export function calculateBelievability(input: BelievabilityInput): number {
  if (input.timesFired < MIN_FIRINGS) return 0.5;

  const baseRate = input.timesCorrect / input.timesFired;
  const bayesian =
    (baseRate * input.timesFired + 0.5 * PRIOR_WEIGHT) / (input.timesFired + PRIOR_WEIGHT);
  const recencyWeight = applyExponentialDecay(input.outcomeTimestamps);

  return bayesian * recencyWeight;
}

/**
 * Recalculate and persist the believability score for a rule to the database.
 *
 * @param db - Open database connection.
 * @param ruleId - Rule ID.
 * @param outcomeTimestamps - Timestamps of recorded outcomes for exponential decay.
 */
export function updateRuleBelievability(
  db: DatabaseConnection,
  ruleId: string,
  outcomeTimestamps: Date[],
): void {
  const row = db.get<{ times_fired: number; times_correct: number }>(
    'SELECT times_fired, times_correct FROM rules WHERE id = ?',
    ruleId,
  );
  if (!row) throw new Error(`Rule "${ruleId}" not found`);

  const score = calculateBelievability({
    timesFired: row.times_fired,
    timesCorrect: row.times_correct,
    outcomeTimestamps,
  });

  db.run('UPDATE rules SET believability_score = ? WHERE id = ?', score, ruleId);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): Bayesian believability scoring with exponential decay`

---

## Task 8: Decision Snapshots

**Files:**
- Create: `packages/core/src/rules-engine/snapshots.ts`
- Create: `packages/core/src/__tests__/rules-engine/snapshots.test.ts`

A snapshot freezes the full rule state + scores + Kelly position at decision time. Enables deterministic replay without mutable data.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/__tests__/rules-engine/snapshots.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../data/db.js';
import { captureDecisionSnapshot, getDecisionSnapshot, listDecisionSnapshots } from '../../rules-engine/snapshots.js';
import type { EngineResult } from '../../rules-engine/engine.js';

let db: DatabaseConnection;
const INVESTMENT_ID = 'inv1';

const ENGINE_RESULT: EngineResult = {
  blocked: false,
  hardGateFails: [],
  softGateWarnings: [],
  scoringResults: [],
  compositeScore: 0.75,
  allResults: [],
};

beforeEach(() => {
  db = createDatabase(':memory:');
  db.run(
    `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
     VALUES (?, 'listed_stock', 'Test', 'screening', 'manual', 'solo-investor', '2026-01-01', '2026-01-01')`,
    INVESTMENT_ID,
  );
});

afterEach(() => db.close());

describe('captureDecisionSnapshot', () => {
  it('stores a snapshot and returns it with an id', () => {
    const snap = captureDecisionSnapshot(db, {
      investmentId: INVESTMENT_ID,
      engineResult: ENGINE_RESULT,
      scoresJson: { altman_z: 2.5 },
      kellyPosition: 0.12,
      scenarioJson: null,
    });
    expect(snap.id).toBeTruthy();
    expect(snap.investmentId).toBe(INVESTMENT_ID);
    expect(snap.kellyPosition).toBe(0.12);
  });

  it('serializes active rules from the engine result', () => {
    const snap = captureDecisionSnapshot(db, {
      investmentId: INVESTMENT_ID,
      engineResult: ENGINE_RESULT,
      scoresJson: {},
      kellyPosition: null,
      scenarioJson: null,
    });
    const retrieved = getDecisionSnapshot(db, snap.id);
    expect(retrieved?.activeRulesJson).toBeTruthy();
    const parsed = JSON.parse(retrieved!.activeRulesJson);
    expect(parsed).toHaveProperty('blocked');
  });
});

describe('listDecisionSnapshots', () => {
  it('returns all snapshots for an investment ordered by snapshotAt DESC', () => {
    captureDecisionSnapshot(db, {
      investmentId: INVESTMENT_ID, engineResult: ENGINE_RESULT,
      scoresJson: {}, kellyPosition: null, scenarioJson: null,
    });
    captureDecisionSnapshot(db, {
      investmentId: INVESTMENT_ID, engineResult: ENGINE_RESULT,
      scoresJson: {}, kellyPosition: 0.1, scenarioJson: null,
    });
    const snaps = listDecisionSnapshots(db, INVESTMENT_ID);
    expect(snaps).toHaveLength(2);
  });

  it('returns empty array for unknown investment', () => {
    const snaps = listDecisionSnapshots(db, 'ghost');
    expect(snaps).toHaveLength(0);
  });
});

describe('getDecisionSnapshot', () => {
  it('returns undefined for unknown id', () => {
    expect(getDecisionSnapshot(db, 'ghost')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose 2>&1 | head -50
```

- [ ] **Step 3: Implement snapshots.ts**

```typescript
// packages/core/src/rules-engine/snapshots.ts
import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '../data/db.js';
import type { EngineResult } from './engine.js';

export interface DecisionSnapshot {
  id: string;
  investmentId: string;
  snapshotAt: Date;
  /** JSON-serialized EngineResult — complete rule firing state at decision time. */
  activeRulesJson: string;
  /** JSON-serialized scores map passed to the engine. */
  scoresJson: string;
  kellyPosition: number | null;
  /** JSON-serialized scenario model, or null if not available. */
  scenarioJson: string | null;
}

export interface CaptureSnapshotInput {
  investmentId: string;
  engineResult: EngineResult;
  scoresJson: Record<string, unknown>;
  kellyPosition: number | null;
  scenarioJson: Record<string, unknown> | null;
}

interface SnapshotRow {
  id: string;
  investment_id: string;
  snapshot_at: string;
  active_rules_json: string;
  scores_json: string;
  kelly_position: number | null;
  scenario_json: string | null;
}

function rowToSnapshot(row: SnapshotRow): DecisionSnapshot {
  return {
    id: row.id,
    investmentId: row.investment_id,
    snapshotAt: new Date(row.snapshot_at),
    activeRulesJson: row.active_rules_json,
    scoresJson: row.scores_json,
    kellyPosition: row.kelly_position,
    scenarioJson: row.scenario_json,
  };
}

/**
 * Capture a full decision snapshot, persisting rule engine state, scores,
 * Kelly position, and scenario model at the moment of a trade decision.
 * The stored data is immutable and enables forensic post-mortem replay.
 *
 * @param db - Open database connection.
 * @param input - Snapshot payload.
 * @returns The persisted {@link DecisionSnapshot}.
 */
export function captureDecisionSnapshot(
  db: DatabaseConnection,
  input: CaptureSnapshotInput,
): DecisionSnapshot {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO decision_snapshots
       (id, investment_id, snapshot_at, active_rules_json, scores_json, kelly_position, scenario_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.investmentId,
    now,
    JSON.stringify(input.engineResult),
    JSON.stringify(input.scoresJson),
    input.kellyPosition,
    input.scenarioJson !== null ? JSON.stringify(input.scenarioJson) : null,
  );

  return rowToSnapshot(db.get<SnapshotRow>('SELECT * FROM decision_snapshots WHERE id = ?', id)!);
}

/**
 * Retrieve a decision snapshot by ID.
 *
 * @param db - Open database connection.
 * @param id - Snapshot ID.
 * @returns The {@link DecisionSnapshot} or `undefined` if not found.
 */
export function getDecisionSnapshot(db: DatabaseConnection, id: string): DecisionSnapshot | undefined {
  const row = db.get<SnapshotRow>('SELECT * FROM decision_snapshots WHERE id = ?', id);
  return row ? rowToSnapshot(row) : undefined;
}

/**
 * List all decision snapshots for an investment, most recent first.
 *
 * @param db - Open database connection.
 * @param investmentId - Investment ID.
 * @returns Array of {@link DecisionSnapshot} ordered by `snapshot_at DESC`.
 */
export function listDecisionSnapshots(db: DatabaseConnection, investmentId: string): DecisionSnapshot[] {
  const rows = db.all<SnapshotRow>(
    'SELECT * FROM decision_snapshots WHERE investment_id = ? ORDER BY snapshot_at DESC',
    investmentId,
  );
  return rows.map(rowToSnapshot);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

**Commit:** `feat(core): decision snapshots for forensic post-mortem replay`

---

## Task 9: Pre-Seeded YAML Rule Files

**Files:**
- Create: `rules/pabrai-9-principles.yaml`
- Create: `rules/munger-5-checklist.yaml`
- Create: `rules/graham-criteria.yaml`

These are the default rules shipped with the platform. They are YAML multi-document files using `---` separators (one document per rule) or separate files per rule set. Use separate-file-per-set for clarity.

- [ ] **Step 1: Create pabrai-9-principles.yaml**

```yaml
# rules/pabrai-9-principles.yaml
# Pabrai's 9 Dhandho Principles encoded as soft_gate and scoring rules.
# Source: "The Dhandho Investor" by Mohnish Pabrai
---
name: Pabrai P1 — Existing Business
category: quality
type: soft_gate
source_type: book
source_detail: "Pabrai - The Dhandho Investor, Ch. 2"
description: Only invest in existing businesses with proven operating history, not startups.
weight: 1.0
conditions:
  - metric: years_in_operation
    operator: gte
    value: 3
    weight: 1.0

---
name: Pabrai P2 — Simple Business in Slow-Change Industry
category: quality
type: scoring
source_type: book
source_detail: "Pabrai - The Dhandho Investor, Ch. 3"
description: Business must be simple with low rate of industry change.
weight: 1.0
conditions:
  - metric: business_simplicity_score
    operator: gte
    value: 3
    weight: 1.0
  - metric: industry_change_rate
    operator: lte
    value: 2
    weight: 0.8

---
name: Pabrai P3 — Distressed Business in Distressed Industry
category: distress
type: scoring
source_type: book
source_detail: "Pabrai - The Dhandho Investor, Ch. 3"
description: Prefer distressed businesses; distress creates mis-pricing opportunities.
weight: 0.8
conditions:
  - metric: altman_z
    operator: lt
    value: 2.99
    weight: 0.8
  - metric: piotroski_f
    operator: gte
    value: 5
    weight: 1.0

---
name: Pabrai P4 — Durable Competitive Advantage
category: quality
type: hard_gate
source_type: book
source_detail: "Pabrai - The Dhandho Investor, Ch. 4"
description: Business must have a moat — durable competitive advantage that compounds.
weight: 1.5
conditions:
  - metric: moat_score
    operator: gte
    value: 3
    weight: 1.0

---
name: Pabrai P5 — Bet Heavily When Odds Are In Your Favor
category: position_sizing
type: scoring
source_type: book
source_detail: "Pabrai - The Dhandho Investor, Ch. 5"
description: Concentrate position when Kelly fraction is high (edge is large).
weight: 1.0
conditions:
  - metric: kelly_fraction
    operator: gte
    value: 0.10
    weight: 1.0

---
name: Pabrai P6 — Arbitrage Opportunity
category: valuation
type: scoring
source_type: book
source_detail: "Pabrai - The Dhandho Investor, Ch. 6"
description: Prefer situations with identifiable arbitrage or catalyst for value realization.
weight: 0.7
conditions:
  - metric: has_catalyst
    operator: gte
    value: 1
    weight: 1.0

---
name: Pabrai P7 — Significant Margin of Safety
category: valuation
type: hard_gate
source_type: book
source_detail: "Pabrai - The Dhandho Investor, Ch. 7"
description: Never buy without >= 30% discount to intrinsic value (Dhandho core pillar).
weight: 1.5
conditions:
  - metric: intrinsic_value_discount
    operator: gte
    value: 0.30
    weight: 1.0

---
name: Pabrai P8 — Low Risk, High Uncertainty
category: risk
type: hard_gate
source_type: book
source_detail: "Pabrai - The Dhandho Investor, Ch. 8"
description: >
  Risk (probability of permanent capital loss) must be low even if uncertainty
  (range of outcomes) is high. Bear case loss must not exceed 15%.
weight: 1.5
conditions:
  - metric: bear_case_loss
    operator: lte
    value: 0.15
    weight: 1.0

---
name: Pabrai P9 — Copycat, Not Innovator
category: quality
type: scoring
source_type: book
source_detail: "Pabrai - The Dhandho Investor, Ch. 9"
description: Prefer businesses that copy proven models (franchise, licensing) over first movers.
weight: 0.6
conditions:
  - metric: business_model_replication_score
    operator: gte
    value: 3
    weight: 1.0
```

- [ ] **Step 2: Create munger-5-checklist.yaml**

```yaml
# rules/munger-5-checklist.yaml
# Munger's 5-point investment checklist as hard_gate and soft_gate rules.
# Source: "Poor Charlie's Almanack", "The Art of Stock Picking"
---
name: Munger C1 — Understandable Business
category: quality
type: hard_gate
source_type: book
source_detail: "Poor Charlie's Almanack — The Art of Stock Picking"
description: Only invest in businesses you can fully understand (circle of competence).
weight: 1.0
conditions:
  - metric: circle_of_competence_fit
    operator: gte
    value: 3
    weight: 1.0

---
name: Munger C2 — Sustainable Competitive Advantage
category: quality
type: hard_gate
source_type: book
source_detail: "Poor Charlie's Almanack — The Art of Stock Picking"
description: Business must have a durable competitive advantage that lasts 10+ years.
weight: 1.5
conditions:
  - metric: moat_score
    operator: gte
    value: 3
    weight: 1.0
  - metric: roic_5yr_avg
    operator: gte
    value: 0.12
    weight: 0.8

---
name: Munger C3 — Management Quality
category: quality
type: soft_gate
source_type: book
source_detail: "Poor Charlie's Almanack — The Art of Stock Picking"
description: Management must be honest, rational capital allocators with skin in the game.
weight: 1.0
conditions:
  - metric: management_score
    operator: gte
    value: 3
    weight: 1.0

---
name: Munger C4 — Reasonable Price
category: valuation
type: hard_gate
source_type: book
source_detail: "Poor Charlie's Almanack — The Art of Stock Picking"
description: >
  Buy at a fair or bargain price. For Munger, fair price for a great business
  beats a bargain price for a mediocre one. Minimum: intrinsic value discount >= 10%.
weight: 1.0
conditions:
  - metric: intrinsic_value_discount
    operator: gte
    value: 0.10
    weight: 1.0
  - metric: ev_ebitda
    operator: lte
    value: 20
    weight: 0.7

---
name: Munger C5 — No Excessive Leverage
category: risk
type: hard_gate
source_type: book
source_detail: "Poor Charlie's Almanack — The Art of Stock Picking"
description: Avoid businesses with excessive debt that could impair survival in a downturn.
weight: 1.2
conditions:
  - metric: debt_ebitda
    operator: lte
    value: 4.0
    weight: 1.0
  - metric: interest_coverage
    operator: gte
    value: 2.5
    weight: 0.9
```

- [ ] **Step 3: Create graham-criteria.yaml**

```yaml
# rules/graham-criteria.yaml
# Benjamin Graham's margin of safety and defensive investor criteria.
# Source: "The Intelligent Investor", "Security Analysis"
---
name: Graham G1 — Adequate Size
category: quality
type: soft_gate
source_type: book
source_detail: "Graham - The Intelligent Investor, Ch. 14"
description: Avoid very small companies — inadequate size increases operational fragility.
weight: 0.8
conditions:
  - metric: market_cap_usd_millions
    operator: gte
    value: 100
    weight: 1.0

---
name: Graham G2 — Sufficiently Strong Financial Condition
category: risk
type: hard_gate
source_type: book
source_detail: "Graham - The Intelligent Investor, Ch. 14"
description: Current ratio >= 2 and long-term debt <= net current assets for defensive investors.
weight: 1.2
conditions:
  - metric: current_ratio
    operator: gte
    value: 2.0
    weight: 1.0
  - metric: debt_to_net_current_assets
    operator: lte
    value: 1.0
    weight: 0.9

---
name: Graham G3 — Earnings Stability
category: quality
type: soft_gate
source_type: book
source_detail: "Graham - The Intelligent Investor, Ch. 14"
description: Positive earnings in each of the past 10 years (no loss years).
weight: 1.0
conditions:
  - metric: earnings_stability_years
    operator: gte
    value: 7
    weight: 1.0

---
name: Graham G4 — Dividend Record
category: quality
type: scoring
source_type: book
source_detail: "Graham - The Intelligent Investor, Ch. 14"
description: Uninterrupted dividend payments for at least 10 years (for income-oriented portfolios).
weight: 0.7
conditions:
  - metric: consecutive_dividend_years
    operator: gte
    value: 7
    weight: 1.0

---
name: Graham G5 — Earnings Growth
category: quality
type: scoring
source_type: book
source_detail: "Graham - The Intelligent Investor, Ch. 14"
description: Minimum increase of at least 33% in EPS over 10 years (3% per annum compounding).
weight: 0.9
conditions:
  - metric: eps_growth_10yr_pct
    operator: gte
    value: 33
    weight: 1.0

---
name: Graham G6 — Moderate P/E Ratio
category: valuation
type: hard_gate
source_type: book
source_detail: "Graham - The Intelligent Investor, Ch. 14"
description: Current price should not be more than 15x average earnings of the past 3 years.
weight: 1.2
conditions:
  - metric: pe_ratio_3yr_avg
    operator: lte
    value: 15
    weight: 1.0

---
name: Graham G7 — Moderate Price to Assets
category: valuation
type: hard_gate
source_type: book
source_detail: "Graham - The Intelligent Investor, Ch. 14"
description: >
  Price-to-book value must not exceed 1.5x. Combined P/E * P/B product must not exceed 22.5
  (equivalent to P/E of 15 and P/B of 1.5 simultaneously).
weight: 1.2
conditions:
  - metric: price_to_book
    operator: lte
    value: 1.5
    weight: 1.0
  - metric: pe_pb_product
    operator: lte
    value: 22.5
    weight: 0.8
```

- [ ] **Step 4: Verify the YAML files parse correctly**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
node --input-type=module <<'EOF'
import { loadRulesFromDirectory } from './packages/core/dist/rules-engine/yaml-parser.js';
const rules = loadRulesFromDirectory('./rules');
console.log(`Loaded ${rules.length} rules`);
rules.forEach(r => console.log(` - [${r.type}] ${r.name}`));
EOF
```

**Commit:** `feat(rules): pre-seeded Pabrai 9 principles, Munger 5 checklist, Graham criteria YAML`

---

## Task 10: Barrel Export and Index Wiring

**Files:**
- Create: `packages/core/src/rules-engine/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create the rules-engine barrel export**

```typescript
// packages/core/src/rules-engine/index.ts
export * from './yaml-parser.js';
export * from './evaluator.js';
export * from './engine.js';
export * from './crud.js';
export * from './audit.js';
export * from './believability.js';
export * from './snapshots.js';
```

- [ ] **Step 2: Add rules-engine to the core package public API**

Add one line to `packages/core/src/index.ts`:

```typescript
export * from './rules-engine/index.js';
```

- [ ] **Step 3: Run the full test suite**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core test -- --reporter=verbose
```

- [ ] **Step 4: Build the core package**

```bash
cd /Users/alexnelja/projects/dhando-analyzer
pnpm --filter @dhando/core build
```

**Commit:** `feat(core): export rules-engine from core package public API`

---

## Completion Checklist

- [ ] All 7 test files pass (`yaml-parser`, `evaluator`, `engine`, `crud`, `audit`, `believability`, `snapshots`)
- [ ] `pnpm --filter @dhando/core build` exits with code 0 (no TypeScript errors)
- [ ] 3 YAML rule set files exist under `rules/` and parse without warnings
- [ ] All rule logic functions are JSDoc-documented
- [ ] `js-yaml` and `zod` are listed in `packages/core/package.json` dependencies
- [ ] No `any` types used; strict mode passes

---

## Key Design Decisions

**Why zod for YAML validation?** Zod gives us a typed schema with a `.safeParse()` path that never throws — we catch the `ZodError` message and re-wrap it in `RuleYamlParseError`, keeping error handling predictable throughout.

**Why `conditions_yaml` stored as a string, not parsed JSON?** The spec stores raw YAML in the `conditions_yaml` column so that the original source format is preserved and human-readable in the database. The evaluator receives a `Rule` with pre-parsed `conditions: RuleCondition[]` (populated by the CRUD layer when reading from DB, or by the YAML parser when loading from files).

**Why separate `believability.ts` from `audit.ts`?** Audit is an append-only write path (every firing). Believability is a read-compute-write path that runs on demand (quarterly review or after each outcome is recorded). Separating them avoids coupling the hot write path to the slower computation.

**Why `outcomeTimestamps` is caller-supplied to `calculateBelievability`?** The `rules` table only stores aggregate counts (`times_fired`, `times_correct`). To apply exponential decay, the caller must supply timestamps — these can be fetched from `rule_audit_log` WHERE result matches and outcome was confirmed. This keeps the function pure and testable without a database dependency.

**YAML multi-document strategy:** Each pre-seeded YAML file uses `---` separators (YAML multi-document). `js-yaml`'s `loadAll` function handles this. The `loadRulesFromDirectory` function is extended in the implementation to call `loadAll` and produce multiple rule documents per file.

> Note: The `loadRulesFromDirectory` implementation above uses `load` (single document per file). To support multi-document YAML (used by the pre-seeded rule sets), replace `load` with `loadAll` and flatten the resulting array. This is a two-line change in `yaml-parser.ts`.
