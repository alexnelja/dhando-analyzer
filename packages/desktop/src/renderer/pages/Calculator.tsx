import React, { useState, useCallback, useEffect } from 'react';
import { formatPct, formatMultiple, formatNumber } from '../lib/format';
import { listWatchlist, getFinancials, type InvestmentRow, type Financial } from '../lib/ipc';

/*
 * Usage example:
 *
 * import { Calculator } from './pages/Calculator';
 * <Route path="/calculator" element={<Calculator />} />
 */

// ── Types ────────────────────────────────────────────────────────────────────

type TabId = 'valuation' | 'quality' | 'risk' | 'growth' | 'macro' | 'momentum';
type Interpretation = 'positive' | 'neutral' | 'negative';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'valuation', label: 'Valuation', icon: '◈' },
  { id: 'quality',   label: 'Quality',   icon: '✓' },
  { id: 'risk',      label: 'Risk',      icon: '⚡' },
  { id: 'growth',    label: 'Growth',    icon: '↗' },
  { id: 'macro',     label: 'Macro',     icon: '◉' },
  { id: 'momentum',  label: 'Momentum',  icon: '〰' },
];

// ── Shared sub-components ────────────────────────────────────────────────────

function CalcInput({
  label,
  value,
  onChange,
  suffix,
  tooltip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  tooltip?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{' '}
        {tooltip && (
          <span className="text-gray-400 cursor-help" title={tooltip}>
            ℹ
          </span>
        )}
      </label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
        />
        {suffix && (
          <span className="absolute right-3 top-2 text-gray-400 text-xs pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function CalculatorCard({
  title,
  description,
  children,
  result,
  interpretation,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  result: React.ReactNode | null;
  interpretation?: Interpretation;
}) {
  const resultBg =
    interpretation === 'positive'
      ? 'bg-green-50 border-green-200'
      : interpretation === 'negative'
      ? 'bg-red-50 border-red-200'
      : 'bg-amber-50 border-amber-200';

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-5 mb-4">
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-4">{description}</p>
      <div className="grid grid-cols-2 gap-3 mb-4">{children}</div>
      {result !== null && (
        <div className={`p-3 rounded-lg border ${result ? resultBg : 'bg-gray-50 border-gray-200'}`}>
          {result}
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function InterpretationBadge({
  text,
  interpretation,
}: {
  text: string;
  interpretation: Interpretation;
}) {
  const cls =
    interpretation === 'positive'
      ? 'text-green-700 font-medium'
      : interpretation === 'negative'
      ? 'text-red-600 font-medium'
      : 'text-amber-700 font-medium';
  return <p className={`text-xs mt-1 ${cls}`}>{text}</p>;
}

// Helper to parse a numeric string safely
function n(v: string): number {
  return parseFloat(v) || 0;
}

/** Valuation-tab fields that can be pre-filled from a stored financial. */
export interface ValuationPrefill {
  roicEbit: string;
  roicWC: string;
  roicFA: string;
  evfcfMktCap: string;
  evfcfDebt: string;
  evfcfCash: string;
  evfcfFCF: string;
}

const numStr = (v: number | null | undefined): string => (v == null ? '' : String(v));

/**
 * Map a stored financial (+ the investment's market cap) onto the Valuation
 * tab's input fields. Pure and string-valued so it can seed `useState` inputs
 * directly; absent figures map to '' (left blank for the user to fill).
 */
export function buildValuationPrefill(
  fin: Financial,
  marketCap: number | null,
): ValuationPrefill {
  const ebit =
    fin.ebit ??
    (fin.ebitda != null && fin.depreciation != null ? fin.ebitda - fin.depreciation : null);
  const wc =
    fin.workingCapital ??
    (fin.currentAssets != null && fin.currentLiabilities != null
      ? fin.currentAssets - fin.currentLiabilities
      : null);
  return {
    roicEbit: numStr(ebit),
    roicWC: numStr(wc),
    roicFA: numStr(fin.ppe),
    evfcfMktCap: numStr(marketCap),
    evfcfDebt: numStr(fin.totalDebt ?? fin.totalLiabilities),
    evfcfCash: numStr(fin.cash),
    evfcfFCF: numStr(fin.fcf),
  };
}

// ── Tab: Valuation ────────────────────────────────────────────────────────────

function ValuationTab({ prefill }: { prefill?: ValuationPrefill }) {
  // ROIC
  const [roicNopat, setRoicNopat] = useState('');
  const [roicIC, setRoicIC] = useState('');
  const [roicEbit, setRoicEbit] = useState('');
  const [roicTax, setRoicTax] = useState('25');
  const [roicWC, setRoicWC] = useState('');
  const [roicFA, setRoicFA] = useState('');
  const roicResult = useCallback(() => {
    const nopat = n(roicNopat) || n(roicEbit) * (1 - n(roicTax) / 100);
    const ic = n(roicIC) || n(roicWC) + n(roicFA);
    if (!ic) return null;
    return { nopat, ic, roic: nopat / ic };
  }, [roicNopat, roicIC, roicEbit, roicTax, roicWC, roicFA]);
  const roicR = roicResult();

  // PEG
  const [pegPE, setPegPE] = useState('');
  const [pegGrowth, setPegGrowth] = useState('');
  const pegResult = useCallback(() => {
    if (!n(pegPE) || !n(pegGrowth)) return null;
    return n(pegPE) / n(pegGrowth);
  }, [pegPE, pegGrowth]);
  const pegR = pegResult();

  // EV/FCF
  const [evfcfMktCap, setEvfcfMktCap] = useState('');
  const [evfcfDebt, setEvfcfDebt] = useState('');
  const [evfcfCash, setEvfcfCash] = useState('');
  const [evfcfFCF, setEvfcfFCF] = useState('');
  const evfcfResult = useCallback(() => {
    if (!n(evfcfFCF)) return null;
    const ev = n(evfcfMktCap) + n(evfcfDebt) - n(evfcfCash);
    return { ev, ratio: ev / n(evfcfFCF) };
  }, [evfcfMktCap, evfcfDebt, evfcfCash, evfcfFCF]);
  const evfcfR = evfcfResult();

  // Seed inputs from a selected investment's stored financials. These remain
  // freely editable afterwards — what-if overrides are never persisted.
  useEffect(() => {
    if (!prefill) return;
    setRoicEbit(prefill.roicEbit);
    setRoicWC(prefill.roicWC);
    setRoicFA(prefill.roicFA);
    setEvfcfMktCap(prefill.evfcfMktCap);
    setEvfcfDebt(prefill.evfcfDebt);
    setEvfcfCash(prefill.evfcfCash);
    setEvfcfFCF(prefill.evfcfFCF);
  }, [prefill]);

  // Gordon Growth DDM
  const [ddmDiv, setDdmDiv] = useState('');
  const [ddmReq, setDdmReq] = useState('');
  const [ddmGrowth, setDdmGrowth] = useState('');
  const ddmResult = useCallback(() => {
    const spread = n(ddmReq) - n(ddmGrowth);
    if (!n(ddmDiv) || spread <= 0) return null;
    return n(ddmDiv) / (spread / 100);
  }, [ddmDiv, ddmReq, ddmGrowth]);
  const ddmR = ddmResult();

  // Risk-Reward Asymmetry
  const [rrBullProb, setRrBullProb] = useState('');
  const [rrBullReturn, setRrBullReturn] = useState('');
  const [rrBearProb, setRrBearProb] = useState('');
  const [rrBearReturn, setRrBearReturn] = useState('');
  const rrResult = useCallback(() => {
    const wu = n(rrBullProb) / 100 * n(rrBullReturn);
    const wd = n(rrBearProb) / 100 * Math.abs(n(rrBearReturn));
    if (!wd) return null;
    return { wu, wd, ratio: wu / wd };
  }, [rrBullProb, rrBullReturn, rrBearProb, rrBearReturn]);
  const rrR = rrResult();

  return (
    <div>
      {/* ROIC Decomposition */}
      <CalculatorCard
        title="ROIC Decomposition"
        description="Return on Invested Capital = NOPAT / Invested Capital. Enter NOPAT directly or derive it from EBIT and tax rate."
        result={
          roicR ? (
            <div className="space-y-1.5">
              <ResultRow label="NOPAT" value={formatNumber(roicR.nopat)} />
              <ResultRow label="Invested Capital" value={formatNumber(roicR.ic)} />
              <ResultRow label="ROIC" value={formatPct(roicR.roic)} />
              <InterpretationBadge
                text={
                  roicR.roic >= 0.15
                    ? 'Excellent — ROIC well above typical cost of capital (10-12%)'
                    : roicR.roic >= 0.10
                    ? 'Adequate — ROIC covers cost of capital'
                    : 'Weak — ROIC below typical cost of capital, value destruction likely'
                }
                interpretation={roicR.roic >= 0.15 ? 'positive' : roicR.roic >= 0.10 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          roicR ? (roicR.roic >= 0.15 ? 'positive' : roicR.roic >= 0.10 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="NOPAT" value={roicNopat} onChange={setRoicNopat} tooltip="Net Operating Profit After Tax. Optional if EBIT + tax rate provided." />
        <CalcInput label="Invested Capital" value={roicIC} onChange={setRoicIC} tooltip="Working Capital + Net Fixed Assets. Optional if components provided." />
        <CalcInput label="EBIT (alternative)" value={roicEbit} onChange={setRoicEbit} tooltip="Used to derive NOPAT if NOPAT not entered directly." />
        <CalcInput label="Tax Rate" value={roicTax} onChange={setRoicTax} suffix="%" tooltip="Effective tax rate used to derive NOPAT from EBIT." />
        <CalcInput label="Net Working Capital" value={roicWC} onChange={setRoicWC} tooltip="Current Assets minus Current Liabilities." />
        <CalcInput label="Net Fixed Assets" value={roicFA} onChange={setRoicFA} tooltip="PP&E net of depreciation." />
      </CalculatorCard>

      {/* PEG Ratio */}
      <CalculatorCard
        title="PEG Ratio"
        description="Price/Earnings divided by Earnings Growth Rate. PEG < 1 suggests undervaluation relative to growth."
        result={
          pegR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="PEG Ratio" value={formatMultiple(pegR)} />
              <InterpretationBadge
                text={
                  pegR < 1
                    ? 'Undervalued relative to growth — PEG < 1'
                    : pegR <= 2
                    ? 'Fairly valued — PEG between 1 and 2'
                    : 'Expensive relative to growth — PEG > 2'
                }
                interpretation={pegR < 1 ? 'positive' : pegR <= 2 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          pegR !== null ? (pegR < 1 ? 'positive' : pegR <= 2 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="P/E Ratio" value={pegPE} onChange={setPegPE} tooltip="Price per share divided by earnings per share." />
        <CalcInput label="Earnings Growth Rate" value={pegGrowth} onChange={setPegGrowth} suffix="%" tooltip="Expected annual EPS growth rate as a percentage (e.g. enter 15 for 15%)." />
      </CalculatorCard>

      {/* EV/FCF */}
      <CalculatorCard
        title="EV / Free Cash Flow"
        description="Enterprise Value divided by Free Cash Flow. Lower ratios indicate cheaper valuation. EV = Market Cap + Debt - Cash."
        result={
          evfcfR ? (
            <div className="space-y-1.5">
              <ResultRow label="Enterprise Value" value={formatNumber(evfcfR.ev)} />
              <ResultRow label="EV/FCF" value={formatMultiple(evfcfR.ratio)} />
              <InterpretationBadge
                text={
                  evfcfR.ratio < 15
                    ? 'Cheap — EV/FCF below 15x'
                    : evfcfR.ratio <= 25
                    ? 'Fair — EV/FCF 15–25x'
                    : 'Expensive — EV/FCF above 25x'
                }
                interpretation={evfcfR.ratio < 15 ? 'positive' : evfcfR.ratio <= 25 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          evfcfR ? (evfcfR.ratio < 15 ? 'positive' : evfcfR.ratio <= 25 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Market Cap" value={evfcfMktCap} onChange={setEvfcfMktCap} tooltip="Current market capitalisation." />
        <CalcInput label="Total Debt" value={evfcfDebt} onChange={setEvfcfDebt} tooltip="Short-term plus long-term debt." />
        <CalcInput label="Cash & Equivalents" value={evfcfCash} onChange={setEvfcfCash} tooltip="Cash and short-term investments." />
        <CalcInput label="Free Cash Flow" value={evfcfFCF} onChange={setEvfcfFCF} tooltip="Operating cash flow minus capex." />
      </CalculatorCard>

      {/* Gordon Growth DDM */}
      <CalculatorCard
        title="Gordon Growth Dividend Discount Model"
        description="Intrinsic value = Dividend / (Required Return - Growth Rate). Both rates entered as percentages."
        result={
          ddmR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="Intrinsic Value" value={`R ${ddmR.toFixed(2)}`} />
              <InterpretationBadge
                text="Compare to current share price — if price < intrinsic value, stock is potentially undervalued."
                interpretation="neutral"
              />
            </div>
          ) : null
        }
        interpretation="neutral"
      >
        <CalcInput label="Annual Dividend" value={ddmDiv} onChange={setDdmDiv} suffix="R" tooltip="Expected annual dividend per share." />
        <CalcInput label="Required Return" value={ddmReq} onChange={setDdmReq} suffix="%" tooltip="Your minimum acceptable rate of return." />
        <CalcInput label="Dividend Growth Rate" value={ddmGrowth} onChange={setDdmGrowth} suffix="%" tooltip="Expected perpetual growth rate of the dividend. Must be less than required return." />
      </CalculatorCard>

      {/* Risk-Reward Asymmetry */}
      <CalculatorCard
        title="Risk-Reward Asymmetry"
        description="Weighted Upside / Weighted Downside across bull and bear scenarios. Ratio > 3 is attractive."
        result={
          rrR ? (
            <div className="space-y-1.5">
              <ResultRow label="Weighted Upside" value={`${rrR.wu.toFixed(1)}%`} />
              <ResultRow label="Weighted Downside" value={`${rrR.wd.toFixed(1)}%`} />
              <ResultRow label="Asymmetry Ratio" value={formatMultiple(rrR.ratio)} />
              <InterpretationBadge
                text={
                  rrR.ratio >= 3
                    ? 'Attractive asymmetry — upside outweighs downside by 3x or more'
                    : rrR.ratio >= 2
                    ? 'Acceptable — moderate asymmetry'
                    : 'Unattractive — insufficient upside relative to downside risk'
                }
                interpretation={rrR.ratio >= 3 ? 'positive' : rrR.ratio >= 2 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          rrR ? (rrR.ratio >= 3 ? 'positive' : rrR.ratio >= 2 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Bull Probability" value={rrBullProb} onChange={setRrBullProb} suffix="%" tooltip="Probability of the bull scenario occurring." />
        <CalcInput label="Bull Return" value={rrBullReturn} onChange={setRrBullReturn} suffix="%" tooltip="Expected return in the bull scenario." />
        <CalcInput label="Bear Probability" value={rrBearProb} onChange={setRrBearProb} suffix="%" tooltip="Probability of the bear scenario occurring." />
        <CalcInput label="Bear Loss" value={rrBearReturn} onChange={setRrBearReturn} suffix="%" tooltip="Expected loss (as a positive percentage) in the bear scenario." />
      </CalculatorCard>
    </div>
  );
}

// ── Tab: Quality ──────────────────────────────────────────────────────────────

function QualityTab() {
  // Sloan Accrual
  const [sloanNI, setSloanNI] = useState('');
  const [sloanOCF, setSloanOCF] = useState('');
  const [sloanTA, setSloanTA] = useState('');
  const sloanResult = useCallback(() => {
    if (!n(sloanTA)) return null;
    return (n(sloanNI) - n(sloanOCF)) / n(sloanTA);
  }, [sloanNI, sloanOCF, sloanTA]);
  const sloanR = sloanResult();

  // Cash Conversion
  const [ccOCF, setCcOCF] = useState('');
  const [ccNI, setCcNI] = useState('');
  const ccResult = useCallback(() => {
    if (!n(ccNI)) return null;
    return n(ccOCF) / n(ccNI);
  }, [ccOCF, ccNI]);
  const ccR = ccResult();

  // Earnings Persistence (manual 5-year inputs)
  const [ep, setEp] = useState(['', '', '', '', '']);
  const epResult = useCallback(() => {
    const vals = ep.map(n).filter((v, i) => ep[i] !== '');
    if (vals.length < 3) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / Math.abs(mean);
    return { mean, stdDev, cv };
  }, [ep]);
  const epR = epResult();

  return (
    <div>
      {/* Sloan Accrual Ratio */}
      <CalculatorCard
        title="Sloan Accrual Ratio"
        description="(Net Income - Operating Cash Flow) / Total Assets. Measures earnings quality — large accruals suggest aggressive accounting."
        result={
          sloanR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="Accrual Ratio" value={formatPct(sloanR)} />
              <InterpretationBadge
                text={
                  sloanR < -0.10
                    ? 'High quality — cash earnings substantially exceed reported net income'
                    : sloanR <= 0.10
                    ? 'Acceptable — accruals within normal range'
                    : 'Low quality — large positive accruals; earnings may be overstated'
                }
                interpretation={sloanR < -0.10 ? 'positive' : sloanR <= 0.10 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          sloanR !== null
            ? sloanR < -0.10
              ? 'positive'
              : sloanR <= 0.10
              ? 'neutral'
              : 'negative'
            : undefined
        }
      >
        <CalcInput label="Net Income" value={sloanNI} onChange={setSloanNI} tooltip="Reported net income for the period." />
        <CalcInput label="Operating Cash Flow" value={sloanOCF} onChange={setSloanOCF} tooltip="Cash flow from operations." />
        <CalcInput label="Total Assets" value={sloanTA} onChange={setSloanTA} tooltip="Total assets from the balance sheet." />
      </CalculatorCard>

      {/* Cash Conversion Score */}
      <CalculatorCard
        title="Cash Conversion Score"
        description="Operating Cash Flow / Net Income. A ratio > 1.0 means more cash is collected than reported profit."
        result={
          ccR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="Cash Conversion" value={formatMultiple(ccR)} />
              <InterpretationBadge
                text={
                  ccR > 1.0
                    ? 'Strong — OCF exceeds net income, high earnings quality'
                    : ccR >= 0.8
                    ? 'Acceptable — OCF within 80–100% of net income'
                    : 'Weak — OCF significantly below net income, investigate accruals'
                }
                interpretation={ccR > 1.0 ? 'positive' : ccR >= 0.8 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          ccR !== null ? (ccR > 1.0 ? 'positive' : ccR >= 0.8 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Operating Cash Flow" value={ccOCF} onChange={setCcOCF} tooltip="Cash flow from operations." />
        <CalcInput label="Net Income" value={ccNI} onChange={setCcNI} tooltip="Reported net income for the period." />
      </CalculatorCard>

      {/* Earnings Persistence */}
      <CalculatorCard
        title="Earnings Persistence"
        description="Stability of earnings over 5 years measured by coefficient of variation. Enter EPS or net income for each year."
        result={
          epR ? (
            <div className="space-y-1.5">
              <ResultRow label="Average Earnings" value={formatNumber(epR.mean)} />
              <ResultRow label="Std Deviation" value={formatNumber(epR.stdDev)} />
              <ResultRow label="Coeff. of Variation" value={formatPct(epR.cv)} />
              <InterpretationBadge
                text={
                  epR.cv < 0.15
                    ? 'Highly persistent — earnings very stable year to year'
                    : epR.cv < 0.35
                    ? 'Moderately persistent — some variability but generally consistent'
                    : 'Low persistence — highly volatile earnings, harder to forecast'
                }
                interpretation={epR.cv < 0.15 ? 'positive' : epR.cv < 0.35 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          epR ? (epR.cv < 0.15 ? 'positive' : epR.cv < 0.35 ? 'neutral' : 'negative') : undefined
        }
      >
        {ep.map((val, i) => (
          <CalcInput
            key={i}
            label={`Year ${i + 1} Earnings`}
            value={val}
            onChange={(v) => setEp((prev) => prev.map((x, j) => (j === i ? v : x)))}
            tooltip={`Earnings (EPS or net income) for year ${i + 1}.`}
          />
        ))}
      </CalculatorCard>
    </div>
  );
}

// ── Tab: Risk ─────────────────────────────────────────────────────────────────

function RiskTab() {
  // Sharpe
  const [sharpReturn, setSharpReturn] = useState('');
  const [sharpRF, setSharpRF] = useState('');
  const [sharpStd, setSharpStd] = useState('');
  const sharpeResult = useCallback(() => {
    if (!n(sharpStd)) return null;
    return (n(sharpReturn) - n(sharpRF)) / n(sharpStd);
  }, [sharpReturn, sharpRF, sharpStd]);
  const sharpeR = sharpeResult();

  // Sortino
  const [sortinoReturn, setSortinoReturn] = useState('');
  const [sortinoRF, setSortinoRF] = useState('');
  const [sortinoDev, setSortinoDev] = useState('');
  const sortinoResult = useCallback(() => {
    if (!n(sortinoDev)) return null;
    return (n(sortinoReturn) - n(sortinoRF)) / n(sortinoDev);
  }, [sortinoReturn, sortinoRF, sortinoDev]);
  const sortinoR = sortinoResult();

  // Max Drawdown
  const [mdPeak, setMdPeak] = useState('');
  const [mdTrough, setMdTrough] = useState('');
  const mdResult = useCallback(() => {
    if (!n(mdPeak)) return null;
    return (n(mdPeak) - n(mdTrough)) / n(mdPeak);
  }, [mdPeak, mdTrough]);
  const mdR = mdResult();

  // Beta
  const [betaCov, setBetaCov] = useState('');
  const [betaVar, setBetaVar] = useState('');
  const betaResult = useCallback(() => {
    if (!n(betaVar)) return null;
    return n(betaCov) / n(betaVar);
  }, [betaCov, betaVar]);
  const betaR = betaResult();

  return (
    <div>
      {/* Sharpe */}
      <CalculatorCard
        title="Sharpe Ratio"
        description="(Portfolio Return - Risk-Free Rate) / Standard Deviation. Measures risk-adjusted return. All inputs as percentages."
        result={
          sharpeR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="Sharpe Ratio" value={sharpeR.toFixed(2)} />
              <InterpretationBadge
                text={
                  sharpeR >= 2
                    ? 'Excellent — Sharpe above 2.0, outstanding risk-adjusted return'
                    : sharpeR >= 1
                    ? 'Good — Sharpe above 1.0, acceptable risk-adjusted return'
                    : sharpeR >= 0
                    ? 'Suboptimal — positive return but poor compensation for risk taken'
                    : 'Poor — negative Sharpe, return below risk-free rate'
                }
                interpretation={sharpeR >= 2 ? 'positive' : sharpeR >= 1 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          sharpeR !== null ? (sharpeR >= 2 ? 'positive' : sharpeR >= 1 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Portfolio Return" value={sharpReturn} onChange={setSharpReturn} suffix="%" tooltip="Annualised portfolio return as a percentage." />
        <CalcInput label="Risk-Free Rate" value={sharpRF} onChange={setSharpRF} suffix="%" tooltip="Current risk-free rate (e.g. 10-year government bond yield)." />
        <CalcInput label="Std Deviation" value={sharpStd} onChange={setSharpStd} suffix="%" tooltip="Annualised standard deviation of portfolio returns." />
      </CalculatorCard>

      {/* Sortino */}
      <CalculatorCard
        title="Sortino Ratio"
        description="(Return - Risk-Free Rate) / Downside Deviation. Like Sharpe but penalises only downside volatility."
        result={
          sortinoR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="Sortino Ratio" value={sortinoR.toFixed(2)} />
              <InterpretationBadge
                text={
                  sortinoR >= 2
                    ? 'Excellent — strong return relative to downside risk'
                    : sortinoR >= 1
                    ? 'Good — adequate downside risk-adjusted return'
                    : 'Poor — return does not justify the downside risk'
                }
                interpretation={sortinoR >= 2 ? 'positive' : sortinoR >= 1 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          sortinoR !== null ? (sortinoR >= 2 ? 'positive' : sortinoR >= 1 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Portfolio Return" value={sortinoReturn} onChange={setSortinoReturn} suffix="%" tooltip="Annualised portfolio return." />
        <CalcInput label="Risk-Free Rate" value={sortinoRF} onChange={setSortinoRF} suffix="%" tooltip="Current risk-free rate." />
        <CalcInput label="Downside Deviation" value={sortinoDev} onChange={setSortinoDev} suffix="%" tooltip="Standard deviation of only negative return periods." />
      </CalculatorCard>

      {/* Max Drawdown */}
      <CalculatorCard
        title="Maximum Drawdown"
        description="(Peak Value - Trough Value) / Peak Value. The largest peak-to-trough decline over a period."
        result={
          mdR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="Max Drawdown" value={formatPct(mdR)} />
              <InterpretationBadge
                text={
                  mdR < 0.1
                    ? 'Low drawdown — portfolio has been resilient'
                    : mdR < 0.25
                    ? 'Moderate drawdown — within typical equity bear market range'
                    : 'Severe drawdown — significant capital loss, review risk management'
                }
                interpretation={mdR < 0.1 ? 'positive' : mdR < 0.25 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          mdR !== null ? (mdR < 0.1 ? 'positive' : mdR < 0.25 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Peak Portfolio Value" value={mdPeak} onChange={setMdPeak} tooltip="Highest portfolio value reached during the period." />
        <CalcInput label="Trough Portfolio Value" value={mdTrough} onChange={setMdTrough} tooltip="Lowest value reached after the peak." />
      </CalculatorCard>

      {/* Beta */}
      <CalculatorCard
        title="Beta Calculator"
        description="Beta = Covariance(Stock, Market) / Variance(Market). Measures sensitivity to market movements."
        result={
          betaR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="Beta" value={betaR.toFixed(2)} />
              <InterpretationBadge
                text={
                  betaR < 0.8
                    ? 'Defensive — stock moves less than the market'
                    : betaR <= 1.2
                    ? 'Market-like — stock closely tracks the market'
                    : 'Aggressive — stock amplifies market moves, higher risk and potential return'
                }
                interpretation={betaR < 0.8 ? 'positive' : betaR <= 1.2 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          betaR !== null ? (betaR < 0.8 ? 'positive' : betaR <= 1.2 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Covariance (Stock, Market)" value={betaCov} onChange={setBetaCov} tooltip="Covariance between the stock's returns and the market's returns." />
        <CalcInput label="Variance (Market)" value={betaVar} onChange={setBetaVar} tooltip="Variance of the market's returns." />
      </CalculatorCard>
    </div>
  );
}

// ── Tab: Growth ───────────────────────────────────────────────────────────────

function GrowthTab() {
  // Rule of 40
  const [r40Growth, setR40Growth] = useState('');
  const [r40Margin, setR40Margin] = useState('');
  const r40Result = useCallback(() => {
    if (r40Growth === '' && r40Margin === '') return null;
    return n(r40Growth) + n(r40Margin);
  }, [r40Growth, r40Margin]);
  const r40R = r40Result();

  // CAC/LTV
  const [ltv, setLtv] = useState('');
  const [cac, setCac] = useState('');
  const cacResult = useCallback(() => {
    if (!n(cac)) return null;
    return n(ltv) / n(cac);
  }, [ltv, cac]);
  const cacR = cacResult();

  // Net Revenue Retention
  const [nrrStart, setNrrStart] = useState('');
  const [nrrExpansion, setNrrExpansion] = useState('');
  const [nrrContraction, setNrrContraction] = useState('');
  const [nrrChurn, setNrrChurn] = useState('');
  const nrrResult = useCallback(() => {
    if (!n(nrrStart)) return null;
    const ending = n(nrrStart) + n(nrrExpansion) - n(nrrContraction) - n(nrrChurn);
    return (ending / n(nrrStart)) * 100;
  }, [nrrStart, nrrExpansion, nrrContraction, nrrChurn]);
  const nrrR = nrrResult();

  // Unit Economics
  const [uePrice, setUePrice] = useState('');
  const [ueVarCost, setUeVarCost] = useState('');
  const [ueUnits, setUeUnits] = useState('');
  const ueResult = useCallback(() => {
    const cm = n(uePrice) - n(ueVarCost);
    const cmPct = n(uePrice) ? cm / n(uePrice) : 0;
    const totalCM = cm * n(ueUnits);
    return { cm, cmPct, totalCM };
  }, [uePrice, ueVarCost, ueUnits]);
  const ueR = ueResult();
  const ueHasInput = uePrice !== '' || ueVarCost !== '';

  return (
    <div>
      {/* Rule of 40 */}
      <CalculatorCard
        title="Rule of 40"
        description="Revenue Growth % + Profit Margin %. For SaaS companies, a score >= 40 indicates a healthy balance between growth and profitability."
        result={
          r40R !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="Rule of 40 Score" value={`${r40R.toFixed(1)}`} />
              <InterpretationBadge
                text={
                  r40R >= 60
                    ? 'Exceptional — elite SaaS business combining rapid growth and strong margins'
                    : r40R >= 40
                    ? 'Healthy — passes the Rule of 40, good balance of growth and profit'
                    : 'Below benchmark — growth + margins do not meet the 40% threshold'
                }
                interpretation={r40R >= 60 ? 'positive' : r40R >= 40 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          r40R !== null ? (r40R >= 60 ? 'positive' : r40R >= 40 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Revenue Growth Rate" value={r40Growth} onChange={setR40Growth} suffix="%" tooltip="YoY revenue growth as a percentage." />
        <CalcInput label="Profit Margin" value={r40Margin} onChange={setR40Margin} suffix="%" tooltip="Net profit or EBITDA margin as a percentage. Can be negative." />
      </CalculatorCard>

      {/* CAC/LTV */}
      <CalculatorCard
        title="LTV / CAC Ratio"
        description="Lifetime Value divided by Customer Acquisition Cost. LTV/CAC > 3x is considered healthy for SaaS businesses."
        result={
          cacR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="LTV/CAC" value={formatMultiple(cacR)} />
              <InterpretationBadge
                text={
                  cacR >= 5
                    ? 'Excellent — every rand spent on acquisition returns 5x in lifetime value'
                    : cacR >= 3
                    ? 'Healthy — LTV/CAC meets the 3x benchmark'
                    : 'Weak — LTV/CAC below 3x, may indicate unsustainable acquisition economics'
                }
                interpretation={cacR >= 5 ? 'positive' : cacR >= 3 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          cacR !== null ? (cacR >= 5 ? 'positive' : cacR >= 3 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Lifetime Value (LTV)" value={ltv} onChange={setLtv} tooltip="Average revenue generated by a customer over their lifetime." />
        <CalcInput label="Customer Acquisition Cost (CAC)" value={cac} onChange={setCac} tooltip="Total cost to acquire one new customer." />
      </CalculatorCard>

      {/* Net Revenue Retention */}
      <CalculatorCard
        title="Net Revenue Retention (NRR)"
        description="Measures revenue retained from existing customers including expansion, contraction, and churn. >120% = excellent."
        result={
          nrrR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="NRR" value={`${nrrR.toFixed(1)}%`} />
              <InterpretationBadge
                text={
                  nrrR >= 120
                    ? 'Excellent — existing customers are expanding faster than they churn'
                    : nrrR >= 100
                    ? 'Healthy — retaining and slightly growing existing revenue'
                    : 'Declining — losing more to churn/contraction than gaining from expansion'
                }
                interpretation={nrrR >= 120 ? 'positive' : nrrR >= 100 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          nrrR !== null ? (nrrR >= 120 ? 'positive' : nrrR >= 100 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Starting ARR" value={nrrStart} onChange={setNrrStart} tooltip="Annual recurring revenue at the start of the period from existing cohort." />
        <CalcInput label="Expansion Revenue" value={nrrExpansion} onChange={setNrrExpansion} tooltip="Upsells and cross-sells to existing customers during the period." />
        <CalcInput label="Contraction Revenue" value={nrrContraction} onChange={setNrrContraction} tooltip="Downgrades from existing customers during the period." />
        <CalcInput label="Churned Revenue" value={nrrChurn} onChange={setNrrChurn} tooltip="Revenue lost due to cancellations during the period." />
      </CalculatorCard>

      {/* Unit Economics */}
      <CalculatorCard
        title="Unit Economics"
        description="Contribution margin per unit = Price - Variable Cost. Measures the incremental profit generated by each additional unit sold."
        result={
          ueHasInput ? (
            <div className="space-y-1.5">
              <ResultRow label="Contribution Margin / Unit" value={`R ${ueR.cm.toFixed(2)}`} />
              <ResultRow label="Contribution Margin %" value={formatPct(ueR.cmPct)} />
              {ueUnits !== '' && (
                <ResultRow label="Total Contribution Margin" value={formatNumber(ueR.totalCM)} />
              )}
              <InterpretationBadge
                text={
                  ueR.cmPct >= 0.5
                    ? 'Strong unit economics — high contribution margin supports fixed cost coverage'
                    : ueR.cmPct >= 0.3
                    ? 'Moderate — adequate margin but watch fixed cost leverage'
                    : ueR.cmPct >= 0
                    ? 'Thin — low contribution margin, vulnerable to cost increases'
                    : 'Negative — selling below variable cost, unsustainable'
                }
                interpretation={ueR.cmPct >= 0.5 ? 'positive' : ueR.cmPct >= 0.3 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={ueHasInput ? (ueR.cmPct >= 0.5 ? 'positive' : ueR.cmPct >= 0.3 ? 'neutral' : 'negative') : undefined}
      >
        <CalcInput label="Price per Unit" value={uePrice} onChange={setUePrice} suffix="R" tooltip="Selling price per unit." />
        <CalcInput label="Variable Cost per Unit" value={ueVarCost} onChange={setUeVarCost} suffix="R" tooltip="Direct variable cost per unit (materials, labour, etc.)." />
        <CalcInput label="Units Sold (optional)" value={ueUnits} onChange={setUeUnits} tooltip="Number of units sold — used to compute total contribution margin." />
      </CalculatorCard>
    </div>
  );
}

// ── Tab: Macro ────────────────────────────────────────────────────────────────

function MacroTab() {
  // CAPE
  const [capePrice, setCapePrice] = useState('');
  const [capeAvgEarnings, setCapeAvgEarnings] = useState('');
  const capeResult = useCallback(() => {
    if (!n(capeAvgEarnings)) return null;
    return n(capePrice) / n(capeAvgEarnings);
  }, [capePrice, capeAvgEarnings]);
  const capeR = capeResult();

  // Yield Curve
  const [yc10, setYc10] = useState('');
  const [yc2, setYc2] = useState('');
  const ycResult = useCallback(() => {
    if (yc10 === '' || yc2 === '') return null;
    return n(yc10) - n(yc2);
  }, [yc10, yc2]);
  const ycR = ycResult();

  // VIX
  const [vix, setVix] = useState('');
  const vixR = vix !== '' ? n(vix) : null;

  return (
    <div>
      {/* Shiller CAPE */}
      <CalculatorCard
        title="Shiller CAPE Ratio"
        description="Cyclically Adjusted Price-to-Earnings: Price divided by 10-year average real earnings. Developed by Robert Shiller."
        result={
          capeR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="CAPE Ratio" value={`${capeR.toFixed(1)}x`} />
              <InterpretationBadge
                text={
                  capeR < 15
                    ? 'Cheap — CAPE below 15, historically attractive entry point'
                    : capeR <= 25
                    ? 'Fair value — CAPE in the 15–25 range, historical average ~17'
                    : capeR <= 35
                    ? 'Expensive — CAPE above 25, elevated valuation with lower future returns expected'
                    : 'Extremely overvalued — CAPE above 35, rare territory associated with bubbles'
                }
                interpretation={capeR < 15 ? 'positive' : capeR <= 25 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          capeR !== null ? (capeR < 15 ? 'positive' : capeR <= 25 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="Current Price (Index Level)" value={capePrice} onChange={setCapePrice} tooltip="Current price of the index or stock." />
        <CalcInput label="10-Year Average Real Earnings" value={capeAvgEarnings} onChange={setCapeAvgEarnings} tooltip="Average inflation-adjusted earnings over the past 10 years." />
      </CalculatorCard>

      {/* Yield Curve */}
      <CalculatorCard
        title="Yield Curve Spread"
        description="10-Year Government Bond Yield minus 2-Year Yield. Negative spread (inversion) has historically preceded recessions."
        result={
          ycR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="10Y - 2Y Spread" value={`${ycR.toFixed(2)}%`} />
              <InterpretationBadge
                text={
                  ycR > 1
                    ? 'Steep curve — healthy growth environment, banks profitable to lend'
                    : ycR >= 0
                    ? 'Flat curve — slowing growth signal, approaching neutral'
                    : 'Inverted — recession warning signal; inversions have preceded most US recessions'
                }
                interpretation={ycR > 1 ? 'positive' : ycR >= 0 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          ycR !== null ? (ycR > 1 ? 'positive' : ycR >= 0 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="10-Year Yield" value={yc10} onChange={setYc10} suffix="%" tooltip="Current yield on 10-year government bonds." />
        <CalcInput label="2-Year Yield" value={yc2} onChange={setYc2} suffix="%" tooltip="Current yield on 2-year government bonds." />
      </CalculatorCard>

      {/* VIX */}
      <CalculatorCard
        title="VIX Sentiment Indicator"
        description="CBOE Volatility Index. Measures market expectation of near-term volatility. Known as the 'fear gauge'."
        result={
          vixR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="VIX Level" value={vixR.toFixed(1)} />
              <InterpretationBadge
                text={
                  vixR < 15
                    ? 'Complacent — low fear, markets potentially overconfident'
                    : vixR < 25
                    ? 'Normal — typical market uncertainty range'
                    : vixR < 35
                    ? 'Fear — elevated uncertainty, potential opportunity for patient buyers'
                    : 'Panic — extreme fear, historically associated with market bottoms and buying opportunities'
                }
                interpretation={vixR < 15 ? 'neutral' : vixR < 25 ? 'positive' : vixR < 35 ? 'neutral' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={
          vixR !== null ? (vixR < 15 ? 'neutral' : vixR < 25 ? 'positive' : vixR < 35 ? 'neutral' : 'negative') : undefined
        }
      >
        <CalcInput label="VIX Level" value={vix} onChange={setVix} tooltip="Current CBOE VIX index level." />
      </CalculatorCard>
    </div>
  );
}

// ── Tab: Momentum ─────────────────────────────────────────────────────────────

function MomentumTab() {
  // RSI
  const [rsiAvgGain, setRsiAvgGain] = useState('');
  const [rsiAvgLoss, setRsiAvgLoss] = useState('');
  const rsiResult = useCallback(() => {
    if (!n(rsiAvgLoss) && rsiAvgLoss !== '') return 100;
    if (rsiAvgGain === '' && rsiAvgLoss === '') return null;
    if (n(rsiAvgLoss) === 0) return 100;
    const rs = n(rsiAvgGain) / n(rsiAvgLoss);
    return 100 - 100 / (1 + rs);
  }, [rsiAvgGain, rsiAvgLoss]);
  const rsiR = rsiResult();

  // Moving Average Crossover
  const [ma50, setMa50] = useState('');
  const [ma200, setMa200] = useState('');
  const maResult = useCallback(() => {
    if (!n(ma50) || !n(ma200)) return null;
    const diff = n(ma50) - n(ma200);
    const pct = (diff / n(ma200)) * 100;
    return { diff, pct, isGolden: n(ma50) > n(ma200) };
  }, [ma50, ma200]);
  const maR = maResult();

  return (
    <div>
      {/* RSI */}
      <CalculatorCard
        title="Relative Strength Index (RSI)"
        description="RSI = 100 - (100 / (1 + AvgGain / AvgLoss)) over 14 periods. Measures momentum and overbought/oversold conditions."
        result={
          rsiR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="RSI (14)" value={rsiR.toFixed(1)} />
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Oversold (0)</span>
                  <span>Neutral (50)</span>
                  <span>Overbought (100)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 relative">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(Math.max(rsiR, 0), 100)}%`,
                      backgroundColor: rsiR > 70 ? '#e05252' : rsiR < 30 ? '#788c5d' : '#d97757',
                    }}
                  />
                </div>
              </div>
              <InterpretationBadge
                text={
                  rsiR > 70
                    ? 'Overbought — RSI above 70, potential reversal or pullback signal'
                    : rsiR < 30
                    ? 'Oversold — RSI below 30, potential bounce or reversal signal'
                    : 'Neutral — RSI in normal range, no extreme momentum signal'
                }
                interpretation={rsiR > 70 ? 'negative' : rsiR < 30 ? 'positive' : 'neutral'}
              />
            </div>
          ) : null
        }
        interpretation={
          rsiR !== null ? (rsiR > 70 ? 'negative' : rsiR < 30 ? 'positive' : 'neutral') : undefined
        }
      >
        <CalcInput label="Average Gain (14 periods)" value={rsiAvgGain} onChange={setRsiAvgGain} tooltip="Average of all up-period closes over the last 14 periods." />
        <CalcInput label="Average Loss (14 periods)" value={rsiAvgLoss} onChange={setRsiAvgLoss} tooltip="Average of all down-period closes (as a positive number) over the last 14 periods." />
      </CalculatorCard>

      {/* Moving Average Crossover */}
      <CalculatorCard
        title="Moving Average Crossover"
        description="50-day vs 200-day simple moving average. Golden Cross (50 > 200) = bullish. Death Cross (50 < 200) = bearish."
        result={
          maR !== null ? (
            <div className="space-y-1.5">
              <ResultRow label="50-day MA" value={`R ${n(ma50).toFixed(2)}`} />
              <ResultRow label="200-day MA" value={`R ${n(ma200).toFixed(2)}`} />
              <ResultRow label="Spread" value={`${maR.pct >= 0 ? '+' : ''}${maR.pct.toFixed(2)}%`} />
              <div
                className="mt-1 inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold"
                style={
                  maR.isGolden
                    ? { backgroundColor: '#f59e0b22', color: '#b45309' }
                    : { backgroundColor: '#e0525222', color: '#e05252' }
                }
              >
                {maR.isGolden ? 'Golden Cross — Bullish Signal' : 'Death Cross — Bearish Signal'}
              </div>
              <InterpretationBadge
                text={
                  maR.isGolden
                    ? 'The 50-day MA is above the 200-day MA — upward momentum confirmed'
                    : 'The 50-day MA is below the 200-day MA — downward momentum confirmed'
                }
                interpretation={maR.isGolden ? 'positive' : 'negative'}
              />
            </div>
          ) : null
        }
        interpretation={maR !== null ? (maR.isGolden ? 'positive' : 'negative') : undefined}
      >
        <CalcInput label="50-Day Moving Average" value={ma50} onChange={setMa50} suffix="R" tooltip="Current 50-day simple moving average of the stock price." />
        <CalcInput label="200-Day Moving Average" value={ma200} onChange={setMa200} suffix="R" tooltip="Current 200-day simple moving average of the stock price." />
      </CalculatorCard>
    </div>
  );
}

// ── Main Calculator Page ──────────────────────────────────────────────────────

export function Calculator() {
  const [activeTab, setActiveTab] = useState<TabId>('valuation');
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [prefillId, setPrefillId] = useState('');
  const [valuationPrefill, setValuationPrefill] = useState<ValuationPrefill | undefined>(undefined);

  useEffect(() => {
    listWatchlist().then(setInvestments).catch(console.error);
  }, []);

  async function handlePrefill(id: string) {
    setPrefillId(id);
    if (!id) {
      setValuationPrefill(undefined);
      return;
    }
    const inv = investments.find((i) => i.id === id);
    const rows = await getFinancials(id);
    const current = rows[0];
    if (current) {
      setActiveTab('valuation');
      setValuationPrefill(buildValuationPrefill(current, inv?.market_cap ?? null));
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Calculator</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Financial methodology calculators — enter inputs and results update automatically.
          </p>
        </div>
        <div className="shrink-0">
          <label className="block text-xs text-gray-500 mb-1">Pre-fill from investment</label>
          <select
            value={prefillId}
            onChange={(e) => handlePrefill(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-56"
          >
            <option value="">None (manual)</option>
            {investments.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.name}
                {inv.ticker ? ` (${inv.ticker})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <span className="text-xs">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'valuation' && <ValuationTab prefill={valuationPrefill} />}
      {activeTab === 'quality'   && <QualityTab />}
      {activeTab === 'risk'      && <RiskTab />}
      {activeTab === 'growth'    && <GrowthTab />}
      {activeTab === 'macro'     && <MacroTab />}
      {activeTab === 'momentum'  && <MomentumTab />}
    </div>
  );
}
