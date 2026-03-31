import type { DataProvider, FundamentalsData, PriceData } from './types.js';

const BASE_URL = 'https://eodhd.com/api';

function validateTicker(ticker: string): string {
  if (!/^[A-Za-z0-9.\-]{1,20}$/.test(ticker)) {
    throw new Error(`Invalid ticker format: ${ticker}`);
  }
  // Return the raw ticker; URL path encoding is handled by URL construction.
  return ticker;
}

export function createEodhdClient(apiKey: string): DataProvider {
  async function fetchJson(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`EODHD API error: ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`EODHD API returned invalid JSON for ${response.status}`);
    }
  }

  return {
    name: 'eodhd',

    async getFundamentals(ticker: string): Promise<FundamentalsData> {
      const safeTicker = validateTicker(ticker);
      const url = new URL(`${BASE_URL}/fundamentals/${safeTicker}`);
      url.searchParams.set('api_token', apiKey);
      url.searchParams.set('fmt', 'json');
      const data = await fetchJson(url.toString());

      const incomeYearly = data?.Financials?.Income_Statement?.yearly ?? {};
      const balanceYearly = data?.Financials?.Balance_Sheet?.yearly ?? {};
      const latestIncomeKey = Object.keys(incomeYearly).sort().reverse()[0];
      const latestBalanceKey = Object.keys(balanceYearly).sort().reverse()[0];
      const income = latestIncomeKey ? incomeYearly[latestIncomeKey] : {};
      const balance = latestBalanceKey ? balanceYearly[latestBalanceKey] : {};

      return {
        revenue: parseFloat(income.totalRevenue) || undefined,
        netIncome: parseFloat(income.netIncome) || undefined,
        ebitda: parseFloat(income.ebitda) || undefined,
        totalAssets: parseFloat(balance.totalAssets) || undefined,
        totalDebt: parseFloat(balance.totalLiab) || undefined,
        cash: parseFloat(balance.cash) || undefined,
      };
    },

    async getPrice(ticker: string): Promise<PriceData> {
      const safeTicker = validateTicker(ticker);
      const url = new URL(`${BASE_URL}/eod/${safeTicker}`);
      url.searchParams.set('api_token', apiKey);
      url.searchParams.set('fmt', 'json');
      url.searchParams.set('order', 'd');
      url.searchParams.set('limit', '1');
      const data = await fetchJson(url.toString());
      const latest = Array.isArray(data) ? data[0] : data;
      return {
        price: latest.close,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        volume: latest.volume,
        date: latest.date,
      };
    },
  };
}
