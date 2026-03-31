import { Command } from 'commander';
import {
  createDatabase,
  getInvestmentById,
  runScreenerPipeline,
  saveScore,
  listActiveRules,
} from '@dhando/core';
import type { PipelineFinancials, ScreenerPipelineInput } from '@dhando/core';
import { getDbPath } from './init.js';

/** Raw row returned from the financials table. */
interface FinancialsRow {
  id: string;
  investment_id: string;
  year: number;
  period: string;
  revenue: number | null;
  net_income: number | null;
  ebitda: number | null;
  total_assets: number | null;
  total_debt: number | null;
  cash: number | null;
  capex: number | null;
  fcf: number | null;
  working_capital: number | null;
}

/**
 * Map a raw financials DB row to the {@link PipelineFinancials} shape required
 * by the screener pipeline, filling missing fields with 0.
 */
function rowToFinancials(row: FinancialsRow): PipelineFinancials {
  const n = (v: number | null): number => v ?? 0;
  const revenue = n(row.revenue);
  const netIncome = n(row.net_income);
  const totalAssets = n(row.total_assets);
  const totalDebt = n(row.total_debt);
  const cash = n(row.cash);
  const capex = n(row.capex);
  const fcf = n(row.fcf);
  const ebitda = n(row.ebitda);
  const workingCapital = n(row.working_capital);

  return {
    revenue,
    netIncome,
    grossProfit: netIncome,          // approximation when gross profit not stored
    ebitda,
    ebit: ebitda,                    // approximation
    totalAssets,
    currentAssets: totalAssets * 0.4,// approximation
    currentLiabilities: totalDebt * 0.3,
    totalLiabilities: totalDebt,
    longTermDebt: totalDebt,
    cash,
    capex,
    fcf,
    ppAndE: totalAssets * 0.4,
    retainedEarnings: netIncome,
    operatingCashFlow: fcf + capex,
    accountsReceivable: revenue * 0.1,
    depreciation: capex * 0.8,
    sgaExpenses: revenue * 0.15,
    sharesOutstanding: 1_000_000,    // placeholder — no shares stored manually
    workingCapital,
    totalAssetsLastYear: totalAssets, // same row as prior when only one period
  };
}

/**
 * Register the `dhando screen <id>` command on the given Commander program.
 *
 * Runs the full screener pipeline for an investment that already has at least
 * one financials row in the database.  Persists computed scores back to the
 * scores table and prints a summary.
 *
 * Options:
 *   --with-rules   Load active rules from DB and run the rules engine gate
 *
 * @param program - The root Commander Command instance.
 */
export function registerScreenCommand(program: Command): void {
  program
    .command('screen <id>')
    .description('Run screener pipeline (Altman Z, Piotroski F, Beneish M) for an investment')
    .option('--with-rules', 'Load rules from DB and run the rules engine gate', false)
    .action((id: string, opts: { withRules: boolean }) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, id);
        if (!inv) {
          console.error(`Investment not found: ${id}`);
          process.exitCode = 1;
          return;
        }

        // Pull the two most recent annual financials rows.
        const rows = db.all<FinancialsRow>(
          `SELECT * FROM financials WHERE investment_id = ? AND period = 'annual'
           ORDER BY year DESC LIMIT 2`,
          id,
        );

        if (rows.length < 2) {
          console.error(
            `Investment requires at least 2 annual financial periods for YoY comparison. ` +
            `Currently have: ${rows.length}. Add financials with: dhando financials add ${id} --year <year> ...`
          );
          process.exitCode = 1;
          return;
        }

        const [currentRow, priorRow] = rows;
        const currentFin = rowToFinancials(currentRow);
        const priorFin = rowToFinancials(priorRow);

        // Price data is required for accurate scoring
        const price = inv.intrinsic_value;
        if (!price || price <= 0) {
          console.error(
            `Investment "${inv.name}" has no market price set. ` +
            `Use "dhando financials fetch ${id}" to pull price data, or update the investment manually.`
          );
          process.exitCode = 1;
          return;
        }

        const input: ScreenerPipelineInput = {
          investment: {
            id: inv.id,
            name: inv.name,
            ticker: inv.ticker ?? '',
          },
          financials: { current: currentFin, prior: priorFin },
          price: {
            price,
            marketCap: price * 1_000_000,
          },
        };

        const rules = opts.withRules ? listActiveRules(db) : undefined;
        const result = runScreenerPipeline(input, rules);

        // Persist scores.
        const now = new Date().toISOString();
        for (const [type, value] of [
          ['altman_z', result.altmanZ.z],
          ['piotroski_f', result.piotroskiF.score],
          ['beneish_m', result.beneishM.mScore],
          ['composite', result.compositeScore],
        ] as [string, number][]) {
          saveScore(db, {
            investmentId: id,
            scoreType: type,
            value,
            calculatedAt: now,
          });
        }

        // Print results.
        console.log(`\nScreener results for: ${inv.name} (${inv.ticker ?? 'n/a'})`);
        console.log('─'.repeat(50));
        console.log(`Altman Z-Score   : ${result.altmanZ.z.toFixed(2)}  [zone: ${result.altmanZ.zone}]`);
        console.log(`Piotroski F-Score: ${result.piotroskiF.score} / 9`);
        console.log(`Beneish M-Score  : ${result.beneishM.mScore.toFixed(3)}  [manipulator: ${result.beneishM.manipulationFlag}]`);
        console.log(`Composite Score  : ${result.compositeScore.toFixed(1)}`);
        console.log('\nValuation Metrics:');
        console.log(`  EV/EBITDA  : ${result.valuation.evEbitda?.toFixed(2) ?? 'n/a'}`);
        console.log(`  P/E        : ${result.valuation.pe?.toFixed(2) ?? 'n/a'}`);
        console.log(`  P/B        : ${result.valuation.pb?.toFixed(2) ?? 'n/a'}`);
        console.log(`  FCF Yield  : ${result.valuation.fcfYield != null ? (result.valuation.fcfYield * 100).toFixed(1) + '%' : 'n/a'}`);
        console.log(`  Owner Earnings: ${result.valuation.ownerEarnings.toFixed(0)}`);

        if (opts.withRules && result.rulesResult) {
          console.log('\nRules Engine:');
          console.log(`  Blocked: ${result.blocked}`);
          console.log(`  Hard-gate failures: ${result.rulesResult.hardGateFails.length}`);
          console.log(`  Soft-gate warnings: ${result.rulesResult.softGateWarnings.length}`);
        }

        console.log('\nScores saved to database.');
      } finally {
        db.close();
      }
    });
}
