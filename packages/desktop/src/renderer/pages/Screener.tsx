import React, { useEffect, useState } from 'react';
import { formatCompact } from '../lib/currency';
import { ScoreCard } from '../components/ScoreCard';
import { TrafficLightBadge, type TrafficLightStatus } from '../components/TrafficLight';
import { DataTable, type Column } from '../components/DataTable';
import { listWatchlist, type InvestmentRow } from '../lib/ipc';

interface FinancialInputs {
  revenue: number;
  netIncome: number;
  grossProfit: number;
  ebitda: number;
  ebit: number;
  totalAssets: number;
  currentAssets: number;
  currentLiabilities: number;
  totalLiabilities: number;
  longTermDebt: number;
  cash: number;
  capex: number;
  fcf: number;
  ppAndE: number;
  retainedEarnings: number;
  operatingCashFlow: number;
  accountsReceivable: number;
  depreciation: number;
  sgaExpenses: number;
  sharesOutstanding: number;
  workingCapital: number;
  totalAssetsLastYear: number;
}

const DEFAULT_FINANCIALS: FinancialInputs = {
  revenue: 100000000,
  netIncome: 12000000,
  grossProfit: 45000000,
  ebitda: 20000000,
  ebit: 15000000,
  totalAssets: 150000000,
  currentAssets: 50000000,
  currentLiabilities: 30000000,
  totalLiabilities: 80000000,
  longTermDebt: 50000000,
  cash: 20000000,
  capex: 5000000,
  fcf: 10000000,
  ppAndE: 40000000,
  retainedEarnings: 35000000,
  operatingCashFlow: 15000000,
  accountsReceivable: 12000000,
  depreciation: 5000000,
  sgaExpenses: 20000000,
  sharesOutstanding: 10000000,
  workingCapital: 20000000,
  totalAssetsLastYear: 145000000,
};

interface ScreenerResult {
  altmanZ: { score: number; zone: string };
  piotroskiF: { score: number; interpretation: string };
  beneishM: { score: number; isManipulator: boolean };
  compositeScore: number;
  valuation: {
    evEbitda: number | null;
    pe: number | null;
    pb: number | null;
    fcfYield: number | null;
    ownerEarnings: number;
  };
  blocked: boolean;
}

function zoneColor(zone: string): TrafficLightStatus {
  if (zone === 'safe') return 'green';
  if (zone === 'grey') return 'amber';
  return 'red';
}

function fScoreColor(score: number): TrafficLightStatus {
  if (score >= 7) return 'green';
  if (score >= 4) return 'amber';
  return 'red';
}

function compositeColor(score: number): 'green' | 'orange' | 'red' {
  if (score >= 60) return 'green';
  if (score >= 35) return 'orange';
  return 'red';
}

export function Screener() {
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [current, setCurrent] = useState({ ...DEFAULT_FINANCIALS });
  const [price, setPrice] = useState(50);
  const [marketCap, setMarketCap] = useState(500000000);
  const [enterpriseValue, setEnterpriseValue] = useState(550000000);
  const [bookValue, setBookValue] = useState(8);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listWatchlist().then(setInvestments).catch(console.error);
  }, []);

  const selectedInvestment = investments.find((i) => i.id === selectedId);

  async function handleRun() {
    if (!selectedInvestment) {
      setError('Select an investment first');
      return;
    }
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const input = {
        investment: {
          id: selectedInvestment.id,
          name: selectedInvestment.name,
          ticker: selectedInvestment.ticker ?? selectedInvestment.name,
        },
        financials: {
          current,
          prior: { ...current, totalAssetsLastYear: current.totalAssets * 0.95 },
        },
        price: {
          price,
          marketCap,
          enterpriseValue,
          bookValuePerShare: bookValue,
        },
      };
      const res = (await window.dhando.screen(input)) as ScreenerResult;
      setResult(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  const valuationRows = result
    ? [
        { metric: 'EV/EBITDA', value: result.valuation.evEbitda?.toFixed(1) ?? 'N/A' },
        { metric: 'P/E', value: result.valuation.pe?.toFixed(1) ?? 'N/A' },
        { metric: 'P/B', value: result.valuation.pb?.toFixed(1) ?? 'N/A' },
        { metric: 'FCF Yield', value: result.valuation.fcfYield ? `${(result.valuation.fcfYield * 100).toFixed(1)}%` : 'N/A' },
        { metric: 'Owner Earnings', value: formatCompact(result.valuation.ownerEarnings) },
      ]
    : [];

  const valCols: Column<(typeof valuationRows)[0]>[] = [
    { key: 'metric', header: 'Metric' },
    { key: 'value', header: 'Value', align: 'right' },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Screener</h1>
        <p className="text-gray-500 mt-1 text-sm">Z-Score, F-Score, M-Score + valuation metrics</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-6 mb-6">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Investment</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            >
              <option value="">Select investment...</option>
              {investments.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.name} {inv.ticker ? `(${inv.ticker})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Share Price</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Market Cap</label>
            <input
              type="number"
              value={marketCap}
              onChange={(e) => setMarketCap(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
        </div>

        <details className="mb-4">
          <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700">
            Financials (click to expand)
          </summary>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {(Object.keys(DEFAULT_FINANCIALS) as (keyof FinancialInputs)[]).map((key) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-0.5 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <input
                  type="number"
                  value={current[key]}
                  onChange={(e) =>
                    setCurrent((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                  }
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-400"
                />
              </div>
            ))}
          </div>
        </details>

        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

        <button
          onClick={handleRun}
          disabled={running || !selectedId}
          className="px-5 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: '#d97757' }}
        >
          {running ? 'Running...' : 'Run Screener'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <>
          {result.blocked && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5 text-sm text-red-600 font-medium">
              Investment blocked by hard gate rules.
            </div>
          )}

          <div className="grid grid-cols-4 gap-4 mb-6">
            <ScoreCard
              label="Composite Score"
              value={`${result.compositeScore.toFixed(0)}/100`}
              subtitle="Higher = better quality"
              color={compositeColor(result.compositeScore)}
              size="lg"
            />
            <div
              className="rounded-lg p-4 border"
              style={{
                backgroundColor: 'rgba(106,155,204,0.08)',
                borderColor: 'rgba(106,155,204,0.2)',
              }}
            >
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Altman Z</p>
              <p className="text-2xl font-bold" style={{ color: '#6a9bcc' }}>
                {result.altmanZ.score.toFixed(2)}
              </p>
              <TrafficLightBadge status={zoneColor(result.altmanZ.zone)} />
            </div>
            <div
              className="rounded-lg p-4 border"
              style={{
                backgroundColor: 'rgba(120,140,93,0.08)',
                borderColor: 'rgba(120,140,93,0.2)',
              }}
            >
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Piotroski F</p>
              <p className="text-2xl font-bold" style={{ color: '#788c5d' }}>
                {result.piotroskiF.score}/9
              </p>
              <TrafficLightBadge status={fScoreColor(result.piotroskiF.score)} />
            </div>
            <div
              className="rounded-lg p-4 border"
              style={
                result.beneishM.isManipulator
                  ? { backgroundColor: 'rgba(224,82,82,0.08)', borderColor: 'rgba(224,82,82,0.2)' }
                  : { backgroundColor: 'rgba(176,174,165,0.08)', borderColor: 'rgba(176,174,165,0.2)' }
              }
            >
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Beneish M</p>
              <p className="text-2xl font-bold" style={{ color: result.beneishM.isManipulator ? '#e05252' : '#b0aea5' }}>
                {result.beneishM.score.toFixed(2)}
              </p>
              <TrafficLightBadge status={result.beneishM.isManipulator ? 'red' : 'green'} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Valuation Metrics
              </h3>
              <DataTable
                columns={valCols}
                rows={valuationRows}
                keyField="metric"
                compact
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Score Interpretation
              </h3>
              <div className="bg-white rounded-lg border border-gray-200/60 p-4 space-y-3 text-sm text-gray-600">
                <p><strong>Z-Score:</strong> {result.altmanZ.zone} zone — {
                  result.altmanZ.zone === 'safe' ? 'financially healthy' :
                  result.altmanZ.zone === 'grey' ? 'moderate risk' : 'distress zone'
                }</p>
                <p><strong>F-Score:</strong> {result.piotroskiF.score}/9 — {
                  result.piotroskiF.score >= 7 ? 'strong financial position' :
                  result.piotroskiF.score >= 4 ? 'average financial health' : 'weak financials'
                }</p>
                <p><strong>M-Score:</strong> {result.beneishM.isManipulator ? 'Earnings manipulation likely' : 'No manipulation flag'}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
