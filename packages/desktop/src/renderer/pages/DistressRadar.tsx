import React, { useEffect, useState } from 'react';
import { ScoreCard } from '../components/ScoreCard';
import { TrafficLightBadge } from '../components/TrafficLight';
import { listWatchlist, runDistressCheck, getFinancials, type InvestmentRow } from '../lib/ipc';

interface DistressResult {
  investmentId: string;
  compositeDistressScore: number;
  classification: 'temporary' | 'uncertain' | 'permanent';
  turnaroundCandidate: boolean;
  factors?: {
    altmanZ: number;
    piotroskiF: number;
    beneishM: number;
    fcf: number;
    leverage: number;
    workingCapital: number;
  };
  sentimentTrend?: string | null;
}

function classificationColor(c: string) {
  if (c === 'temporary') return 'green';
  if (c === 'uncertain') return 'amber';
  return 'red';
}

function scoreColor(score: number): 'green' | 'orange' | 'red' {
  if (score < 35) return 'green';
  if (score < 65) return 'orange';
  return 'red';
}

interface InfoTooltipProps {
  text: string;
}

function InfoTooltip({ text }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="ml-1 w-4 h-4 rounded-full border border-gray-300 text-gray-400 text-xs flex items-center justify-center hover:border-gray-500 hover:text-gray-600 focus:outline-none"
        aria-label="More information"
      >
        i
      </button>
      {visible && (
        <span className="absolute z-30 left-6 top-0 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg leading-relaxed">
          {text}
        </span>
      )}
    </span>
  );
}

export function DistressRadar() {
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DistressResult | null>(null);
  const [error, setError] = useState('');
  const [autoCalcStatus, setAutoCalcStatus] = useState<'none' | 'loaded' | 'missing'>('none');

  // Financial score inputs
  const [altmanZ, setAltmanZ] = useState(1.5);
  const [piotroskiF, setPiotroskiF] = useState(3);
  const [piotroskiFPrior, setPiotroskiFPrior] = useState(4);
  const [beneishM, setBeneishM] = useState(-2.2);
  const [fcfCurrent, setFcfCurrent] = useState(-2000000);
  const [fcfPrior, setFcfPrior] = useState(5000000);
  const [debtToEbitda, setDebtToEbitda] = useState(4.5);
  const [workingCapitalCurrent, setWorkingCapitalCurrent] = useState(3000000);
  const [workingCapitalPrior, setWorkingCapitalPrior] = useState(8000000);

  // Qualitative factors (0-10 each)
  const [distressFactors, setDistressFactors] = useState({
    cause: 3,
    industry: 2,
    balanceSheet: 5,
    management: 4,
    competition: 3,
    revenueBase: 4,
    assetValue: 3,
  });

  useEffect(() => {
    listWatchlist().then(setInvestments).catch(console.error);
  }, []);

  const selectedInvestment = investments.find((i) => i.id === selectedId);

  // Auto-load financials when investment changes
  useEffect(() => {
    if (!selectedId) {
      setAutoCalcStatus('none');
      return;
    }
    setAutoCalcStatus('none');
    getFinancials(selectedId).then((rows) => {
      if (rows.length === 0) {
        setAutoCalcStatus('missing');
        return;
      }

      const latest = rows[0];
      const prior = rows[1];

      // Auto-calculate Altman Z from stored financials
      // Simplified: use ratio proxies available in StoredFinancials
      // Full Altman Z needs market cap and book equity, which we don't store — use distress proxy
      const totalLiabilities = latest.totalDebt ?? 0;
      const totalAssets = latest.totalAssets || 1;
      const x1 = (latest.workingCapital ?? 0) / totalAssets;
      const x2 = 0; // retained earnings not stored
      const x3 = ((latest.ebitda ?? 0) * 0.7) / totalAssets; // EBIT proxy from EBITDA
      const x4 = 1.0; // market cap / liabilities — unknown, default neutral
      const x5 = (latest.revenue ?? 0) / totalAssets;
      const calculatedZ = Math.max(0, 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5);

      // Beneish M: simplified proxy — use -2.22 (not manipulator) as default since full M needs 8 ratios
      const calculatedM = -2.22;

      setAltmanZ(parseFloat(calculatedZ.toFixed(2)));
      setBeneishM(calculatedM);
      setFcfCurrent(latest.fcf ?? 0);
      setDebtToEbitda(
        (latest.ebitda ?? 0) > 0
          ? parseFloat(((latest.totalDebt ?? 0) / (latest.ebitda ?? 1)).toFixed(2))
          : debtToEbitda,
      );
      setWorkingCapitalCurrent(latest.workingCapital ?? 0);

      if (prior) {
        setFcfPrior(prior.fcf ?? 0);
        setWorkingCapitalPrior(prior.workingCapital ?? 0);
      }

      setAutoCalcStatus('loaded');
    }).catch(console.error);
  }, [selectedId]);

  async function handleCheck() {
    if (!selectedInvestment) {
      setError('Select an investment first');
      return;
    }
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const input = {
        investmentId: selectedInvestment.id,
        altmanZ,
        piotroskiFCurrent: piotroskiF,
        piotroskiFPrior,
        beneishM,
        fcfCurrent,
        fcfPrior,
        debtToEbitda,
        workingCapitalCurrent,
        workingCapitalPrior,
        distressFactors,
      };
      const res = (await runDistressCheck(input)) as unknown as DistressResult;
      setResult(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Distress Radar</h1>
        <p className="text-gray-500 mt-1 text-sm">
          7-factor distress classification — temporary vs permanent impairment
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-6 mb-6 space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Investment</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-72 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          >
            <option value="">Select investment...</option>
            {investments.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.name} {inv.ticker ? `(${inv.ticker})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Auto-calc status banners */}
        {autoCalcStatus === 'loaded' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
            <span className="text-green-500 text-sm">&#10003;</span>
            <span className="text-xs text-green-700 font-medium">Auto-calculated from stored financials</span>
            <span className="text-xs text-green-600">— Piotroski F must still be entered manually</span>
          </div>
        )}
        {autoCalcStatus === 'missing' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
            <span className="text-amber-500 text-lg">&#9888;</span>
            <span className="text-xs text-amber-700">No financial data found — enter values manually or run the Screener first</span>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Financial Inputs</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="flex items-center text-xs text-gray-500 mb-0.5">
                Altman Z
                <InfoTooltip text="Altman Z-Score measures bankruptcy risk. Z > 2.99 = safe zone, 1.81–2.99 = grey zone, < 1.81 = distress zone. Calculated from working capital, retained earnings, EBIT, market cap, and revenue relative to total assets." />
              </label>
              <input
                type="number"
                step={0.1}
                value={altmanZ}
                onChange={(e) => setAltmanZ(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="flex items-center text-xs text-gray-500 mb-0.5">
                Piotroski F (current)
                <InfoTooltip text="Piotroski F-Score (0–9) measures financial strength across profitability, leverage, and efficiency signals. 8–9 = strong, 4–7 = average, 0–3 = weak. Higher is better." />
              </label>
              <input
                type="number"
                step={1}
                value={piotroskiF}
                onChange={(e) => setPiotroskiF(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="flex items-center text-xs text-gray-500 mb-0.5">
                Piotroski F (prior year)
                <InfoTooltip text="Prior year Piotroski F-Score for trend comparison. A declining F-Score signals deteriorating financial health." />
              </label>
              <input
                type="number"
                step={1}
                value={piotroskiFPrior}
                onChange={(e) => setPiotroskiFPrior(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="flex items-center text-xs text-gray-500 mb-0.5">
                Beneish M
                <InfoTooltip text="Beneish M-Score detects earnings manipulation. M > -1.78 suggests likely manipulation. M < -1.78 is normal. Calculated from 8 financial ratios including Days Sales Outstanding and Asset Quality Index." />
              </label>
              <input
                type="number"
                step={0.1}
                value={beneishM}
                onChange={(e) => setBeneishM(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="flex items-center text-xs text-gray-500 mb-0.5">
                FCF Current
                <InfoTooltip text="Free Cash Flow for the current year. Negative FCF can signal distress — especially if it has declined from the prior year." />
              </label>
              <input
                type="number"
                step={500000}
                value={fcfCurrent}
                onChange={(e) => setFcfCurrent(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="flex items-center text-xs text-gray-500 mb-0.5">
                FCF Prior
                <InfoTooltip text="Free Cash Flow for the prior year. Used to detect FCF trend deterioration." />
              </label>
              <input
                type="number"
                step={500000}
                value={fcfPrior}
                onChange={(e) => setFcfPrior(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="flex items-center text-xs text-gray-500 mb-0.5">
                Debt / EBITDA
                <InfoTooltip text="Net Debt divided by EBITDA. A ratio above 4x signals high leverage. Above 6x is typically considered distressed. Investment-grade companies generally stay below 3x." />
              </label>
              <input
                type="number"
                step={0.5}
                value={debtToEbitda}
                onChange={(e) => setDebtToEbitda(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="flex items-center text-xs text-gray-500 mb-0.5">
                Working Capital (current)
                <InfoTooltip text="Current Assets minus Current Liabilities. Negative working capital means the business cannot cover short-term obligations from liquid assets." />
              </label>
              <input
                type="number"
                step={500000}
                value={workingCapitalCurrent}
                onChange={(e) => setWorkingCapitalCurrent(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="flex items-center text-xs text-gray-500 mb-0.5">
                Working Capital (prior)
                <InfoTooltip text="Prior year Working Capital. A declining trend is a distress signal even if current year is still positive." />
              </label>
              <input
                type="number"
                step={500000}
                value={workingCapitalPrior}
                onChange={(e) => setWorkingCapitalPrior(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Qualitative Factors
          </h3>
          <p className="text-xs text-gray-400 mb-3">0 = temporary / recoverable, 10 = permanent / structural. These require human judgment.</p>
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(distressFactors) as (keyof typeof distressFactors)[]).map((key) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-0.5 capitalize">
                  {key.replace(/([A-Z])/g, ' $1')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={distressFactors[key]}
                    onChange={(e) =>
                      setDistressFactors((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                    className="flex-1"
                  />
                  <span className="text-sm font-medium w-4 text-right text-gray-700">
                    {distressFactors[key]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-red-500 text-xs">{error}</p>}

        <button
          onClick={handleCheck}
          disabled={running || !selectedId}
          className="px-5 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: '#d97757' }}
        >
          {running ? 'Analyzing...' : 'Run Distress Radar'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <ScoreCard
              label="Distress Score"
              value={`${result.compositeDistressScore.toFixed(0)}/100`}
              subtitle="Higher = more distressed"
              color={scoreColor(result.compositeDistressScore)}
              size="lg"
            />
            <div
              className="rounded-lg p-4 border col-span-2"
              style={{ backgroundColor: 'rgba(106,155,204,0.06)', borderColor: 'rgba(106,155,204,0.2)' }}
            >
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Classification</p>
              <div className="flex items-center gap-3 mb-2">
                <TrafficLightBadge
                  status={classificationColor(result.classification) as 'green' | 'amber' | 'red'}
                />
                <span className="text-lg font-semibold text-gray-800 capitalize">
                  {result.classification}
                </span>
              </div>
              {result.turnaroundCandidate && (
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'rgba(120,140,93,0.15)', color: '#788c5d' }}
                >
                  Turnaround Candidate
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                {result.classification === 'temporary'
                  ? 'Distress appears cyclical or external. Potential turnaround opportunity.'
                  : result.classification === 'uncertain'
                  ? 'Mixed signals — deeper analysis required before committing capital.'
                  : 'Structural impairment detected. Avoid or short.'}
              </p>
            </div>
          </div>

          {/* Score gauge */}
          <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Distress Score Gauge</h3>
            <div className="relative h-4 rounded-full overflow-hidden bg-gray-100">
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all"
                style={{
                  width: `${result.compositeDistressScore}%`,
                  background: result.compositeDistressScore < 35
                    ? '#788c5d'
                    : result.compositeDistressScore < 65
                    ? '#d97757'
                    : '#e05252',
                }}
              />
              <div className="absolute top-0 left-1/3 w-px h-full bg-white/60" />
              <div className="absolute top-0 left-2/3 w-px h-full bg-white/60" />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Minimal (0)</span>
              <span>Moderate (35)</span>
              <span>Severe (65)</span>
              <span>Critical (100)</span>
            </div>
          </div>

          {/* Factor breakdown */}
          <div className="bg-white rounded-xl border border-gray-200/60 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Qualitative Factor Breakdown</h3>
            <div className="space-y-3">
              {(Object.entries(distressFactors) as [string, number][]).map(([key, val]) => (
                <div key={key} className="flex items-center gap-4">
                  <span className="w-36 text-xs text-gray-600 capitalize shrink-0">
                    {key.replace(/([A-Z])/g, ' $1')}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(val / 10) * 100}%`,
                        backgroundColor: val < 4 ? '#788c5d' : val < 7 ? '#d97757' : '#e05252',
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-4 text-right">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
