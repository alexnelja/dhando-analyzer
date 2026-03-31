import { Command } from 'commander';
import {
  addToWatchlist,
  getWatchlist,
  advancePipelineStatus,
  removeFromWatchlist,
  getInvestmentById,
  createDatabase,
} from '@dhando/core';
import { getDbPath } from './init.js';

/**
 * Print an array of objects as a console table with only the requested columns.
 *
 * @param rows - Array of plain objects to display.
 * @param columns - Keys to include in the output.
 */
function printTable(rows: Record<string, unknown>[], columns: string[]): void {
  if (rows.length === 0) {
    console.log('(no results)');
    return;
  }
  console.table(rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]]))));
}

/**
 * Register all `dhando watchlist` sub-commands on the given Commander program.
 *
 * Sub-commands:
 *   - add      Add an investment to the watchlist
 *   - list     List watchlist entries (optionally filtered by status)
 *   - advance  Advance an investment to the next pipeline stage
 *   - remove   Soft-delete an investment (sets status → rejected)
 *   - show     Display full details of a single investment
 *
 * @param program - The root Commander Command instance.
 */
export function registerWatchlistCommands(program: Command): void {
  const wl = program.command('watchlist').description('Manage the investment watchlist');

  // ── add ─────────────────────────────────────────────────────────────────────
  wl.command('add')
    .description('Add an investment to the watchlist')
    .requiredOption('--name <name>', 'Investment name')
    .requiredOption('--ticker <ticker>', 'Ticker symbol')
    .requiredOption('--exchange <exchange>', 'Exchange (e.g. JSE, NYSE)')
    .option('--sector <sector>', 'Sector classification')
    .option('--type <type>', 'Investment type', 'listed_stock')
    .action((opts) => {
      const db = createDatabase(getDbPath());
      try {
        const id = addToWatchlist(db, {
          name: opts.name,
          ticker: opts.ticker,
          exchange: opts.exchange,
          sector: opts.sector ?? null,
          type: opts.type,
        });
        console.log(`Added "${opts.name}" to watchlist with id: ${id}`);
      } finally {
        db.close();
      }
    });

  // ── list ────────────────────────────────────────────────────────────────────
  wl.command('list')
    .description('List watchlist investments')
    .option('--status <status>', 'Filter by pipeline status (e.g. screening, researching)')
    .action((opts) => {
      const db = createDatabase(getDbPath());
      try {
        const rows = getWatchlist(db, opts.status);
        printTable(
          rows as unknown as Record<string, unknown>[],
          ['id', 'name', 'ticker', 'exchange', 'sector', 'status', 'created_at'],
        );
      } finally {
        db.close();
      }
    });

  // ── advance ─────────────────────────────────────────────────────────────────
  wl.command('advance <id>')
    .description('Advance an investment to the next pipeline stage')
    .action((id: string) => {
      const db = createDatabase(getDbPath());
      try {
        advancePipelineStatus(db, id);
        const updated = getInvestmentById(db, id);
        console.log(`Advanced "${updated?.name}" to status: ${updated?.status}`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
      } finally {
        db.close();
      }
    });

  // ── remove ───────────────────────────────────────────────────────────────────
  wl.command('remove <id>')
    .description('Remove (reject) an investment from the watchlist')
    .action((id: string) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, id);
        if (!inv) {
          console.error(`Investment not found: ${id}`);
          process.exitCode = 1;
          return;
        }
        removeFromWatchlist(db, id);
        console.log(`Rejected "${inv.name}" (id: ${id})`);
      } finally {
        db.close();
      }
    });

  // ── show ─────────────────────────────────────────────────────────────────────
  wl.command('show <id>')
    .description('Show full details of an investment')
    .action((id: string) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, id);
        if (!inv) {
          console.error(`Investment not found: ${id}`);
          process.exitCode = 1;
          return;
        }
        console.log(JSON.stringify(inv, null, 2));
      } finally {
        db.close();
      }
    });
}
