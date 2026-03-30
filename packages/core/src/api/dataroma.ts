import type { SuperInvestorPosition } from '../models/super-investor.js';

const BASE_URL = 'https://www.dataroma.com/m/holdings.php';

export interface ConvergenceSignal {
  ticker: string;
  investors: string[];
  convergenceSignal: boolean;
}

export function createDataromaClient() {
  async function fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DhandoAnalyzer/1.0' },
    });
    if (!response.ok) {
      throw new Error(`Dataroma error: ${response.status}`);
    }
    return response.text();
  }

  function parsePositionsFromHtml(
    html: string,
    investorId: string
  ): Omit<SuperInvestorPosition, 'id'>[] {
    const positions: Omit<SuperInvestorPosition, 'id'>[] = [];
    const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>(.*?)<\/td>[\s\S]*?<td[^>]*>.*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/tr>/gi;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const ticker = match[2]?.trim();
      if (ticker && ticker.length <= 5) {
        positions.push({
          investorName: investorId,
          ticker,
          action: 'hold',
          quarter: `${new Date().getFullYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`,
          shares: 0,
          value: 0,
        });
      }
    }
    return positions;
  }

  return {
    async getPositions(investorId: string): Promise<Omit<SuperInvestorPosition, 'id'>[]> {
      const html = await fetchHtml(`${BASE_URL}?m=${investorId}`);
      return parsePositionsFromHtml(html, investorId);
    },

    findConvergence(
      positions: Omit<SuperInvestorPosition, 'id'>[],
      threshold: number = 3
    ): ConvergenceSignal[] {
      const tickerMap = new Map<string, Set<string>>();
      for (const pos of positions) {
        if (!tickerMap.has(pos.ticker)) tickerMap.set(pos.ticker, new Set());
        tickerMap.get(pos.ticker)!.add(pos.investorName);
      }
      const signals: ConvergenceSignal[] = [];
      for (const [ticker, investors] of tickerMap) {
        if (investors.size >= threshold) {
          signals.push({
            ticker,
            investors: Array.from(investors),
            convergenceSignal: true,
          });
        }
      }
      return signals;
    },
  };
}
