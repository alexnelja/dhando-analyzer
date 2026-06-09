import React, { useState } from 'react';
import { formatCompact } from '../lib/currency';
import { ScoreCard } from '../components/ScoreCard';
import { TrafficLightBadge } from '../components/TrafficLight';
import { analyzePrivateMarket } from '../lib/ipc';

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
    principleScores: Array<{ principle: string; score: number; weight: number; weighted: number }>;
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
  { field: 'durableAdvantage', label: 'Durable competitive advantage (1.5x)', weight: 1.5 },
  { field: 'betHeavily', label: 'Bet heavily when odds favour', weight: 1 },
  { field: 'arbitrageOpportunity', label: 'Arbitrage opportunity', weight: 1 },
  { field: 'marginOfSafety', label: 'Significant margin of safety (1.5x)', weight: 1.5 },
  { field: 'lowRiskHighUncertainty', label: 'Low risk, high uncertainty (1.5x)', weight: 1.5 },
  { field: 'copycatNotInnovator', label: 'Copycat, not innovator', weight: 1 },
];

const EM_FACTORS: { field: keyof EmRiskInput; label: string }[] = [
  { field: 'politicalInstability', label: 'Political Instability' },
  { field: 'currencyRisk', label: 'Currency Risk' },
  { field: 'regulatoryRisk', label: 'Regulatory Risk' },
  { field: 'exitLiquidity', label: 'Exit Liquidity Risk' },
];

const PIPELINE_STAGES = ['NDA', 'Screening', 'Meeting', 'Deep DD', 'IC Memo', 'Bidding', 'Closed'] as const;
type PipelineStage = typeof PIPELINE_STAGES[number];

// Pre-filled example deal with realistic SA data
const EXAMPLE_DEAL = {
  name: 'Cape Town Coffee Roasters (Pty) Ltd',
  dealType: 'SME Acquisition',
  description:
    'A 15 year established coffee roasting and distribution business based in Cape Town. Owner is retiring and asking below market price. Strong local brand recognition and loyal distribution network serving 80+ cafes and restaurants across the Western Cape. Proven coffee model with stable recurring revenue. The business operates a single roastery with simple operations.',
  dhandho: {
    existingBusiness: 8,
    simpleBusiness: 7,
    distressedBusiness: 6,
    durableAdvantage: 5,
    betHeavily: 4,
    arbitrageOpportunity: 3,
    marginOfSafety: 7,
    lowRiskHighUncertainty: 6,
    copycatNotInnovator: 8,
  } as DhandhoFitInput,
  netIncome: 650000,
  depreciation: 120000,
  capex: 80000,
  emRisk: {
    politicalInstability: 4,
    currencyRisk: 5,
    regulatoryRisk: 3,
    exitLiquidity: 6,
  } as EmRiskInput,
};

function estimateDhandhoScores(
  description: string,
  financials: { netIncome: number; depreciation: number; capex: number },
): DhandhoFitInput {
  const desc = description.toLowerCase();

  // Principle 1: Existing business — look for age/history keywords
  const yearMatch = desc.match(/(\d+)\s*year/);
  const existingBusiness = yearMatch
    ? Math.min(10, parseInt(yearMatch[1], 10) / 2)
    : 5;

  // Principle 2: Simple business — fewer product lines = simpler
  const simpleBusiness =
    desc.includes('single') || desc.includes('simple')
      ? 8
      : desc.includes('diversified') || desc.includes('complex')
      ? 3
      : 6;

  // Principle 3: Distressed — look for distress keywords
  const distressedBusiness =
    desc.includes('distress') || desc.includes('retiring') || desc.includes('liquidat')
      ? 7
      : desc.includes('discount') || desc.includes('below market')
      ? 6
      : 4;

  // Principle 4: Durable advantage — moat keywords
  const durableAdvantage =
    desc.includes('brand') || desc.includes('patent') || desc.includes('license') || desc.includes('monopol')
      ? 7
      : desc.includes('contract') || desc.includes('loyal')
      ? 6
      : 4;

  // Principle 5: Bet heavily — based on owner earnings margin
  const ownerEarnings = financials.netIncome + financials.depreciation - financials.capex;
  const betHeavily = ownerEarnings > 500000 ? 7 : ownerEarnings > 200000 ? 5 : 3;

  // Principle 6: Arbitrage — pricing keywords
  const arbitrageOpportunity =
    desc.includes('undervalued') || desc.includes('below') || desc.includes('discount') ? 7 : 4;

  // Principle 7: Margin of safety — financial health
  const marginOfSafety = ownerEarnings > 0 ? Math.min(8, Math.round(ownerEarnings / 100000)) : 2;

  // Principle 8: Low risk, high uncertainty
  const lowRiskHighUncertainty =
    desc.includes('stable') || desc.includes('recurring')
      ? 7
      : desc.includes('volatile') || desc.includes('cyclical')
      ? 5
      : 5;

  // Principle 9: Copycat
  const copycatNotInnovator =
    desc.includes('innovat') || desc.includes('disrupt') || desc.includes('first')
      ? 3
      : desc.includes('proven') || desc.includes('established') || desc.includes('franchise')
      ? 8
      : 6;

  return {
    existingBusiness: Math.round(existingBusiness),
    simpleBusiness,
    distressedBusiness,
    durableAdvantage,
    betHeavily,
    arbitrageOpportunity,
    marginOfSafety,
    lowRiskHighUncertainty,
    copycatNotInnovator,
  };
}

export function PrivateMarkets() {
  const [dealName, setDealName] = useState(EXAMPLE_DEAL.name);
  const [dealDescription, setDealDescription] = useState(EXAMPLE_DEAL.description);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('Screening');
  const [dhandho, setDhandho] = useState<DhandhoFitInput>({ ...EXAMPLE_DEAL.dhandho });
  const [emRisk, setEmRisk] = useState<EmRiskInput>({ ...EXAMPLE_DEAL.emRisk });
  const [includeEmRisk, setIncludeEmRisk] = useState(false);
  const [netIncome, setNetIncome] = useState(EXAMPLE_DEAL.netIncome);
  const [depreciation, setDepreciation] = useState(EXAMPLE_DEAL.depreciation);
  const [capex, setCapex] = useState(EXAMPLE_DEAL.capex);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PrivateMarketsResult | null>(null);
  const [error, setError] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [estimateApplied, setEstimateApplied] = useState(false);

  function handleAiEstimate() {
    if (!dealDescription.trim()) return;
    setEstimating(true);
    setEstimateApplied(false);
    // Run synchronously — heuristic, no async needed
    const scores = estimateDhandhoScores(dealDescription, { netIncome, depreciation, capex });
    setDhandho(scores);
    setEstimating(false);
    setEstimateApplied(true);
    setTimeout(() => setEstimateApplied(false), 3000);
  }

  async function handleAnalyze() {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const input = {
        investmentId: 'manual',
        dhandhoFit: dhandho as unknown as Record<string, number>,
        emRisk: includeEmRisk ? emRisk : undefined,
        netIncome,
        depreciation,
        capex,
      };
      const res = (await analyzePrivateMarket(input)) as unknown as PrivateMarketsResult;
      setResult(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  const ownerEarningsLive = netIncome + depreciation - capex;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Private Markets</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Dhandho fit scoring (9 principles), EM risk overlay, owner earnings calculator
        </p>
      </div>

      {/* Deal header */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-5">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Deal Name</label>
            <input
              type="text"
              value={dealName}
              onChange={(e) => setDealName(e.target.value)}
              placeholder="e.g. Cape Town Coffee Roasters (Pty) Ltd"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Deal Description</label>
            <textarea
              value={dealDescription}
              onChange={(e) => setDealDescription(e.target.value)}
              rows={3}
              placeholder="Describe the business — age, industry, distress, competitive advantage..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Pipeline stage */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Deal Pipeline</h3>
        <div className="flex items-center gap-0">
          {PIPELINE_STAGES.map((stage, idx) => {
            const isActive = stage === pipelineStage;
            const isPast = PIPELINE_STAGES.indexOf(stage) < PIPELINE_STAGES.indexOf(pipelineStage);
            return (
              <React.Fragment key={stage}>
                <button
                  onClick={() => setPipelineStage(stage)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    isActive
                      ? 'text-white'
                      : isPast
                      ? 'text-gray-500 bg-gray-100 hover:bg-gray-200'
                      : 'text-gray-400 bg-gray-50 hover:bg-gray-100'
                  }`}
                  style={isActive ? { backgroundColor: '#d97757' } : {}}
                >
                  {stage}
                </button>
                {idx < PIPELINE_STAGES.length - 1 && (
                  <div
                    className="h-0.5 flex-1 min-w-2"
                    style={{ backgroundColor: isPast ? '#d97757' : '#e5e7eb' }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Dhandho Principles */}
        <div className="bg-white rounded-xl border border-gray-200/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Dhandho Fit (9 Principles)</h3>
            <button
              onClick={handleAiEstimate}
              disabled={estimating || !dealDescription.trim()}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                estimateApplied
                  ? 'text-white'
                  : 'text-white hover:opacity-90'
              }`}
              style={{ backgroundColor: estimateApplied ? '#788c5d' : '#6a9bcc' }}
            >
              {estimating ? 'Estimating...' : estimateApplied ? 'Applied' : 'AI Estimate Scores'}
            </button>
          </div>
          {estimateApplied && (
            <p className="text-xs text-green-600 mb-3 bg-green-50 rounded-lg px-3 py-1.5 border border-green-200">
              Scores estimated from deal description. Review and adjust as needed.
            </p>
          )}
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
                    {formatCompact(ownerEarningsLive)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Net Income + D&A - CapEx</p>
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
              value={formatCompact(result.ownerEarnings)}
              color="blue"
            />
          </div>

          {/* Principle breakdown */}
          {result.dhandhoFit.principleScores && (
            <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Principle Breakdown</h3>
              <div className="space-y-2">
                {result.dhandhoFit.principleScores.map((item, idx) => (
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
                      {item.weighted.toFixed(1)} pts
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
