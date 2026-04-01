import React, { useState, useCallback, useMemo, useId } from 'react';
import { formatPct } from '../lib/format';
import {
  aiAnalyzeScenario,
  aiAnalyzeResult,
  aiDebate,
  type AiStakeholder,
  type AiDebateResult,
} from '../lib/ipc';

/*
 * Usage example:
 *
 * import { StakeholderAnalysis } from './pages/StakeholderAnalysis';
 * <Route path="/stakeholders" element={<StakeholderAnalysis />} />
 */

// ── Types ────────────────────────────────────────────────────────────────────

interface Stakeholder {
  id: string;
  name: string;
  /** 0–100: preferred outcome on the policy scale */
  position: number;
  /** 0–100: how much they care about this issue */
  salience: number;
  /** 0–100: relative power/resources */
  power: number;
  /** Optional Claude reasoning text */
  reasoning?: string;
}

interface InfluenceEntry {
  name: string;
  effectiveInfluence: number;
  position: number;
}

interface RoundSnapshot {
  round: number;
  weightedMean: number;
  positions: Array<{ name: string; position: number; moved?: boolean }>;
}

interface GameTheoryResult {
  predictedOutcome: number;
  probability: number;
  confidence: number;
  rounds: RoundSnapshot[];
  influenceRanking: InfluenceEntry[];
}

// ── Pure game-theory model (Mesquita-inspired) ───────────────────────────────

function computeWeightedMean(stakeholders: Stakeholder[]): number {
  let numerator = 0;
  let denominator = 0;
  for (const s of stakeholders) {
    const ei = (s.power * s.salience) / 100;
    numerator += ei * s.position;
    denominator += ei;
  }
  return denominator === 0 ? 50 : numerator / denominator;
}

function computeEI(s: Stakeholder): number {
  return (s.power * s.salience) / 100;
}

function runGameTheory(
  initial: Stakeholder[],
  maxRounds: number = 10,
): GameTheoryResult {
  let current: Stakeholder[] = initial.map((s) => ({ ...s }));
  const rounds: RoundSnapshot[] = [];
  let previousMean = computeWeightedMean(current);

  for (let r = 1; r <= maxRounds; r++) {
    const next: Stakeholder[] = current.map((s) => ({ ...s }));
    const moved = new Set<string>();

    for (let i = 0; i < current.length; i++) {
      for (let j = 0; j < current.length; j++) {
        if (i === j) continue;
        const challenger = current[i];
        const target = next[j];
        const challengerEI = computeEI(challenger);
        const targetEI = computeEI(target);

        if (challengerEI > targetEI) {
          const prevPos = target.position;
          const delta = (challenger.position - target.position) * 0.15;
          target.position = Math.max(0, Math.min(100, target.position + delta));
          if (Math.abs(target.position - prevPos) > 0.1) moved.add(target.name);
        }
      }
    }

    const newMean = computeWeightedMean(next);
    rounds.push({
      round: r,
      weightedMean: Math.round(newMean * 10) / 10,
      positions: next.map((s) => ({
        name: s.name,
        position: Math.round(s.position),
        moved: moved.has(s.name),
      })),
    });

    if (Math.abs(newMean - previousMean) < 0.05) {
      current = next;
      break;
    }

    previousMean = newMean;
    current = next;
  }

  const finalMean = computeWeightedMean(current);
  const distanceFrom50 = Math.abs(finalMean - 50);
  const probability = 0.5 + distanceFrom50 / 100;

  const positions = current.map((s) => s.position);
  const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
  const variance = positions.reduce((a, b) => a + (b - mean) ** 2, 0) / positions.length;
  const stddev = Math.sqrt(variance);
  const confidence = Math.max(0, Math.min(1, 1 - stddev / 50));

  const influenceRanking: InfluenceEntry[] = current
    .map((s) => ({
      name: s.name,
      effectiveInfluence: computeEI(s),
      position: Math.round(s.position),
    }))
    .sort((a, b) => b.effectiveInfluence - a.effectiveInfluence);

  const maxEI = influenceRanking[0]?.effectiveInfluence ?? 1;
  influenceRanking.forEach((e) => {
    e.effectiveInfluence = e.effectiveInfluence / maxEI;
  });

  return {
    predictedOutcome: Math.round(finalMean * 10) / 10,
    probability: Math.round(probability * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    rounds,
    influenceRanking,
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_QUESTION = 'Will SARB cut rates in Q2 2026?';

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_STAKEHOLDERS: Stakeholder[] = [
  { id: makeId(), name: 'SARB MPC', position: 60, salience: 95, power: 100 },
  { id: makeId(), name: 'Treasury', position: 70, salience: 60, power: 40 },
  { id: makeId(), name: 'Banking sector', position: 40, salience: 80, power: 50 },
  { id: makeId(), name: 'Labour unions', position: 80, salience: 70, power: 20 },
  { id: makeId(), name: 'IMF', position: 55, salience: 30, power: 15 },
];

const STAKEHOLDER_COLORS = [
  '#d97757', '#6a9bcc', '#788c5d', '#9b59b6',
  '#e74c3c', '#f39c12', '#1abc9c', '#34495e',
];

// ── Sub-components ────────────────────────────────────────────────────────────

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color?: string;
}

function SliderField({ label, value, onChange, color = '#d97757' }: SliderFieldProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 min-w-0">
      <label htmlFor={id} className="text-xs text-gray-500 w-16 shrink-0">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} ${value}%, #e5e7eb ${value}%)`,
          accentColor: color,
        }}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      <span className="text-xs font-semibold text-gray-800 w-8 text-right tabular-nums">
        {value}
      </span>
    </div>
  );
}

interface StakeholderRowProps {
  stakeholder: Stakeholder;
  colorIndex: number;
  onUpdate: (id: string, field: keyof Omit<Stakeholder, 'id'>, value: number | string) => void;
  onRemove: (id: string) => void;
}

function StakeholderRow({ stakeholder, colorIndex, onUpdate, onRemove }: StakeholderRowProps) {
  const color = STAKEHOLDER_COLORS[colorIndex % STAKEHOLDER_COLORS.length];
  return (
    <div className="bg-white rounded-xl border border-gray-200/80 p-4 flex flex-col gap-3">
      {/* Name + remove */}
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {stakeholder.name.charAt(0).toUpperCase() || '?'}
        </div>
        <input
          type="text"
          value={stakeholder.name}
          onChange={(e) => onUpdate(stakeholder.id, 'name', e.target.value)}
          placeholder="Stakeholder name"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400"
          aria-label="Stakeholder name"
        />
        <button
          type="button"
          onClick={() => onRemove(stakeholder.id)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          aria-label={`Remove ${stakeholder.name}`}
        >
          x
        </button>
      </div>

      {/* AI reasoning */}
      {stakeholder.reasoning && (
        <p className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 italic leading-relaxed">
          {stakeholder.reasoning}
        </p>
      )}

      {/* Sliders */}
      <div className="space-y-2">
        <SliderField
          label="Position"
          value={stakeholder.position}
          onChange={(v) => onUpdate(stakeholder.id, 'position', v)}
          color="#3b82f6"
        />
        <SliderField
          label="Salience"
          value={stakeholder.salience}
          onChange={(v) => onUpdate(stakeholder.id, 'salience', v)}
          color="#8b5cf6"
        />
        <SliderField
          label="Power"
          value={stakeholder.power}
          onChange={(v) => onUpdate(stakeholder.id, 'power', v)}
          color="#d97757"
        />
      </div>
    </div>
  );
}

interface ResultGaugeProps {
  value: number;
  label: string;
  max?: number;
}

function ResultGauge({ value, label, max = 100 }: ResultGaugeProps) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 60 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative w-28 h-28 rounded-full flex items-center justify-center"
        style={{
          background: `conic-gradient(${color} ${pct * 3.6}deg, #f3f4f6 ${pct * 3.6}deg)`,
        }}
        role="img"
        aria-label={`${label}: ${value}`}
      >
        <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
          <span className="text-2xl font-bold text-gray-900 tabular-nums">{Math.round(value)}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-gray-500">{label}</span>
    </div>
  );
}

interface InfluenceBarProps {
  entry: InfluenceEntry;
}

function InfluenceBar({ entry }: InfluenceBarProps) {
  const pct = Math.round(entry.effectiveInfluence * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-700 w-32 shrink-0 truncate font-medium">
        {entry.name}
      </span>
      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: '#d97757' }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right tabular-nums">{pct}%</span>
      <span className="text-xs text-gray-400 w-12 text-right tabular-nums">pos:{entry.position}</span>
    </div>
  );
}

// ── Iteration Chart ───────────────────────────────────────────────────────────

interface IterationChartProps {
  rounds: RoundSnapshot[];
  stakeholderNames: string[];
}

function IterationChart({ rounds, stakeholderNames }: IterationChartProps) {
  if (rounds.length === 0) return null;

  return (
    <div className="space-y-4">
      {rounds.map((round) => (
        <div key={round.round} className="relative">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-gray-500 w-16">Round {round.round}</span>
            <span className="text-xs font-semibold" style={{ color: '#d97757' }}>
              Median: {round.weightedMean.toFixed(1)}
            </span>
          </div>
          {/* Scale bar */}
          <div className="relative h-8 bg-gray-100 rounded-lg overflow-visible">
            {/* Scale labels */}
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-gray-300 select-none">0</span>
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-gray-300 select-none">100</span>
            {/* Median line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10 opacity-70"
              style={{ left: `${round.weightedMean}%` }}
            />
            {/* Midpoint reference */}
            <div className="absolute top-0 bottom-0 w-px bg-gray-300 z-0" style={{ left: '50%' }} />
            {/* Stakeholder dots */}
            {round.positions.map((s, j) => {
              const colorIdx = stakeholderNames.indexOf(s.name);
              const color = STAKEHOLDER_COLORS[(colorIdx >= 0 ? colorIdx : j) % STAKEHOLDER_COLORS.length];
              return (
                <div
                  key={s.name}
                  className={`absolute top-1 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm transition-all duration-500 z-20 ${
                    s.moved ? 'ring-2 ring-yellow-400 ring-offset-1' : ''
                  }`}
                  style={{
                    left: `calc(${Math.max(0, Math.min(100, s.position))}% - 12px)`,
                    backgroundColor: color,
                  }}
                  title={`${s.name}: ${s.position}`}
                >
                  {s.name.charAt(0).toUpperCase()}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-1">
        {stakeholderNames.map((name, i) => (
          <div key={name} className="flex items-center gap-1.5">
            <div
              className="w-4 h-4 rounded-full text-[8px] font-bold text-white flex items-center justify-center"
              style={{ backgroundColor: STAKEHOLDER_COLORS[i % STAKEHOLDER_COLORS.length] }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] text-gray-600">{name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-orange-500" />
          <span className="text-[11px] text-gray-400">Weighted median</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-yellow-400 bg-transparent" />
          <span className="text-[11px] text-gray-400">Position shifted</span>
        </div>
      </div>
    </div>
  );
}

// ── Debate Display ────────────────────────────────────────────────────────────

interface DebateDisplayProps {
  debate: AiDebateResult;
  stakeholderNames: string[];
}

function DebateDisplay({ debate, stakeholderNames }: DebateDisplayProps) {
  return (
    <div className="space-y-4">
      {debate.rounds.map((round, i) => {
        const colorIdx = stakeholderNames.indexOf(round.speaker);
        const color = STAKEHOLDER_COLORS[(colorIdx >= 0 ? colorIdx : i) % STAKEHOLDER_COLORS.length];
        const isLeft = i % 2 === 0;

        return (
          <div key={i} className={`flex gap-3 ${isLeft ? '' : 'flex-row-reverse'}`}>
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-1"
              style={{ backgroundColor: color }}
            >
              {round.speaker.charAt(0).toUpperCase()}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                isLeft ? 'rounded-tl-sm bg-white border border-gray-200' : 'rounded-tr-sm bg-orange-50 border border-orange-100'
              }`}
            >
              <p className="font-semibold text-xs mb-1" style={{ color }}>
                {round.speaker}
              </p>
              <p className="text-gray-700 leading-relaxed">{round.argument}</p>
              {round.movesPosition && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-yellow-700 bg-yellow-50 rounded-full px-2.5 py-1 border border-yellow-200">
                  <span>Position shifted</span>
                  <span className="font-mono">{round.movesPosition.from} → {round.movesPosition.to}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Conclusion */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Conclusion
        </p>
        <p className="text-sm text-gray-700 leading-relaxed">{debate.conclusion}</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function StakeholderAnalysis() {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [context, setContext] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(DEFAULT_STAKEHOLDERS);
  const [result, setResult] = useState<GameTheoryResult | null>(null);
  const [showRounds, setShowRounds] = useState(false);
  const [showIterationChart, setShowIterationChart] = useState(true);
  const [kellyLinked, setKellyLinked] = useState(false);

  // AI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [debate, setDebate] = useState<AiDebateResult | null>(null);
  const [debateLoading, setDebateLoading] = useState(false);
  const [investmentAnalysis, setInvestmentAnalysis] = useState<string | null>(null);
  const [investmentLoading, setInvestmentLoading] = useState(false);

  const handleUpdate = useCallback(
    (id: string, field: keyof Omit<Stakeholder, 'id'>, value: number | string) => {
      setStakeholders((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, [field]: typeof value === 'string' ? value : Number(value) }
            : s,
        ),
      );
      setResult(null);
      setInvestmentAnalysis(null);
    },
    [],
  );

  const handleRemove = useCallback((id: string) => {
    setStakeholders((prev) => prev.filter((s) => s.id !== id));
    setResult(null);
    setInvestmentAnalysis(null);
  }, []);

  const handleAdd = useCallback(() => {
    setStakeholders((prev) => [
      ...prev,
      { id: makeId(), name: '', position: 50, salience: 50, power: 50 },
    ]);
  }, []);

  const handleRun = useCallback(() => {
    const valid = stakeholders.filter((s) => s.name.trim());
    if (valid.length < 2) return;
    const r = runGameTheory(valid);
    setResult(r);
    setInvestmentAnalysis(null);
    setDebate(null);
  }, [stakeholders]);

  // AI: analyze scenario via Claude
  const handleAiAnalyze = useCallback(async () => {
    if (!question.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiAnalysis(null);
    try {
      const analysis = await aiAnalyzeScenario(question.trim(), context.trim() || undefined);
      setAiAnalysis(analysis.analysis);

      // Auto-populate stakeholders from Claude's response
      const newStakeholders: Stakeholder[] = analysis.stakeholders.map((s: AiStakeholder) => ({
        id: makeId(),
        name: s.name,
        position: Math.max(0, Math.min(100, Math.round(s.position))),
        salience: Math.max(0, Math.min(100, Math.round(s.salience))),
        power: Math.max(0, Math.min(100, Math.round(s.power))),
        reasoning: s.reasoning,
      }));

      if (newStakeholders.length >= 2) {
        setStakeholders(newStakeholders);
        setResult(null);
        setInvestmentAnalysis(null);
        setDebate(null);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  }, [question, context]);

  // AI: debate simulation
  const handleDebate = useCallback(async () => {
    if (!result || !question.trim()) return;
    const valid = stakeholders.filter((s) => s.name.trim());
    if (valid.length < 2) return;

    setDebateLoading(true);
    setDebate(null);
    try {
      const debateResult = await aiDebate(question, valid.map((s) => ({
        name: s.name,
        position: s.position,
        salience: s.salience,
        power: s.power,
      })));
      setDebate(debateResult);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setDebateLoading(false);
    }
  }, [question, stakeholders, result]);

  // AI: investment implications
  const handleInvestmentAnalysis = useCallback(async () => {
    if (!result || !question.trim()) return;
    setInvestmentLoading(true);
    setInvestmentAnalysis(null);
    try {
      const valid = stakeholders.filter((s) => s.name.trim());
      const influenceRanking = valid
        .map((s) => ({ name: s.name, influence: (s.power * s.salience) / 10000 }))
        .sort((a, b) => b.influence - a.influence);

      const text = await aiAnalyzeResult(question, {
        predictedOutcome: result.predictedOutcome,
        probability: result.probability,
        confidence: result.confidence,
        stakeholderInfluence: influenceRanking,
      });
      setInvestmentAnalysis(text);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setInvestmentLoading(false);
    }
  }, [question, stakeholders, result]);

  const canRun = useMemo(
    () => stakeholders.filter((s) => s.name.trim()).length >= 2,
    [stakeholders],
  );

  const stakeholderNames = useMemo(
    () => stakeholders.filter((s) => s.name.trim()).map((s) => s.name),
    [stakeholders],
  );

  const confidenceLabel =
    result === null
      ? ''
      : result.confidence >= 0.7
      ? 'High'
      : result.confidence >= 0.4
      ? 'Medium'
      : 'Low';

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Stakeholder Analysis</h1>
        <p className="text-sm text-gray-500 mt-1">
          Mesquita-inspired game theory model — predict political and regulatory outcomes from stakeholder positions.
          Use AI Analyze to auto-populate stakeholders from a scenario description.
        </p>
      </div>

      {/* Scenario */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6" aria-label="Scenario configuration">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          What outcome are you predicting?
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Will SARB cut rates in Q2 2026?"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
            aria-label="Prediction question"
          />
          <button
            type="button"
            onClick={handleAiAnalyze}
            disabled={aiLoading || !question.trim()}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ backgroundColor: '#6a9bcc' }}
            title="Ask Claude to identify stakeholders for this scenario"
          >
            {aiLoading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing...
              </span>
            ) : (
              'AI Analyze'
            )}
          </button>
        </div>

        {/* Optional context */}
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowContext((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showContext ? '- Hide context' : '+ Add context (optional)'}
          </button>
          {showContext && (
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Additional context for Claude, e.g. current inflation rate, recent policy statements..."
              rows={3}
              className="mt-2 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400 resize-none"
              aria-label="Additional context for AI analysis"
            />
          )}
        </div>

        <p className="text-xs text-gray-400 mt-2">
          Scale: 0 = definitely no, 100 = definitely yes. Set each stakeholder's preferred position on this scale.
        </p>
      </section>

      {/* AI error */}
      {aiError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <span className="font-semibold shrink-0">AI Error:</span>
          <span>{aiError}</span>
          <button
            type="button"
            onClick={() => setAiError(null)}
            className="ml-auto text-red-400 hover:text-red-600 shrink-0"
            aria-label="Dismiss error"
          >
            x
          </button>
        </div>
      )}

      {/* AI Analysis summary */}
      {aiAnalysis && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
            Claude's Scenario Analysis
          </p>
          <p className="text-sm text-blue-800 leading-relaxed">{aiAnalysis}</p>
          <p className="text-xs text-blue-500 mt-2">Stakeholder table auto-populated from AI analysis. Adjust values as needed.</p>
        </div>
      )}

      {/* Stakeholders */}
      <section aria-label="Stakeholder table">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">
            Stakeholders
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({stakeholders.length})
            </span>
          </h2>
          <button
            type="button"
            onClick={handleAdd}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-700 transition-colors"
          >
            + Add Stakeholder
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {stakeholders.map((s, i) => (
            <StakeholderRow
              key={s.id}
              stakeholder={s}
              colorIndex={i}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-400 mb-5">
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />
            Position: preferred outcome (0–100)
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-purple-400 mr-1" />
            Salience: how much they care (0–100)
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: '#d97757' }} />
            Power: resources/influence (0–100)
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 items-center">
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#d97757' }}
            aria-disabled={!canRun}
          >
            Run Prediction
          </button>
          {!canRun && (
            <p className="text-xs text-gray-400">Add at least 2 named stakeholders to run.</p>
          )}
        </div>
      </section>

      {/* Results */}
      {result !== null && (
        <section className="mt-8 space-y-5" aria-label="Prediction results" aria-live="polite">
          <h2 className="text-base font-semibold text-gray-800">Results</h2>

          {/* Gauge row */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex flex-wrap gap-8 justify-center">
              <ResultGauge value={result.predictedOutcome} label="Predicted Outcome" />
              <ResultGauge value={result.probability * 100} label="Probability %" />
              <ResultGauge value={result.confidence * 100} label="Confidence %" />
            </div>

            <div className="mt-5 text-center space-y-1">
              <p className="text-sm font-medium text-gray-800">
                There is a{' '}
                <span className="font-bold" style={{ color: '#d97757' }}>
                  {formatPct(result.probability)}
                </span>{' '}
                probability of this outcome.
              </p>
              <p className="text-xs text-gray-500">
                Confidence: <span className="font-semibold">{confidenceLabel}</span> ({formatPct(result.confidence)}) &mdash; based on how converged stakeholder positions are after negotiation rounds.
              </p>
            </div>

            {/* Post-prediction AI buttons */}
            <div className="flex flex-wrap gap-3 justify-center mt-5 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleDebate}
                disabled={debateLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                style={{ backgroundColor: '#9b59b6' }}
                title="Simulate a negotiation debate between stakeholders"
              >
                {debateLoading ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Debating...
                  </>
                ) : (
                  'AI Debate'
                )}
              </button>
              <button
                type="button"
                onClick={handleInvestmentAnalysis}
                disabled={investmentLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                style={{ backgroundColor: '#788c5d' }}
                title="Get investment implications for SA value investors"
              >
                {investmentLoading ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Investment Implications'
                )}
              </button>
            </div>
          </div>

          {/* Iteration Chart */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowIterationChart((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              aria-expanded={showIterationChart}
            >
              <span>Position Convergence Chart</span>
              <span className="text-gray-400 text-xs">{showIterationChart ? 'Collapse' : 'Expand'}</span>
            </button>

            {showIterationChart && (
              <div className="px-5 pb-5 border-t border-gray-100">
                <p className="text-xs text-gray-400 mt-3 mb-4">
                  Each dot is a stakeholder on the 0–100 scale. Yellow ring = position shifted this round. Orange line = weighted median.
                </p>
                <IterationChart rounds={result.rounds} stakeholderNames={stakeholderNames} />
              </div>
            )}
          </div>

          {/* Influence ranking */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Stakeholder Influence Ranking</h3>
            <div className="space-y-2.5">
              {result.influenceRanking.map((entry) => (
                <InfluenceBar key={entry.name} entry={entry} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Effective influence = Power x Salience / 100, normalized to top actor = 100%.
            </p>
          </div>

          {/* Debate display */}
          {debate && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">AI Debate Simulation</h3>
              <DebateDisplay debate={debate} stakeholderNames={stakeholderNames} />
            </div>
          )}

          {/* Investment implications */}
          {investmentAnalysis && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Investment Implications</h3>
              <div className="prose prose-sm max-w-none">
                {investmentAnalysis.split('\n').map((line, i) => {
                  if (!line.trim()) return <br key={i} />;
                  // Bold headers (lines ending with : or starting with **)
                  if (line.startsWith('**') || line.endsWith(':')) {
                    return (
                      <p key={i} className="text-sm font-semibold text-gray-800 mt-3 mb-1">
                        {line.replace(/\*\*/g, '')}
                      </p>
                    );
                  }
                  return (
                    <p key={i} className="text-sm text-gray-700 leading-relaxed">
                      {line.replace(/\*\*/g, '')}
                    </p>
                  );
                })}
              </div>
            </div>
          )}

          {/* Convergence rounds table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRounds((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              aria-expanded={showRounds}
              aria-controls="rounds-table"
            >
              <span>Round-by-round Convergence Table</span>
              <span className="text-gray-400 text-xs">{showRounds ? 'Collapse' : 'Expand'}</span>
            </button>

            {showRounds && (
              <div id="rounds-table" className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-semibold text-gray-500">Round</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-500">Weighted Mean</th>
                      {result.rounds[0]?.positions.map((p) => (
                        <th key={p.name} className="text-left px-4 py-2 font-semibold text-gray-500">
                          {p.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rounds.map((row) => (
                      <tr key={row.round} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-700">{row.round}</td>
                        <td className="px-4 py-2 font-semibold" style={{ color: '#d97757' }}>
                          {row.weightedMean}
                        </td>
                        {row.positions.map((p) => (
                          <td
                            key={p.name}
                            className={`px-4 py-2 tabular-nums ${p.moved ? 'font-semibold text-yellow-700' : 'text-gray-600'}`}
                          >
                            {p.position}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Kelly input link */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-orange-900">Use as Kelly Criterion Input</p>
              <p className="text-xs text-orange-700 mt-0.5">
                Pipe this {formatPct(result.probability)} probability into an investment's scenario analysis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setKellyLinked(true)}
              disabled={kellyLinked}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-60"
              style={{ backgroundColor: '#d97757' }}
            >
              {kellyLinked ? 'Linked' : 'Use as Kelly Input'}
            </button>
          </div>

          {kellyLinked && (
            <p className="text-xs text-gray-500 text-center" role="status">
              Probability {formatPct(result.probability)} copied to clipboard and ready to use in Calculator or Deal Analyzer.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
