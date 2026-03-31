import { describe, it, expect } from 'vitest';
import {
  computeBrierCalibration,
  type BrierCalibrationInput,
} from '../../src/portfolio/brier.js';

describe('computeBrierCalibration', () => {
  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('handles empty input gracefully', () => {
    const result = computeBrierCalibration({ predictions: [] });

    expect(result.totalPredictions).toBe(0);
    expect(result.meanBrierScore).toBe(0);
    // meanBrier = 0 → skillScore = 1 - 0/0.25 = 1 (vacuously perfect)
    expect(result.skillScore).toBe(1);
    expect(result.overconfidenceBias).toBe(0);
    expect(result.isWellCalibrated).toBe(true);
    expect(result.calibrationCurve).toHaveLength(10);
    result.calibrationCurve.forEach((b) => expect(b.count).toBe(0));
  });

  it('handles a single perfect prediction (p=1, o=1)', () => {
    const result = computeBrierCalibration({
      predictions: [{ predictedProbability: 1.0, actualOutcome: 1 }],
    });

    expect(result.meanBrierScore).toBe(0);
    expect(result.skillScore).toBe(1);
    expect(result.totalPredictions).toBe(1);
    expect(result.isWellCalibrated).toBe(true);
  });

  it('handles a single perfectly wrong prediction (p=1, o=0)', () => {
    const result = computeBrierCalibration({
      predictions: [{ predictedProbability: 1.0, actualOutcome: 0 }],
    });

    expect(result.meanBrierScore).toBe(1);
    // skillScore = max(0, 1 - 1/0.25) = max(0, -3) = 0
    expect(result.skillScore).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Perfect calibration
  // ---------------------------------------------------------------------------

  it('perfect calibration returns Brier score = 0', () => {
    // All predictions are 1.0 and all outcomes are 1 — perfect.
    const predictions = Array.from({ length: 20 }, () => ({
      predictedProbability: 1.0,
      actualOutcome: 1 as const,
    }));

    const result = computeBrierCalibration({ predictions });

    expect(result.meanBrierScore).toBe(0);
    expect(result.skillScore).toBe(1);
    expect(result.isWellCalibrated).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Random guessing
  // ---------------------------------------------------------------------------

  it('random guessing at 0.5 yields Brier score ≈ 0.25 and skill ≈ 0', () => {
    // Half outcomes 1, half outcomes 0, all predictions 0.5.
    const predictions = Array.from({ length: 100 }, (_, i) => ({
      predictedProbability: 0.5,
      actualOutcome: i < 50 ? 1 : 0,
    }));

    const result = computeBrierCalibration({ predictions });

    // (0.5 - 1)^2 = 0.25, (0.5 - 0)^2 = 0.25 → mean = 0.25
    expect(result.meanBrierScore).toBeCloseTo(0.25, 5);
    expect(result.skillScore).toBeCloseTo(0, 5);
  });

  // ---------------------------------------------------------------------------
  // Overconfident predictor
  // ---------------------------------------------------------------------------

  it('overconfident predictor has positive overconfidenceBias', () => {
    // Predicts 0.9 but only 50% hit rate.
    const predictions = Array.from({ length: 100 }, (_, i) => ({
      predictedProbability: 0.9,
      actualOutcome: i < 50 ? 1 : 0,
    }));

    const result = computeBrierCalibration({ predictions });

    expect(result.overconfidenceBias).toBeGreaterThan(0);
    // 0.9 bucket: avgPredicted=0.9, avgActual=0.5 → deviation= -0.4 → not well-calibrated
    expect(result.isWellCalibrated).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Well-calibrated predictor
  // ---------------------------------------------------------------------------

  it('well-calibrated predictor passes isWellCalibrated', () => {
    // For each bucket midpoint, actualOutcome matches exactly.
    // Use 0.65 predicted with 65% hit rate (deviation ≈ 0).
    const predictions = Array.from({ length: 200 }, (_, i) => ({
      predictedProbability: 0.65,
      actualOutcome: i < 130 ? 1 : 0,
    }));

    const result = computeBrierCalibration({ predictions });

    const bucket = result.calibrationCurve.find((b) => b.count > 0)!;
    expect(Math.abs(bucket.deviation)).toBeLessThan(0.15);
    expect(result.isWellCalibrated).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Calibration curve structure
  // ---------------------------------------------------------------------------

  it('produces exactly 10 buckets with correct range labels', () => {
    const result = computeBrierCalibration({ predictions: [] });

    expect(result.calibrationCurve).toHaveLength(10);
    expect(result.calibrationCurve[0].range).toBe('0.00-0.10');
    expect(result.calibrationCurve[5].range).toBe('0.50-0.60');
    expect(result.calibrationCurve[9].range).toBe('0.90-1.00');
  });

  it('routes predictions into correct buckets', () => {
    const input: BrierCalibrationInput = {
      predictions: [
        { predictedProbability: 0.05, actualOutcome: 0 },
        { predictedProbability: 0.15, actualOutcome: 1 },
        { predictedProbability: 0.95, actualOutcome: 1 },
        { predictedProbability: 1.0, actualOutcome: 1 },  // should clamp to bucket 9
      ],
    };

    const result = computeBrierCalibration(input);

    expect(result.calibrationCurve[0].count).toBe(1); // 0.05
    expect(result.calibrationCurve[1].count).toBe(1); // 0.15
    expect(result.calibrationCurve[9].count).toBe(2); // 0.95 and 1.0
    expect(result.totalPredictions).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // Skill score is clamped at 0
  // ---------------------------------------------------------------------------

  it('skill score is clamped at 0 for worse-than-random predictions', () => {
    // p=1, o=0 → Brier=1 → skill = 1 - 1/0.25 = -3, clamped to 0.
    const result = computeBrierCalibration({
      predictions: [{ predictedProbability: 1.0, actualOutcome: 0 }],
    });

    expect(result.skillScore).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // overconfidenceBias sign check
  // ---------------------------------------------------------------------------

  it('underconfident predictor has negative overconfidenceBias', () => {
    // Predicts 0.1 but all outcomes are 1 → avgActual (1) > avgPredicted (0.1).
    const predictions = Array.from({ length: 10 }, () => ({
      predictedProbability: 0.1,
      actualOutcome: 1 as const,
    }));

    const result = computeBrierCalibration({ predictions });

    // overconfidence = avgPredicted - avgActual = 0.1 - 1 = -0.9
    expect(result.overconfidenceBias).toBeLessThan(0);
  });
});
