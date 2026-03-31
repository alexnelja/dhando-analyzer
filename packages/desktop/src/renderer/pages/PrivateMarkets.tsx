import React, { useState } from 'react';
import { ScoreCard } from '../components/ScoreCard';
import { TrafficLightBadge } from '../components/TrafficLight';

interface DhandhoFitInput {
  existingBusiness: number;
  simpleBusiness: number;
  distressedBusiness: number;
  durableAdvantage: number;
  betHeavily: number;
  arbitrageOpportunity: number;
  marginOfSafety: number;
  lowRiskHighUncertainty: number;
  copycatNotInnovator: number;
}

interface EmRiskInput {
  politicalInstability: number;
  currencyRisk: number;
  regulatoryRisk: number;
  exitLiquidity: number;
}

interface PrivateMarketsResult {
  dhandhoFit: {
    totalScore: number;
    maxScore: number;
    passesGate: boolean;
    breakdown: Array<{ principle: string; score: number; weight: number; weightedScore: number }>;
  };
  emRisk?: {
    totalScore: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  ownerEarnings: number;
  passesGate: boolean;
}

const DHANDHO_PRINCIPLES: { field: keyof DhandhoFitInput; label: string; weight: number }[] = [
  { field: 'existingBusiness', label: 'Existing business (not startup)', weight: 1 },
  { field: 'simpleBusiness', label: 'Simple business in slow-change industry', weight: 1 },
  { field: 'distressedBusiness', label: 'Distressed business in distressed industry', weight: 1 },
  { field: 'durableAdvantage', label: 'Durable competitive advantage (1.5×)', weight: 1.5 },
  { field: 'betHeavily', label: 'Bet heavily when odds favour', weight: 1 },
  { field: 'arbitrageOpportunity', label: 'Arbitrage opportunity', weight: 1 },
  { field: 'marginOfSafety', label: 'Significant margin of safety (1.5×)', weight: 1.5 },
  { field: 'lowRiskHighUncertainty', label: 'Low risk, high uncertainty (1.5×)', weight: 1.5 },
  { field: 'copycatNotInnovator', label: 'Copycat, not innovator', weight: 1 },
];

const EM_FACTORS: { field: keyof EmRiskInput; label: string }[] = [
  { field: 'politicalInstability', label: 'Political Instability' },
  { field: 'currencyRisk', label: 'Currency Risk' },
  { field: 'regulatoryRisk', label: 'Regulatory Risk' },
  { field: 'exitLiquidity', label: 'Exit Liquidity Risk' },
];

const DEFAULT_DHANDHO: DhandhoFitInput = {
  existingBusiness: 7,
  simpleBusiness: 6,
  distressedBusiness: 5,
  durableAdvantage: 7,
  betHeavily: 6,
  arbitrageOpportunity: 5,
  marginOfSafety: 8,
  lowRiskHighUncertainty: 7,
  copycatNotInnovator: 6,
};

const DEFAULT_EM: EmRiskInput = {
  politicalInstability: 3,
  currencyRisk: 4,
  regulatoryRisk: 3,
  exitLiquidity: 5,
};

export function PrivateMarkets() {
  const [dhandho, setDhandho] = useState<DhandhoFitInput>({ ...DEFAULT_DHANDHO });
  const [emRisk, setEmRisk] = useState<EmRiskInput>({ ...DEFAULT_EM });
  const [includeEmRisk, setIncludeEmRisk] = useState(false);
  const [netIncome, setNetIncome] = useState(10000000);
  const [depreciation, setDepreciation] = useState(2000000);
  const [capex, setCapex] = useState(3000000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PrivateMarketsResult | null>(null);
  const [error, setError] = useState('');

  async function handleAnalyze() {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const input = {
        investmentId: 'manual',
        dhandhoFit: dhandho,
        emRisk: includeEmRisk ? emRisk : undefined,
        netIncome,
        depreciation,
        capex,
      };
      const res = (await window.dhando.privateMarkets.analyze(input)) as PrivateMarketsResult;
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
        <h1 className="text-2xl font-semibold text-gray-900">Private Markets</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Dhandho fit scoring (9 principles), EM risk overlay, owner earnings calculator
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Dhandho Principles */}
        <div className="bg-white rounded-xl border border-gray-200/60 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Dhandho Fit (9 Principles)</h3>
          <div className="space-y-3">
            {DHANDHO_PRINCIPLES.map((principle) => (
              <div key={principle.field}>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-xs text-gray-600">{principle.label}</label>
                  <span className="text-xs font-medium text-gray-700">{dhandho[principle.field]}/10</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={dhandho[principle.field]}
                  onChange={(e) =>
                    setDhandho((prev) => ({
                      ...prev,
                      [principle.field]: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-orange-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* EM Risk + Owner Earnings */}
        <div className="space-y-5">
          {/* Toggle EM Risk */}
          <div className="bg-white rounded-xl border border-gray-200/60 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Emerging Market Risk</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeEmRisk}
                  onChange={(e) => setIncludeEmRisk(e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs text-gray-500">Include</span>
              </label>
            </div>
            {includeEmRisk && (
              <div className="space-y-3">
                {EM_FACTORS.map((factor) => (
                  <div key={factor.field}>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-xs text-gray-600">{factor.label}</label>
                      <span className="text-xs font-medium text-gray-700">{emRisk[factor.field]}/10</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={emRisk[factor.field]}
                      onChange={(e) =>
                        setEmRisk((prev) => ({
                          ...prev,
                          [factor.field]: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-orange-500"
                    />
                  </div>
                ))}
              </div>
            )}
            {!includeEmRisk && (
              <p className="text-xs text-gray-400">EM risk gate skipped for domestic deals.</p>
            )}
          </div>

          {/* Owner Earnings */}
          <div className="bg-white rounded-xl border border-gray-200/60 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Owner Earnings Inputs</h3>
            <div className="space-y-3">
              {[
                { label: 'Net Income', value: netIncome, set: setNetIncome },
                { label: 'Depreciation & Amortisation', value: depreciation, set: setDepreciation },
                { label: 'Capital Expenditure', value: capex, set: setCapex },
              ].map((field) => (
                <div key={field.label}>
                  <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                  <input
                    type="number"
                    value={field.value}
                    onChange={(e) => field.set(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Estimated Owner Earnings</span>
                  <span className="font-semibold" style={{ color: '#788c5d' }}>
                    ${((netIncome + depreciation - capex) / 1e6).toFixed(2)}M
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Net Income + D&A − CapEx</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <button
        onClick={handleAnalyze}
        disabled={running}
        className="px-5 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50 mb-6"
        style={{ backgroundColor: '#d97757' }}
      >
        {running ? 'Analyzing...' : 'Analyze Dhandho Fit'}
      </button>

      {/* Results */}
      {result && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <ScoreCard
              label="Dhandho Score"
              value={`${result.dhandhoFit.totalScore.toFixed(0)} / ${result.dhandhoFit.maxScore}`}
              color={result.dhandhoFit.passesGate ? 'green' : 'red'}
              size="lg"
            />
            <div
              className="rounded-lg p-4 border"
              style={
                result.passesGate
                  ? { backgroundColor: 'rgba(120,140,93,0.08)', borderColor: 'rgba(120,140,93,0.2)' }
                  : { backgroundColor: 'rgba(224,82,82,0.08)', borderColor: 'rgba(224,82,82,0.2)' }
              }
            >
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Gate Result</p>
              <TrafficLightBadge status={result.passesGate ? 'green' : 'red'} />
              <p className="text-sm font-medium mt-2" style={{ color: result.passesGate ? '#788c5d' : '#e05252' }}>
                {result.passesGate ? 'Passes — proceed with analysis' : 'Blocked — criteria not met'}
              </p>
            </div>
            <ScoreCard
              label="Owner Earnings"
              value={`$${(result.ownerEarnings / 1e6).toFixed(2)}M`}
              color="blue"
            />
          </div>

          {/* Principle breakdown */}
          {result.dhandhoFit.breakdown && (
            <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Principle Breakdown</h3>
              <div className="space-y-2">
                {result.dhandhoFit.breakdown.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <span className="w-64 text-xs text-gray-600 shrink-0">{item.principle}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(item.score / 10) * 100}%`,
                          backgroundColor: item.score >= 7 ? '#788c5d' : item.score >= 4 ? '#d97757' : '#e05252',
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right">
                      {item.weightedScore.toFixed(1)} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EM Risk */}
          {result.emRisk && (
            <div className="bg-white rounded-xl border border-gray-200/60 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">EM Risk Assessment</h3>
              <div className="flex items-center gap-4">
                <ScoreCard
                  label="EM Risk Score"
                  value={result.emRisk.totalScore.toFixed(0)}
                  color={result.emRisk.riskLevel === 'low' ? 'green' : result.emRisk.riskLevel === 'medium' ? 'orange' : 'red'}
                />
                <div>
                  <p className="text-xs text-gray-500 mb-1">Risk Level</p>
                  <TrafficLightBadge
                    status={result.emRisk.riskLevel === 'low' ? 'green' : result.emRisk.riskLevel === 'medium' ? 'amber' : 'red'}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
