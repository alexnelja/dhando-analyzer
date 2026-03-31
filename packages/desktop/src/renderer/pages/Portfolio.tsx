import React, { useEffect, useState, useCallback } from 'react';
import { formatCurrency, formatCompact } from '../lib/currency';
import { ScoreCard } from '../components/ScoreCard';
import { TrafficLight } from '../components/TrafficLight';
import { DataTable, type Column } from '../components/DataTable';
import { listPositions, listWatchlist, addPosition, getStockPrice, type PortfolioPositionRow, type InvestmentRow } from '../lib/ipc';

interface PositionWithMeta extends PortfolioPositionRow {
  name?: string;
  ticker?: string | null;
  exchange?: string | null;
  currentPrice?: number;
  totalCost?: number;
  currentValue?: number;
  pnl?: number;
  pnlPct?: number;
  returnPct?: number;
  weight?: number;
}

export function Portfolio() {
  const [positions, setPositions] = useState<PositionWithMeta[]>([]);
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ investmentId: '', costBasis: 0, shares: 0 });
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [closingPosition, setClosingPosition] = useState<{ id: string; name: string } | null>(null);
  const [closePrice, setClosePrice] = useState('');

  const buildPositions = useCallback(
    (pos: PortfolioPositionRow[], inv: InvestmentRow[], prices: Record<string, number>): PositionWithMeta[] => {
      const invMap = Object.fromEntries(inv.map((i) => [i.id, i]));

      const enriched: PositionWithMeta[] = pos.map((p) => {
        const meta = invMap[p.investmentId];
        const cp = prices[p.investmentId] ?? p.costBasis;
        const totalCost = p.costBasis * p.shares;
        const currentValue = cp * p.shares;
        const pnl = currentValue - totalCost;
        const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
        return {
          ...p,
          name: meta?.name ?? 'Unknown',
          ticker: meta?.ticker ?? null,
          exchange: meta?.exchange ?? null,
          currentPrice: cp,
          totalCost,
          currentValue,
          pnl,
          pnlPct,
          returnPct: pnlPct,
        };
      });

      // Compute portfolio weights
      const totalValue = enriched.reduce((sum, p) => sum + (p.currentValue ?? 0), 0);
      return enriched.map((p) => ({
        ...p,
        weight: totalValue > 0 ? (p.currentValue ?? 0) / totalValue : 0,
      }));
    },
    [],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [pos, inv] = await Promise.all([listPositions(), listWatchlist()]);
      setInvestments(inv);
      setPositions(buildPositions(pos, inv, currentPrices));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentPrices, buildPositions]);

  useEffect(() => {
    reload();
  }, []);

  // Re-enrich when prices change
  useEffect(() => {
    setPositions((prev) => buildPositions(prev, investments, currentPrices));
  }, [currentPrices, investments, buildPositions]);

  async function handleRefreshPrices() {
    setRefreshing(true);
    try {
      const tickers = positions
        .filter((p) => p.ticker && p.exchange)
        .map((p) => ({ id: p.investmentId, ticker: p.ticker!, exchange: p.exchange! }));

      const results = await Promise.allSettled(
        tickers.map(async ({ id, ticker, exchange }) => {
          const price = await getStockPrice(ticker, exchange);
          return { id, price };
        }),
      );

      const newPrices: Record<string, number> = { ...currentPrices };
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.price !== null) {
          newPrices[r.value.id] = r.value.price;
        }
      }
      setCurrentPrices(newPrices);
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  }

  const totalCost = positions.reduce((sum, p) => sum + (p.totalCost ?? 0), 0);
  const totalValue = positions.reduce((sum, p) => sum + (p.currentValue ?? 0), 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  async function handleAddPosition() {
    if (!addForm.investmentId || !addForm.costBasis || !addForm.shares) return;
    setSaving(true);
    try {
      await addPosition(addForm.investmentId, addForm.costBasis, addForm.shares);
      setShowAddForm(false);
      setAddForm({ investmentId: '', costBasis: 0, shares: 0 });
      await reload();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function openCloseModal(investmentId: string, name: string) {
    setClosingPosition({ id: investmentId, name });
    setClosePrice('');
  }

  async function handleConfirmClose() {
    if (!closingPosition || !closePrice) return;
    const exitPrice = Number(closePrice);
    if (isNaN(exitPrice) || exitPrice <= 0) return;
    try {
      await (window as any).dhando.portfolio.close(closingPosition.id, exitPrice);
      setClosingPosition(null);
      setClosePrice('');
      await reload();
    } catch (err) {
      console.error(err);
    }
  }

  const columns: Column<PositionWithMeta>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div>
          <span className="font-medium text-gray-800">{row.name}</span>
          {row.ticker && <span className="ml-2 text-xs text-gray-400 font-mono">{row.ticker}</span>}
        </div>
      ),
    },
    {
      key: 'shares',
      header: 'Shares',
      align: 'right',
      render: (row) => <span className="text-sm text-gray-700">{row.shares.toLocaleString()}</span>,
    },
    {
      key: 'costBasis',
      header: 'Entry Price',
      align: 'right',
      render: (row) => <span className="text-sm text-gray-600">{formatCurrency(row.costBasis)}</span>,
    },
    {
      key: 'currentPrice',
      header: 'Current Price',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <span className="text-sm text-gray-700">{formatCurrency(row.currentPrice ?? row.costBasis)}</span>
          <input
            type="number"
            placeholder="Update"
            className="w-20 border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-orange-400"
            onBlur={(e) => {
              const val = Number(e.target.value);
              if (val > 0) {
                setCurrentPrices((prev) => ({ ...prev, [row.investmentId]: val }));
              }
            }}
          />
        </div>
      ),
    },
    {
      key: 'totalCost',
      header: 'Total Cost',
      align: 'right',
      render: (row) => <span className="text-sm text-gray-600">{formatCompact(row.totalCost ?? 0)}</span>,
    },
    {
      key: 'currentValue',
      header: 'Current Value',
      align: 'right',
      render: (row) => <span className="text-sm font-medium text-gray-800">{formatCompact(row.currentValue ?? 0)}</span>,
    },
    {
      key: 'pnl',
      header: 'P&L',
      align: 'right',
      render: (row) => {
        const pnl = row.pnl ?? 0;
        return (
          <span
            className="text-sm font-medium"
            style={{ color: pnl >= 0 ? '#788c5d' : '#e05252' }}
          >
            {pnl >= 0 ? '+' : ''}{formatCompact(pnl)}
          </span>
        );
      },
    },
    {
      key: 'pnlPct',
      header: 'P&L %',
      align: 'right',
      render: (row) => {
        const pct = row.pnlPct ?? 0;
        return (
          <span
            className="text-sm font-semibold"
            style={{ color: pct >= 0 ? '#788c5d' : '#e05252' }}
          >
            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
          </span>
        );
      },
    },
    {
      key: 'weight',
      header: 'Weight',
      align: 'right',
      render: (row) => (
        <span className="text-xs text-gray-500">{((row.weight ?? 0) * 100).toFixed(1)}%</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <button
          onClick={() => openCloseModal(row.investmentId, row.name ?? 'Position')}
          className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
        >
          Close
        </button>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Portfolio</h1>
          <p className="text-gray-500 mt-1 text-sm">Active positions, P&amp;L tracking, and rebalancing signals</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshPrices}
            disabled={refreshing || positions.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-90 disabled:opacity-50"
            style={{ color: '#6a9bcc', borderColor: 'rgba(106,155,204,0.4)', backgroundColor: 'rgba(106,155,204,0.06)' }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh Prices'}
          </button>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
            style={{ backgroundColor: '#d97757' }}
          >
            + Add Position
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <ScoreCard label="Total Value" value={formatCompact(totalValue)} color="green" />
        <ScoreCard label="Total Cost" value={formatCompact(totalCost)} subtitle="Cost basis" color="blue" />
        <ScoreCard
          label="Total P&L"
          value={`${totalPnl >= 0 ? '+' : ''}${formatCompact(totalPnl)}`}
          color={totalPnl >= 0 ? 'green' : 'red'}
        />
        <ScoreCard
          label="Return"
          value={`${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}%`}
          subtitle={`${positions.length} position${positions.length !== 1 ? 's' : ''}`}
          color={totalPnlPct >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* Add position form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Add Position</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Investment</label>
              <select
                value={addForm.investmentId}
                onChange={(e) => setAddForm((f) => ({ ...f, investmentId: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              >
                <option value="">Select...</option>
                {investments.map((inv) => (
                  <option key={inv.id} value={inv.id}>{inv.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Entry Price (ZAR per share)</label>
              <input
                type="number"
                value={addForm.costBasis}
                onChange={(e) => setAddForm((f) => ({ ...f, costBasis: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shares</label>
              <input
                type="number"
                value={addForm.shares}
                onChange={(e) => setAddForm((f) => ({ ...f, shares: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>

          {/* Cost preview */}
          {addForm.costBasis > 0 && addForm.shares > 0 && (
            <div className="mb-4 text-xs text-gray-500">
              Total cost: <span className="font-medium text-gray-700">{formatCurrency(addForm.costBasis * addForm.shares)}</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleAddPosition}
              disabled={saving}
              className="px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#d97757' }}
            >
              {saving ? 'Saving...' : 'Add Position'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : (
        <DataTable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          columns={columns as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows={positions as any}
          keyField="id"
          emptyMessage="No positions. Add your first position above or use the + Portfolio button in the Watchlist."
        />
      )}

      {/* Close position modal */}
      {closingPosition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-80">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Close Position</h3>
            <p className="text-xs text-gray-500 mb-4">
              Enter exit price per share for <span className="font-medium text-gray-700">{closingPosition.name}</span>
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Exit Price (ZAR per share)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={closePrice}
              onChange={(e) => setClosePrice(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmClose(); if (e.key === 'Escape') setClosingPosition(null); }}
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 mb-4"
              placeholder="e.g. 52.50"
            />
            <div className="flex gap-3">
              <button
                onClick={handleConfirmClose}
                disabled={!closePrice || Number(closePrice) <= 0}
                className="px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#d97757' }}
              >
                Confirm Close
              </button>
              <button
                onClick={() => setClosingPosition(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Traffic light legend */}
      <div className="mt-8 bg-white rounded-xl border border-gray-200/60 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Traffic Light Factors</h3>
        <p className="text-xs text-gray-500 mb-4">
          Run the traffic light analysis via the Screener + Deal Analyzer pages. The 8 factors are:
          Margin of Safety, Moat Score, Management Score, Altman Z, Piotroski F, Beneish M, Kelly Drift, Sentiment.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {['Margin of Safety', 'Moat Score', 'Management', 'Altman Z', 'Piotroski F', 'Beneish M', 'Kelly Drift', 'Sentiment'].map((factor) => (
            <div key={factor} className="flex items-center gap-2 p-2 rounded border border-gray-100">
              <TrafficLight status="amber" size="sm" />
              <span className="text-xs text-gray-600">{factor}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
