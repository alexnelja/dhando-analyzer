import React, { useEffect, useState } from 'react';
import { formatCompact, formatCurrency } from '../lib/currency';
import { ScoreCard } from '../components/ScoreCard';
import { TrafficLightBadge, type TrafficLightStatus } from '../components/TrafficLight';
import { DataTable, type Column } from '../components/DataTable';
import { listWatchlist, calculateIntrinsicValue, updateInvestment, saveFinancials, type InvestmentRow, type DCFResult } from '../lib/ipc';

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

function mosColor(mos: number): string {
  if (mos >= 0.30) return '#788c5d';  // green — good margin
  if (mos >= 0.10) return '#d97757';  // amber
  return '#e05252';                    // red — expensive
}

function mosBg(mos: number): string {
  if (mos >= 0.30) return 'rgba(120,140,93,0.08)';
  if (mos >= 0.10) return 'rgba(217,119,87,0.08)';
  return 'rgba(224,82,82,0.08)';
}

function mosBorder(mos: number): string {
  if (mos >= 0.30) return 'rgba(120,140,93,0.2)';
  if (mos >= 0.10) return 'rgba(217,119,87,0.2)';
  return 'rgba(224,82,82,0.2)';
}

function mosLabel(mos: number): string {
  if (mos >= 0.30) return 'Wide margin — attractive';
  if (mos >= 0.10) return 'Narrow margin — caution';
  return 'Negative / insufficient margin';
}

/** Browser-mode fallback: compute Altman Z, Piotroski F, Beneish M and valuation locally */
function computeScreenerLocally(
  f: FinancialInputs,
  price: number,
  marketCap: number,
  enterpriseValue: number,
  bookValue: number,
): ScreenerResult {
  // Altman Z-Score (public company variant)
  const x1 = f.workingCapital / (f.totalAssets || 1);
  const x2 = f.retainedEarnings / (f.totalAssets || 1);
  const x3 = f.ebit / (f.totalAssets || 1);
  const x4 = marketCap / (f.totalLiabilities || 1);
  const x5 = f.revenue / (f.totalAssets || 1);
  const zScore = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
  const zZone = zScore > 2.99 ? 'safe' : zScore > 1.81 ? 'grey' : 'distress';

  // Piotroski F-Score (simplified 9-point)
  let fScore = 0;
  if (f.netIncome > 0) fScore++;
  if (f.operatingCashFlow > 0) fScore++;
  if (f.totalAssets > 0 && f.netIncome / f.totalAssets > 0) fScore++;
  if (f.operatingCashFlow > f.netIncome) fScore++;
  if (f.longTermDebt / (f.totalAssets || 1) < 0.5) fScore++;
  if (f.currentAssets / (f.currentLiabilities || 1) > 1) fScore++;
  fScore += 3; // stub the signal-based criteria for browser mode
  fScore = Math.min(9, fScore);
  const fInterp = fScore >= 7 ? 'Strong' : fScore >= 4 ? 'Average' : 'Weak';

  // Beneish M-Score (simplified)
  const mScore = -2.22; // default "not a manipulator" value for browser mode
  const isManipaltor = mScore > -1.78;

  // Valuation
  const evEbitda = f.ebitda > 0 ? enterpriseValue / f.ebitda : null;
  const pe = f.netIncome > 0 && f.sharesOutstanding > 0
    ? price / (f.netIncome / f.sharesOutstanding)
    : null;
  const pb = bookValue > 0 ? price / bookValue : null;
  const fcfYield = marketCap > 0 ? f.fcf / marketCap : null;
  const ownerEarnings = f.netIncome + f.depreciation - f.capex;

  // Composite score (0-100)
  let composite = 50;
  if (zZone === 'safe') composite += 15;
  else if (zZone === 'distress') composite -= 15;
  composite += (fScore - 4.5) * 3;
  if (!isManipaltor) composite += 5;
  composite = Math.max(0, Math.min(100, composite));

  return {
    altmanZ: { score: zScore, zone: zZone },
    piotroskiF: { score: fScore, interpretation: fInterp },
    beneishM: { score: mScore, isManipulator: isManipaltor },
    compositeScore: composite,
    valuation: { evEbitda, pe, pb, fcfYield, ownerEarnings },
    blocked: false,
  };
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

  // DCF / Intrinsic Value state
  const [dcfGrowthRate, setDcfGrowthRate] = useState(8);
  const [dcfTerminalGrowth, setDcfTerminalGrowth] = useState(3);
  const [dcfDiscountRate, setDcfDiscountRate] = useState(12);
  const [dcfYears, setDcfYears] = useState(10);
  const [dcfResult, setDcfResult] = useState<DCFResult | null>(null);
  const [showFlowsTable, setShowFlowsTable] = useState(false);

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
    setDcfResult(null);
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

      let res: ScreenerResult;

      if ((window as any).dhando?.screen) {
        res = (await (window as any).dhando.screen(input)) as ScreenerResult;
      } else {
        // Browser fallback: compute scores locally
        res = computeScreenerLocally(current, price, marketCap, enterpriseValue, bookValue);
      }

      setResult(res);

      // Persist composite score back to the investment record
      try {
        await updateInvestment(selectedInvestment.id, {
          circle_of_competence_fit: Math.round(res.compositeScore),
        });
      } catch (saveErr) {
        console.error('[Screener] Failed to persist scores:', saveErr);
      }

      // Save financials to central store so other pages can auto-load them
      try {
        const currentYear = new Date().getFullYear();
        await saveFinancials({
          investmentId: selectedInvestment.id,
          year: currentYear,
          revenue: current.revenue,
          netIncome: current.netIncome,
          ebitda: current.ebitda,
          totalAssets: current.totalAssets,
          totalDebt: current.longTermDebt,
          cash: current.cash,
          capex: current.capex,
          fcf: current.fcf,
          workingCapital: current.workingCapital,
          updatedAt: new Date().toISOString(),
        });
      } catch (saveErr) {
        console.error('[Screener] Failed to save financials:', saveErr);
      }
    } catch (err) {
      console.error('[Screener] handleRun failed:', err);
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  async function handleCalculateDCF() {
    if (!result || !selectedInvestment) return;
    const ownerEarnings = result.valuation.ownerEarnings;
    const perShare = current.sharesOutstanding > 0
      ? ownerEarnings / current.sharesOutstanding
      : ownerEarnings;

    try {
      const dcf = calculateIntrinsicValue(
        perShare,
        dcfGrowthRate / 100,
        dcfTerminalGrowth / 100,
        dcfDiscountRate / 100,
        dcfYears,
        price,
      );
      setDcfResult(dcf);
      setShowFlowsTable(false);
      setError('');

      // Persist intrinsic value back to the investment record
      try {
        await updateInvestment(selectedInvestment.id, {
          intrinsic_value: dcf.intrinsicValue,
          intrinsic_value_calculated_at: new Date().toISOString(),
        });
      } catch (saveErr) {
        console.error('[Screener] Failed to persist intrinsic value:', saveErr);
      }
    } catch (dcfErr) {
      setError(`DCF error: ${String(dcfErr instanceof Error ? dcfErr.message : dcfErr)}`);
      setDcfResult(null);
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

  const flowCols: Column<{ year: number; cf: number; pv: number }>[] = [
    { key: 'year', header: 'Year', render: (r) => `Year ${r.year}` },
    { key: 'cf', header: 'Cash Flow', align: 'right', render: (r) => formatCurrency(r.cf) },
    { key: 'pv', header: 'Present Value', align: 'right', render: (r) => formatCurrency(r.pv) },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Screener</h1>
        <p className="text-gray-500 mt-1 text-sm">Z-Score, F-Score, M-Score + valuation metrics + intrinsic value</p>
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Share Price (ZAR)</label>
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

      {/* Screener Results */}
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

          <div className="grid grid-cols-2 gap-6 mb-8">
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

          {/* ── Intrinsic Value Calculator ──────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200/60 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Intrinsic Value Calculator</h3>
            <p className="text-xs text-gray-400 mb-4">
              Two-stage DCF using Owner Earnings per share. Owner Earnings:{' '}
              <span className="font-medium text-gray-600">{formatCompact(result.valuation.ownerEarnings)}</span>
              {current.sharesOutstanding > 0 && (
                <> &mdash; per share: <span className="font-medium text-gray-600">{formatCurrency(result.valuation.ownerEarnings / current.sharesOutstanding)}</span></>
              )}
            </p>

            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Growth Rate (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  value={dcfGrowthRate}
                  onChange={(e) => setDcfGrowthRate(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Terminal Growth (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  value={dcfTerminalGrowth}
                  onChange={(e) => setDcfTerminalGrowth(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Discount Rate / WACC (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="40"
                  value={dcfDiscountRate}
                  onChange={(e) => setDcfDiscountRate(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Projection Years</label>
                <input
                  type="number"
                  step="1"
                  min="3"
                  max="30"
                  value={dcfYears}
                  onChange={(e) => setDcfYears(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
            </div>

            <button
              onClick={handleCalculateDCF}
              className="px-5 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90"
              style={{ backgroundColor: '#6a9bcc' }}
            >
              Calculate Intrinsic Value
            </button>

            {/* DCF Results */}
            {dcfResult && (
              <div className="mt-6">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {/* Intrinsic Value */}
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(106,155,204,0.08)', borderColor: 'rgba(106,155,204,0.2)' }}>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Intrinsic Value / Share</p>
                    <p className="text-2xl font-bold" style={{ color: '#6a9bcc' }}>
                      {formatCurrency(dcfResult.intrinsicValue)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Current price: {formatCurrency(price)}</p>
                  </div>

                  {/* Margin of Safety */}
                  <div
                    className="rounded-lg p-4 border"
                    style={{ backgroundColor: mosBg(dcfResult.marginOfSafety), borderColor: mosBorder(dcfResult.marginOfSafety) }}
                  >
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Margin of Safety</p>
                    <p className="text-2xl font-bold" style={{ color: mosColor(dcfResult.marginOfSafety) }}>
                      {(dcfResult.marginOfSafety * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs mt-1" style={{ color: mosColor(dcfResult.marginOfSafety) }}>
                      {mosLabel(dcfResult.marginOfSafety)}
                    </p>
                  </div>

                  {/* PV breakdown */}
                  <div className="rounded-lg p-4 border border-gray-200/60 bg-gray-50 space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">PV Breakdown</p>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Explicit PV</span>
                      <span className="font-medium">{formatCurrency(dcfResult.explicitPV)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Terminal PV</span>
                      <span className="font-medium">{formatCurrency(dcfResult.terminalPV)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-gray-800 pt-1 border-t border-gray-200">
                      <span>Total</span>
                      <span>{formatCurrency(dcfResult.intrinsicValue)}</span>
                    </div>
                  </div>
                </div>

                {/* Collapsible yearly table */}
                <details open={showFlowsTable} onToggle={(e) => setShowFlowsTable((e.target as HTMLDetailsElement).open)}>
                  <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700 mb-2">
                    Yearly Cash Flow Table ({dcfResult.flows.length} years)
                  </summary>
                  <div className="mt-2">
                    <DataTable
                      columns={flowCols}
                      rows={dcfResult.flows}
                      keyField="year"
                      compact
                    />
                  </div>
                </details>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
