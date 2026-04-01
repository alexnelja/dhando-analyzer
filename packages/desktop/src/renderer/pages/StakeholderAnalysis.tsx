import React, { useState, useCallback, useMemo, useId } from 'react';
import { formatPct } from '../lib/format';

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
}

interface InfluenceEntry {
  name: string;
  effectiveInfluence: number;
  position: number;
}

interface RoundSnapshot {
  round: number;
  weightedMean: number;
  positions: Array<{ name: string; position: number }>;
}

interface GameTheoryResult {
  predictedOutcome: number;
  probability: number;
  confidence: number;
  rounds: RoundSnapshot[];
  influenceRanking: InfluenceEntry[];
}

// ── Pure game-theory model (Mesquita-inspired) ───────────────────────────────
//
// Algorithm:
//   1. Compute effective influence = power * salience / 100 for each actor.
//   2. Weighted mean of positions by effective influence = current prediction.
//   3. Each actor challenges the current winner:
//      - If challenger's EI > target's EI, target moves toward challenger.
//      - Repeat for N rounds until convergence.
//   4. Probability = normalized proximity of final mean to initial mean range.
//   5. Confidence = 1 - stddev(final positions) / 100.

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
  // Deep copy so we don't mutate inputs
  let current: Stakeholder[] = initial.map((s) => ({ ...s }));

  const rounds: RoundSnapshot[] = [];
  let previousMean = computeWeightedMean(current);

  for (let r = 1; r <= maxRounds; r++) {
    const next: Stakeholder[] = current.map((s) => ({ ...s }));

    for (let i = 0; i < current.length; i++) {
      for (let j = 0; j < current.length; j++) {
        if (i === j) continue;
        const challenger = current[i];
        const target = next[j];
        const challengerEI = computeEI(challenger);
        const targetEI = computeEI(target);

        if (challengerEI > targetEI) {
          // Target persuaded — moves halfway toward challenger
          const delta = (challenger.position - target.position) * 0.15;
          target.position = Math.max(0, Math.min(100, target.position + delta));
        }
      }
    }

    const newMean = computeWeightedMean(next);
    rounds.push({
      round: r,
      weightedMean: Math.round(newMean * 10) / 10,
      positions: next.map((s) => ({ name: s.name, position: Math.round(s.position) })),
    });

    // Check convergence: if mean barely moved, stop early
    if (Math.abs(newMean - previousMean) < 0.05) {
      current = next;
      break;
    }

    previousMean = newMean;
    current = next;
  }

  const finalMean = computeWeightedMean(current);

  // Probability: scale final outcome relative to [0,100] range, then treat
  // distance from 50 as signal strength (closer to 50 = more uncertain).
  const distanceFrom50 = Math.abs(finalMean - 50);
  const probability = 0.5 + distanceFrom50 / 100;

  // Confidence: low variance among final positions = high confidence
  const positions = current.map((s) => s.position);
  const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
  const variance = positions.reduce((a, b) => a + (b - mean) ** 2, 0) / positions.length;
  const stddev = Math.sqrt(variance);
  const confidence = Math.max(0, Math.min(1, 1 - stddev / 50));

  // Effective influence ranking
  const influenceRanking: InfluenceEntry[] = current
    .map((s) => ({
      name: s.name,
      effectiveInfluence: computeEI(s),
      position: Math.round(s.position),
    }))
    .sort((a, b) => b.effectiveInfluence - a.effectiveInfluence);

  const maxEI = influenceRanking[0]?.effectiveInfluence ?? 1;
  influenceRanking.forEach((e) => {
    e.effectiveInfluence = e.effectiveInfluence / maxEI; // normalize to [0,1]
  });

  return {
    predictedOutcome: Math.round(finalMean * 10) / 10,
    probability: Math.round(probability * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    rounds,
    influenceRanking,
  };
}

// ── Default example stakeholders ──────────────────────────────────────────────

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
  onUpdate: (id: string, field: keyof Omit<Stakeholder, 'id'>, value: number | string) => void;
  onRemove: (id: string) => void;
}

function StakeholderRow({ stakeholder, onUpdate, onRemove }: StakeholderRowProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/80 p-4 flex flex-col gap-3">
      {/* Name + remove */}
      <div className="flex items-center gap-2">
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
          ×
        </button>
      </div>

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

// ── Main Page ─────────────────────────────────────────────────────────────────

export function StakeholderAnalysis() {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(DEFAULT_STAKEHOLDERS);
  const [result, setResult] = useState<GameTheoryResult | null>(null);
  const [showRounds, setShowRounds] = useState(false);
  const [kellyLinked, setKellyLinked] = useState(false);

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
    },
    [],
  );

  const handleRemove = useCallback((id: string) => {
    setStakeholders((prev) => prev.filter((s) => s.id !== id));
    setResult(null);
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
  }, [stakeholders]);

  const canRun = useMemo(
    () => stakeholders.filter((s) => s.name.trim()).length >= 2,
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
        </p>
      </div>

      {/* Scenario */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6" aria-label="Scenario configuration">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          What outcome are you predicting?
        </label>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Will SARB cut rates in Q2 2026?"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400"
          aria-label="Prediction question"
        />
        <p className="text-xs text-gray-400 mt-2">
          Scale: 0 = definitely no, 100 = definitely yes. Set each stakeholder's preferred position on this scale.
        </p>
      </section>

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
          {stakeholders.map((s) => (
            <StakeholderRow
              key={s.id}
              stakeholder={s}
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

        {/* Run button */}
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: canRun ? '#d97757' : '#d97757' }}
          aria-disabled={!canRun}
        >
          Run Prediction
        </button>
        {!canRun && (
          <p className="text-xs text-gray-400 mt-1">Add at least 2 named stakeholders to run.</p>
        )}
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
              Effective influence = Power × Salience / 100, normalized to top actor = 100%.
            </p>
          </div>

          {/* Convergence rounds */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRounds((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              aria-expanded={showRounds}
              aria-controls="rounds-table"
            >
              <span>Round-by-round Convergence</span>
              <span className="text-gray-400 text-xs">{showRounds ? '▲ Collapse' : '▼ Expand'}</span>
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
                          <td key={p.name} className="px-4 py-2 text-gray-600 tabular-nums">
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
