import { Command } from 'commander';
import {
  createDatabase,
  getInvestmentById,
  listActiveRules,
  createRule,
  loadRulesFromDirectory,
  runEngine,
  getLatestScore,
} from '@dhando/core';
import type { RuleDocument } from '@dhando/core';
import { resolve } from 'node:path';
import { getDbPath } from './init.js';

/**
 * Register all `dhando rules` sub-commands on the given Commander program.
 *
 * Sub-commands:
 *   - list      List all active rules from the database
 *   - load      Load YAML rules from a directory and persist to DB
 *   - add       Create a single rule from CLI arguments
 *   - evaluate  Run the rules engine against an investment's current scores
 *
 * @param program - The root Commander Command instance.
 */
export function registerRulesCommands(program: Command): void {
  const rules = program.command('rules').description('Manage investment rules');

  // ── list ─────────────────────────────────────────────────────────────────────
  rules.command('list')
    .description('List all active rules')
    .action(() => {
      const db = createDatabase(getDbPath());
      try {
        const active = listActiveRules(db);
        if (active.length === 0) {
          console.log('No active rules found. Use `dhando rules load` or `dhando rules add`.');
          return;
        }
        console.log(`\nActive rules (${active.length}):`);
        console.table(
          active.map((r) => ({
            id: r.id.slice(0, 8) + '...',
            name: r.name,
            category: r.category,
            type: r.type,
            weight: r.weight,
            believability: r.believabilityScore.toFixed(2),
            version: r.version,
          })),
        );
      } finally {
        db.close();
      }
    });

  // ── load ─────────────────────────────────────────────────────────────────────
  rules.command('load')
    .description('Load YAML rules from a directory and persist to DB')
    .option('--dir <path>', 'Directory containing .yaml / .yml rule files', './rules')
    .action((opts: { dir: string }) => {
      const db = createDatabase(getDbPath());
      try {
        const dir = resolve(opts.dir);
        console.log(`Loading rules from: ${dir}`);

        const docs = loadRulesFromDirectory(dir);
        if (docs.length === 0) {
          console.log('No valid YAML rule files found in directory.');
          return;
        }

        let loaded = 0;
        for (const doc of docs) {
          createRule(db, doc);
          loaded++;
          console.log(`  Loaded: ${doc.name}`);
        }
        console.log(`\nLoaded ${loaded} rule(s) into database.`);
      } catch (err) {
        console.error(`Error loading rules: ${(err as Error).message}`);
        process.exitCode = 1;
      } finally {
        db.close();
      }
    });

  // ── add ──────────────────────────────────────────────────────────────────────
  rules.command('add')
    .description('Create a rule from CLI arguments')
    .requiredOption('--name <name>', 'Rule name')
    .requiredOption('--category <category>', 'Category: valuation|risk|quality|behaviour|position_sizing|distress|em_private')
    .requiredOption('--type <type>', 'Type: hard_gate|soft_gate|scoring')
    .requiredOption('--source-type <sourceType>', 'Source type: book|meeting|mistake|expert')
    .requiredOption('--source-detail <detail>', 'Source detail (e.g. book title)')
    .requiredOption('--description <desc>', 'Human-readable description')
    .requiredOption(
      '--conditions <conditions>',
      'Pipe-delimited conditions: metric:operator:value:weight (e.g. altman_z:gte:1.81:1.0)',
    )
    .option('--weight <n>', 'Rule weight (default 1.0)', parseFloat, 1.0)
    .action((opts: {
      name: string;
      category: string;
      type: string;
      sourceType: string;
      sourceDetail: string;
      description: string;
      conditions: string;
      weight: number;
    }) => {
      const db = createDatabase(getDbPath());
      try {
        // Parse conditions string: "metric:operator:value:weight|..."
        const conditionParts = opts.conditions.split('|').map((part) => {
          const [metric, operator, valueStr, weightStr] = part.trim().split(':');
          if (!metric || !operator || !valueStr) {
            throw new Error(`Invalid condition format: "${part}". Expected metric:operator:value:weight`);
          }
          return {
            metric,
            operator: operator as 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between',
            value: parseFloat(valueStr),
            weight: weightStr != null ? parseFloat(weightStr) : 1.0,
          };
        });

        const doc: RuleDocument = {
          name: opts.name,
          category: opts.category as RuleDocument['category'],
          type: opts.type as RuleDocument['type'],
          source_type: opts.sourceType as RuleDocument['source_type'],
          source_detail: opts.sourceDetail,
          description: opts.description,
          weight: opts.weight,
          conditions: conditionParts,
        };

        const id = createRule(db, doc);
        console.log(`Rule "${opts.name}" created with id: ${id}`);
      } catch (err) {
        console.error(`Error creating rule: ${(err as Error).message}`);
        process.exitCode = 1;
      } finally {
        db.close();
      }
    });

  // ── evaluate ──────────────────────────────────────────────────────────────────
  rules.command('evaluate <investmentId>')
    .description("Run the rules engine against an investment's current scores")
    .action((investmentId: string) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, investmentId);
        if (!inv) {
          console.error(`Investment not found: ${investmentId}`);
          process.exitCode = 1;
          return;
        }

        const activeRules = listActiveRules(db);
        if (activeRules.length === 0) {
          console.log('No active rules to evaluate. Add rules with `dhando rules add` or `dhando rules load`.');
          return;
        }

        // Build context from latest scores.
        const context: Record<string, number> = {};
        for (const scoreType of ['altman_z', 'piotroski_f', 'beneish_m', 'composite']) {
          const row = getLatestScore(db, investmentId, scoreType);
          if (row != null) {
            context[scoreType] = row.value;
          }
        }

        if (Object.keys(context).length === 0) {
          console.error(
            `No scores found for "${inv.name}". Run \`dhando screen ${investmentId}\` first.`,
          );
          process.exitCode = 1;
          return;
        }

        const result = runEngine(activeRules, context);

        console.log(`\nRules evaluation for: ${inv.name}`);
        console.log('─'.repeat(50));
        console.log(`  Blocked          : ${result.blocked}`);
        console.log(`  Composite Score  : ${result.compositeScore.toFixed(2)}`);
        console.log(`  Hard-gate fails  : ${result.hardGateFails.length}`);
        console.log(`  Soft-gate warns  : ${result.softGateWarnings.length}`);
        console.log(`  Total rules run  : ${result.allResults.length}`);

        // Build id → name lookup for display.
        const ruleNameById = new Map(activeRules.map((r) => [r.id, r.name]));

        if (result.hardGateFails.length > 0) {
          console.log('\n  Hard-gate failures:');
          for (const f of result.hardGateFails) {
            const name = ruleNameById.get(f.ruleId) ?? f.ruleId;
            console.log(`    - ${name}: ${f.result}`);
          }
        }

        if (result.softGateWarnings.length > 0) {
          console.log('\n  Soft-gate warnings:');
          for (const w of result.softGateWarnings) {
            const name = ruleNameById.get(w.ruleId) ?? w.ruleId;
            console.log(`    - ${name}: ${w.result}`);
          }
        }
      } finally {
        db.close();
      }
    });
}
