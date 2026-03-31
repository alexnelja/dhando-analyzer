import React, { useEffect, useState } from 'react';
import { formatCurrency, formatCompact } from '../lib/currency';
import { listWatchlist, type InvestmentRow } from '../lib/ipc';

interface CompareMetric {
  label: string;
  key: string;
  format?: (v: number | null) => string;
  higherIsBetter?: boolean;
  isText?: boolean;
}

interface CompareData {
  investmentId: string;
  name: string;
  ticker: string | null;
  currentPrice: number | null;
  intrinsicValue: number | null;
  marginOfSafety: number | null;
  compositeScore: number | null;
  altmanZScore: number | null;
  altmanZZone: string | null;
  piotroskiFScore: number | null;
  piotroskiFInterp: string | null;
  beneishMScore: number | null;
  beneishManipulator: boolean | null;
  evEbitda: number | null;
  pe: number | null;
  pb: number | null;
  fcfYield: number | null;
  ownerEarnings: number | null;
  moatScore: number | null;
  managementScore: number | null;
  kellyPosition: number | null;
  dhandoFitScore: number | null;
}

function emptyData(inv: InvestmentRow): CompareData {
  return {
    investmentId: inv.id,
    name: inv.name,
    ticker: inv.ticker,
    currentPrice: null,
    intrinsicValue: inv.intrinsic_value,
    marginOfSafety: null,
    compositeScore: inv.circle_of_competence_fit,
    altmanZScore: null,
    altmanZZone: null,
    piotroskiFScore: null,
    piotroskiFInterp: null,
    beneishMScore: null,
    beneishManipulator: null,
    evEbitda: null,
    pe: null,
    pb: null,
    fcfYield: null,
    ownerEarnings: null,
    moatScore: inv.moat_score,
    managementScore: inv.management_score,
    kellyPosition: null,
    dhandoFitScore: null,
  };
}

const METRICS: CompareMetric[] = [
  { label: 'Current Price', key: 'currentPrice', format: (v) => v !== null ? formatCurrency(v) : '—', isText: true },
  { label: 'Intrinsic Value', key: 'intrinsicValue', format: (v) => v !== null ? formatCurrency(v) : '—', higherIsBetter: true, isText: true },
  { label: 'Margin of Safety %', key: 'marginOfSafety', format: (v) => v !== null ? `${(v * 100).toFixed(1)}%` : '—', higherIsBetter: true },
  { label: 'Composite Score (0–100)', key: 'compositeScore', format: (v) => v !== null ? `${v.toFixed(0)}/100` : '—', higherIsBetter: true },
  { label: 'Altman Z-Score', key: 'altmanZScore', format: (v) => v !== null ? v.toFixed(2) : '—', higherIsBetter: true },
  { label: 'Altman Zone', key: 'altmanZZone', isText: true },
  { label: 'Piotroski F-Score', key: 'piotroskiFScore', format: (v) => v !== null ? `${v}/9` : '—', higherIsBetter: true },
  { label: 'F-Score Interpretation', key: 'piotroskiFInterp', isText: true },
  { label: 'Beneish M-Score', key: 'beneishMScore', format: (v) => v !== null ? v.toFixed(2) : '—', higherIsBetter: false },
  { label: 'Manipulation Flag', key: 'beneishManipulator', isText: true },
  { label: 'EV/EBITDA', key: 'evEbitda', format: (v) => v !== null ? v.toFixed(1) + 'x' : '—', higherIsBetter: false },
  { label: 'P/E Ratio', key: 'pe', format: (v) => v !== null ? v.toFixed(1) + 'x' : '—', higherIsBetter: false },
  { label: 'P/B Ratio', key: 'pb', format: (v) => v !== null ? v.toFixed(2) + 'x' : '—', higherIsBetter: false },
  { label: 'FCF Yield', key: 'fcfYield', format: (v) => v !== null ? `${(v * 100).toFixed(1)}%` : '—', higherIsBetter: true },
  { label: 'Owner Earnings', key: 'ownerEarnings', format: (v) => v !== null ? formatCompact(v) : '—', higherIsBetter: true },
  { label: 'Moat Score (1–5)', key: 'moatScore', format: (v) => v !== null ? `${v}/5` : '—', higherIsBetter: true },
  { label: 'Management Score (1–5)', key: 'managementScore', format: (v) => v !== null ? `${v}/5` : '—', higherIsBetter: true },
  { label: 'Kelly Position %', key: 'kellyPosition', format: (v) => v !== null ? `${v.toFixed(1)}%` : '—', higherIsBetter: true },
  { label: 'Dhandho Fit Score', key: 'dhandoFitScore', format: (v) => v !== null ? v.toFixed(0) : '—', higherIsBetter: true },
];

function formatCell(metric: CompareMetric, data: CompareData): string {
  const raw = (data as unknown as Record<string, unknown>)[metric.key];
  if (metric.key === 'altmanZZone') return raw != null ? String(raw) : '—';
  if (metric.key === 'piotroskiFInterp') return raw != null ? String(raw) : '—';
  if (metric.key === 'beneishManipulator') {
    if (raw === null || raw === undefined) return '—';
    return raw ? 'Yes — flag' : 'No';
  }
  if (metric.format) return metric.format(raw != null ? Number(raw) : null);
  return raw != null ? String(raw) : '—';
}

/** Determine which column wins for a given numeric metric row */
function findWinnerIdx(metric: CompareMetric, columns: CompareData[]): number | null {
  if (metric.isText) return null;
  if (metric.higherIsBetter === undefined) return null;

  const values = columns.map((d) => {
    const v = (d as unknown as Record<string, unknown>)[metric.key];
    return v != null ? Number(v) : null;
  });

  const defined = values.filter((v): v is number => v !== null);
  if (defined.length < 2) return null;

  const best = metric.higherIsBetter
    ? Math.max(...defined)
    : Math.min(...defined);

  const idx = values.indexOf(best);
  return idx >= 0 ? idx : null;
}

function cellStyle(metric: CompareMetric, data: CompareData, isWinner: boolean): React.CSSProperties {
  if (metric.isText) return {};
  const raw = (data as unknown as Record<string, unknown>)[metric.key];
  if (raw === null || raw === undefined) return { color: '#9ca3af' };

  const v = Number(raw);

  // Specific coloring logic per metric
  if (metric.key === 'marginOfSafety') {
    if (v >= 0.3) return { color: '#788c5d', fontWeight: 600 };
    if (v >= 0.1) return { color: '#d97757' };
    return { color: '#e05252' };
  }
  if (metric.key === 'compositeScore') {
    if (v >= 60) return { color: '#788c5d', fontWeight: 600 };
    if (v >= 35) return { color: '#d97757' };
    return { color: '#e05252' };
  }
  if (metric.key === 'altmanZScore') {
    if (v > 2.99) return { color: '#788c5d', fontWeight: 600 };
    if (v > 1.81) return { color: '#d97757' };
    return { color: '#e05252' };
  }
  if (metric.key === 'piotroskiFScore') {
    if (v >= 7) return { color: '#788c5d', fontWeight: 600 };
    if (v >= 4) return { color: '#d97757' };
    return { color: '#e05252' };
  }
  if (metric.key === 'beneishMScore') {
    if (v > -1.78) return { color: '#e05252' };
    return { color: '#788c5d' };
  }

  if (isWinner) return { color: '#788c5d', fontWeight: 600 };
  return {};
}

function verdictForColumn(data: CompareData): { label: string; color: string; bg: string } {
  const scores: number[] = [];
  if (data.marginOfSafety !== null) scores.push(data.marginOfSafety >= 0.3 ? 2 : data.marginOfSafety >= 0.1 ? 1 : 0);
  if (data.compositeScore !== null) scores.push(data.compositeScore >= 60 ? 2 : data.compositeScore >= 35 ? 1 : 0);
  if (data.altmanZScore !== null) scores.push(data.altmanZScore > 2.99 ? 2 : data.altmanZScore > 1.81 ? 1 : 0);
  if (data.piotroskiFScore !== null) scores.push(data.piotroskiFScore >= 7 ? 2 : data.piotroskiFScore >= 4 ? 1 : 0);
  if (data.moatScore !== null) scores.push(data.moatScore >= 4 ? 2 : data.moatScore >= 2 ? 1 : 0);

  if (scores.length === 0) return { label: 'Insufficient data', color: '#9ca3af', bg: '#f9fafb' };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 1.5) return { label: 'Strong candidate', color: '#788c5d', bg: 'rgba(120,140,93,0.08)' };
  if (avg >= 0.8) return { label: 'Neutral / watch', color: '#d97757', bg: 'rgba(217,119,87,0.08)' };
  return { label: 'Weak / avoid', color: '#e05252', bg: 'rgba(224,82,82,0.08)' };
}

/*
 * Usage example:
 *
 * import { Compare } from './pages/Compare';
 * <Route path="/compare" element={<Compare />} />
 */

export function Compare() {
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [columns, setColumns] = useState<CompareData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listWatchlist()
      .then(setInvestments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev; // max 4
      return [...prev, id];
    });
  }

  function handleCompare() {
    const cols = selectedIds.map((id) => {
      const inv = investments.find((i) => i.id === id);
      if (!inv) return null;
      const data = emptyData(inv);
      // Derive margin of safety if both values are available
      if (data.intrinsicValue !== null && data.currentPrice !== null && data.intrinsicValue > 0) {
        data.marginOfSafety = (data.intrinsicValue - data.currentPrice) / data.intrinsicValue;
      }
      return data;
    }).filter((c): c is CompareData => c !== null);
    setColumns(cols);
  }

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Investment Comparison</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Side-by-side comparison of up to 4 investments across all key metrics
        </p>
      </div>

      {/* Selection panel */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-6">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Select 2–4 investments to compare
        </p>
        {loading ? (
          <div className="text-gray-400 text-sm">Loading watchlist...</div>
        ) : investments.length === 0 ? (
          <div className="text-gray-400 text-sm">No investments in watchlist. Add some first.</div>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {investments.map((inv) => {
              const selected = selectedIds.includes(inv.id);
              return (
                <button
                  key={inv.id}
                  onClick={() => toggleSelect(inv.id)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
                  style={
                    selected
                      ? { backgroundColor: 'rgba(217,119,87,0.12)', borderColor: '#d97757', color: '#d97757' }
                      : { backgroundColor: '#f9faf5', borderColor: '#e5e7eb', color: '#6b7280' }
                  }
                >
                  {inv.name}
                  {inv.ticker && <span className="ml-1.5 font-mono text-xs opacity-70">{inv.ticker}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={handleCompare}
            disabled={selectedIds.length < 2}
            className="px-5 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: '#d97757' }}
          >
            Compare
          </button>
          {selectedIds.length > 0 && (
            <button
              onClick={() => { setSelectedIds([]); setColumns([]); }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-gray-400">{selectedIds.length}/4 selected</span>
        </div>
      </div>

      {/* Comparison table */}
      {columns.length >= 2 && (
        <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#f3f2ee' }}>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-52">
                    Metric
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.investmentId}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-800 uppercase tracking-wide"
                    >
                      <div className="font-semibold text-gray-900">{col.name}</div>
                      {col.ticker && (
                        <div className="font-mono text-xs font-normal mt-0.5" style={{ color: '#d97757' }}>
                          {col.ticker}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/60">
                {METRICS.map((metric) => {
                  const winnerIdx = findWinnerIdx(metric, columns);
                  return (
                    <tr key={metric.key} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-medium text-gray-500 bg-gray-50/40">
                        {metric.label}
                      </td>
                      {columns.map((col, idx) => {
                        const isWinner = winnerIdx === idx;
                        const style = cellStyle(metric, col, isWinner);
                        const displayValue = formatCell(metric, col);
                        return (
                          <td
                            key={col.investmentId}
                            className="px-4 py-2.5"
                            style={style}
                          >
                            <span>{displayValue}</span>
                            {isWinner && displayValue !== '—' && (
                              <span
                                className="ml-2 text-xs px-1.5 py-0.5 rounded font-medium"
                                style={{ backgroundColor: 'rgba(120,140,93,0.12)', color: '#788c5d' }}
                              >
                                best
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Verdict row */}
                <tr style={{ backgroundColor: '#f8f7f3' }}>
                  <td className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Overall Verdict
                  </td>
                  {columns.map((col) => {
                    const v = verdictForColumn(col);
                    return (
                      <td key={col.investmentId} className="px-4 py-3">
                        <span
                          className="inline-block px-3 py-1 rounded-full text-xs font-semibold"
                          style={{ color: v.color, backgroundColor: v.bg, border: `1px solid ${v.color}33` }}
                        >
                          {v.label}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            Note: metrics show stored values from the screener. Run the Screener page on each investment to populate scores.
            Green = strong, amber = neutral, red = weak.
          </div>
        </div>
      )}
    </div>
  );
}
