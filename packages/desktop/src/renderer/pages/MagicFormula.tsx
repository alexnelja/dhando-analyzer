import React, { useEffect, useState, useCallback } from 'react';
import { formatCompact } from '../lib/currency';
import {
  listWatchlist,
  calculateMagicFormula,
  fetchFundamentalsForMagicFormula,
  getFinancials,
  type InvestmentRow,
  type MagicFormulaEntry,
  type Financial,
} from '../lib/ipc';

interface MagicFormulaInputs {
  ebit: number;
  enterpriseValue: number;
  /** Estimated: totalAssets * 0.4 - totalDebt * 0.3 */
  netWorkingCapital: number;
  /** Estimated: totalAssets * 0.6 */
  netFixedAssets: number;
}

interface EditableRow {
  inv: InvestmentRow;
  inputs: MagicFormulaInputs;
  dataSource: 'manual' | 'eodhd';
}

const DEFAULT_INPUTS: MagicFormulaInputs = {
  ebit: 15000000,
  enterpriseValue: 550000000,
  netWorkingCapital: 20000000,
  netFixedAssets: 90000000,
};

function deriveInputs(_inv: InvestmentRow): MagicFormulaInputs {
  // Base row before the shared financials store is consulted (see
  // deriveInputsFromFinancial, applied asynchronously on mount).
  return { ...DEFAULT_INPUTS };
}

/**
 * Build Magic Formula inputs from an investment's most recent stored financial.
 *
 * - EBIT falls back to `ebitda - depreciation` when EBIT itself is absent.
 * - Net working capital falls back to `currentAssets - currentLiabilities`.
 * - Enterprise value needs the investment's market cap; without it that one
 *   field keeps its default.
 * Returns `null` when there is no stored financial to derive from. Any field
 * that cannot be derived keeps its {@link DEFAULT_INPUTS} value.
 */
export function deriveInputsFromFinancial(
  inv: Pick<InvestmentRow, 'market_cap'>,
  fin: Financial | undefined,
): { inputs: MagicFormulaInputs; dataSource: 'manual' | 'eodhd' } | null {
  if (!fin) return null;

  const ebit =
    fin.ebit ??
    (fin.ebitda != null && fin.depreciation != null ? fin.ebitda - fin.depreciation : null);
  const netWorkingCapital =
    fin.workingCapital ??
    (fin.currentAssets != null && fin.currentLiabilities != null
      ? fin.currentAssets - fin.currentLiabilities
      : null);
  const netFixedAssets = fin.ppe;
  const enterpriseValue =
    inv.market_cap != null
      ? inv.market_cap + (fin.totalDebt ?? fin.totalLiabilities ?? 0) - (fin.cash ?? 0)
      : null;

  return {
    inputs: {
      ebit: ebit ?? DEFAULT_INPUTS.ebit,
      enterpriseValue: enterpriseValue ?? DEFAULT_INPUTS.enterpriseValue,
      netWorkingCapital: netWorkingCapital ?? DEFAULT_INPUTS.netWorkingCapital,
      netFixedAssets: netFixedAssets ?? DEFAULT_INPUTS.netFixedAssets,
    },
    dataSource: fin.source === 'api' ? 'eodhd' : 'manual',
  };
}

function rankBadgeStyle(rank: number, total: number): React.CSSProperties {
  const quartile = rank / total;
  if (rank <= 5) return { backgroundColor: '#f59e0b', color: '#ffffff' }; // gold
  if (quartile <= 0.25) return { backgroundColor: 'rgba(120,140,93,0.15)', color: '#788c5d' };
  if (quartile >= 0.75) return { backgroundColor: 'rgba(224,82,82,0.12)', color: '#e05252' };
  return { backgroundColor: '#f3f2ee', color: '#6b7280' };
}

function eyColor(ey: number): string {
  if (ey >= 0.12) return '#788c5d';
  if (ey >= 0.06) return '#d97757';
  return '#e05252';
}

function rocColor(roc: number): string {
  if (roc >= 0.25) return '#788c5d';
  if (roc >= 0.10) return '#d97757';
  return '#e05252';
}

/*
 * Usage example:
 *
 * import { MagicFormula } from './pages/MagicFormula';
 * <Route path="/magic-formula" element={<MagicFormula />} />
 */

export function MagicFormula() {
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [editableRows, setEditableRows] = useState<EditableRow[]>([]);
  const [results, setResults] = useState<MagicFormulaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasRun, setHasRun] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number } | null>(null);
  const [fetchBanner, setFetchBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const invs = await listWatchlist();
        if (cancelled) return;
        setInvestments(invs);
        setEditableRows(
          invs.map((inv) => ({ inv, inputs: deriveInputs(inv), dataSource: 'manual' as const })),
        );

        // Pre-fill from the shared financials store where available.
        const fins = await Promise.all(
          invs.map((inv) => getFinancials(inv.id).catch(() => [] as Financial[])),
        );
        if (cancelled) return;
        setEditableRows((prev) =>
          prev.map((r, i) => {
            const patch = deriveInputsFromFinancial(r.inv, fins[i]?.[0]);
            return patch ? { ...r, inputs: patch.inputs, dataSource: patch.dataSource } : r;
          }),
        );
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRun = useCallback(() => {
    const payload = editableRows.map(({ inv, inputs }) => ({
      id: inv.id,
      name: inv.name,
      ticker: inv.ticker,
      ebit: inputs.ebit,
      enterpriseValue: inputs.enterpriseValue,
      netWorkingCapital: inputs.netWorkingCapital,
      netFixedAssets: inputs.netFixedAssets,
    }));
    const ranked = calculateMagicFormula(payload);
    setResults(ranked);
    setHasRun(true);
  }, [editableRows]);

  const handleAutoFetch = useCallback(async () => {
    const eligible = editableRows.filter((r) => r.inv.ticker && r.inv.exchange);
    if (eligible.length === 0) return;

    setFetchBanner(null);
    setFetchProgress({ current: 0, total: eligible.length });

    let successCount = 0;
    const updated = new Map<string, { inputs: MagicFormulaInputs; dataSource: 'eodhd' }>();

    for (let i = 0; i < eligible.length; i++) {
      const { inv } = eligible[i];
      setFetchProgress({ current: i + 1, total: eligible.length });
      const result = await fetchFundamentalsForMagicFormula(inv.ticker!, inv.exchange!);
      if (result) {
        updated.set(inv.id, {
          inputs: {
            ebit: result.ebit,
            enterpriseValue: result.enterpriseValue,
            netWorkingCapital: result.netWorkingCapital,
            netFixedAssets: result.netFixedAssets,
          },
          dataSource: 'eodhd',
        });
        successCount++;
      }
    }

    setEditableRows((prev) =>
      prev.map((r) => {
        const patch = updated.get(r.inv.id);
        return patch ? { ...r, inputs: patch.inputs, dataSource: patch.dataSource } : r;
      }),
    );

    setFetchProgress(null);

    if (successCount > 0) {
      setFetchBanner(`Financials fetched for ${successCount} investment${successCount !== 1 ? 's' : ''}`);

      // Auto-run rankings after fetch
      setEditableRows((prev) => {
        const payload = prev.map(({ inv, inputs }) => ({
          id: inv.id,
          name: inv.name,
          ticker: inv.ticker,
          ebit: inputs.ebit,
          enterpriseValue: inputs.enterpriseValue,
          netWorkingCapital: inputs.netWorkingCapital,
          netFixedAssets: inputs.netFixedAssets,
        }));
        const ranked = calculateMagicFormula(payload);
        setResults(ranked);
        setHasRun(true);
        return prev;
      });
    } else {
      setFetchBanner('No financials could be fetched — check tickers and exchange codes.');
    }
  }, [editableRows]);

  function updateInput(id: string, field: keyof MagicFormulaInputs, value: number) {
    setEditableRows((prev) =>
      prev.map((r) =>
        r.inv.id === id ? { ...r, inputs: { ...r.inputs, [field]: value } } : r,
      ),
    );
  }

  const total = results.length;

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Magic Formula</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Joel Greenblatt's rank-based system: highest earnings yield + highest return on capital = best opportunity
        </p>
      </div>

      {/* Formula explanation card */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
              Earnings Yield = EBIT / Enterprise Value
            </p>
            <p className="text-xs text-gray-500">
              Higher is better. Measures how much earnings you get per rand of enterprise value.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
              Return on Capital = EBIT / (Net Working Capital + Net Fixed Assets)
            </p>
            <p className="text-xs text-gray-500">
              Higher is better. Measures business efficiency — how much earnings are generated per unit of invested capital.
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
          Combined rank = Earnings Yield rank + ROC rank. Lowest combined rank = best Magic Formula stock.
          Top 5 are highlighted in gold.
        </div>
      </div>

      {/* Input table */}
      {loading ? (
        <div className="text-gray-400 text-sm">Loading watchlist...</div>
      ) : editableRows.length === 0 ? (
        <div className="text-gray-400 text-sm">
          No investments in watchlist. Add some first from the Watchlist page.
        </div>
      ) : (
        <>
          {/* Auto-fetch controls */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleAutoFetch}
              disabled={fetchProgress !== null}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {fetchProgress
                ? `Fetching ${fetchProgress.current}/${fetchProgress.total}...`
                : 'Auto-Fetch Financials'}
            </button>
            {fetchBanner && (
              <span
                className="text-xs font-medium px-3 py-1.5 rounded-md"
                style={{
                  backgroundColor: fetchBanner.startsWith('No') ? 'rgba(224,82,82,0.1)' : 'rgba(120,140,93,0.12)',
                  color: fetchBanner.startsWith('No') ? '#e05252' : '#788c5d',
                }}
              >
                {fetchBanner}
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Financial Inputs — edit per investment
              </p>
              <span className="text-xs text-gray-400">
                EV = Market Cap + Total Debt – Cash; NWC = Current Assets – Current Liabilities
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#f3f2ee' }}>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Investment
                    </th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Source
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                      EBIT
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Enterprise Value
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Net Working Capital
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Net Fixed Assets
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/60">
                  {editableRows.map(({ inv, inputs, dataSource }) => (
                    <tr key={inv.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-gray-800">{inv.name}</span>
                        {inv.ticker && (
                          <span className="ml-2 font-mono text-xs text-gray-400">{inv.ticker}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {dataSource === 'eodhd' ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: 'rgba(120,140,93,0.12)', color: '#788c5d' }}
                          >
                            EODHD
                          </span>
                        ) : (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: '#f3f2ee', color: '#9ca3af' }}
                          >
                            Manual
                          </span>
                        )}
                      </td>
                      {(['ebit', 'enterpriseValue', 'netWorkingCapital', 'netFixedAssets'] as const).map(
                        (field) => (
                          <td key={field} className="px-4 py-2.5 text-right">
                            <input
                              type="number"
                              value={inputs[field]}
                              onChange={(e) => updateInput(inv.id, field, Number(e.target.value))}
                              className="w-32 border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:border-orange-400"
                            />
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mb-6">
            <button
              onClick={handleRun}
              className="px-5 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90"
              style={{ backgroundColor: '#d97757' }}
            >
              Calculate Magic Formula Rankings
            </button>
          </div>

          {/* Results table */}
          {hasRun && (
            results.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200/60 p-6 text-center text-gray-400 text-sm">
                No valid entries — ensure Enterprise Value and Net Capital are greater than zero.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">
                    Rankings — sorted by combined rank (best first)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: '#f3f2ee' }}>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide w-16">
                          Rank
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Investment
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Earnings Yield
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                          EY Rank
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Return on Capital
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                          ROC Rank
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Combined Rank
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Score Badge
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/60">
                      {results.map((entry, idx) => {
                        const rank = idx + 1;
                        const badgeStyle = rankBadgeStyle(rank, total);
                        const isTop5 = rank <= 5;
                        return (
                          <tr
                            key={entry.investmentId}
                            className="hover:bg-gray-50/60 transition-colors"
                            style={isTop5 ? { backgroundColor: 'rgba(245,158,11,0.04)' } : {}}
                          >
                            <td className="px-4 py-3 text-center">
                              <span
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
                                style={badgeStyle}
                              >
                                {rank}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-medium text-gray-800">{entry.name}</span>
                              {entry.ticker && (
                                <span className="ml-2 font-mono text-xs text-gray-400">
                                  {entry.ticker}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm" style={{ color: eyColor(entry.earningsYield) }}>
                              {(entry.earningsYield * 100).toFixed(2)}%
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-gray-600">
                              #{entry.eyRank}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm" style={{ color: rocColor(entry.returnOnCapital) }}>
                              {(entry.returnOnCapital * 100).toFixed(2)}%
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-gray-600">
                              #{entry.rocRank}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold"
                                style={badgeStyle}
                              >
                                {entry.combinedRank}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isTop5 ? (
                                <span
                                  className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                  style={{ backgroundColor: '#f59e0b', color: '#ffffff' }}
                                >
                                  Top Pick
                                </span>
                              ) : rank / total <= 0.25 ? (
                                <span
                                  className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                  style={{ backgroundColor: 'rgba(120,140,93,0.12)', color: '#788c5d' }}
                                >
                                  Strong
                                </span>
                              ) : rank / total >= 0.75 ? (
                                <span
                                  className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                  style={{ backgroundColor: 'rgba(224,82,82,0.1)', color: '#e05252' }}
                                >
                                  Weak
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">Mid</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
                  Gold = top 5. Green = top quartile. Red = bottom quartile.
                  Financials are manually entered above — update with actual reported figures for accurate rankings.
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
