import type { DataProvider, FundamentalsData, PriceData } from './types.js';

const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

export function createYahooClient(): DataProvider {
  async function fetchJson(url: string) {
    const response = await fetch(url, { headers: { 'User-Agent': 'DhandoAnalyzer/1.0' } });
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }
    return response.json();
  }

  return {
    name: 'yahoo',

    async getFundamentals(_ticker: string): Promise<FundamentalsData> {
      return {}; // Yahoo free tier has limited fundamentals — price fallback only
    },

    async getPrice(ticker: string): Promise<PriceData> {
      const data = await fetchJson(`${BASE_URL}/${ticker}?interval=1d&range=1d`);
      const result = data?.chart?.result?.[0];
      if (!result) throw new Error(`No data for ${ticker}`);

      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];
      const timestamp = result.timestamp?.[0];
      const date = timestamp
        ? new Date(timestamp * 1000).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      return {
        price: meta.regularMarketPrice ?? quote?.close?.[0],
        open: quote?.open?.[0],
        high: quote?.high?.[0],
        low: quote?.low?.[0],
        volume: quote?.volume?.[0],
        date,
      };
    },
  };
}
