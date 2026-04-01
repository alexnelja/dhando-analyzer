const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';

/** A Polymarket event container (e.g. "How many Fed rate cuts in 2026?"). */
export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  markets: PolymarketMarket[];
  volume: number;
  liquidity: number;
  endDate: string;
  active: boolean;
}

/** A single binary market within an event (e.g. "Will no Fed rate cuts happen?"). */
export interface PolymarketMarket {
  /** conditionId — the on-chain identifier, used as the CLOB API market param. */
  id: string;
  question: string;
  /** JSON string encoding [Yes price, No price], e.g. '["0.315","0.685"]'. */
  outcomePrices: string;
  volume: string;
  active: boolean;
  /** JSON string encoding outcome labels, e.g. '["Yes","No"]'. */
  outcomes: string;
}

/** Normalised market-implied probability record for investment analysis. */
export interface MarketProbability {
  question: string;
  /** Probability of the "Yes" outcome, 0–1. Equal to the Yes token price. */
  yesProbability: number;
  /** Probability of the "No" outcome, 0–1. */
  noProbability: number;
  /** Cumulative trading volume in USD. */
  volume: number;
  /** Order-book depth in USD. */
  liquidity: number;
  /** ISO 8601 resolution date. */
  endDate: string;
  source: 'polymarket';
}

/**
 * Create a Polymarket API client that exposes read-only market data.
 * No authentication is required for the endpoints used here.
 */
export function createPolymarketClient() {
  async function fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Polymarket API error: ${response.status}`);
    return response.json();
  }

  return {
    /**
     * Search for prediction markets by keyword.
     * Queries the Gamma /events endpoint and normalises each market into a
     * {@link MarketProbability} record.
     *
     * @param query - Keyword(s) to search for (matched against event title).
     * @param limit - Maximum number of events to return (default 10).
     * @returns Flat list of market probability records across all matching events.
     */
    async searchMarkets(query: string, limit: number = 10): Promise<MarketProbability[]> {
      const data = await fetchJson(
        `${GAMMA_BASE}/events?title_contains=${encodeURIComponent(query)}&active=true&closed=false&limit=${limit}&order=volume&ascending=false`,
      );
      const events: PolymarketEvent[] = Array.isArray(data) ? (data as PolymarketEvent[]) : [];
      const results: MarketProbability[] = [];

      for (const event of events) {
        for (const market of event.markets ?? []) {
          try {
            const prices = JSON.parse(market.outcomePrices || '[]') as string[];
            const yesPrice = parseFloat(prices[0]) || 0;
            results.push({
              question: market.question || event.title,
              yesProbability: yesPrice,
              noProbability: 1 - yesPrice,
              volume: parseFloat(market.volume) || event.volume || 0,
              liquidity: event.liquidity || 0,
              endDate: event.endDate || '',
              source: 'polymarket',
            });
          } catch {
            /* skip malformed market entries */
          }
        }
      }
      return results;
    },

    /**
     * Retrieve all markets for a specific event by its URL slug.
     *
     * @param slug - The event slug, e.g. "how-many-fed-rate-cuts-in-2026".
     * @returns Markets within the event, each as a {@link MarketProbability}.
     */
    async getEvent(slug: string): Promise<MarketProbability[]> {
      const data = await fetchJson(`${GAMMA_BASE}/events?slug=${encodeURIComponent(slug)}`);
      const events: PolymarketEvent[] = Array.isArray(data) ? (data as PolymarketEvent[]) : [];
      if (events.length === 0) return [];

      const event = events[0];
      return (event.markets ?? []).map(market => {
        const prices = JSON.parse(market.outcomePrices || '["0.5","0.5"]') as string[];
        return {
          question: market.question || event.title,
          yesProbability: parseFloat(prices[0]) || 0.5,
          noProbability: parseFloat(prices[1]) || 0.5,
          volume: parseFloat(market.volume) || 0,
          liquidity: event.liquidity || 0,
          endDate: event.endDate || '',
          source: 'polymarket' as const,
        };
      });
    },

    /**
     * Retrieve historical price data for a CLOB market condition.
     * Prices equal probabilities on Polymarket (1 USDC per correct share at settlement).
     *
     * @param conditionId - The market's `conditionId` (hex string from Gamma API).
     * @param interval    - Time bucket: '1h' | '6h' | '1d' | '1w' (default '1d').
     * @returns Ordered array of { timestamp (Unix seconds), price (0–1) }.
     */
    async getPriceHistory(
      conditionId: string,
      interval: string = '1d',
    ): Promise<{ timestamp: number; price: number }[]> {
      const data = (await fetchJson(
        `${CLOB_BASE}/prices-history?market=${conditionId}&interval=${interval}&fidelity=60`,
      )) as { history?: { t?: number; p?: string | number }[] };

      return (data.history ?? []).map(h => ({
        timestamp: h.t ?? 0,
        price: parseFloat(String(h.p)) || 0,
      }));
    },

    /**
     * Fetch investment-relevant macro market probabilities.
     * Queries a set of economic keywords and returns deduplicated results.
     * Useful as a signal layer for macro-regime detection.
     *
     * @returns Deduplicated list of macro-relevant market probability records.
     */
    async getMacroProbabilities(): Promise<MarketProbability[]> {
      const queries = ['recession', 'federal reserve', 'interest rate', 'inflation', 'tariff'];
      const allResults: MarketProbability[] = [];

      for (const q of queries) {
        try {
          const results = await this.searchMarkets(q, 5);
          allResults.push(...results);
        } catch {
          /* skip failed individual queries so others still run */
        }
      }

      // Deduplicate by exact question text
      const seen = new Set<string>();
      return allResults.filter(r => {
        if (seen.has(r.question)) return false;
        seen.add(r.question);
        return true;
      });
    },
  };
}
