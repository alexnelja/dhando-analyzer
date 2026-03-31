/**
 * Typed IPC client helpers for the renderer process.
 * Works in both Electron (via window.dhando) and browser (via direct API calls).
 */

export type InvestmentType =
  | 'listed_stock'
  | 'private_equity'
  | 'property'
  | 'franchise'
  | 'em_stock';

export type InvestmentStatus =
  | 'screening'
  | 'researching'
  | 'deep_dive'
  | 'ready_to_buy'
  | 'held'
  | 'exited'
  | 'rejected';

export interface WatchlistEntry {
  id?: string;
  type: InvestmentType;
  name: string;
  ticker?: string | null;
  exchange?: string | null;
  sector?: string | null;
  industry?: string | null;
}

export interface InvestmentRow {
  id: string;
  type: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  status: InvestmentStatus;
  pe_deal_stage: string | null;
  data_source: string;
  intrinsic_value: number | null;
  intrinsic_value_calculated_at: string | null;
  moat_score: number | null;
  management_score: number | null;
  circle_of_competence_fit: number | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface PortfolioPositionRow {
  id: string;
  investmentId: string;
  costBasis: number;
  shares: number;
  enteredAt: string;
  exitedAt: string | null;
  exitPrice: number | null;
}

export interface Rule {
  id: string;
  name: string;
  version: number;
  category: string;
  type: string;
  sourceType: string;
  sourceDetail: string;
  description: string;
  conditions: unknown;
  weight: number;
  active: boolean;
  activeFrom: string;
  activeTo: string | null;
  createdAt: string;
  timesFired: number;
  timesCorrect: number;
  believabilityScore: number;
}

export interface StockSearchResult {
  Code: string;
  Exchange: string;
  Name: string;
  Type: string;
  Country: string;
  Currency: string;
  ISIN: string;
  previousClose?: number;
  sector?: string;
  industry?: string;
}

// ── Detect environment ───────────────────────────────────────────────────────
const isElectron = typeof window !== 'undefined' && !!(window as any).dhando;

// ── In-memory store for browser mode ─────────────────────────────────────────
let browserWatchlist: InvestmentRow[] = [];
let browserIdCounter = 1;

function generateId(): string {
  return `inv-${Date.now()}-${browserIdCounter++}`;
}

// ── Watchlist ────────────────────────────────────────────────────────────────

export async function listWatchlist(status?: InvestmentStatus): Promise<InvestmentRow[]> {
  if (isElectron) {
    return window.dhando.watchlist.list(status) as Promise<InvestmentRow[]>;
  }
  // Browser fallback: in-memory
  if (status) {
    return browserWatchlist.filter((r) => r.status === status);
  }
  return [...browserWatchlist];
}

export async function addWatchlistEntry(data: WatchlistEntry): Promise<string> {
  if (isElectron) {
    return window.dhando.watchlist.add(data) as Promise<string>;
  }
  // Browser fallback
  const id = data.id || generateId();
  const now = new Date().toISOString();
  const row: InvestmentRow = {
    id,
    type: data.type,
    name: data.name,
    ticker: data.ticker ?? null,
    exchange: data.exchange ?? null,
    sector: data.sector ?? null,
    industry: data.industry ?? null,
    status: 'screening',
    pe_deal_stage: null,
    data_source: 'manual',
    intrinsic_value: null,
    intrinsic_value_calculated_at: null,
    moat_score: null,
    management_score: null,
    circle_of_competence_fit: null,
    user_id: 'solo-investor',
    created_at: now,
    updated_at: now,
  };
  browserWatchlist.push(row);
  return id;
}

export async function advanceEntry(id: string): Promise<void> {
  if (isElectron) {
    await window.dhando.watchlist.advance(id);
    return;
  }
  const statusOrder: InvestmentStatus[] = ['screening', 'researching', 'deep_dive', 'ready_to_buy', 'held'];
  const row = browserWatchlist.find((r) => r.id === id);
  if (row) {
    const idx = statusOrder.indexOf(row.status);
    if (idx >= 0 && idx < statusOrder.length - 1) {
      row.status = statusOrder[idx + 1];
      row.updated_at = new Date().toISOString();
    }
  }
}

export async function removeEntry(id: string): Promise<void> {
  if (isElectron) {
    await window.dhando.watchlist.remove(id);
    return;
  }
  const row = browserWatchlist.find((r) => r.id === id);
  if (row) {
    row.status = 'rejected';
    row.updated_at = new Date().toISOString();
  }
}

// ── Portfolio ────────────────────────────────────────────────────────────────

export async function listPositions(): Promise<PortfolioPositionRow[]> {
  if (isElectron) {
    return window.dhando.portfolio.list() as Promise<PortfolioPositionRow[]>;
  }
  return [];
}

// ── Rules ────────────────────────────────────────────────────────────────────

export async function listRules(): Promise<Rule[]> {
  if (isElectron) {
    return window.dhando.rules.list() as Promise<Rule[]>;
  }
  return [];
}

export async function loadRulesFromDir(dir: string): Promise<{ loaded: number; ids: string[] }> {
  if (isElectron) {
    return window.dhando.rules.load(dir) as Promise<{ loaded: number; ids: string[] }>;
  }
  return { loaded: 0, ids: [] };
}

// ── Stock Search (EODHD) ─────────────────────────────────────────────────────

const EODHD_API_KEY = '69ca80bde491c3.16456760';

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query || query.length < 2) return [];
  try {
    const url = `https://eodhd.com/api/search/${encodeURIComponent(query)}?api_token=${EODHD_API_KEY}&fmt=json&limit=10`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getStockProfile(ticker: string, exchange: string): Promise<{ sector: string; industry: string; price: number } | null> {
  try {
    const url = `https://eodhd.com/api/fundamentals/${ticker}.${exchange}?api_token=${EODHD_API_KEY}&fmt=json&filter=General`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      sector: data?.Sector ?? data?.GicSector ?? '',
      industry: data?.Industry ?? data?.GicGroup ?? '',
      price: data?.SharesStats?.SharesOutstanding ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getStockPrice(ticker: string, exchange: string): Promise<number | null> {
  try {
    const url = `https://eodhd.com/api/real-time/${ticker}.${exchange}?api_token=${EODHD_API_KEY}&fmt=json`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.close ?? data?.previousClose ?? null;
  } catch {
    return null;
  }
}
