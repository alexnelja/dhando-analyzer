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
  notes?: string | null;
}

export interface InvestmentRow {
  id: string;
  type: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  notes: string | null;
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
  isPrimary?: boolean;
  previousClose?: number;
  sector?: string;
  industry?: string;
}

// ── Detect environment ───────────────────────────────────────────────────────
const isElectron = typeof window !== 'undefined' && !!(window as any).dhando;

// ── localStorage helpers ──────────────────────────────────────────────────────
function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key: string, data: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}

// ── Central Financial Data Store ──────────────────────────────────────────────
// The canonical Financial type is owned by @dhando/core and persisted in SQLite
// via the dhando:financials:* IPC channels. (No browser-mode fallback — the
// store is Electron-only.)
export type { Financial } from '@dhando/core';

// ── In-memory store for browser mode (persisted to localStorage) ──────────────
let browserWatchlist: InvestmentRow[] = loadFromStorage('dhando_watchlist', []);
let browserRules: (Rule & { id: string })[] = loadFromStorage('dhando_rules', []);
let browserPositions: PortfolioPositionRow[] = loadFromStorage('dhando_positions', []);
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
    notes: data.notes ?? null,
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
  saveToStorage('dhando_watchlist', browserWatchlist);
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
  saveToStorage('dhando_watchlist', browserWatchlist);
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
  saveToStorage('dhando_watchlist', browserWatchlist);
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

/** Shape expected by the core createRule / RuleDocument (snake_case field names). */
export interface RuleDocumentInput {
  name: string;
  category: string;
  type: string;
  source_type: string;
  source_detail: string;
  description: string;
  weight?: number;
  conditions: {
    metric: string;
    operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between';
    value: number | [number, number];
    weight: number;
  }[];
}

export async function createRuleEntry(rule: RuleDocumentInput): Promise<string> {
  if (isElectron) {
    return window.dhando.rules.create(rule) as Promise<string>;
  }
  // Browser fallback — map snake_case fields back to Rule camelCase for in-memory store
  const id = generateId();
  const now = new Date().toISOString();
  browserRules.push({
    id,
    name: rule.name,
    category: rule.category,
    type: rule.type,
    sourceType: rule.source_type,
    sourceDetail: rule.source_detail,
    description: rule.description,
    conditions: rule.conditions,
    weight: rule.weight ?? 1.0,
    version: 1,
    active: true,
    activeFrom: now as unknown as string,
    activeTo: null,
    createdAt: now as unknown as string,
    timesFired: 0,
    timesCorrect: 0,
    believabilityScore: 0.5,
  } as unknown as Rule & { id: string });
  saveToStorage('dhando_rules', browserRules);
  return id;
}

export async function addPosition(investmentId: string, costBasis: number, shares: number): Promise<string> {
  if (isElectron) {
    return window.dhando.portfolio.upsert({ investmentId, costBasis, shares }) as Promise<string>;
  }
  // Browser fallback
  browserPositions.push({
    id: generateId(),
    investmentId,
    costBasis,
    shares,
    enteredAt: new Date().toISOString(),
    exitedAt: null,
    exitPrice: null,
  });
  saveToStorage('dhando_positions', browserPositions);
  return 'ok';
}

export interface DCFResult {
  intrinsicValue: number;
  explicitPV: number;
  terminalPV: number;
  marginOfSafety: number;
  flows: { year: number; cf: number; pv: number }[];
}

export function calculateIntrinsicValue(
  ownerEarnings: number,
  growthRate: number,
  terminalGrowth: number,
  discountRate: number,
  years: number,
  currentPrice: number,
): DCFResult {
  if (discountRate <= terminalGrowth) {
    throw new Error('Discount rate must be greater than terminal growth rate');
  }
  if (ownerEarnings <= 0) {
    throw new Error('Owner earnings must be positive');
  }
  let explicitPV = 0;
  const flows: { year: number; cf: number; pv: number }[] = [];
  for (let y = 1; y <= years; y++) {
    const cf = ownerEarnings * Math.pow(1 + growthRate, y);
    const pv = cf / Math.pow(1 + discountRate, y);
    explicitPV += pv;
    flows.push({ year: y, cf, pv });
  }
  const finalCF = ownerEarnings * Math.pow(1 + growthRate, years) * (1 + terminalGrowth);
  const terminalValue = finalCF / (discountRate - terminalGrowth);
  const terminalPV = terminalValue / Math.pow(1 + discountRate, years);
  const intrinsicValue = explicitPV + terminalPV;
  const marginOfSafety = currentPrice > 0 ? (intrinsicValue - currentPrice) / intrinsicValue : 0;

  return { intrinsicValue, explicitPV, terminalPV, marginOfSafety, flows };
}

// ── Distress Radar (browser fallback) ────────────────────────────────────────

export interface DistressRadarInput {
  investmentId: string;
  altmanZ: number;
  piotroskiFCurrent: number;
  piotroskiFPrior: number;
  beneishM: number;
  fcfCurrent: number;
  fcfPrior: number;
  debtToEbitda: number;
  workingCapitalCurrent: number;
  workingCapitalPrior: number;
  distressFactors: {
    cause: number; industry: number; balanceSheet: number;
    management: number; competition: number; revenueBase: number; assetValue: number;
  };
}

export interface DistressRadarResult {
  compositeDistressScore: number;
  classification: 'temporary' | 'uncertain' | 'permanent';
  permanenceScore: number;
  isTurnaroundCandidate: boolean;
}

export async function runDistressCheck(input: DistressRadarInput): Promise<DistressRadarResult> {
  if (isElectron) {
    return window.dhando.distress.check(input) as Promise<DistressRadarResult>;
  }
  // Browser fallback — compute locally
  const f = input.distressFactors;
  const permanenceScore = f.cause * 0.20 + f.industry * 0.15 + f.balanceSheet * 0.20 +
    f.management * 0.15 + f.competition * 0.10 + f.revenueBase * 0.10 + f.assetValue * 0.10;
  const classification = permanenceScore < 3.5 ? 'temporary' : permanenceScore > 6.5 ? 'permanent' : 'uncertain';

  // Simple composite distress score
  const zDistress = Math.max(0, Math.min(100, (3 - input.altmanZ) / 3 * 100));
  const fTrend = input.piotroskiFCurrent < input.piotroskiFPrior ? 70 : 30;
  const mDistress = input.beneishM > -1.78 ? 80 : 20;
  const fcfDistress = input.fcfCurrent < 0 ? 80 : input.fcfCurrent < input.fcfPrior ? 60 : 20;
  const levDistress = Math.min(100, input.debtToEbitda / 6 * 100);
  const wcDistress = input.workingCapitalCurrent < input.workingCapitalPrior ? 70 : 30;

  const compositeDistressScore = zDistress * 0.30 + fTrend * 0.20 + mDistress * 0.15 +
    fcfDistress * 0.15 + levDistress * 0.10 + wcDistress * 0.10;

  const isTurnaroundCandidate = classification === 'temporary' &&
    input.piotroskiFCurrent > input.piotroskiFPrior && compositeDistressScore > 60;

  return { compositeDistressScore, classification, permanenceScore, isTurnaroundCandidate };
}

// ── Private Markets (browser fallback) ───────────────────────────────────────

export interface PrivateMarketsInput {
  investmentId: string;
  dhandhoFit: Record<string, number>;
  emRisk?: { politicalInstability: number; currencyRisk: number; regulatoryRisk: number; exitLiquidity: number };
  netIncome: number;
  depreciation: number;
  capex: number;
}

export interface PrivateMarketsResult {
  dhandhoFit: {
    totalScore: number;
    maxScore: number;
    passesGate: boolean;
    breakdown: Array<{ principle: string; score: number; weight: number; weightedScore: number }>;
  };
  emRisk: { overallRisk: number; riskLevel: string } | null;
  ownerEarnings: number;
}

export async function analyzePrivateMarket(input: PrivateMarketsInput): Promise<PrivateMarketsResult> {
  if (isElectron) {
    return window.dhando.privateMarkets.analyze(input) as Promise<PrivateMarketsResult>;
  }
  // Browser fallback — compute locally
  const d = input.dhandhoFit;
  const principles = [
    { principle: 'Existing business', score: d.existingBusiness ?? 5, weight: 1.0 },
    { principle: 'Simple business', score: d.simpleBusiness ?? 5, weight: 1.0 },
    { principle: 'Distressed business', score: d.distressedBusiness ?? 5, weight: 1.0 },
    { principle: 'Durable advantage', score: d.durableAdvantage ?? 5, weight: 1.5 },
    { principle: 'Bet heavily', score: d.betHeavily ?? 5, weight: 1.0 },
    { principle: 'Arbitrage', score: d.arbitrageOpportunity ?? 5, weight: 1.0 },
    { principle: 'Margin of safety', score: d.marginOfSafety ?? 5, weight: 1.5 },
    { principle: 'Low risk, high uncertainty', score: d.lowRiskHighUncertainty ?? 5, weight: 1.5 },
    { principle: 'Copycat', score: d.copycatNotInnovator ?? 5, weight: 1.0 },
  ];
  const breakdown = principles.map((p) => ({ ...p, weightedScore: p.score * p.weight }));
  const totalScore = breakdown.reduce((s, b) => s + b.weightedScore, 0);
  const maxScore = 105;
  const passesGate = totalScore >= 54;

  let emRisk = null;
  if (input.emRisk) {
    const e = input.emRisk;
    const avg = (e.politicalInstability + e.currencyRisk + e.regulatoryRisk + e.exitLiquidity) / 4;
    emRisk = { overallRisk: avg, riskLevel: avg < 3.5 ? 'low' : avg > 6.5 ? 'high' : 'medium' };
  }

  return {
    dhandhoFit: { totalScore, maxScore, passesGate, breakdown },
    emRisk,
    ownerEarnings: input.netIncome + input.depreciation - input.capex,
  };
}

// ── Update investment status ────────────────────────────────────────────────

export async function setInvestmentStatus(id: string, status: InvestmentStatus): Promise<void> {
  if (isElectron) {
    await window.dhando.watchlist.update(id, { status });
    return;
  }
  const inv = browserWatchlist.find((r) => r.id === id);
  if (inv) {
    inv.status = status;
    inv.updated_at = new Date().toISOString();
  }
  saveToStorage('dhando_watchlist', browserWatchlist);
}

// ── Stock Search (EODHD) — uses Vite proxy in dev, direct in Electron ───────

const EODHD_API_KEY = (import.meta as any).env?.VITE_EODHD_API_KEY as string || '';

function eodhUrl(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  // In browser dev mode, use Vite proxy to avoid CORS
  if (!isElectron) {
    return `/api/eodhd${path}${sep}api_token=${EODHD_API_KEY}`;
  }
  return `https://eodhd.com/api${path}${sep}api_token=${EODHD_API_KEY}`;
}

// JSE exchange codes used by EODHD
const JSE_EXCHANGES = ['JSE', 'JO', 'XJSE'];
// Exchanges to prioritize (SA first, then major global)
const EXCHANGE_PRIORITY: Record<string, number> = {
  'JSE': 0, 'JO': 0, 'XJSE': 0,        // SA — highest priority
  'LSE': 1, 'LON': 1,                     // London
  'US': 2, 'NYSE': 2, 'NASDAQ': 2,        // US
  'F': 3, 'XETRA': 3,                     // Germany
  'AS': 4, 'PA': 4, 'MI': 4,              // Europe
};

function isJseExchange(exchange: string): boolean {
  return JSE_EXCHANGES.includes(exchange.toUpperCase());
}

/**
 * JSE prices from EODHD are in ZAC (cents). Convert to ZAR by dividing by 100.
 * Non-JSE prices are already in their local currency.
 */
export function convertJsePrice(price: number, exchange: string): number {
  if (isJseExchange(exchange)) {
    return price / 100; // ZAC → ZAR
  }
  return price;
}

// ── JSE local stock cache ──────────────────────────────────────────────────
let jseStockCache: StockSearchResult[] | null = null;
let jseLoadingPromise: Promise<void> | null = null;

async function loadJseStocks(): Promise<StockSearchResult[]> {
  if (jseStockCache) return jseStockCache;
  if (jseLoadingPromise) { await jseLoadingPromise; return jseStockCache ?? []; }

  jseLoadingPromise = (async () => {
    try {
      // Check localStorage cache first (valid for 24h)
      const cached = localStorage.getItem('dhando_jse_stocks');
      const cachedAt = localStorage.getItem('dhando_jse_stocks_at');
      if (cached && cachedAt && Date.now() - parseInt(cachedAt) < 24 * 60 * 60 * 1000) {
        jseStockCache = JSON.parse(cached);
        return;
      }

      const url = eodhUrl(`/exchange-symbol-list/JSE?fmt=json`);
      const response = await fetch(url);
      if (!response.ok) { jseStockCache = []; return; }
      const data = await response.json();
      if (!Array.isArray(data)) { jseStockCache = []; return; }

      jseStockCache = data
        .filter((s: any) => s.Type === 'Common Stock' || s.Type === 'ETF')
        .map((s: any) => ({
          Code: s.Code,
          Exchange: 'JSE',
          Name: s.Name ?? '',
          Type: s.Type ?? 'Common Stock',
          Country: s.Country ?? 'South Africa',
          Currency: s.Currency ?? 'ZAC',
          ISIN: s.Isin ?? '',
          isPrimary: true,
          previousClose: s.previousClose,
        }));

      // Cache to localStorage
      localStorage.setItem('dhando_jse_stocks', JSON.stringify(jseStockCache));
      localStorage.setItem('dhando_jse_stocks_at', String(Date.now()));
    } catch (err) {
      console.error('[loadJseStocks]', err);
      jseStockCache = [];
    }
  })();

  await jseLoadingPromise;
  return jseStockCache ?? [];
}

function searchJseLocal(query: string, stocks: StockSearchResult[]): StockSearchResult[] {
  const q = query.toLowerCase();
  return stocks.filter(s =>
    s.Name.toLowerCase().includes(q) ||
    s.Code.toLowerCase().includes(q)
  ).slice(0, 10);
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query || query.length < 2) return [];

  // Search JSE locally AND EODHD global in parallel
  const [jseStocks, globalResults] = await Promise.all([
    loadJseStocks().then(stocks => searchJseLocal(query, stocks)),
    (async () => {
      try {
        const url = eodhUrl(`/search/${encodeURIComponent(query)}?fmt=json&limit=15`);
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data as StockSearchResult[] : [];
      } catch (err) {
        console.error('[searchStocks global]', err);
        return [];
      }
    })(),
  ]);

  // Combine: JSE first, then global (dedup by Code+Exchange)
  const seen = new Set<string>();
  const combined: StockSearchResult[] = [];

  for (const s of jseStocks) {
    const key = `${s.Code}:${s.Exchange}`;
    if (!seen.has(key)) { seen.add(key); combined.push(s); }
  }
  for (const s of globalResults) {
    const key = `${s.Code}:${s.Exchange}`;
    if (!seen.has(key)) { seen.add(key); combined.push(s); }
  }

  // Sort: JSE first, then by exchange priority
  combined.sort((a, b) => {
    const aPriority = EXCHANGE_PRIORITY[a.Exchange] ?? 10;
    const bPriority = EXCHANGE_PRIORITY[b.Exchange] ?? 10;
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });

  return combined.slice(0, 12);
}

export async function getStockProfile(ticker: string, exchange: string): Promise<{ sector: string; industry: string; price: number } | null> {
  try {
    const url = eodhUrl(`/fundamentals/${ticker}.${exchange}?fmt=json&filter=General`);
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

export async function getJseLivePrice(ticker: string): Promise<number | null> {
  try {
    // Yahoo uses .JO suffix for JSE stocks
    const yahooTicker = `${ticker}.JO`;
    const url = isElectron
      ? `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1d`
      : `/api/yahoo/${yahooTicker}?interval=1d&range=1d`; // proxy in dev

    const response = await fetch(url, {
      headers: { 'User-Agent': 'DhandoAnalyzer/1.0' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (!price) return null;
    // Yahoo returns ZAc (cents) for JSE — convert to ZAR
    return price / 100;
  } catch {
    return null;
  }
}

async function getEodPrice(ticker: string, exchange: string): Promise<number | null> {
  try {
    const url = eodhUrl(`/eod/${ticker}.${exchange}?fmt=json&order=d&limit=1`);
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const latest = Array.isArray(data) ? data[0] : null;
    if (!latest) return null;
    return convertJsePrice(latest.close ?? latest.adjusted_close, exchange);
  } catch {
    return null;
  }
}

export async function getStockPrice(ticker: string, exchange: string): Promise<number | null> {
  // For JSE stocks, use Yahoo Finance (EODHD real-time returns "NA")
  if (['JSE', 'JO', 'XJSE'].includes(exchange)) {
    const yahooPrice = await getJseLivePrice(ticker);
    if (yahooPrice !== null) return yahooPrice;
    // Fallback to EODHD EOD
  }

  try {
    const url = eodhUrl(`/real-time/${ticker}.${exchange}?fmt=json`);
    const response = await fetch(url);
    if (!response.ok) {
      // Try EOD as fallback
      return getEodPrice(ticker, exchange);
    }
    const data = await response.json();
    const rawPrice = data?.close ?? data?.previousClose ?? null;
    if (rawPrice === null || rawPrice === 'NA') {
      return getEodPrice(ticker, exchange);
    }
    return convertJsePrice(rawPrice, exchange);
  } catch {
    return getEodPrice(ticker, exchange);
  }
}

export async function fetchFundamentalsForMagicFormula(
  ticker: string,
  exchange: string,
): Promise<{
  ebit: number;
  enterpriseValue: number;
  netWorkingCapital: number;
  netFixedAssets: number;
  marketCap: number;
  revenue: number;
} | null> {
  try {
    const url = eodhUrl(`/fundamentals/${ticker}.${exchange}?fmt=json`);
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();

    const highlights = data?.Highlights ?? {};
    const balance = data?.Financials?.Balance_Sheet?.yearly ?? {};
    const income = data?.Financials?.Income_Statement?.yearly ?? {};

    // Get latest year
    const latestBalKey = Object.keys(balance).sort().reverse()[0];
    const latestIncKey = Object.keys(income).sort().reverse()[0];
    const bal = latestBalKey ? balance[latestBalKey] : {};
    const inc = latestIncKey ? income[latestIncKey] : {};

    const marketCap = parseFloat(highlights.MarketCapitalization) || 0;
    const totalDebt = parseFloat(bal.totalLiab ?? bal.longTermDebt ?? '0') || 0;
    const cash = parseFloat(bal.cash ?? bal.cashAndShortTermInvestments ?? '0') || 0;
    const totalAssets = parseFloat(bal.totalAssets ?? '0') || 0;
    const ebitda = parseFloat(inc.ebitda ?? '0') || 0;
    const revenue = parseFloat(inc.totalRevenue ?? '0') || 0;

    // For JSE stocks, values might be in ZAC — convert
    const isJse = ['JSE', 'JO', 'XJSE'].includes(exchange);
    const divisor = isJse ? 100 : 1;

    const enterpriseValue = (marketCap + totalDebt - cash) / divisor;
    const netWorkingCapital = (totalAssets * 0.4 - totalDebt * 0.3) / divisor;
    const netFixedAssets = (totalAssets * 0.6) / divisor;

    return {
      ebit: ebitda / divisor, // EBITDA as EBIT proxy
      enterpriseValue,
      netWorkingCapital: Math.max(netWorkingCapital, 1), // prevent negative/zero
      netFixedAssets: Math.max(netFixedAssets, 1),
      marketCap: marketCap / divisor,
      revenue: revenue / divisor,
    };
  } catch (err) {
    console.error('[fetchFundamentals]', err);
    return null;
  }
}

// ── Investment Updates ────────────────────────────────────────────────────────

export async function updateInvestment(id: string, updates: Partial<InvestmentRow>): Promise<void> {
  if (isElectron) {
    await (window as any).dhando.watchlist.update(id, updates);
    return;
  }
  // Browser fallback
  const inv = browserWatchlist.find((r) => r.id === id);
  if (inv) {
    Object.assign(inv, updates, { updated_at: new Date().toISOString() });
    saveToStorage('dhando_watchlist', browserWatchlist);
  }
}

// ── Deal Analyzer (browser fallback) ─────────────────────────────────────────

export async function runDealAnalysis(input: any): Promise<any> {
  if (isElectron) {
    return window.dhando.analyze(input);
  }
  // Browser fallback — return a structured result from the input data
  const ownerEarnings = (input.screenerResult?.valuation?.ownerEarnings ?? input.baseRevenue * 0.12);
  const scenarios = input.scenarioInputs?.map((s: any) => ({
    name: s.name,
    terminalValue: input.baseRevenue * Math.pow(1 + s.revenueGrowthRate, input.projectionYears) * s.ebitdaMargin * s.exitMultiple,
    presentValue: input.baseRevenue * Math.pow(1 + s.revenueGrowthRate, input.projectionYears) * s.ebitdaMargin * s.exitMultiple / Math.pow(1 + (input.dcfInput?.discountRate ?? 0.1), input.projectionYears),
    probability: s.probability,
  })) ?? [];
  const weightedValue = scenarios.reduce((sum: number, s: any) => sum + s.presentValue * s.probability, 0);
  const intrinsicValue = ownerEarnings * 10;
  const marginOfSafety = input.currentPrice > 0 ? (intrinsicValue / input.sharesOutstanding - input.currentPrice) / (intrinsicValue / input.sharesOutstanding) : 0.3;
  return {
    scenarioModel: { scenarios, weightedValue },
    dcf: { intrinsicValue, terminalValue: ownerEarnings * 8, presentValue: intrinsicValue },
    kelly: { kellyFraction: 0.05, halfKelly: 0.025 },
    kellyPosition: 0.05,
    expectedValue: weightedValue,
    intrinsicValue,
    marginOfSafety,
    blocked: false,
    memo: {
      thesis: `Analysis of ${input.name ?? 'investment'} based on provided scenarios.`,
      risks: ['Market conditions', 'Execution risk'],
      catalysts: ['Improved earnings', 'Sector re-rating'],
    },
    preMortem: {
      risks: [
        { factor: 'Valuation', severity: 'medium', description: 'Are assumptions realistic?' },
      ],
    },
  };
}

// ── Central Financial Data Store (CRUD over IPC) ─────────────────────────────

import type { Financial } from '@dhando/core';

/**
 * The financials store is Electron-only; in browser mode these are no-ops.
 * Resolved dynamically (not via the cached `isElectron`) so the bridge is
 * picked up whenever `window.dhando` becomes available.
 */
function financialsApi() {
  if (typeof window === 'undefined') return null;
  return (window as any).dhando?.financials ?? null;
}

/** Persist a single (possibly user-edited) financial row. */
export async function saveFinancials(financial: Financial): Promise<void> {
  await financialsApi()?.save(financial);
}

/** Fetch all stored financial rows for an investment (newest period first). */
export async function getFinancials(investmentId: string): Promise<Financial[]> {
  return (await financialsApi()?.get(investmentId)) ?? [];
}

/** Pull fundamentals from EODHD into the store for a ticker. */
export async function pullFinancials(
  investmentId: string,
  ticker: string,
  years = 2,
): Promise<{ saved: number }> {
  return (await financialsApi()?.pull(investmentId, ticker, years)) ?? { saved: 0 };
}

/** Extract financials from pasted text via Claude and persist them. */
export async function extractFinancialsFromText(
  investmentId: string,
  text: string,
): Promise<Financial[]> {
  return (await financialsApi()?.extractFromText(investmentId, text)) ?? [];
}

/** Subscribe to financials-changed broadcasts; returns an unsubscribe fn. */
export function onFinancialsChanged(cb: (investmentId: string) => void): () => void {
  return financialsApi()?.onChanged(cb) ?? (() => {});
}

// ── Magic Formula ─────────────────────────────────────────────────────────────

export interface MagicFormulaEntry {
  investmentId: string;
  name: string;
  ticker: string | null;
  earningsYield: number;
  returnOnCapital: number;
  eyRank: number;
  rocRank: number;
  combinedRank: number;
}

export function calculateMagicFormula(
  investments: {
    id: string;
    name: string;
    ticker: string | null;
    ebit: number;
    enterpriseValue: number;
    netWorkingCapital: number;
    netFixedAssets: number;
  }[],
): MagicFormulaEntry[] {
  // Filter out invalid entries
  const valid = investments.filter(
    (i) => i.enterpriseValue > 0 && i.netWorkingCapital + i.netFixedAssets > 0,
  );

  // Calculate ratios
  const entries: MagicFormulaEntry[] = valid.map((i) => ({
    investmentId: i.id,
    name: i.name,
    ticker: i.ticker,
    earningsYield: i.ebit / i.enterpriseValue,
    returnOnCapital: i.ebit / (i.netWorkingCapital + i.netFixedAssets),
    eyRank: 0,
    rocRank: 0,
    combinedRank: 0,
  }));

  // Rank by earnings yield (descending — highest yield gets rank 1)
  const byEY = [...entries].sort((a, b) => b.earningsYield - a.earningsYield);
  byEY.forEach((e, i) => { e.eyRank = i + 1; });

  // Rank by return on capital (descending — highest ROC gets rank 1)
  const byROC = [...entries].sort((a, b) => b.returnOnCapital - a.returnOnCapital);
  byROC.forEach((e, i) => { e.rocRank = i + 1; });

  // Combined rank
  entries.forEach((e) => { e.combinedRank = e.eyRank + e.rocRank; });

  // Sort by combined rank ascending (best first)
  return entries.sort((a, b) => a.combinedRank - b.combinedRank);
}

// ── Claude AI (LLM-powered game theory) ──────────────────────────────────────

export interface AiStakeholder {
  name: string;
  position: number;
  salience: number;
  power: number;
  reasoning: string;
}

export interface AiScenarioAnalysis {
  stakeholders: AiStakeholder[];
  analysis: string;
}

export interface AiDebateRound {
  speaker: string;
  argument: string;
  movesPosition?: { from: number; to: number };
}

export interface AiDebateResult {
  rounds: AiDebateRound[];
  conclusion: string;
}

// The Anthropic key is read from env at build time for the browser fallback.
// In Electron, it is read server-side in the main process (never exposed to renderer).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ANTHROPIC_KEY = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY as string | undefined;

async function claudeBrowserChat(
  systemPrompt: string,
  userMsg: string,
): Promise<string> {
  const key = ANTHROPIC_KEY;
  if (!key) throw new Error('VITE_ANTHROPIC_API_KEY not set for browser mode');

  const response = await fetch('/api/claude/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? '';
}

function extractJsonFromText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Claude response');
  return JSON.parse(jsonMatch[0]);
}

const SCENARIO_SYSTEM = `You are an expert in game theory and political/economic analysis, specifically Bruce Bueno de Mesquita's Expected Utility Model from "The Predictioneer's Game."

Your task: Given a scenario, identify the key stakeholders and estimate their:
- Position (0-100): What outcome do they want? 0 = completely against, 100 = completely in favor
- Salience (0-100): How much do they care about this issue? 0 = indifferent, 100 = top priority
- Power (0-100): How much influence can they exert? 0 = no power, 100 = dominant

Focus on South African political economy, SARB, government, business, labor, and international actors where relevant.

IMPORTANT: Respond ONLY in valid JSON format:
{
  "stakeholders": [
    { "name": "...", "position": 0-100, "salience": 0-100, "power": 0-100, "reasoning": "..." }
  ],
  "analysis": "Brief analysis of the scenario dynamics and key tensions"
}`;

const DEBATE_SYSTEM = `You are simulating a negotiation/debate between stakeholders on a political/economic scenario, following Mesquita's game theory principles.

Simulate 3-4 rounds of negotiation. In each round:
1. The most powerful stakeholder states their position
2. Other stakeholders respond with counter-arguments
3. Some stakeholders shift their positions based on the arguments

Respond in JSON:
{
  "rounds": [
    { "speaker": "stakeholder name", "argument": "their argument", "movesPosition": { "from": 60, "to": 65 } }
  ],
  "conclusion": "Summary of where things are likely to land and why"
}`;

const INVESTMENT_SYSTEM = `You are an investment analyst who uses game theory predictions to assess investment implications. Be specific about which SA companies/sectors would be affected and how. Be concise but actionable.`;

/**
 * Ask Claude to identify stakeholders and their game theory parameters for a scenario.
 * Works in both Electron (IPC → main process) and browser (Vite proxy).
 */
export async function aiAnalyzeScenario(
  scenario: string,
  context?: string,
): Promise<AiScenarioAnalysis> {
  if (isElectron) {
    return (window as any).dhando.claude.analyzeScenario(scenario, context) as Promise<AiScenarioAnalysis>;
  }
  const userMsg = context
    ? `Scenario: ${scenario}\n\nAdditional context: ${context}`
    : `Scenario: ${scenario}`;
  const text = await claudeBrowserChat(SCENARIO_SYSTEM, userMsg);
  return extractJsonFromText(text) as AiScenarioAnalysis;
}

/**
 * Ask Claude to produce investment implications from a completed game theory prediction.
 * Returns prose text.
 */
export async function aiAnalyzeResult(
  scenario: string,
  result: {
    predictedOutcome: number;
    probability: number;
    confidence: number;
    stakeholderInfluence: { name: string; influence: number }[];
  },
): Promise<string> {
  if (isElectron) {
    return (window as any).dhando.claude.analyzeResult(scenario, result) as Promise<string>;
  }
  const topStakeholders = result.stakeholderInfluence
    .slice(0, 3)
    .map((s) => `${s.name} (${(s.influence * 100).toFixed(0)}%)`)
    .join(', ');

  const userMsg = `Scenario: ${scenario}

Game Theory Prediction Result:
- Predicted Outcome: ${result.predictedOutcome}/100 (${result.probability > 0.5 ? 'likely to happen' : 'unlikely'})
- Probability: ${(result.probability * 100).toFixed(1)}%
- Model Confidence: ${(result.confidence * 100).toFixed(0)}%
- Most Influential Stakeholders: ${topStakeholders}

What are the investment implications for a South African value investor? Which JSE sectors/stocks would benefit or suffer? How should this affect portfolio positioning?`;

  return claudeBrowserChat(INVESTMENT_SYSTEM, userMsg);
}

/**
 * Ask Claude to simulate a structured negotiation debate between stakeholders.
 */
export async function aiDebate(
  scenario: string,
  stakeholders: { name: string; position: number; salience: number; power: number }[],
): Promise<AiDebateResult> {
  if (isElectron) {
    return (window as any).dhando.claude.debate(scenario, stakeholders) as Promise<AiDebateResult>;
  }
  const stakeholderList = stakeholders
    .map(
      (s) =>
        `- ${s.name}: Position ${s.position}/100, Salience ${s.salience}/100, Power ${s.power}/100`,
    )
    .join('\n');
  const userMsg = `Scenario: ${scenario}\n\nStakeholders:\n${stakeholderList}\n\nSimulate the negotiation.`;
  const text = await claudeBrowserChat(DEBATE_SYSTEM, userMsg);
  return extractJsonFromText(text) as AiDebateResult;
}
