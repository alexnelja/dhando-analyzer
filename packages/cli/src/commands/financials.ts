import { Command } from 'commander';
import { createDatabase, getInvestmentById, createEodhdClient } from '@dhando/core';
import { randomUUID } from 'node:crypto';
import { getDbPath } from './init.js';

/** Raw row shape returned from the financials table. */
interface FinancialsRow {
  id: string;
  investment_id: string;
  source: string;
  period: string;
  year: number;
  quarter: number | null;
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
 * Register all `dhando financials` sub-commands on the given Commander program.
 *
 * Sub-commands:
 *   - add    Manually enter financials for an investment
 *   - list   Show all financials rows for an investment
 *   - fetch  Pull latest financials from EODHD API (requires EODHD_API_KEY)
 *
 * @param program - The root Commander Command instance.
 */
export function registerFinancialsCommands(program: Command): void {
  const fin = program.command('financials').description('Manage financial data for investments');

  // ── add ──────────────────────────────────────────────────────────────────────
  fin.command('add <investmentId>')
    .description('Manually add a financials row for an investment')
    .requiredOption('--year <n>', 'Fiscal year', (v) => parseInt(v, 10))
    .option('--period <period>', 'Reporting period (annual|quarterly)', 'annual')
    .option('--revenue <n>', 'Total revenue', parseFloat)
    .option('--net-income <n>', 'Net income', parseFloat)
    .option('--ebitda <n>', 'EBITDA', parseFloat)
    .option('--total-assets <n>', 'Total assets', parseFloat)
    .option('--total-debt <n>', 'Total debt', parseFloat)
    .option('--cash <n>', 'Cash and equivalents', parseFloat)
    .option('--capex <n>', 'Capital expenditure', parseFloat)
    .option('--fcf <n>', 'Free cash flow', parseFloat)
    .option('--working-capital <n>', 'Working capital', parseFloat)
    .action((investmentId: string, opts: {
      year: number;
      period: string;
      revenue?: number;
      netIncome?: number;
      ebitda?: number;
      totalAssets?: number;
      totalDebt?: number;
      cash?: number;
      capex?: number;
      fcf?: number;
      workingCapital?: number;
    }) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, investmentId);
        if (!inv) {
          console.error(`Investment not found: ${investmentId}`);
          process.exitCode = 1;
          return;
        }

        const financialFields = [opts.revenue, opts.netIncome, opts.ebitda, opts.totalAssets, opts.totalDebt, opts.cash, opts.capex, opts.fcf, opts.workingCapital];
        if (!financialFields.some(v => v !== undefined)) {
          console.error('At least one financial metric must be provided.');
          process.exitCode = 1;
          return;
        }

        const currentYear = new Date().getFullYear();
        if (opts.year < 1900 || opts.year > currentYear + 1) {
          console.error(`Year must be between 1900 and ${currentYear + 1}, got ${opts.year}`);
          process.exitCode = 1;
          return;
        }

        const id = randomUUID();
        db.run(
          `INSERT INTO financials
             (id, investment_id, source, period, year, quarter,
              revenue, net_income, ebitda, total_assets, total_debt,
              cash, capex, fcf, working_capital)
           VALUES (?, ?, 'manual', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          investmentId,
          opts.period,
          opts.year,
          opts.revenue ?? null,
          opts.netIncome ?? null,
          opts.ebitda ?? null,
          opts.totalAssets ?? null,
          opts.totalDebt ?? null,
          opts.cash ?? null,
          opts.capex ?? null,
          opts.fcf ?? null,
          opts.workingCapital ?? null,
        );

        console.log(`Financials added for "${inv.name}" (year ${opts.year}, period: ${opts.period})`);
        console.log(`  Row id: ${id}`);
      } finally {
        db.close();
      }
    });

  // ── list ─────────────────────────────────────────────────────────────────────
  fin.command('list <investmentId>')
    .description('List all financials rows for an investment')
    .action((investmentId: string) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, investmentId);
        if (!inv) {
          console.error(`Investment not found: ${investmentId}`);
          process.exitCode = 1;
          return;
        }

        const rows = db.all<FinancialsRow>(
          `SELECT * FROM financials WHERE investment_id = ? ORDER BY year DESC, period`,
          investmentId,
        );

        if (rows.length === 0) {
          console.log(`No financials found for "${inv.name}".`);
          return;
        }

        console.log(`\nFinancials for: ${inv.name}`);
        console.table(
          rows.map((r) => ({
            year: r.year,
            period: r.period,
            source: r.source,
            revenue: r.revenue,
            net_income: r.net_income,
            ebitda: r.ebitda,
            total_assets: r.total_assets,
            total_debt: r.total_debt,
            cash: r.cash,
            capex: r.capex,
            fcf: r.fcf,
          })),
        );
      } finally {
        db.close();
      }
    });

  // ── fetch ─────────────────────────────────────────────────────────────────────
  fin.command('fetch <investmentId>')
    .description('Fetch financials from EODHD API (requires EODHD_API_KEY env var)')
    .option('--source <source>', 'Data source', 'eodhd')
    .action(async (investmentId: string) => {
      const db = createDatabase(getDbPath());
      try {
        const inv = getInvestmentById(db, investmentId);
        if (!inv) {
          console.error(`Investment not found: ${investmentId}`);
          process.exitCode = 1;
          return;
        }

        if (!inv.ticker) {
          console.error(`Investment "${inv.name}" has no ticker — cannot fetch from API.`);
          process.exitCode = 1;
          return;
        }

        const apiKey = process.env['EODHD_API_KEY'];
        if (!apiKey) {
          console.error(
            'EODHD_API_KEY environment variable is not set. ' +
            'Export it or add it to your .env file.',
          );
          process.exitCode = 1;
          return;
        }

        console.log(`Fetching financials for ${inv.ticker} from EODHD...`);
        const client = createEodhdClient(apiKey);
        const data = await client.getFundamentals(inv.ticker);

        const year = new Date().getFullYear();
        const id = randomUUID();

        db.run(
          `INSERT INTO financials
             (id, investment_id, source, period, year, quarter,
              revenue, net_income, ebitda, total_assets, total_debt,
              cash, capex, fcf, working_capital, auto_updated, last_refresh, api_source)
           VALUES (?, ?, 'api', 'annual', ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 1, ?, 'eodhd')`,
          id,
          investmentId,
          year,
          data.revenue ?? null,
          data.netIncome ?? null,
          data.ebitda ?? null,
          data.totalAssets ?? null,
          data.totalDebt ?? null,
          data.cash ?? null,
          new Date().toISOString(),
        );

        console.log(`Financials fetched and saved for "${inv.name}" (year ${year}):`);
        console.log(`  Revenue     : ${data.revenue ?? 'n/a'}`);
        console.log(`  Net Income  : ${data.netIncome ?? 'n/a'}`);
        console.log(`  EBITDA      : ${data.ebitda ?? 'n/a'}`);
        console.log(`  Total Assets: ${data.totalAssets ?? 'n/a'}`);
        console.log(`  Total Debt  : ${data.totalDebt ?? 'n/a'}`);
        console.log(`  Cash        : ${data.cash ?? 'n/a'}`);
      } finally {
        db.close();
      }
    });
}
