/**
 * Unit tests for Predictions and StakeholderAnalysis pure logic.
 *
 * These tests validate the game-theory model and Polymarket data parsing
 * without any DOM dependencies.
 *
 * Run with: pnpm test (turbo) or npx vitest
 */

import { describe, it, expect } from 'vitest';

// ── Polymarket data parsing (mirrors Predictions.tsx) ────────────────────────

interface ParsedMarket {
  id: string;
  question: string;
  yesProbability: number;
  volume: number;
  endDate: string;
}

function parsePolymarketEvent(event: Record<string, unknown>): ParsedMarket | null {
  const markets = Array.isArray(event.markets) ? event.markets : [];
  const market = markets[0] as Record<string, unknown> | undefined;
  if (!market) return null;
  const outcomePrices: string[] = market.outcomePrices
    ? JSON.parse(market.outcomePrices as string)
    : [];
  const yesPrice = outcomePrices.length > 0 ? parseFloat(outcomePrices[0]) : 0.5;
  return {
    id: String(event.id ?? market.id),
    question: String(event.title ?? market.question ?? 'Unknown'),
    yesProbability: isFinite(yesPrice) ? yesPrice : 0.5,
    volume: Number(event.volume ?? market.volume ?? 0),
    endDate: String(event.endDate ?? market.endDate ?? ''),
  };
}

describe('Polymarket event parsing', () => {
  it('parses a well-formed event correctly', () => {
    const event = {
      id: '42',
      title: 'Will the US enter recession in 2025?',
      volume: 1500000,
      endDate: '2025-12-31',
      markets: [
        {
          id: '42-0',
          question: 'Will the US enter recession?',
          outcomePrices: JSON.stringify(['0.35', '0.65']),
          volume: 1500000,
          endDate: '2025-12-31',
        },
      ],
    };
    const result = parsePolymarketEvent(event);
    expect(result).not.toBeNull();
    expect(result!.yesProbability).toBeCloseTo(0.35);
    expect(result!.question).toBe('Will the US enter recession in 2025?');
    expect(result!.volume).toBe(1500000);
  });

  it('falls back to 0.5 probability when outcomePrices is empty', () => {
    const event = {
      id: '99',
      title: 'Test market',
      volume: 0,
      endDate: '',
      markets: [{ id: '99-0', outcomePrices: '[]' }],
    };
    const result = parsePolymarketEvent(event);
    expect(result!.yesProbability).toBe(0.5);
  });

  it('returns null when no markets array', () => {
    const event = { id: '1', title: 'Empty' };
    const result = parsePolymarketEvent(event);
    expect(result).toBeNull();
  });

  it('clamps non-finite probability to 0.5', () => {
    const event = {
      id: '5',
      title: 'Bad price market',
      markets: [{ id: '5-0', outcomePrices: JSON.stringify(['NaN']) }],
    };
    const result = parsePolymarketEvent(event);
    expect(result!.yesProbability).toBe(0.5);
  });
});

// ── Game theory model (mirrors StakeholderAnalysis.tsx) ──────────────────────

interface Stakeholder {
  id: string;
  name: string;
  position: number;
  salience: number;
  power: number;
}

function computeEI(s: Stakeholder): number {
  return (s.power * s.salience) / 100;
}

function computeWeightedMean(stakeholders: Stakeholder[]): number {
  let numerator = 0;
  let denominator = 0;
  for (const s of stakeholders) {
    const ei = computeEI(s);
    numerator += ei * s.position;
    denominator += ei;
  }
  return denominator === 0 ? 50 : numerator / denominator;
}

function runGameTheory(
  initial: Stakeholder[],
  maxRounds: number = 10,
): { predictedOutcome: number; probability: number; confidence: number } {
  let current: Stakeholder[] = initial.map((s) => ({ ...s }));
  let previousMean = computeWeightedMean(current);

  for (let r = 1; r <= maxRounds; r++) {
    const next: Stakeholder[] = current.map((s) => ({ ...s }));
    for (let i = 0; i < current.length; i++) {
      for (let j = 0; j < current.length; j++) {
        if (i === j) continue;
        const challenger = current[i];
        const target = next[j];
        if (computeEI(challenger) > computeEI(target)) {
          const delta = (challenger.position - target.position) * 0.15;
          target.position = Math.max(0, Math.min(100, target.position + delta));
        }
      }
    }
    const newMean = computeWeightedMean(next);
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

  return {
    predictedOutcome: Math.round(finalMean * 10) / 10,
    probability: Math.round(probability * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  };
}

describe('computeEI (effective influence)', () => {
  it('returns power * salience / 100', () => {
    const s: Stakeholder = { id: '1', name: 'A', position: 50, power: 80, salience: 50 };
    expect(computeEI(s)).toBe(40);
  });

  it('returns 0 when salience is 0', () => {
    const s: Stakeholder = { id: '2', name: 'B', position: 50, power: 100, salience: 0 };
    expect(computeEI(s)).toBe(0);
  });

  it('returns 100 when both power and salience are 100', () => {
    const s: Stakeholder = { id: '3', name: 'C', position: 50, power: 100, salience: 100 };
    expect(computeEI(s)).toBe(100);
  });
});

describe('computeWeightedMean', () => {
  it('returns 50 for empty input', () => {
    expect(computeWeightedMean([])).toBe(50);
  });

  it('returns the single position for one stakeholder', () => {
    const s: Stakeholder = { id: '1', name: 'A', position: 70, power: 50, salience: 50 };
    expect(computeWeightedMean([s])).toBeCloseTo(70);
  });

  it('weights higher-power actors more heavily', () => {
    const low: Stakeholder = { id: '1', name: 'Low', position: 20, power: 10, salience: 50 };
    const high: Stakeholder = { id: '2', name: 'High', position: 80, power: 90, salience: 50 };
    const mean = computeWeightedMean([low, high]);
    // Should be closer to 80 than to 20
    expect(mean).toBeGreaterThan(70);
  });

  it('equal EI actors produce simple average', () => {
    const a: Stakeholder = { id: '1', name: 'A', position: 30, power: 50, salience: 50 };
    const b: Stakeholder = { id: '2', name: 'B', position: 70, power: 50, salience: 50 };
    expect(computeWeightedMean([a, b])).toBeCloseTo(50);
  });
});

describe('runGameTheory', () => {
  const SARB_EXAMPLE: Stakeholder[] = [
    { id: '1', name: 'SARB MPC', position: 60, salience: 95, power: 100 },
    { id: '2', name: 'Treasury', position: 70, salience: 60, power: 40 },
    { id: '3', name: 'Banking sector', position: 40, salience: 80, power: 50 },
    { id: '4', name: 'Labour unions', position: 80, salience: 70, power: 20 },
    { id: '5', name: 'IMF', position: 55, salience: 30, power: 15 },
  ];

  it('returns a predicted outcome between 0 and 100', () => {
    const result = runGameTheory(SARB_EXAMPLE);
    expect(result.predictedOutcome).toBeGreaterThanOrEqual(0);
    expect(result.predictedOutcome).toBeLessThanOrEqual(100);
  });

  it('returns probability between 0.5 and 1.0', () => {
    const result = runGameTheory(SARB_EXAMPLE);
    expect(result.probability).toBeGreaterThanOrEqual(0.5);
    expect(result.probability).toBeLessThanOrEqual(1.0);
  });

  it('returns confidence between 0 and 1', () => {
    const result = runGameTheory(SARB_EXAMPLE);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('a dominant actor drives outcome toward their position', () => {
    const dominant: Stakeholder[] = [
      { id: '1', name: 'Dominant', position: 90, power: 100, salience: 100 },
      { id: '2', name: 'Weak A', position: 10, power: 5, salience: 20 },
      { id: '3', name: 'Weak B', position: 20, power: 5, salience: 20 },
    ];
    const result = runGameTheory(dominant);
    expect(result.predictedOutcome).toBeGreaterThan(70);
  });

  it('highly converged stakeholders produce higher confidence', () => {
    const converged: Stakeholder[] = [
      { id: '1', name: 'A', position: 70, power: 60, salience: 60 },
      { id: '2', name: 'B', position: 72, power: 60, salience: 60 },
      { id: '3', name: 'C', position: 68, power: 60, salience: 60 },
    ];
    const diverged: Stakeholder[] = [
      { id: '1', name: 'A', position: 10, power: 60, salience: 60 },
      { id: '2', name: 'B', position: 50, power: 60, salience: 60 },
      { id: '3', name: 'C', position: 90, power: 60, salience: 60 },
    ];
    const r1 = runGameTheory(converged);
    const r2 = runGameTheory(diverged);
    expect(r1.confidence).toBeGreaterThan(r2.confidence);
  });

  it('does not mutate the original stakeholder array', () => {
    const original = SARB_EXAMPLE.map((s) => ({ ...s }));
    runGameTheory(SARB_EXAMPLE);
    SARB_EXAMPLE.forEach((s, i) => {
      expect(s.position).toBe(original[i].position);
    });
  });
});

// ── Probability formatting ────────────────────────────────────────────────────

describe('formatPct helper', () => {
  function formatPct(value: number, decimals: number = 1): string {
    return `${(value * 100).toFixed(decimals)}%`;
  }

  it('formats 0.35 as 35.0%', () => {
    expect(formatPct(0.35)).toBe('35.0%');
  });

  it('formats 1.0 as 100.0%', () => {
    expect(formatPct(1.0)).toBe('100.0%');
  });

  it('formats 0 as 0.0%', () => {
    expect(formatPct(0)).toBe('0.0%');
  });

  it('supports custom decimal places', () => {
    expect(formatPct(0.6234, 2)).toBe('62.34%');
  });
});
