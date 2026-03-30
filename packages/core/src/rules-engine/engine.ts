import type { Rule } from '../models/rule.js';
import { evaluateRule, type EvaluationResult } from './evaluator.js';

/**
 * The consolidated result of running all active rules against an investment context.
 */
export interface EngineResult {
  /** True if at least one hard_gate rule produced a `fail` result. */
  blocked: boolean;
  /** All hard_gate rules that failed. */
  hardGateFails: EvaluationResult[];
  /** All soft_gate rules that produced a `warn` result. */
  softGateWarnings: EvaluationResult[];
  /** Evaluation results for all scoring rules, regardless of pass/fail/warn. */
  scoringResults: EvaluationResult[];
  /** Every evaluation result across all active rules. */
  allResults: EvaluationResult[];
  /**
   * Weighted average of scoring rules' weightedScore, using each rule's weight.
   * Zero when no scoring rules are present.
   */
  compositeScore: number;
}

/**
 * Run all active rules against a flat metric context.
 *
 * Inactive rules (active === false) are skipped entirely.
 * hard_gate failures set `blocked` to true.
 * soft_gate failures produce warnings but do not block.
 * scoring rules contribute to `compositeScore` via weighted average.
 *
 * @param rules - Full array of rules (active and inactive).
 * @param context - Map of metric name to numeric value drawn from investment scores/financials.
 * @returns {@link EngineResult} with structured access to all gate and scoring outcomes.
 */
export function runEngine(rules: Rule[], context: Record<string, number>): EngineResult {
  const activeRules = rules.filter((r) => r.active !== false);

  const hardGateFails: EvaluationResult[] = [];
  const softGateWarnings: EvaluationResult[] = [];
  const scoringResults: EvaluationResult[] = [];
  const allResults: EvaluationResult[] = [];

  for (const rule of activeRules) {
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

  // Weighted average of scoring results using rule.weight as the weight.
  // We need to look up each scoring rule's weight by ruleId.
  const ruleWeightById = new Map<string, number>(activeRules.map((r) => [r.id, r.weight]));

  let totalWeight = 0;
  let weightedSum = 0;
  for (const sr of scoringResults) {
    const weight = ruleWeightById.get(sr.ruleId) ?? 1;
    const score = sr.weightedScore ?? 0;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    blocked: hardGateFails.length > 0,
    hardGateFails,
    softGateWarnings,
    scoringResults,
    allResults,
    compositeScore,
  };
}
