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
 * @param context - Map of metric name to numeric value drawn from investment scores/financials.
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
