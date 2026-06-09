/**
 * Electron-free financials IPC logic.
 *
 * The actual `ipcMain.handle(...)` registrations live in `index.ts`; this module
 * holds the pure orchestration so it can be unit-tested without spinning up
 * Electron. Each function takes its dependencies (db, fetcher, client) as
 * explicit arguments rather than reaching for module-level singletons.
 */

import {
  getFinancialsForInvestment,
  saveFinancial,
  pullAndSave,
  extractFinancialsFromText,
  type Financial,
  type StatementsFetcher,
  type ChatClient,
} from '@dhando/core';
import type { DatabaseConnection } from '@dhando/core';

/** Return all stored financial rows for an investment. */
export function financialsGet(db: DatabaseConnection, investmentId: string): Financial[] {
  return getFinancialsForInvestment(db, investmentId);
}

/** Persist a single (possibly user-edited) financial row. */
export function financialsSave(db: DatabaseConnection, financial: Financial): void {
  saveFinancial(db, financial);
}

/**
 * Pull statements from a data feed and persist them.
 * @returns the number of periods saved (0 ⇒ investment flagged needs-manual).
 */
export async function financialsPull(
  db: DatabaseConnection,
  fetcher: StatementsFetcher,
  investmentId: string,
  ticker: string,
  years = 2,
): Promise<number> {
  return pullAndSave(db, fetcher, investmentId, ticker, years);
}

/**
 * Extract financials from pasted text via Claude and persist each period.
 * @returns the saved rows.
 */
export async function financialsExtract(
  db: DatabaseConnection,
  client: ChatClient,
  investmentId: string,
  text: string,
): Promise<Financial[]> {
  const rows = await extractFinancialsFromText(client, investmentId, text);
  for (const row of rows) saveFinancial(db, row);
  return rows;
}
