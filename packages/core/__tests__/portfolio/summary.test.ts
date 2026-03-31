import { describe, it, expect } from 'vitest';
import {
  computePortfolioSummary,
  type PortfolioSummaryInput,
} from '../../src/portfolio/summary.js';
import type { BrierCalibrationResult } from '../../src/portfolio/brier.js';

/** Minimal calibration stub for use in tests. */
function makeCalibration(skillScore: number, isWellCalibrated: boolean): BrierCalibrationResult {
  return {
    meanBrierScore: 0.1,
    skillScore,
    calibrationCurve: [],
    overconfidenceBias: 0,
    totalPredictions: 10,
    isWellCalibrated,
  };
}

describe('computePortfolioSummary', () => {
  // ---------------------------------------------------------------------------
  // Empty portfolio
  // ---------------------------------------------------------------------------

  it('handles empty portfolio', () => {
    const result = computePortfolioSummary({ positions: [] });

    expect(result.totalPositions).toBe(0);
    expect(result.totalValue).toBe(0);
    expect(result.weightedCompositeScore).toBe(0);
    expect(result.greenCount).toBe(0);
    expect(result.amberCount).toBe(0);
    expect(result.redCount).toBe(0);
    expect(result.overallRisk).toBe('low');
    expect(result.calibrationScore).toBeNull();
    expect(result.isWellCalibrated).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // All-green portfolio
  // ---------------------------------------------------------------------------

  it('all-green portfolio has low risk and correct counts', () => {
    const input: PortfolioSummaryInput = {
      positions: [
        { marketValue: 10000, compositeScore: 0.8, trafficLight: 'green' },
        { marketValue: 20000, compositeScore: 0.9, trafficLight: 'green' },
        { marketValue: 15000, compositeScore: 0.7, trafficLight: 'green' },
      ],
    };

    const result = computePortfolioSummary(input);

    expect(result.totalPositions).toBe(3);
    expect(result.greenCount).toBe(3);
    expect(result.amberCount).toBe(0);
    expect(result.redCount).toBe(0);
    expect(result.overallRisk).toBe('low');
    expect(result.totalValue).toBe(45000);
  });

  // ---------------------------------------------------------------------------
  // Value-weighted composite score
  // ---------------------------------------------------------------------------

  it('computes value-weighted composite score correctly', () => {
    // score = (100 * 0.4 + 400 * 0.8) / 500 = (40 + 320) / 500 = 0.72
    const input: PortfolioSummaryInput = {
      positions: [
        { marketValue: 100, compositeScore: 0.4, trafficLight: 'green' },
        { marketValue: 400, compositeScore: 0.8, trafficLight: 'green' },
      ],
    };

    const result = computePortfolioSummary(input);

    expect(result.weightedCompositeScore).toBeCloseTo(0.72, 5);
  });

  it('larger position dominates weighted score', () => {
    const input: PortfolioSummaryInput = {
      positions: [
        { marketValue: 1000, compositeScore: 1.0, trafficLight: 'green' },
        { marketValue: 1, compositeScore: 0.0, trafficLight: 'red' },
      ],
    };

    const result = computePortfolioSummary(input);

    // Nearly all weight is on the 1.0 position.
    expect(result.weightedCompositeScore).toBeGreaterThan(0.99);
  });

  // ---------------------------------------------------------------------------
  // Mixed portfolio — risk levels
  // ---------------------------------------------------------------------------

  it('risk is medium when >10% but <=30% of positions are red', () => {
    // 2 red out of 10 = 20% → medium
    const positions = [
      ...Array.from({ length: 8 }, () => ({
        marketValue: 1000,
        compositeScore: 0.7,
        trafficLight: 'green' as const,
      })),
      ...Array.from({ length: 2 }, () => ({
        marketValue: 1000,
        compositeScore: 0.3,
        trafficLight: 'red' as const,
      })),
    ];

    const result = computePortfolioSummary({ positions });

    expect(result.overallRisk).toBe('medium');
    expect(result.redCount).toBe(2);
  });

  it('risk is high when >30% of positions are red', () => {
    // 4 red out of 10 = 40% → high
    const positions = [
      ...Array.from({ length: 6 }, () => ({
        marketValue: 1000,
        compositeScore: 0.7,
        trafficLight: 'green' as const,
      })),
      ...Array.from({ length: 4 }, () => ({
        marketValue: 1000,
        compositeScore: 0.2,
        trafficLight: 'red' as const,
      })),
    ];

    const result = computePortfolioSummary({ positions });

    expect(result.overallRisk).toBe('high');
  });

  it('risk is low when exactly 10% are red (not strictly > 10%)', () => {
    // 1 red out of 10 = 10% → not > 10% → low
    const positions = [
      ...Array.from({ length: 9 }, () => ({
        marketValue: 1000,
        compositeScore: 0.7,
        trafficLight: 'green' as const,
      })),
      {
        marketValue: 1000,
        compositeScore: 0.3,
        trafficLight: 'red' as const,
      },
    ];

    const result = computePortfolioSummary({ positions });

    expect(result.overallRisk).toBe('low');
  });

  // ---------------------------------------------------------------------------
  // Calibration integration
  // ---------------------------------------------------------------------------

  it('surfaces calibration score and flag when provided', () => {
    const calibration = makeCalibration(0.6, true);
    const result = computePortfolioSummary({
      positions: [{ marketValue: 1000, compositeScore: 0.7, trafficLight: 'green' }],
      calibration,
    });

    expect(result.calibrationScore).toBe(0.6);
    expect(result.isWellCalibrated).toBe(true);
  });

  it('calibration fields are null when calibration is not provided', () => {
    const result = computePortfolioSummary({
      positions: [{ marketValue: 1000, compositeScore: 0.7, trafficLight: 'green' }],
    });

    expect(result.calibrationScore).toBeNull();
    expect(result.isWellCalibrated).toBeNull();
  });

  it('surfaces poorly-calibrated flag', () => {
    const calibration = makeCalibration(0.2, false);
    const result = computePortfolioSummary({
      positions: [],
      calibration,
    });

    expect(result.isWellCalibrated).toBe(false);
    expect(result.calibrationScore).toBe(0.2);
  });

  // ---------------------------------------------------------------------------
  // Amber count
  // ---------------------------------------------------------------------------

  it('counts amber positions correctly', () => {
    const input: PortfolioSummaryInput = {
      positions: [
        { marketValue: 1000, compositeScore: 0.7, trafficLight: 'green' },
        { marketValue: 1000, compositeScore: 0.5, trafficLight: 'amber' },
        { marketValue: 1000, compositeScore: 0.5, trafficLight: 'amber' },
        { marketValue: 1000, compositeScore: 0.3, trafficLight: 'red' },
      ],
    };

    const result = computePortfolioSummary(input);

    expect(result.greenCount).toBe(1);
    expect(result.amberCount).toBe(2);
    expect(result.redCount).toBe(1);
    // 1 red / 4 total = 25% → medium
    expect(result.overallRisk).toBe('medium');
  });
});
