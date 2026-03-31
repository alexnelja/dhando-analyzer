import React, { useEffect, useState } from 'react';
import { ScoreCard } from '../components/ScoreCard';
import { TrafficLightBadge } from '../components/TrafficLight';
import { listWatchlist, runDistressCheck, type InvestmentRow } from '../lib/ipc';

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

const FACTOR_LABELS: Record<string, string> = {
  altmanZ: 'Altman Z',
  piotroskiF: 'Piotroski F',
  beneishM: 'Beneish M',
  fcf: 'FCF Trend',
  leverage: 'Leverage',
  workingCapital: 'Working Capital',
};

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

export function DistressRadar() {
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DistressResult | null>(null);
  const [error, setError] = useState('');

  // Distress inputs
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

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Financial Inputs</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Altman Z', value: altmanZ, set: setAltmanZ, step: 0.1 },
              { label: 'Piotroski F (current)', value: piotroskiF, set: setPiotroskiF, step: 1 },
              { label: 'Piotroski F (prior)', value: piotroskiFPrior, set: setPiotroskiFPrior, step: 1 },
              { label: 'Beneish M', value: beneishM, set: setBeneishM, step: 0.1 },
              { label: 'FCF Current', value: fcfCurrent, set: setFcfCurrent, step: 500000 },
              { label: 'FCF Prior', value: fcfPrior, set: setFcfPrior, step: 500000 },
              { label: 'Debt/EBITDA', value: debtToEbitda, set: setDebtToEbitda, step: 0.5 },
              { label: 'Working Capital (current)', value: workingCapitalCurrent, set: setWorkingCapitalCurrent, step: 500000 },
              { label: 'Working Capital (prior)', value: workingCapitalPrior, set: setWorkingCapitalPrior, step: 500000 },
            ].map((field) => (
              <div key={field.label}>
                <label className="block text-xs text-gray-500 mb-0.5">{field.label}</label>
                <input
                  type="number"
                  step={field.step}
                  value={field.value}
                  onChange={(e) => field.set(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Qualitative Factors (0 = temporary, 10 = permanent)
          </h3>
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
