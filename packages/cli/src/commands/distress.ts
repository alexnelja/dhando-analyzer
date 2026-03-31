import { Command } from 'commander';
import {
  createDatabase,
  getInvestmentById,
  getLatestScore,
  runDistressRadar,
} from '@dhando/core';
import type { DistressRadarInput, DistressFactors } from '@dhando/core';
import { getDbPath } from './init.js';

/**
 * Register the `dhando distress check <id>` command on the given Commander program.
 *
 * Runs the full distress radar pipeline against stored scores for an investment.
 * Requires at least Altman Z, Piotroski F, and Beneish M scores to have been
 * computed via `dhando screen <id>`.
 *
 * @param program - The root Commander Command instance.
 */
export function registerDistressCommands(program: Command): void {
  const dist = program.command('distress').description('Distress radar analysis');

  // ── check ─────────────────────────────────────────────────────────────────────
  dist.command('check <id>')
    .description('Run the distress radar for an investment')
    .option('--piotroski-prior <n>', 'Piotroski F-Score from prior year (for trend)', parseFloat)
    .option('--fcf-current <n>', 'Current FCF', parseFloat)
    .option('--fcf-prior <n>', 'Prior FCF', parseFloat)
    .option('--debt-ebitda <n>', 'Debt / EBITDA ratio', parseFloat)
    .option('--wc-current <n>', 'Current working capital', parseFloat)
    .option('--wc-prior <n>', 'Prior working capital', parseFloat)
    .action((id: string, opts: {
      piotroskiPrior?: number;
      fcfCurrent?: number;
      fcfPrior?: number;
      debtEbitda?: number;
      wcCurrent?: number;
      wcPrior?: number;
    }) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, id);
        if (!inv) {
          console.error(`Investment not found: ${id}`);
          process.exitCode = 1;
          return;
        }

        const zRow = getLatestScore(db, id, 'altman_z');
        const fRow = getLatestScore(db, id, 'piotroski_f');
        const mRow = getLatestScore(db, id, 'beneish_m');

        if (!zRow || !fRow || !mRow) {
          console.error(
            `Missing scores for "${inv.name}". Run \`dhando screen ${id}\` first.`,
          );
          process.exitCode = 1;
          return;
        }

        const piotroskiFCurrent = fRow.value;
        const piotroskiFPrior = opts.piotroskiPrior ?? Math.max(0, piotroskiFCurrent - 1);

        // Build qualitative distress factors with neutral defaults (mid-scale = 5).
        // Callers can extend this command with per-factor options if needed.
        const distressFactors: DistressFactors = {
          cause: 5,        // mid-scale: cause of distress uncertain
          industry: 5,     // mid-scale: industry dynamics uncertain
          balanceSheet: 5, // mid-scale: balance sheet moderate
          management: 5,   // mid-scale: management quality unknown
          competition: 5,  // mid-scale: competitive position unknown
          revenueBase: 5,  // mid-scale: revenue durability unknown
          assetValue: 5,   // mid-scale: asset coverage unknown
        };

        const input: DistressRadarInput = {
          investmentId: id,
          altmanZ: zRow.value,
          piotroskiFCurrent,
          piotroskiFPrior,
          beneishM: mRow.value,
          fcfCurrent: opts.fcfCurrent ?? 0,
          fcfPrior: opts.fcfPrior ?? 0,
          debtToEbitda: opts.debtEbitda ?? 0,
          workingCapitalCurrent: opts.wcCurrent ?? 0,
          workingCapitalPrior: opts.wcPrior ?? 0,
          distressFactors,
        };

        const result = runDistressRadar(input, db);

        console.log(`\nDistress Radar: ${inv.name} (${inv.ticker ?? 'n/a'})`);
        console.log('═'.repeat(55));
        console.log(`  Composite Distress Score : ${result.compositeDistressScore.toFixed(1)} / 100`);
        console.log(`  Classification           : ${result.classification.toUpperCase()}`);
        console.log(`  Permanence Score         : ${result.permanenceScore.toFixed(2)} / 10`);
        console.log(`  Turnaround Candidate     : ${result.isTurnaroundCandidate}`);

        console.log('\n  Component Breakdown:');
        for (const [component, score] of Object.entries(result.compositeComponents)) {
          console.log(`    ${component.padEnd(25)}: ${(score as number).toFixed(2)}`);
        }

        if (result.sentimentTrend) {
          console.log(`\n  Sentiment Trend: ${result.sentimentTrend.trend} (avg: ${result.sentimentTrend.avgScore.toFixed(3)})`);
        }

        if (result.geopoliticalMatches && result.geopoliticalMatches.length > 0) {
          console.log('\n  Geopolitical Matches:');
          for (const m of result.geopoliticalMatches) {
            console.log(`    - ${m.eventType}: relevance ${m.relevanceWeight}`);
          }
        }

        // Risk guidance.
        if (result.compositeDistressScore > 70) {
          console.log('\n  [HIGH DISTRESS] Review position urgently.');
        } else if (result.compositeDistressScore > 40) {
          console.log('\n  [ELEVATED DISTRESS] Monitor closely.');
        } else {
          console.log('\n  [LOW DISTRESS] Financial health appears adequate.');
        }
      } finally {
        db.close();
      }
    });
}
