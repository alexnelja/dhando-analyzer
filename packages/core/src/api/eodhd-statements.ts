/**
 * EODHD fundamentals → {@link Financial} mapper.
 *
 * Pulls the full `fundamentals` payload for a ticker and projects each annual
 * reporting period onto the 22 numeric fields the scoring adapters consume.
 * The mapping (`mapEodhdToFinancial`) is a pure function exported separately so
 * it can be unit-tested without network access.
 *
 * Reference: https://eodhd.com/financial-apis/stock-etfs-fundamental-data-feeds
 */

import type { Financial } from '../models/financial.js';

const BASE_URL = 'https://eodhd.com/api';

/** A statement row keyed by EODHD's string field names. */
type EodhdRow = Record<string, string | number | null | undefined>;

interface EodhdFinancials {
  Income_Statement?: { yearly?: Record<string, EodhdRow> };
  Balance_Sheet?: { yearly?: Record<string, EodhdRow> };
  Cash_Flow?: { yearly?: Record<string, EodhdRow> };
}

/** Parse an EODHD numeric string; absent / non-numeric values become null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Project one annual period (`yearKey`, e.g. `"2025-12-31"`) of an EODHD
 * `Financials` node onto a partial {@link Financial}.
 */
export function mapEodhdToFinancial(
  yearKey: string,
  financials: EodhdFinancials,
): Partial<Financial> {
  const inc = financials.Income_Statement?.yearly?.[yearKey] ?? {};
  const bal = financials.Balance_Sheet?.yearly?.[yearKey] ?? {};
  const cf = financials.Cash_Flow?.yearly?.[yearKey] ?? {};

  return {
    source: 'api',
    period: 'annual',
    year: parseInt(yearKey.slice(0, 4), 10),
    quarter: null,
    apiSource: 'eodhd',

    // Income statement
    revenue: num(inc.totalRevenue),
    netIncome: num(inc.netIncome),
    ebitda: num(inc.ebitda),
    ebit: num(inc.ebit),
    grossProfit: num(inc.grossProfit),
    sga: num(inc.sellingGeneralAdministrative),

    // Balance sheet
    totalAssets: num(bal.totalAssets),
    totalLiabilities: num(bal.totalLiab),
    totalDebt: num(bal.shortLongTermDebtTotal),
    cash: num(bal.cash),
    retainedEarnings: num(bal.retainedEarnings),
    longTermDebt: num(bal.longTermDebt),
    currentAssets: num(bal.totalCurrentAssets),
    currentLiabilities: num(bal.totalCurrentLiabilities),
    sharesOutstanding: num(bal.commonStockSharesOutstanding),
    receivables: num(bal.netReceivables),
    ppe: num(bal.propertyPlantEquipment),
    workingCapital: num(bal.netWorkingCapital),

    // Cash flow
    cashFromOps: num(cf.totalCashFromOperatingActivities),
    capex: num(cf.capitalExpenditures),
    fcf: num(cf.freeCashFlow),
    depreciation: num(cf.depreciation),
  };
}

function validateTicker(ticker: string): string {
  if (!/^[A-Za-z0-9.\-]{1,20}$/.test(ticker)) {
    throw new Error(`Invalid ticker format: ${ticker}`);
  }
  return ticker;
}

/**
 * Fetch the `years` most recent annual statements for a ticker, newest first.
 *
 * - Returns `[]` when EODHD has no fundamentals for the ticker (HTTP 404).
 * - Throws on any other non-OK status (e.g. 429 rate limit, 401 bad key) so
 *   the caller can fall back to manual entry / retry.
 */
export async function pullStatements(
  apiKey: string,
  ticker: string,
  years: number,
): Promise<Partial<Financial>[]> {
  const safeTicker = validateTicker(ticker);
  const url = new URL(`${BASE_URL}/fundamentals/${safeTicker}`);
  url.searchParams.set('api_token', apiKey);
  url.searchParams.set('fmt', 'json');

  const response = await fetch(url.toString());
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`EODHD API error: ${response.status}`);
  }

  const data = (await response.json()) as { Financials?: EodhdFinancials };
  const financials = data.Financials;
  if (!financials) return [];

  const yearKeys = Object.keys(financials.Income_Statement?.yearly ?? {})
    .sort()
    .reverse()
    .slice(0, years);

  return yearKeys.map((key) => mapEodhdToFinancial(key, financials));
}
