import { load } from 'js-yaml';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { RuleCondition } from '../models/rule.js';

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
  category: z.enum(['valuation', 'risk', 'quality', 'behaviour', 'position_sizing', 'distress', 'em_private']),
  type: z.enum(['hard_gate', 'soft_gate', 'scoring']),
  source_type: z.enum(['book', 'meeting', 'mistake', 'expert']),
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
 * Load every `.yaml` or `.yml` file from a directory.
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
