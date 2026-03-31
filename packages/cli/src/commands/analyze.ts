import { Command } from 'commander';
import {
  createDatabase,
  getInvestmentById,
  getLatestScore,
  runDealAnalyzer,
} from '@dhando/core';
import type { DealAnalyzerInput, ScenarioInput } from '@dhando/core';
import { getDbPath } from './init.js';

/**
 * Register the `dhando analyze <id>` command on the given Commander program.
 *
 * Runs the full deal analyzer pipeline for an investment that already has
 * scores persisted (run `dhando screen <id>` first).  Bear / base / bull
 * growth rates and margin are provided as CLI flags.
 *
 * Required options:
 *   --bear-growth <n>   Bear-case annual revenue growth (e.g. -0.05)
 *   --base-growth <n>   Base-case annual revenue growth (e.g. 0.08)
 *   --bull-growth <n>   Bull-case annual revenue growth (e.g. 0.15)
 *   --margin <n>        EBITDA margin applied across all scenarios (e.g. 0.20)
 *   --years <n>         Projection horizon in years (default: 5)
 *
 * Optional options:
 *   --current-price <n>   Current market price (default: 10)
 *   --market-cap <n>      Market capitalisation (default: 10 000 000)
 *   --shares <n>          Shares outstanding (default: 1 000 000)
 *   --owner-earnings <n>  Year-0 owner earnings for DCF (default: from base revenue × margin)
 *   --moat <n>            Moat score 1–5 (default: 3)
 *   --mgmt <n>            Management score 1–5 (default: 3)
 *   --win-prob <n>        Analyst win probability 0–1 (default: 0.6)
 *   --discount-rate <n>   DCF discount rate (default: 0.10)
 *
 * @param program - The root Commander Command instance.
 */
export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze <id>')
    .description('Run the full deal analyzer (scenarios, DCF, Kelly, memo) for an investment')
    .requiredOption('--bear-growth <n>', 'Bear-case annual revenue growth rate', parseFloat)
    .requiredOption('--base-growth <n>', 'Base-case annual revenue growth rate', parseFloat)
    .requiredOption('--bull-growth <n>', 'Bull-case annual revenue growth rate', parseFloat)
    .requiredOption('--margin <n>', 'EBITDA margin for all scenarios', parseFloat)
    .option('--years <n>', 'Projection horizon in years', (v) => parseInt(v, 10), 5)
    .option('--current-price <n>', 'Current market price per share', parseFloat, 10)
    .option('--market-cap <n>', 'Market capitalisation', parseFloat, 10_000_000)
    .option('--shares <n>', 'Shares outstanding', parseFloat, 1_000_000)
    .option('--owner-earnings <n>', 'Year-0 owner earnings for DCF', parseFloat)
    .option('--moat <n>', 'Moat score 1–5', (v) => parseInt(v, 10), 3)
    .option('--mgmt <n>', 'Management quality score 1–5', (v) => parseInt(v, 10), 3)
    .option('--win-prob <n>', 'Analyst win probability 0–1', parseFloat, 0.6)
    .option('--discount-rate <n>', 'DCF discount rate', parseFloat, 0.10)
    .action((id: string, opts: {
      bearGrowth: number;
      baseGrowth: number;
      bullGrowth: number;
      margin: number;
      years: number;
      currentPrice: number;
      marketCap: number;
      shares: number;
      ownerEarnings: number | undefined;
      moat: number;
      mgmt: number;
      winProb: number;
      discountRate: number;
    }) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, id);
        if (!inv) {
          console.error(`Investment not found: ${id}`);
          process.exitCode = 1;
          return;
        }

        // Retrieve latest scores from DB.
        const zRow = getLatestScore(db, id, 'altman_z');
        const fRow = getLatestScore(db, id, 'piotroski_f');
        const mRow = getLatestScore(db, id, 'beneish_m');
        const compRow = getLatestScore(db, id, 'composite');

        const altmanZScore = zRow?.value ?? 1.5;
        const piotroskiFScore = fRow?.value ?? 4;
        const beneishMScore = mRow?.value ?? -2.0;
        const compositeScore = compRow?.value ?? 50;

        // Derive a rough base revenue from owner earnings + margin.
        const baseRevenue = opts.ownerEarnings != null
          ? opts.ownerEarnings / (opts.margin > 0 ? opts.margin : 0.15)
          : opts.marketCap * 0.15;

        const ownerEarnings = opts.ownerEarnings ?? baseRevenue * opts.margin;

        const scenarioInputs: ScenarioInput[] = [
          { case: 'bear', revenueGrowth: opts.bearGrowth, margin: opts.margin, multiple: 8, probabilityWeight: 0.25 },
          { case: 'base', revenueGrowth: opts.baseGrowth, margin: opts.margin, multiple: 12, probabilityWeight: 0.50 },
          { case: 'bull', revenueGrowth: opts.bullGrowth, margin: opts.margin, multiple: 16, probabilityWeight: 0.25 },
        ];

        const input: DealAnalyzerInput = {
          investmentId: id,
          name: inv.name,
          ticker: inv.ticker,
          sector: inv.sector,
          currentPrice: opts.currentPrice,
          marketCap: opts.marketCap,
          sharesOutstanding: opts.shares,
          screenerResult: {
            altmanZ: {
              score: altmanZScore,
              zone: altmanZScore > 2.99 ? 'safe' : altmanZScore >= 1.81 ? 'grey' : 'distress',
            },
            piotroskiF: { score: piotroskiFScore },
            beneishM: { score: beneishMScore, likelyManipulator: beneishMScore > -1.78 },
            compositeScore,
            valuation: {
              evEbitda: null,
              pe: null,
              pb: null,
              fcfYield: null,
              ownerEarnings,
            },
          },
          moatScore: opts.moat,
          managementScore: opts.mgmt,
          scenarioInputs,
          baseRevenue,
          projectionYears: opts.years,
          dcfInput: {
            ownerEarnings,
            growthRate: opts.baseGrowth,
            terminalGrowthRate: 0.03,
            discountRate: opts.discountRate,
            projectionYears: opts.years,
          },
          winProbability: opts.winProb,
        };

        const result = runDealAnalyzer(input, db);

        // Print results.
        console.log(`\nDeal Analysis: ${inv.name} (${inv.ticker ?? 'n/a'})`);
        console.log('═'.repeat(55));

        console.log('\nScenarios:');
        for (const s of result.scenarioModel.scenarios) {
          console.log(
            `  ${s.case.padEnd(5)}: target ${s.targetPrice.toFixed(2)} ` +
            `× ${(s.probabilityWeight * 100).toFixed(0)}% = ${s.weightedValue.toFixed(2)}`,
          );
        }
        console.log(`  Expected Value : ${result.expectedValue.toFixed(2)}`);

        console.log('\nDCF Valuation:');
        console.log(`  Intrinsic Value  : ${result.intrinsicValue.toFixed(2)}`);
        console.log(`  Margin of Safety : ${(result.marginOfSafety * 100).toFixed(1)}%`);

        console.log('\nKelly Position Sizing:');
        console.log(`  Full Kelly  : ${(result.kelly.fullKelly * 100).toFixed(1)}%`);
        console.log(`  Half Kelly  : ${(result.kelly.halfKelly * 100).toFixed(1)}%`);
        console.log(`  Recommended : ${(result.kellyPosition * 100).toFixed(1)}%`);

        console.log('\nPre-Mortem Risk Assessment:');
        console.log(`  Adjusted Win Probability: ${(result.preMortem.adjustedWinProbability * 100).toFixed(1)}%`);
        console.log(`  Overall Risk Level      : ${result.preMortem.overallRiskLevel}`);
        const highRisks = result.preMortem.categories.filter((c) => c.riskLevel === 'high');
        if (highRisks.length > 0) {
          console.log('  High-Risk Categories:');
          for (const cat of highRisks) {
            console.log(`    - ${cat.category}: ${cat.evidence}`);
          }
        }

        console.log('\nInvestment Memo:');
        console.log(`  Thesis     : ${result.memo.thesis}`);
        console.log(`  Moat       : ${result.memo.moatAnalysis}`);
        console.log(`  Valuation  : ${result.memo.valuation}`);
        if (result.memo.keyRisks.length > 0) {
          console.log('  Key Risks:');
          for (const risk of result.memo.keyRisks) {
            console.log(`    - ${risk}`);
          }
        }
        if (result.memo.exitCriteria.length > 0) {
          console.log('  Exit Criteria:');
          for (const criterion of result.memo.exitCriteria) {
            console.log(`    - ${criterion}`);
          }
        }

        if (result.blocked) {
          console.log('\n  [BLOCKED by hard-gate rule]');
        }

        console.log('\nAnalysis persisted to database.');
      } finally {
        db.close();
      }
    });
}
