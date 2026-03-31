const FINNHUB_BASE = 'https://finnhub.io/api/v1';

export interface InsiderTransaction {
  name: string;
  share: number;
  change: number;
  transactionDate: string;
  transactionCode: string; // P=purchase, S=sale
  transactionPrice: number;
}

export interface AnalystRecommendation {
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
}

export function createFinnhubClient(apiKey: string) {
  async function fetchJson(path: string) {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${FINNHUB_BASE}${path}${separator}token=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Finnhub API error: ${response.status}`);
    return response.json();
  }

  return {
    async getInsiderTransactions(symbol: string): Promise<InsiderTransaction[]> {
      const data = await fetchJson(`/stock/insider-transactions?symbol=${symbol}`);
      return (data.data ?? []).map((t: Record<string, unknown>) => ({
        name: (t.name as string) ?? '',
        share: (t.share as number) ?? 0,
        change: (t.change as number) ?? 0,
        transactionDate: (t.transactionDate as string) ?? '',
        transactionCode: (t.transactionCode as string) ?? '',
        transactionPrice: (t.transactionPrice as number) ?? 0,
      }));
    },

    async getRecommendations(symbol: string): Promise<AnalystRecommendation[]> {
      const data = await fetchJson(`/stock/recommendation?symbol=${symbol}`);
      return Array.isArray(data) ? data : [];
    },

    async getBasicFinancials(symbol: string): Promise<Record<string, unknown>> {
      const data = await fetchJson(`/stock/metric?symbol=${symbol}&metric=all`);
      return (data.metric as Record<string, unknown>) ?? {};
    },

    async getEarningsCalendar(from: string, to: string): Promise<unknown[]> {
      const data = await fetchJson(`/calendar/earnings?from=${from}&to=${to}`);
      return (data.earningsCalendar as unknown[]) ?? [];
    },
  };
}
