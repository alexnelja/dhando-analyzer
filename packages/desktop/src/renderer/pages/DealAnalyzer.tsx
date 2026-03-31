import React, { useEffect, useState } from 'react';
import { formatCompact } from '../lib/currency';
import { ScoreCard } from '../components/ScoreCard';
import { TrafficLightBadge } from '../components/TrafficLight';
import { DataTable, type Column } from '../components/DataTable';
import { listWatchlist, runDealAnalysis, type InvestmentRow } from '../lib/ipc';

interface ScenarioInput {
  name: 'bear' | 'base' | 'bull';
  revenueGrowthRate: number;
  ebitdaMargin: number;
  exitMultiple: number;
  probability: number;
}

interface DealAnalysis {
  investmentId: string;
  scenarioModel: {
    scenarios: Array<{
      name: string;
      terminalValue: number;
      presentValue: number;
      probability: number;
    }>;
    weightedValue: number;
  };
  dcf: {
    intrinsicValue: number;
    terminalValue: number;
    presentValue: number;
  };
  kelly: {
    kellyFraction: number;
    halfKelly: number;
  };
  kellyPosition: number;
  expectedValue: number;
  intrinsicValue: number;
  marginOfSafety: number;
  memo: {
    thesis: string;
    risks: string[];
    catalysts: string[];
  };
  preMortem: {
    risks: Array<{ factor: string; severity: string; description: string }>;
  };
  blocked: boolean;
}

const DEFAULT_SCENARIOS: ScenarioInput[] = [
  { name: 'bear', revenueGrowthRate: -0.05, ebitdaMargin: 0.08, exitMultiple: 5, probability: 0.25 },
  { name: 'base', revenueGrowthRate: 0.08, ebitdaMargin: 0.15, exitMultiple: 8, probability: 0.50 },
  { name: 'bull', revenueGrowthRate: 0.18, ebitdaMargin: 0.22, exitMultiple: 12, probability: 0.25 },
];

export function DealAnalyzer() {
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [scenarios, setScenarios] = useState<ScenarioInput[]>(DEFAULT_SCENARIOS);
  const [currentPrice, setCurrentPrice] = useState(50);
  const [marketCap, setMarketCap] = useState(500000000);
  const [sharesOutstanding, setSharesOutstanding] = useState(10000000);
  const [baseRevenue, setBaseRevenue] = useState(100000000);
  const [projectionYears, setProjectionYears] = useState(5);
  const [discountRate, setDiscountRate] = useState(0.1);
  const [terminalGrowth, setTerminalGrowth] = useState(0.02);
  const [moatScore, setMoatScore] = useState(3);
  const [managementScore, setManagementScore] = useState(3);
  const [winProbability, setWinProbability] = useState(0.6);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DealAnalysis | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listWatchlist().then(setInvestments).catch(console.error);
  }, []);

  const selectedInvestment = investments.find((i) => i.id === selectedId);
  const screenerDataAvailable = !!(
    selectedInvestment &&
    (selectedInvestment.moat_score !== null ||
      selectedInvestment.management_score !== null ||
      selectedInvestment.intrinsic_value !== null)
  );

  // Sync moat/management scores from stored investment when selection changes
  useEffect(() => {
    if (!selectedInvestment) return;
    if (selectedInvestment.moat_score !== null) {
      setMoatScore(selectedInvestment.moat_score);
    }
    if (selectedInvestment.management_score !== null) {
      setManagementScore(selectedInvestment.management_score);
    }
  }, [selectedId]);

  const probabilitySum = scenarios.reduce((sum, s) => sum + s.probability, 0);
  const probabilitySumOk = Math.abs(probabilitySum - 1.0) <= 0.05;

  function updateScenario(index: number, field: keyof ScenarioInput, value: number) {
    setScenarios((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  async function handleAnalyze() {
    if (!selectedInvestment) {
      setError('Select an investment first');
      return;
    }
    setRunning(true);
    setError('');
    setResult(null);

    const ownerEarnings = selectedInvestment.intrinsic_value !== null
      ? selectedInvestment.intrinsic_value * (sharesOutstanding / 1)  // intrinsic_value is per-share; scale back
      : baseRevenue * 0.12;

    // Use stored screener fields when available, fall back to sensible defaults
    const compositeScore = selectedInvestment.circle_of_competence_fit ?? 58;
    const storedMoat = selectedInvestment.moat_score ?? moatScore;
    const storedManagement = selectedInvestment.management_score ?? managementScore;

    try {
      const input = {
        investmentId: selectedInvestment.id,
        name: selectedInvestment.name,
        ticker: selectedInvestment.ticker,
        sector: selectedInvestment.sector,
        currentPrice,
        marketCap,
        sharesOutstanding,
        screenerResult: {
          altmanZ: { score: 2.5, zone: 'grey' as const },
          piotroskiF: { score: 6 },
          beneishM: { score: -2.5, likelyManipulator: false },
          compositeScore,
          valuation: {
            evEbitda: 8,
            pe: 18,
            pb: 2.1,
            fcfYield: 0.05,
            ownerEarnings: baseRevenue * 0.12,
          },
        },
        moatScore: storedMoat,
        managementScore: storedManagement,
        scenarioInputs: scenarios,
        baseRevenue,
        projectionYears,
        dcfInput: {
          freeCashFlow: ownerEarnings,
          growthRateYear1to5: scenarios[1].revenueGrowthRate,
          terminalGrowthRate: terminalGrowth,
          discountRate,
          projectionYears,
          sharesOutstanding,
        },
        winProbability,
      };

      const res = (await runDealAnalysis(input)) as DealAnalysis;
      setResult(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  const scenarioCols: Column<Record<string, unknown>>[] = [
    { key: 'name', header: 'Scenario', render: (row) => <span className="capitalize font-medium">{String(row.name)}</span> },
    { key: 'terminalValue', header: 'Terminal Value', align: 'right', render: (row) => formatCompact(Number(row.terminalValue)) },
    { key: 'presentValue', header: 'PV', align: 'right', render: (row) => formatCompact(Number(row.presentValue)) },
    { key: 'probability', header: 'Probability', align: 'right', render: (row) => `${(Number(row.probability) * 100).toFixed(0)}%` },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Deal Analyzer</h1>
        <p className="text-gray-500 mt-1 text-sm">Scenario analysis, DCF valuation, Kelly sizing, and pre-mortem</p>
      </div>

      {/* Setup */}
      <div className="bg-white rounded-xl border border-gray-200/60 p-6 mb-6 space-y-5">
        <div className="grid grid-cols-3 gap-4">
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Current Price</label>
            <input type="number" value={currentPrice} onChange={(e) => setCurrentPrice(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Base Revenue</label>
            <input type="number" value={baseRevenue} onChange={(e) => setBaseRevenue(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Discount Rate</label>
            <input type="number" step="0.01" value={discountRate} onChange={(e) => setDiscountRate(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Terminal Growth</label>
            <input type="number" step="0.01" value={terminalGrowth} onChange={(e) => setTerminalGrowth(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Win Probability</label>
            <input type="number" step="0.05" min="0" max="1" value={winProbability} onChange={(e) => setWinProbability(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Projection Years</label>
            <input type="number" value={projectionYears} onChange={(e) => setProjectionYears(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
          </div>
        </div>

        {/* Screener data warning */}
        {selectedInvestment && !screenerDataAvailable && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            Run the Screener first for more accurate analysis. Moat, management, and intrinsic value scores are not yet stored for this investment.
          </div>
        )}

        {/* Scenario inputs */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Scenarios</h3>
          <div className="grid grid-cols-3 gap-4">
            {scenarios.map((scenario, idx) => (
              <div key={scenario.name} className="border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-semibold capitalize mb-2" style={{
                  color: scenario.name === 'bull' ? '#788c5d' : scenario.name === 'base' ? '#6a9bcc' : '#e05252'
                }}>{scenario.name}</p>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-500">Revenue Growth</label>
                    <input type="number" step="0.01" value={scenario.revenueGrowthRate}
                      onChange={(e) => updateScenario(idx, 'revenueGrowthRate', Number(e.target.value))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs mt-0.5 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">EBITDA Margin</label>
                    <input type="number" step="0.01" value={scenario.ebitdaMargin}
                      onChange={(e) => updateScenario(idx, 'ebitdaMargin', Number(e.target.value))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs mt-0.5 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Exit Multiple</label>
                    <input type="number" step="0.5" value={scenario.exitMultiple}
                      onChange={(e) => updateScenario(idx, 'exitMultiple', Number(e.target.value))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs mt-0.5 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Probability</label>
                    <input type="number" step="0.05" min="0" max="1" value={scenario.probability}
                      onChange={(e) => updateScenario(idx, 'probability', Number(e.target.value))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs mt-0.5 focus:outline-none" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Probability sum validator */}
          <div className={`mt-2 text-xs font-medium ${probabilitySumOk ? 'text-gray-400' : 'text-red-600'}`}>
            Probability sum: {probabilitySum.toFixed(2)}
            {!probabilitySumOk && ' — must equal 1.00 (tolerance 0.05)'}
          </div>
        </div>

        {error && <p className="text-red-500 text-xs">{error}</p>}

        <button
          onClick={handleAnalyze}
          disabled={running || !selectedId}
          className="px-5 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: '#d97757' }}
        >
          {running ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <>
          {result.blocked && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5 text-sm text-red-600 font-medium">
              Investment blocked by hard gate rules. Kelly position set to 0.
            </div>
          )}

          <div className="grid grid-cols-4 gap-4 mb-6">
            <ScoreCard label="Intrinsic Value" value={formatCompact(result.intrinsicValue)} color="green" />
            <ScoreCard
              label="Margin of Safety"
              value={`${(result.marginOfSafety * 100).toFixed(1)}%`}
              color={result.marginOfSafety >= 0.25 ? 'green' : result.marginOfSafety >= 0 ? 'orange' : 'red'}
            />
            <ScoreCard label="Expected Value" value={formatCompact(result.expectedValue)} color="blue" />
            <ScoreCard
              label="Kelly Position"
              value={`${(result.kellyPosition * 100).toFixed(1)}%`}
              subtitle="Recommended allocation"
              color="orange"
            />
          </div>

          {result.scenarioModel?.scenarios && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Scenario Analysis</h3>
              <DataTable
                columns={scenarioCols}
                rows={result.scenarioModel.scenarios as unknown as Record<string, unknown>[]}
                keyField="name"
              />
            </div>
          )}

          {result.memo && (
            <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Investment Memo</h3>
              <p className="text-sm text-gray-700 mb-3">{result.memo.thesis}</p>
              {result.memo.risks?.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-gray-500 mb-1">Key Risks</p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                    {result.memo.risks.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {result.memo.catalysts?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Catalysts</p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                    {result.memo.catalysts.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
