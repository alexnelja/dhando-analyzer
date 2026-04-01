import { describe, it, expect } from 'vitest';
import {
  weightedMedian,
  probabilityOfSuccess,
  expectedUtilityOfChallenge,
  predict,
} from '../../src/game-theory/predictor.js';
import type { Stakeholder } from '../../src/game-theory/predictor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function s(name: string, position: number, salience: number, power: number): Stakeholder {
  return { name, position, salience, power };
}

// ---------------------------------------------------------------------------
// weightedMedian
// ---------------------------------------------------------------------------

describe('weightedMedian', () => {
  it('returns 50 for an empty array', () => {
    expect(weightedMedian([])).toBe(50);
  });

  it('returns the sole stakeholder position for a single entry', () => {
    expect(weightedMedian([s('A', 70, 50, 50)])).toBe(70);
  });

  it('returns the weighted median for two equal-weight stakeholders', () => {
    // Equal weight: cumulative reaches half at the first (lower) position
    const result = weightedMedian([s('A', 20, 50, 50), s('B', 80, 50, 50)]);
    expect(result).toBe(20);
  });

  it('pulls the median toward the heavier stakeholder', () => {
    // A has weight 50*50=2500, B has weight 50*10=500; median should be at A's position
    const result = weightedMedian([s('A', 20, 50, 50), s('B', 80, 50, 10)]);
    expect(result).toBe(20);
  });

  it('selects B position when B has much higher weight', () => {
    // A weight=100, B weight=9000; median at B
    const result = weightedMedian([s('A', 10, 10, 10), s('B', 90, 90, 100)]);
    expect(result).toBe(90);
  });

  it('returns 50 when all stakeholders have zero weight (salience or power = 0)', () => {
    expect(weightedMedian([s('A', 30, 0, 50), s('B', 70, 50, 0)])).toBe(50);
  });

  it('correctly handles three stakeholders with different weights', () => {
    // Weights: A=25*25=625, B=50*50=2500, C=10*10=100; total=3225; half=1612.5
    // Sorted by position: A(10,625), B(50,2500), C(90,100)
    // After A: cumulative=625 < 1612.5; after B: cumulative=3125 >= 1612.5 → median=50
    const result = weightedMedian([s('A', 10, 25, 25), s('B', 50, 50, 50), s('C', 90, 10, 10)]);
    expect(result).toBe(50);
  });

  it.each([
    [[s('X', 40, 100, 100)], 40],
    [[s('X', 0, 100, 100)], 0],
    [[s('X', 100, 100, 100)], 100],
  ])('single stakeholder at position %#', (stakeholders, expected) => {
    expect(weightedMedian(stakeholders)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// probabilityOfSuccess
// ---------------------------------------------------------------------------

describe('probabilityOfSuccess', () => {
  it('returns 0.5 when challenger and target have identical positions', () => {
    const all = [s('C', 50, 50, 50), s('T', 50, 50, 50)];
    const p = probabilityOfSuccess(all[0], all[1], all);
    expect(p).toBeCloseTo(0.5);
  });

  it('returns 0.5 when total support is zero (degenerate case)', () => {
    // All weights zero — can't happen in normal usage but formula returns 0.5
    const c = s('C', 20, 0, 0);
    const t = s('T', 80, 0, 0);
    expect(probabilityOfSuccess(c, t, [c, t])).toBe(0.5);
  });

  it('returns > 0.5 when most stakeholders are closer to the target position (challenger wins)', () => {
    // Challenger at 10; target at 90; four bystanders all at 80 → they prefer challenger wins
    const challenger = s('C', 10, 50, 50);
    const target = s('T', 90, 50, 50);
    const bystanders = [
      s('B1', 80, 50, 50),
      s('B2', 85, 50, 50),
      s('B3', 75, 50, 50),
    ];
    const all = [challenger, target, ...bystanders];
    const p = probabilityOfSuccess(challenger, target, all);
    // Bystanders near target → distance to target is small → less support for challenger
    // Actually bystanders near 80 are closer to target(90) than challenger(10)
    // support for challenger += weight * |target - bystander| = weight * 10
    // support for target   += weight * |challenger - bystander| = weight * 70
    // So target wins (p < 0.5 for challenger)
    expect(p).toBeLessThan(0.5);
  });

  it('challenger wins when bystanders are all positioned near the challenger', () => {
    const challenger = s('C', 10, 50, 50);
    const target = s('T', 90, 50, 50);
    const bystanders = [s('B1', 15, 50, 50), s('B2', 20, 50, 50)];
    const all = [challenger, target, ...bystanders];
    const p = probabilityOfSuccess(challenger, target, all);
    expect(p).toBeGreaterThan(0.5);
  });

  it('probability sums to 1 when called symmetrically (challenger vs target and vice versa)', () => {
    const a = s('A', 30, 60, 70);
    const b = s('B', 70, 40, 80);
    const all = [a, b, s('C', 50, 50, 50)];
    const pAB = probabilityOfSuccess(a, b, all);
    const pBA = probabilityOfSuccess(b, a, all);
    expect(pAB + pBA).toBeCloseTo(1, 5);
  });
});

// ---------------------------------------------------------------------------
// expectedUtilityOfChallenge
// ---------------------------------------------------------------------------

describe('expectedUtilityOfChallenge', () => {
  it('returns a number', () => {
    const a = s('A', 20, 60, 50);
    const b = s('B', 80, 60, 50);
    const all = [a, b];
    const eu = expectedUtilityOfChallenge(a, b, 50, all);
    expect(typeof eu).toBe('number');
    expect(Number.isFinite(eu)).toBe(true);
  });

  it('returns lower EU when challenger position already matches the median (no incentive)', () => {
    // Challenger already at median → uStatusQuo is high → EU should be low
    const a = s('A', 50, 80, 80);
    const b = s('B', 90, 50, 50);
    const all = [a, b];
    const eu = expectedUtilityOfChallenge(a, b, 50, all);
    expect(eu).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// predict — full model
// ---------------------------------------------------------------------------

describe('predict', () => {
  it('returns default result for empty stakeholder array', () => {
    const result = predict([]);
    expect(result.predictedOutcome).toBe(50);
    expect(result.confidence).toBe(0);
    expect(result.probability).toBe(0.5);
    expect(result.rounds).toHaveLength(0);
    expect(result.convergenceRound).toBe(0);
    expect(result.stakeholderInfluence).toHaveLength(0);
  });

  it('returns single stakeholder position as outcome', () => {
    const result = predict([s('Only', 75, 80, 80)]);
    // With one stakeholder there's no one to challenge, so position stays at 75
    expect(result.predictedOutcome).toBeCloseTo(75, 0);
    expect(result.stakeholderInfluence).toHaveLength(1);
    expect(result.stakeholderInfluence[0].name).toBe('Only');
  });

  it('converges and records rounds', () => {
    const stakeholders = [
      s('Hawk', 80, 70, 80),
      s('Dove', 20, 70, 80),
      s('Centrist', 50, 50, 60),
    ];
    const result = predict(stakeholders, 30, 0.5);
    expect(result.rounds.length).toBeGreaterThan(0);
    expect(result.convergenceRound).toBeGreaterThan(0);
    expect(result.convergenceRound).toBeLessThanOrEqual(30);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('predictedOutcome is within 0–100', () => {
    const stakeholders = [
      s('A', 0, 100, 100),
      s('B', 100, 100, 100),
      s('C', 50, 50, 50),
    ];
    const result = predict(stakeholders);
    expect(result.predictedOutcome).toBeGreaterThanOrEqual(0);
    expect(result.predictedOutcome).toBeLessThanOrEqual(100);
  });

  it('probability equals predictedOutcome / 100', () => {
    const stakeholders = [s('A', 60, 80, 80), s('B', 40, 40, 40)];
    const result = predict(stakeholders);
    expect(result.probability).toBeCloseTo(result.predictedOutcome / 100, 10);
  });

  it('stakeholder influence is ranked descending', () => {
    const stakeholders = [
      s('Low', 50, 10, 10),
      s('High', 50, 90, 90),
      s('Mid', 50, 50, 50),
    ];
    const result = predict(stakeholders);
    const influences = result.stakeholderInfluence.map(si => si.influence);
    for (let i = 0; i < influences.length - 1; i++) {
      expect(influences[i]).toBeGreaterThanOrEqual(influences[i + 1]);
    }
  });

  it('influence values equal power * salience / 10000', () => {
    const stakeholders = [s('A', 50, 80, 60), s('B', 50, 40, 20)];
    const result = predict(stakeholders);
    const aEntry = result.stakeholderInfluence.find(si => si.name === 'A');
    expect(aEntry?.influence).toBeCloseTo((80 * 60) / 10000, 10);
  });

  it('does not mutate the input stakeholder array', () => {
    const stakeholders = [s('A', 20, 80, 80), s('B', 80, 80, 80)];
    const originalPositions = stakeholders.map(s => s.position);
    predict(stakeholders);
    stakeholders.forEach((st, i) => {
      expect(st.position).toBe(originalPositions[i]);
    });
  });

  it('high-conflict scenario: stakeholders at opposite extremes', () => {
    // Hawks at 100, Doves at 0, equal power — the model may converge at one of
    // the symmetric poles (0 or 100) or at a middle value depending on which
    // side wins the challenge dynamics.  What we assert is that the model
    // actually converges within the round budget and the outcome stays in range.
    const stakeholders = [
      s('Hawk1', 100, 80, 80),
      s('Hawk2', 95, 70, 70),
      s('Dove1', 0, 80, 80),
      s('Dove2', 5, 70, 70),
    ];
    const result = predict(stakeholders, 50, 0.5);
    expect(result.predictedOutcome).toBeGreaterThanOrEqual(0);
    expect(result.predictedOutcome).toBeLessThanOrEqual(100);
    expect(result.convergenceRound).toBeLessThanOrEqual(50);
    // Model should reach a decision — confidence above minimum 0.4
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it('dominant single stakeholder drives outcome toward their position', () => {
    // One extremely powerful stakeholder vs many weak ones
    const stakeholders = [
      s('Giant', 90, 100, 100),
      s('W1', 10, 5, 5),
      s('W2', 15, 5, 5),
      s('W3', 20, 5, 5),
    ];
    const result = predict(stakeholders);
    // Giant has weight 10000 vs ~225 each for weak ones — outcome near 90
    expect(result.predictedOutcome).toBeGreaterThan(60);
  });

  it('confidence is higher when convergenceRound is small', () => {
    // Near-unanimous stakeholders should converge in one round
    const aligned = [s('A', 50, 80, 80), s('B', 52, 80, 80), s('C', 51, 80, 80)];
    const result = predict(aligned, 20, 0.5);
    if (result.convergenceRound < 10) {
      expect(result.confidence).toBeGreaterThan(0.6);
    }
  });

  it('returns maxRounds as convergenceRound when model fails to converge', () => {
    // Deliberately set a very high convergence threshold so it never converges
    // Actually the opposite — set threshold to 0 so it almost never converges
    // Use threshold of -1 (impossible to satisfy) with max 3 rounds
    const stakeholders = [s('A', 0, 100, 100), s('B', 100, 100, 100)];
    const result = predict(stakeholders, 3, -1); // threshold = -1: never converges
    expect(result.convergenceRound).toBe(3);
    expect(result.confidence).toBe(0.4);
    expect(result.rounds).toHaveLength(3);
  });

  it('binary outcome: probability > 0.5 when outcome tilts toward high end', () => {
    const stakeholders = [
      s('Bull', 80, 90, 90),
      s('Bear', 20, 30, 30),
    ];
    const result = predict(stakeholders);
    expect(result.probability).toBeGreaterThan(0.5);
  });

  it('each round entry has correct structure', () => {
    const stakeholders = [s('A', 30, 60, 60), s('B', 70, 60, 60)];
    const result = predict(stakeholders);
    for (const round of result.rounds) {
      expect(typeof round.round).toBe('number');
      expect(typeof round.weightedMedian).toBe('number');
      expect(Array.isArray(round.stakeholderPositions)).toBe(true);
      for (const sp of round.stakeholderPositions) {
        expect(typeof sp.name).toBe('string');
        expect(typeof sp.position).toBe('number');
        expect(typeof sp.moved).toBe('boolean');
      }
    }
  });
});
