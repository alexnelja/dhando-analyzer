import React, { useEffect, useState, useCallback } from 'react';
import { ScoreCard } from '../components/ScoreCard';
import { TrafficLight, TrafficLightBadge, type TrafficLightStatus } from '../components/TrafficLight';
import { DataTable, type Column } from '../components/DataTable';
import { listPositions, listWatchlist, type PortfolioPositionRow, type InvestmentRow } from '../lib/ipc';

interface PositionWithMeta extends PortfolioPositionRow {
  name?: string;
  ticker?: string | null;
  currentPrice?: number;
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

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [pos, inv] = await Promise.all([listPositions(), listWatchlist()]);
      const invMap = Object.fromEntries(inv.map((i) => [i.id, i]));

      const enriched: PositionWithMeta[] = pos.map((p) => {
        const meta = invMap[p.investmentId];
        const cp = currentPrices[p.investmentId] ?? p.costBasis;
        const currentValue = cp * p.shares;
        const costValue = p.costBasis * p.shares;
        return {
          ...p,
          name: meta?.name ?? 'Unknown',
          ticker: meta?.ticker,
          currentPrice: cp,
          returnPct: ((currentValue - costValue) / costValue) * 100,
        };
      });

      // Compute weights
      const totalValue = enriched.reduce((sum, p) => sum + (p.currentPrice ?? p.costBasis) * p.shares, 0);
      const withWeights = enriched.map((p) => ({
        ...p,
        weight: totalValue > 0 ? ((p.currentPrice ?? p.costBasis) * p.shares) / totalValue : 0,
      }));

      setPositions(withWeights);
      setInvestments(inv);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentPrices]);

  useEffect(() => {
    reload();
  }, []);

  const totalValue = positions.reduce(
    (sum, p) => sum + (p.currentPrice ?? p.costBasis) * p.shares,
    0,
  );

  const avgReturn = positions.length > 0
    ? positions.reduce((sum, p) => sum + (p.returnPct ?? 0), 0) / positions.length
    : 0;

  async function handleAddPosition() {
    if (!addForm.investmentId || !addForm.costBasis || !addForm.shares) return;
    setSaving(true);
    try {
      await window.dhando.portfolio.upsert(addForm);
      setShowAddForm(false);
      setAddForm({ investmentId: '', costBasis: 0, shares: 0 });
      await reload();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleClose(investmentId: string) {
    const price = prompt('Exit price per share:');
    if (!price) return;
    try {
      await window.dhando.portfolio.close(investmentId, Number(price));
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
    { key: 'shares', header: 'Shares', align: 'right', render: (row) => row.shares.toLocaleString() },
    { key: 'costBasis', header: 'Cost', align: 'right', render: (row) => `$${row.costBasis.toFixed(2)}` },
    {
      key: 'currentPrice',
      header: 'Price',
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <span>${(row.currentPrice ?? row.costBasis).toFixed(2)}</span>
          <input
            type="number"
            placeholder="Update"
            className="w-20 border border-gray-200 rounded px-1 py-0.5 text-xs"
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
      key: 'returnPct',
      header: 'Return',
      align: 'right',
      render: (row) => {
        const ret = row.returnPct ?? 0;
        return (
          <span style={{ color: ret >= 0 ? '#788c5d' : '#e05252' }} className="font-medium">
            {ret >= 0 ? '+' : ''}{ret.toFixed(1)}%
          </span>
        );
      },
    },
    {
      key: 'weight',
      header: 'Weight',
      align: 'right',
      render: (row) => `${((row.weight ?? 0) * 100).toFixed(1)}%`,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <button
          onClick={() => handleClose(row.investmentId)}
          className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
        >
          Close
        </button>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Portfolio</h1>
          <p className="text-gray-500 mt-1 text-sm">Active positions, traffic-light indicators, and rebalancing signals</p>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
          style={{ backgroundColor: '#d97757' }}
        >
          + Add Position
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <ScoreCard label="Total Value" value={`$${(totalValue / 1e6).toFixed(2)}M`} color="green" />
        <ScoreCard label="Positions" value={positions.length} subtitle="Active holdings" color="blue" />
        <ScoreCard
          label="Avg Return"
          value={`${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(1)}%`}
          color={avgReturn >= 0 ? 'green' : 'red'}
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Cost Basis (per share)</label>
              <input type="number" value={addForm.costBasis} onChange={(e) => setAddForm((f) => ({ ...f, costBasis: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shares</label>
              <input type="number" value={addForm.shares} onChange={(e) => setAddForm((f) => ({ ...f, shares: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleAddPosition} disabled={saving}
              className="px-4 py-2 text-sm text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#d97757' }}>
              {saving ? 'Saving...' : 'Add Position'}
            </button>
            <button onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-300">
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
          emptyMessage="No positions. Add your first position above."
        />
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
