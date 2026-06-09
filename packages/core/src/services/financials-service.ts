/**
 * Orchestration layer over {@link financials-repo} and the EODHD client.
 *
 * Responsibilities:
 * - `pullAndSave`  — fetch statements from a data feed, snapshot the raw API
 *   values, persist them, and toggle `investments.needs_manual_financials`.
 * - `saveOverride` — record that the user has manually edited specific fields.
 * - `reconcile`    — surface overridden fields whose value now diverges from
 *   the original API snapshot, so the UI can warn the user.
 */

import type { DatabaseConnection } from '../data/db.js';
import type { Financial } from '../models/financial.js';
import { saveFinancial } from '../data/financials-repo.js';

/** A function that returns annual statements for a ticker (e.g. `pullStatements` bound to a key). */
export type StatementsFetcher = (ticker: string, years: number) => Promise<Partial<Financial>[]>;

/** Numeric `Financial` fields that the API snapshot tracks for reconciliation. */
const NUMERIC_FIELDS: (keyof Financial)[] = [
  'revenue', 'netIncome', 'ebitda', 'totalAssets', 'totalDebt', 'cash', 'capex', 'fcf',
  'workingCapital', 'retainedEarnings', 'ebit', 'totalLiabilities', 'longTermDebt',
  'currentAssets', 'currentLiabilities', 'sharesOutstanding', 'grossProfit', 'receivables',
  'ppe', 'depreciation', 'sga', 'cashFromOps',
];

function setNeedsManual(db: DatabaseConnection, investmentId: string, value: 0 | 1): void {
  db.run(
    `UPDATE investments SET needs_manual_financials = ? WHERE id = ?`,
    value,
    investmentId,
  );
}

/** Build the `apiValuesJson` snapshot from a row's numeric fields. */
function snapshot(row: Partial<Financial>): string {
  const snap: Record<string, number | null> = {};
  for (const f of NUMERIC_FIELDS) {
    snap[f] = (row[f] as number | null | undefined) ?? null;
  }
  return JSON.stringify(snap);
}

/** Complete a {@link Financial} from an API partial, tagging it as a fresh API pull. */
function toApiFinancial(investmentId: string, p: Partial<Financial>): Financial {
  const period = p.period ?? 'annual';
  const quarter = p.quarter ?? null;
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return {
    id: `${investmentId}-${period}-${p.year}-${quarter ?? 'A'}`,
    investmentId,
    source: 'api',
    period,
    year: p.year as number,
    quarter,
    revenue: num(p.revenue),
    netIncome: num(p.netIncome),
    ebitda: num(p.ebitda),
    totalAssets: num(p.totalAssets),
    totalDebt: num(p.totalDebt),
    cash: num(p.cash),
    capex: num(p.capex),
    fcf: num(p.fcf),
    workingCapital: num(p.workingCapital),
    retainedEarnings: num(p.retainedEarnings),
    ebit: num(p.ebit),
    totalLiabilities: num(p.totalLiabilities),
    longTermDebt: num(p.longTermDebt),
    currentAssets: num(p.currentAssets),
    currentLiabilities: num(p.currentLiabilities),
    sharesOutstanding: num(p.sharesOutstanding),
    grossProfit: num(p.grossProfit),
    receivables: num(p.receivables),
    ppe: num(p.ppe),
    depreciation: num(p.depreciation),
    sga: num(p.sga),
    cashFromOps: num(p.cashFromOps),
    apiValuesJson: snapshot(p),
    overriddenFields: null,
    autoUpdated: true,
    lastRefresh: new Date(),
    apiSource: p.apiSource ?? 'eodhd',
  };
}

/**
 * Fetch statements via `fetcher`, persist them, and update the investment's
 * manual-entry flag. An empty result (no data from the feed) flips
 * `needs_manual_financials` to 1; a non-empty result clears it to 0.
 *
 * @returns the number of periods saved.
 */
export async function pullAndSave(
  db: DatabaseConnection,
  fetcher: StatementsFetcher,
  investmentId: string,
  ticker: string,
  years: number,
): Promise<number> {
  const partials = await fetcher(ticker, years);
  if (partials.length === 0) {
    setNeedsManual(db, investmentId, 1);
    return 0;
  }
  for (const p of partials) {
    saveFinancial(db, toApiFinancial(investmentId, p));
  }
  setNeedsManual(db, investmentId, 0);
  return partials.length;
}

/**
 * Persist a user-edited financial row, unioning `fields` into its
 * `overriddenFields` list so reconciliation knows which figures are manual.
 */
export function saveOverride(
  db: DatabaseConnection,
  financial: Financial,
  fields: string[],
): void {
  const existing: string[] = financial.overriddenFields
    ? (JSON.parse(financial.overriddenFields) as string[])
    : [];
  const merged = Array.from(new Set([...existing, ...fields]));
  saveFinancial(db, { ...financial, overriddenFields: JSON.stringify(merged) });
}

/** A single divergence between a user override and the original API value. */
export interface Reconciliation {
  field: string;
  apiValue: number | null;
  currentValue: number | null;
}

/**
 * Compare each overridden field's current value against the API snapshot.
 * Returns one entry per field whose current value differs from the API value.
 * Returns `[]` when there is no API snapshot or no overrides.
 */
export function reconcile(financial: Financial): Reconciliation[] {
  if (!financial.apiValuesJson || !financial.overriddenFields) return [];
  const api = JSON.parse(financial.apiValuesJson) as Record<string, number | null>;
  const overridden = JSON.parse(financial.overriddenFields) as string[];

  const diffs: Reconciliation[] = [];
  for (const field of overridden) {
    const apiValue = api[field] ?? null;
    const currentValue = (financial[field as keyof Financial] as number | null) ?? null;
    if (apiValue !== currentValue) {
      diffs.push({ field, apiValue, currentValue });
    }
  }
  return diffs;
}
