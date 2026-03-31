/**
 * Typed IPC client helpers for the renderer process.
 * All calls go through window.dhando (exposed via contextBridge in preload).
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

// ── Watchlist ──────────────────────────────────────────────────────────────

export async function listWatchlist(status?: InvestmentStatus): Promise<InvestmentRow[]> {
  return window.dhando.watchlist.list(status) as Promise<InvestmentRow[]>;
}

export async function addWatchlistEntry(data: WatchlistEntry): Promise<string> {
  return window.dhando.watchlist.add(data) as Promise<string>;
}

export async function advanceEntry(id: string): Promise<void> {
  await window.dhando.watchlist.advance(id);
}

export async function removeEntry(id: string): Promise<void> {
  await window.dhando.watchlist.remove(id);
}

// ── Portfolio ──────────────────────────────────────────────────────────────

export async function listPositions(): Promise<PortfolioPositionRow[]> {
  return window.dhando.portfolio.list() as Promise<PortfolioPositionRow[]>;
}

// ── Rules ──────────────────────────────────────────────────────────────────

export async function listRules(): Promise<Rule[]> {
  return window.dhando.rules.list() as Promise<Rule[]>;
}

export async function loadRulesFromDir(dir: string): Promise<{ loaded: number; ids: string[] }> {
  return window.dhando.rules.load(dir) as Promise<{ loaded: number; ids: string[] }>;
}
