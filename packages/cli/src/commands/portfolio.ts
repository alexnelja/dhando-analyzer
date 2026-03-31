import { Command } from 'commander';
import {
  createDatabase,
  getInvestmentById,
  upsertPosition,
  listActivePositions,
  closePosition,
  getPosition,
  getLatestScore,
  scoreTrafficLight,
  generateRebalanceSignals,
  generatePostMortem,
} from '@dhando/core';
import type { RebalanceInput } from '@dhando/core';
import { getDbPath } from './init.js';

/** Emoji / ASCII badge for a traffic-light status. */
function tlBadge(status: 'green' | 'amber' | 'red'): string {
  switch (status) {
    case 'green': return '[GREEN]';
    case 'amber': return '[AMBER]';
    case 'red':   return '[RED]  ';
  }
}

/**
 * Register all `dhando portfolio` sub-commands on the given Commander program.
 *
 * Sub-commands:
 *   - add         Upsert a portfolio position
 *   - list        List active positions with return %
 *   - dashboard   Traffic-light view of all active positions
 *   - rebalance   Kelly rebalancing signals
 *   - close       Close a position and optionally generate a post-mortem
 *
 * @param program - The root Commander Command instance.
 */
export function registerPortfolioCommands(program: Command): void {
  const port = program.command('portfolio').description('Manage portfolio positions');

  // ── add ──────────────────────────────────────────────────────────────────────
  port.command('add <id>')
    .description('Add or update a portfolio position for an investment')
    .requiredOption('--cost <price>', 'Average cost basis per share', parseFloat)
    .requiredOption('--shares <n>', 'Number of shares', parseFloat)
    .action((id: string, opts: { cost: number; shares: number }) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, id);
        if (!inv) {
          console.error(`Investment not found: ${id}`);
          process.exitCode = 1;
          return;
        }
        const posId = upsertPosition(db, {
          investmentId: id,
          costBasis: opts.cost,
          shares: opts.shares,
        });
        console.log(`Position upserted for "${inv.name}" (id: ${posId})`);
        console.log(`  Cost basis: ${opts.cost}  Shares: ${opts.shares}`);
      } finally {
        db.close();
      }
    });

  // ── list ─────────────────────────────────────────────────────────────────────
  port.command('list')
    .description('List active positions with return %')
    .action(() => {
      const db = createDatabase(getDbPath());
      try {
        const positions = listActivePositions(db);
        if (positions.length === 0) {
          console.log('No active positions.');
          return;
        }

        const rows = positions.map((p) => {
          const inv = getInvestmentById(db, p.investmentId);
          const ivRow = getLatestScore(db, p.investmentId, 'altman_z');
          // Approximate current price from intrinsic value or fall back to cost.
          const currentPrice = inv?.intrinsic_value ?? p.costBasis;
          const returnPct = ((currentPrice - p.costBasis) / p.costBasis) * 100;
          return {
            name: inv?.name ?? p.investmentId,
            ticker: inv?.ticker ?? '-',
            cost: p.costBasis.toFixed(2),
            shares: p.shares,
            currentPrice: currentPrice.toFixed(2),
            returnPct: returnPct.toFixed(1) + '%',
            enteredAt: p.enteredAt.slice(0, 10),
            _stale: ivRow == null,
          };
        });

        console.table(rows.map(({ _stale, ...r }) => r));
        if (rows.some((r) => r._stale)) {
          console.log('  (!) Some positions lack score data — run `dhando screen <id>` first.');
        }
      } finally {
        db.close();
      }
    });

  // ── dashboard ─────────────────────────────────────────────────────────────────
  port.command('dashboard')
    .description('Traffic-light dashboard for all active positions')
    .action(() => {
      const db = createDatabase(getDbPath());
      try {
        const positions = listActivePositions(db);
        if (positions.length === 0) {
          console.log('No active positions.');
          return;
        }

        console.log('\nPortfolio Traffic-Light Dashboard');
        console.log('═'.repeat(55));

        for (const p of positions) {
          const inv = getInvestmentById(db, p.investmentId);
          const name = inv?.name ?? p.investmentId;

          const zRow = getLatestScore(db, p.investmentId, 'altman_z');
          const fRow = getLatestScore(db, p.investmentId, 'piotroski_f');
          const mRow = getLatestScore(db, p.investmentId, 'beneish_m');
          const compRow = getLatestScore(db, p.investmentId, 'composite');

          if (!zRow || !fRow || !mRow) {
            console.log(`  ${name}: [NO DATA] — run \`dhando screen ${p.investmentId}\` first`);
            continue;
          }

          const currentPrice = inv?.intrinsic_value ?? p.costBasis;
          const mos = (currentPrice - p.costBasis) / currentPrice;

          const tl = scoreTrafficLight({
            marginOfSafety: mos,
            moatScore: inv?.moat_score ?? 3,
            managementScore: inv?.management_score ?? 3,
            altmanZScore: zRow.value,
            piotroskiFScore: fRow.value,
            beneishMScore: mRow.value,
            kellyDriftAbsolute: 0,
            sentimentScore: 0,
          });

          console.log(`\n  ${tlBadge(tl.overall)} ${name} (${inv?.ticker ?? 'n/a'})`);
          console.log(`  Composite: ${(compRow?.value ?? 0).toFixed(1)} | MoS: ${(mos * 100).toFixed(1)}%`);
          for (const f of tl.factors) {
            console.log(`    ${tlBadge(f.status)} ${f.name.padEnd(20)} ${f.value.toFixed(2)}`);
          }
        }
        console.log('');
      } finally {
        db.close();
      }
    });

  // ── rebalance ─────────────────────────────────────────────────────────────────
  port.command('rebalance')
    .description('Generate Kelly rebalancing signals for all active positions')
    .action(() => {
      const db = createDatabase(getDbPath());
      try {
        const positions = listActivePositions(db);
        if (positions.length === 0) {
          console.log('No active positions.');
          return;
        }

        // Compute total portfolio value (using cost basis as proxy for current value).
        const totalValue = positions.reduce((sum, p) => sum + p.costBasis * p.shares, 0);

        const rebalanceInputs: RebalanceInput[] = positions.map((p) => {
          const inv = getInvestmentById(db, p.investmentId);
          const kellyRow = getLatestScore(db, p.investmentId, 'composite');
          // Approximate Kelly optimal as composite / 200 (max half-Kelly ~50%).
          const kellyOptimal = Math.min((kellyRow?.value ?? 50) / 200, 0.25);
          const currentWeight = totalValue > 0 ? (p.costBasis * p.shares) / totalValue : 0;

          return {
            investmentId: p.investmentId,
            name: inv?.name ?? p.investmentId,
            currentWeight,
            kellyOptimal,
          };
        });

        const signals = generateRebalanceSignals(rebalanceInputs);

        console.log('\nKelly Rebalancing Signals');
        console.log('═'.repeat(55));
        for (const s of signals) {
          const urgencyTag = s.urgency === 'high' ? ' [!!]' : s.urgency === 'medium' ? ' [!]' : '';
          console.log(
            `  ${s.action.toUpperCase().padEnd(5)} ${s.name.padEnd(30)} ` +
            `current: ${(s.currentWeight * 100).toFixed(1)}%  ` +
            `optimal: ${(s.optimalWeight * 100).toFixed(1)}%` +
            urgencyTag,
          );
          if (s.urgency !== 'low') {
            console.log(`         ${s.message}`);
          }
        }
        console.log('');
      } finally {
        db.close();
      }
    });

  // ── close ─────────────────────────────────────────────────────────────────────
  port.command('close <id>')
    .description('Close a position and generate a post-mortem')
    .requiredOption('--price <exitPrice>', 'Exit price per share', parseFloat)
    .action((id: string, opts: { price: number }) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, id);
        if (!inv) {
          console.error(`Investment not found: ${id}`);
          process.exitCode = 1;
          return;
        }

        const pos = getPosition(db, id);
        if (!pos) {
          console.error(`No active position found for investment: ${id}`);
          process.exitCode = 1;
          return;
        }

        closePosition(db, id, opts.price);
        console.log(`Position closed for "${inv.name}" at price ${opts.price}`);

        // Attempt to generate post-mortem from journal entry.
        const journalRow = db.get<{
          thesis: string | null;
          predicted_probability: number | null;
        }>(
          `SELECT thesis, predicted_probability FROM decision_journal
           WHERE investment_id = ? ORDER BY created_at DESC LIMIT 1`,
          id,
        );

        const returnPct = (opts.price - pos.costBasis) / pos.costBasis;
        const isWin = returnPct > 0 ? 1 : 0;
        const holdingDays = Math.round(
          (Date.now() - new Date(pos.enteredAt).getTime()) / 86_400_000,
        );

        const postMortem = generatePostMortem({
          name: inv.name,
          originalThesis: journalRow?.thesis ?? 'No thesis recorded.',
          predictedProbability: journalRow?.predicted_probability ?? 0.5,
          actualOutcome: isWin,
          entryPrice: pos.costBasis,
          exitPrice: opts.price,
          holdingPeriodDays: holdingDays,
          moatScoreAtEntry: inv.moat_score ?? 3,
          moatScoreAtExit: inv.moat_score ?? 3,
          keyAssumptions: {},
        });

        console.log('\nPost-Mortem:');
        console.log(`  Return       : ${(postMortem.returnPct * 100).toFixed(1)}%`);
        console.log(`  Held         : ${postMortem.holdingPeriodDays} days`);
        console.log(`  Quadrant     : ${postMortem.quadrant}`);
        console.log(`  Brier Score  : ${postMortem.brierContribution.toFixed(4)}`);
        console.log(`  Thesis Review: ${postMortem.thesisReview}`);
        console.log(`  Moat Change  : ${postMortem.moatChange}`);
        console.log(`  Lessons      : ${postMortem.lessons}`);
      } finally {
        db.close();
      }
    });
}
