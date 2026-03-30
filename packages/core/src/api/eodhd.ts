import type { DataProvider, FundamentalsData, PriceData } from './types.js';

const BASE_URL = 'https://eodhd.com/api';

export function createEodhdClient(apiKey: string): DataProvider {
  async function fetchJson(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`EODHD API error: ${response.status}`);
    }
    return response.json();
  }

  return {
    name: 'eodhd',

    async getFundamentals(ticker: string): Promise<FundamentalsData> {
      const data = await fetchJson(
        `${BASE_URL}/fundamentals/${ticker}?api_token=${apiKey}&fmt=json`
      );

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
      const data = await fetchJson(
        `${BASE_URL}/eod/${ticker}?api_token=${apiKey}&fmt=json&order=d&limit=1`
      );
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
