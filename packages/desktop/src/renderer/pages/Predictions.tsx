import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatPct } from '../lib/format';
import { listWatchlist, type InvestmentRow } from '../lib/ipc';

/*
 * Usage example:
 *
 * import { Predictions } from './pages/Predictions';
 * <Route path="/predictions" element={<Predictions />} />
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface PredictionMarket {
  id: string;
  question: string;
  yesProbability: number;
  volume: number;
  endDate: string;
  slug?: string;
}

interface LinkedPrediction {
  marketId: string;
  investmentId: string;
  investmentName: string;
}

// ── Polymarket API ────────────────────────────────────────────────────────────

const GAMMA_BASE = '/api/polymarket';

async function searchPolymarket(query: string): Promise<PredictionMarket[]> {
  try {
    const url = `${GAMMA_BASE}/events?title_contains=${encodeURIComponent(query)}&active=true&closed=false&limit=10&order=volume&ascending=false`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const events = await response.json();
    const markets: PredictionMarket[] = [];
    for (const event of Array.isArray(events) ? events : []) {
      const market = Array.isArray(event.markets) ? event.markets[0] : null;
      if (!market) continue;
      const outcomePrices: string[] = market.outcomePrices
        ? JSON.parse(market.outcomePrices)
        : [];
      const yesPrice = outcomePrices.length > 0 ? parseFloat(outcomePrices[0]) : 0.5;
      markets.push({
        id: String(event.id ?? market.id),
        question: String(event.title ?? market.question ?? 'Unknown'),
        yesProbability: isFinite(yesPrice) ? yesPrice : 0.5,
        volume: Number(event.volume ?? market.volume ?? 0),
        endDate: String(event.endDate ?? market.endDate ?? ''),
        slug: event.slug,
      });
    }
    return markets;
  } catch {
    return [];
  }
}

// ── Default macro queries loaded on mount ─────────────────────────────────────

const MACRO_QUERIES = [
  'recession 2025',
  'fed rate cut',
  'inflation',
  'tariffs',
];

// ── Sub-components ────────────────────────────────────────────────────────────

interface LinkDropdownProps {
  marketId: string;
  investments: InvestmentRow[];
  linked: LinkedPrediction[];
  onLink: (marketId: string, investment: InvestmentRow) => void;
}

function LinkDropdown({ marketId, investments, linked, onLink }: LinkDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const linkedInvestments = linked
    .filter((l) => l.marketId === marketId)
    .map((l) => l.investmentName);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs px-3 py-1.5 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 transition-colors font-medium"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        Link to Investment
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-20"
          role="listbox"
          aria-label="Select investment to link"
        >
          {investments.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400">No investments in watchlist</p>
          ) : (
            <ul className="py-1 max-h-52 overflow-y-auto">
              {investments.map((inv) => (
                <li key={inv.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={linkedInvestments.includes(inv.name)}
                    onClick={() => {
                      onLink(marketId, inv);
                      setOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-xs hover:bg-orange-50 flex items-center justify-between"
                  >
                    <span className="text-gray-800 font-medium truncate">{inv.name}</span>
                    {linkedInvestments.includes(inv.name) && (
                      <span className="text-orange-500 text-xs ml-2 shrink-0">linked</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {linkedInvestments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {linkedInvestments.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5"
            >
              <span
                className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"
                aria-hidden="true"
              />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface PredictionCardProps {
  market: PredictionMarket;
  investments: InvestmentRow[];
  linked: LinkedPrediction[];
  onLink: (marketId: string, investment: InvestmentRow) => void;
}

function PredictionCard({ market, investments, linked, onLink }: PredictionCardProps) {
  const pct = market.yesProbability;
  // Color threshold: green if > 50% (outcome likely), orange if borderline, red if unlikely
  const barColor =
    pct >= 0.6 ? 'bg-green-500' : pct >= 0.4 ? 'bg-amber-400' : 'bg-red-400';
  const yesColor =
    pct >= 0.6 ? 'text-green-600' : pct >= 0.4 ? 'text-amber-600' : 'text-red-500';

  const endDateStr = market.endDate
    ? new Date(market.endDate).toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'N/A';

  const volumeStr =
    market.volume >= 1_000_000
      ? `$${(market.volume / 1_000_000).toFixed(1)}M`
      : market.volume >= 1_000
      ? `$${(market.volume / 1_000).toFixed(0)}K`
      : `$${market.volume.toLocaleString()}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      <h3 className="font-medium text-gray-900 text-sm leading-snug">{market.question}</h3>

      {/* Probability bar */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className={`font-semibold ${yesColor}`}>
            Yes {formatPct(pct)}
          </span>
          <span className="text-red-500">
            No {formatPct(1 - pct)}
          </span>
        </div>
        <div className="h-3 bg-red-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Yes probability: ${formatPct(pct)}`}>
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Vol: {volumeStr}</span>
        <span>Ends: {endDateStr}</span>
      </div>

      {/* Link to investment */}
      <div className="pt-1 border-t border-gray-100">
        <LinkDropdown
          marketId={market.id}
          investments={investments}
          linked={linked}
          onLink={onLink}
        />
      </div>
    </div>
  );
}

// ── Empty / Loading states ────────────────────────────────────────────────────

function EmptyState({ loading, query }: { loading: boolean; query: string }) {
  if (loading) {
    return (
      <div className="col-span-full flex items-center justify-center py-16 text-gray-400 text-sm">
        <span className="animate-pulse">Loading prediction markets...</span>
      </div>
    );
  }
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
      <span className="text-3xl" aria-hidden="true">◎</span>
      <p className="text-sm">
        {query.trim() ? `No markets found for "${query}"` : 'Search for a prediction market above'}
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function Predictions() {
  const [query, setQuery] = useState('');
  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [linked, setLinked] = useState<LinkedPrediction[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  // Load watchlist once
  useEffect(() => {
    listWatchlist().then(setInvestments).catch(() => {});
  }, []);

  // Auto-load macro markets on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    setLoading(true);
    Promise.all(MACRO_QUERIES.map(searchPolymarket))
      .then((results) => {
        const seen = new Set<string>();
        const merged: PredictionMarket[] = [];
        for (const group of results) {
          for (const m of group) {
            if (!seen.has(m.id)) {
              seen.add(m.id);
              merged.push(m);
            }
          }
        }
        setMarkets(merged.slice(0, 12));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Debounced search
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) return;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchPolymarket(value);
        setMarkets(results);
      } catch {
        setMarkets([]);
      } finally {
        setLoading(false);
      }
    }, 500);
  }, []);

  const handleLink = useCallback((marketId: string, investment: InvestmentRow) => {
    setLinked((prev) => {
      const exists = prev.find(
        (l) => l.marketId === marketId && l.investmentId === investment.id,
      );
      if (exists) return prev;
      return [
        ...prev,
        { marketId, investmentId: investment.id, investmentName: investment.name },
      ];
    });
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Prediction Markets</h1>
        <p className="text-sm text-gray-500 mt-1">
          Live Polymarket probabilities — link outcomes to investments as Kelly criterion inputs.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none"
          aria-hidden="true"
        >
          ⊞
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search prediction markets..."
          className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-orange-400 bg-white shadow-sm"
          aria-label="Search prediction markets"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs animate-pulse">
            Loading...
          </span>
        )}
      </div>

      {/* Markets grid */}
      <section aria-label="Prediction market cards">
        {markets.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <EmptyState loading={loading} query={query} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {markets.map((market) => (
              <PredictionCard
                key={market.id}
                market={market}
                investments={investments}
                linked={linked}
                onLink={handleLink}
              />
            ))}
          </div>
        )}
      </section>

      {/* Summary of all links */}
      {linked.length > 0 && (
        <section className="mt-8" aria-label="Linked predictions summary">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Linked Predictions</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Investment</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Market Question</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Yes Probability</th>
                </tr>
              </thead>
              <tbody>
                {linked.map((l, i) => {
                  const market = markets.find((m) => m.id === l.marketId);
                  if (!market) return null;
                  return (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3 font-medium text-gray-800">{l.investmentName}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">{market.question}</td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: '#d97757' }}>
                        {formatPct(market.yesProbability)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
