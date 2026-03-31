import { describe, it, expect } from 'vitest';
import {
  computePositionMetrics,
  type PositionInput,
} from '../../src/portfolio/position.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Profitable position, overweight relative to Kelly. */
const PROFITABLE_INPUT: PositionInput = {
  costBasis: 100,
  currentPrice: 130,
  shares: 100,
  totalPortfolioValue: 100_000,
  kellyOptimal: 0.1, // 10% optimal
};

/** Losing position, underweight relative to Kelly. */
const LOSING_INPUT: PositionInput = {
  costBasis: 200,
  currentPrice: 160,
  shares: 50,
  totalPortfolioValue: 100_000,
  kellyOptimal: 0.15, // 15% optimal
};

/** Position exactly at Kelly-optimal weight. */
const KELLY_MATCH_INPUT: PositionInput = {
  costBasis: 50,
  currentPrice: 100,
  shares: 200,
  totalPortfolioValue: 200_000, // marketValue = 20_000 => weight = 0.10
  kellyOptimal: 0.1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computePositionMetrics', () => {
  describe('profitable position (overweight)', () => {
    it('computes market value correctly', () => {
      const result = computePositionMetrics(PROFITABLE_INPUT);
      // 100 shares * $130 = $13,000
      expect(result.marketValue).toBe(13_000);
    });

    it('computes return percentage correctly', () => {
      const result = computePositionMetrics(PROFITABLE_INPUT);
      // (130 - 100) / 100 = 0.30 = 30%
      expect(result.returnPct).toBeCloseTo(0.3, 10);
    });

    it('computes absolute return correctly', () => {
      const result = computePositionMetrics(PROFITABLE_INPUT);
      // (130 - 100) * 100 = $3,000
      expect(result.returnAbsolute).toBe(3_000);
    });

    it('computes current weight correctly', () => {
      const result = computePositionMetrics(PROFITABLE_INPUT);
      // 13,000 / 100,000 = 0.13
      expect(result.currentWeight).toBeCloseTo(0.13, 10);
    });

    it('passes through kellyOptimal unchanged', () => {
      const result = computePositionMetrics(PROFITABLE_INPUT);
      expect(result.kellyOptimal).toBe(0.1);
    });

    it('detects overweight: drift is positive', () => {
      const result = computePositionMetrics(PROFITABLE_INPUT);
      // 0.13 - 0.10 = +0.03
      expect(result.driftFromOptimal).toBeCloseTo(0.03, 10);
      expect(result.driftAbsolute).toBeCloseTo(0.03, 10);
      expect(result.overweight).toBe(true);
    });
  });

  describe('losing position (underweight)', () => {
    it('computes negative return percentage', () => {
      const result = computePositionMetrics(LOSING_INPUT);
      // (160 - 200) / 200 = -0.20 = -20%
      expect(result.returnPct).toBeCloseTo(-0.2, 10);
    });

    it('computes negative absolute return', () => {
      const result = computePositionMetrics(LOSING_INPUT);
      // (160 - 200) * 50 = -$2,000
      expect(result.returnAbsolute).toBe(-2_000);
    });

    it('detects underweight: drift is negative', () => {
      const result = computePositionMetrics(LOSING_INPUT);
      // weight = 8,000 / 100,000 = 0.08; drift = 0.08 - 0.15 = -0.07
      expect(result.driftFromOptimal).toBeCloseTo(-0.07, 10);
      expect(result.driftAbsolute).toBeCloseTo(0.07, 10);
      expect(result.overweight).toBe(false);
    });
  });

  describe('Kelly-exact match', () => {
    it('drift is zero when current weight equals kellyOptimal', () => {
      const result = computePositionMetrics(KELLY_MATCH_INPUT);
      // marketValue = 200 * 100 = 20,000; weight = 20,000 / 200,000 = 0.10
      expect(result.currentWeight).toBeCloseTo(0.1, 10);
      expect(result.driftFromOptimal).toBeCloseTo(0, 10);
      expect(result.driftAbsolute).toBeCloseTo(0, 10);
      expect(result.overweight).toBe(false);
    });
  });

  describe('validation errors', () => {
    it('throws when totalPortfolioValue is zero', () => {
      expect(() =>
        computePositionMetrics({ ...PROFITABLE_INPUT, totalPortfolioValue: 0 }),
      ).toThrow('totalPortfolioValue must be > 0');
    });

    it('throws when totalPortfolioValue is negative', () => {
      expect(() =>
        computePositionMetrics({
          ...PROFITABLE_INPUT,
          totalPortfolioValue: -500,
        }),
      ).toThrow('totalPortfolioValue must be > 0');
    });

    it('throws when shares is zero', () => {
      expect(() =>
        computePositionMetrics({ ...PROFITABLE_INPUT, shares: 0 }),
      ).toThrow('shares must be > 0');
    });

    it('throws when shares is negative', () => {
      expect(() =>
        computePositionMetrics({ ...PROFITABLE_INPUT, shares: -10 }),
      ).toThrow('shares must be > 0');
    });

    it('throws when costBasis is zero', () => {
      expect(() =>
        computePositionMetrics({ ...PROFITABLE_INPUT, costBasis: 0 }),
      ).toThrow('costBasis must be > 0');
    });

    it('throws when costBasis is negative', () => {
      expect(() =>
        computePositionMetrics({ ...PROFITABLE_INPUT, costBasis: -1 }),
      ).toThrow('costBasis must be > 0');
    });
  });
});
