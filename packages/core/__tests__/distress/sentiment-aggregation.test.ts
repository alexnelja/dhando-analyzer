import { describe, it, expect } from 'vitest';
import {
  aggregateDailySentiment,
  computeSentimentTrend,
  type HeadlinePrediction,
  type DailySentiment,
} from '../../src/distress/sentiment-aggregation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHeadline(score: number, confidence: number, date: string): HeadlinePrediction {
  return { score, confidence, date };
}

// ---------------------------------------------------------------------------
// aggregateDailySentiment tests
// ---------------------------------------------------------------------------

describe('aggregateDailySentiment', () => {
  describe('empty and minimal inputs', () => {
    it('returns empty array for empty input', () => {
      expect(aggregateDailySentiment([])).toEqual([]);
    });

    it('returns single day as insufficient when only one headline', () => {
      const result = aggregateDailySentiment([makeHeadline(0.5, 0.8, '2026-01-01')]);
      expect(result).toHaveLength(1);
      expect(result[0].sufficient).toBe(false);
      expect(result[0].medianScore).toBe(0);
      expect(result[0].predictionCount).toBe(1);
    });

    it('returns two qualifying headlines on same day as sufficient', () => {
      const headlines = [
        makeHeadline(0.4, 0.8, '2026-01-01'),
        makeHeadline(0.6, 0.9, '2026-01-01'),
      ];
      const result = aggregateDailySentiment(headlines);
      expect(result).toHaveLength(1);
      expect(result[0].sufficient).toBe(true);
      expect(result[0].medianScore).toBeCloseTo(0.5, 5);
      expect(result[0].predictionCount).toBe(2);
    });
  });

  describe('confidence filtering', () => {
    it('excludes predictions below default threshold 0.75', () => {
      const headlines = [
        makeHeadline(0.8, 0.74, '2026-01-01'), // below threshold
        makeHeadline(0.2, 0.76, '2026-01-01'), // above threshold
      ];
      const result = aggregateDailySentiment(headlines);
      // Only one qualifies → insufficient
      expect(result[0].predictionCount).toBe(1);
      expect(result[0].sufficient).toBe(false);
    });

    it('includes predictions exactly at threshold (>= 0.75)', () => {
      const headlines = [
        makeHeadline(0.5, 0.75, '2026-01-01'),
        makeHeadline(0.7, 0.75, '2026-01-01'),
      ];
      const result = aggregateDailySentiment(headlines);
      expect(result[0].predictionCount).toBe(2);
      expect(result[0].sufficient).toBe(true);
    });

    it('uses custom confidence threshold when provided', () => {
      const headlines = [
        makeHeadline(0.4, 0.60, '2026-01-01'),
        makeHeadline(0.8, 0.65, '2026-01-01'),
        makeHeadline(0.9, 0.90, '2026-01-01'),
      ];
      // With threshold 0.55, all three qualify (all confidences >= 0.55)
      const result = aggregateDailySentiment(headlines, 0.55);
      expect(result[0].predictionCount).toBe(3);
      expect(result[0].sufficient).toBe(true);
    });

    it('day with all predictions below threshold is marked insufficient with count 0', () => {
      const headlines = [
        makeHeadline(0.5, 0.50, '2026-01-05'),
        makeHeadline(0.6, 0.60, '2026-01-05'),
      ];
      const result = aggregateDailySentiment(headlines);
      expect(result[0].sufficient).toBe(false);
      expect(result[0].predictionCount).toBe(0);
      expect(result[0].medianScore).toBe(0);
    });
  });

  describe('median computation', () => {
    it('computes correct median for odd number of predictions', () => {
      const headlines = [
        makeHeadline(-0.3, 0.8, '2026-01-01'),
        makeHeadline(0.5, 0.8, '2026-01-01'),
        makeHeadline(0.1, 0.8, '2026-01-01'),
      ];
      const result = aggregateDailySentiment(headlines);
      // Sorted: [-0.3, 0.1, 0.5] → median = 0.1
      expect(result[0].medianScore).toBeCloseTo(0.1, 5);
    });

    it('computes correct median for even number of predictions', () => {
      const headlines = [
        makeHeadline(0.2, 0.8, '2026-01-01'),
        makeHeadline(0.4, 0.8, '2026-01-01'),
        makeHeadline(0.6, 0.8, '2026-01-01'),
        makeHeadline(0.8, 0.8, '2026-01-01'),
      ];
      const result = aggregateDailySentiment(headlines);
      // Sorted: [0.2, 0.4, 0.6, 0.8] → median = (0.4 + 0.6) / 2 = 0.5
      expect(result[0].medianScore).toBeCloseTo(0.5, 5);
    });
  });

  describe('multi-day aggregation', () => {
    it('groups headlines by date and returns one entry per day', () => {
      const headlines = [
        makeHeadline(0.5, 0.8, '2026-01-01'),
        makeHeadline(0.3, 0.8, '2026-01-01'),
        makeHeadline(-0.2, 0.8, '2026-01-02'),
        makeHeadline(-0.4, 0.8, '2026-01-02'),
        makeHeadline(0.1, 0.8, '2026-01-03'),
        makeHeadline(0.2, 0.8, '2026-01-03'),
      ];
      const result = aggregateDailySentiment(headlines);
      expect(result).toHaveLength(3);
    });

    it('sorts results by date ascending', () => {
      const headlines = [
        makeHeadline(0.5, 0.9, '2026-01-03'),
        makeHeadline(0.5, 0.9, '2026-01-03'),
        makeHeadline(-0.2, 0.9, '2026-01-01'),
        makeHeadline(-0.2, 0.9, '2026-01-01'),
        makeHeadline(0.1, 0.9, '2026-01-02'),
        makeHeadline(0.1, 0.9, '2026-01-02'),
      ];
      const result = aggregateDailySentiment(headlines);
      expect(result[0].date).toBe('2026-01-01');
      expect(result[1].date).toBe('2026-01-02');
      expect(result[2].date).toBe('2026-01-03');
    });

    it('marks day with only 1 qualifying as insufficient', () => {
      const headlines = [
        makeHeadline(0.5, 0.8, '2026-01-01'),
        makeHeadline(0.3, 0.9, '2026-01-01'),
        makeHeadline(0.2, 0.8, '2026-01-02'), // only 1 qualifying (enough)
        makeHeadline(0.7, 0.5, '2026-01-02'), // below threshold
      ];
      const result = aggregateDailySentiment(headlines);
      const day2 = result.find((r) => r.date === '2026-01-02')!;
      expect(day2.sufficient).toBe(false);
      expect(day2.predictionCount).toBe(1);
    });

    it('truncates datetime to date string before grouping', () => {
      const headlines = [
        makeHeadline(0.5, 0.9, '2026-01-01T08:30:00Z'),
        makeHeadline(0.3, 0.9, '2026-01-01T15:00:00Z'),
      ];
      const result = aggregateDailySentiment(headlines);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-01-01');
      expect(result[0].sufficient).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// computeSentimentTrend tests
// ---------------------------------------------------------------------------

describe('computeSentimentTrend', () => {
  function makeDailySentiment(date: string, score: number, sufficient = true): DailySentiment {
    return { date, medianScore: score, predictionCount: 2, sufficient };
  }

  describe('empty and insufficient data', () => {
    it('returns stable with avgScore 0 for empty input', () => {
      const result = computeSentimentTrend([]);
      expect(result.trend).toBe('stable');
      expect(result.avgScore).toBe(0);
    });

    it('returns stable with avgScore 0 when all days are insufficient', () => {
      const days: DailySentiment[] = [
        { date: '2026-01-01', medianScore: 0, predictionCount: 1, sufficient: false },
        { date: '2026-01-02', medianScore: 0, predictionCount: 0, sufficient: false },
      ];
      const result = computeSentimentTrend(days);
      expect(result.trend).toBe('stable');
      expect(result.avgScore).toBe(0);
    });
  });

  describe('trend detection', () => {
    it('detects improving trend when recent avg > prior avg by more than 0.05', () => {
      // Prior 7 days: avg ~ 0.1, recent 7 days: avg ~ 0.4 → delta = 0.3 > 0.05
      const days = [
        ...Array.from({ length: 7 }, (_, i) => makeDailySentiment(`2026-01-0${i + 1}`, 0.1)),
        ...Array.from({ length: 7 }, (_, i) => makeDailySentiment(`2026-01-${i + 8 < 10 ? '0' : ''}${i + 8}`, 0.4)),
      ];
      const result = computeSentimentTrend(days);
      expect(result.trend).toBe('improving');
      expect(result.avgScore).toBeCloseTo(0.4, 5);
    });

    it('detects deteriorating trend when recent avg < prior avg by more than 0.05', () => {
      const days = [
        ...Array.from({ length: 7 }, (_, i) => makeDailySentiment(`2026-01-0${i + 1}`, 0.5)),
        ...Array.from({ length: 7 }, (_, i) => makeDailySentiment(`2026-01-${i + 8 < 10 ? '0' : ''}${i + 8}`, 0.1)),
      ];
      const result = computeSentimentTrend(days);
      expect(result.trend).toBe('deteriorating');
      expect(result.avgScore).toBeCloseTo(0.1, 5);
    });

    it('detects stable trend when delta is within ±0.05', () => {
      const days = [
        ...Array.from({ length: 7 }, (_, i) => makeDailySentiment(`2026-01-0${i + 1}`, 0.3)),
        ...Array.from({ length: 7 }, (_, i) => makeDailySentiment(`2026-01-${i + 8 < 10 ? '0' : ''}${i + 8}`, 0.32)),
      ];
      const result = computeSentimentTrend(days);
      expect(result.trend).toBe('stable');
    });

    it('treats delta of exactly 0.04 as stable (within epsilon)', () => {
      // prior avg = 0.30, recent avg = 0.34 → delta = 0.04 < 0.05 → stable
      const prior = Array.from({ length: 7 }, (_, i) =>
        makeDailySentiment(`2026-01-0${i + 1}`, 0.30),
      );
      const recent = Array.from({ length: 7 }, (_, i) =>
        makeDailySentiment(`2026-01-${i + 8 < 10 ? '0' : ''}${i + 8}`, 0.34),
      );
      const result = computeSentimentTrend([...prior, ...recent]);
      expect(result.trend).toBe('stable');
    });
  });

  describe('custom window days', () => {
    it('uses custom windowDays when provided', () => {
      // 3-day window: prior 3 days avg 0.1, recent 3 days avg 0.5 → improving
      const days = [
        makeDailySentiment('2026-01-01', 0.1),
        makeDailySentiment('2026-01-02', 0.1),
        makeDailySentiment('2026-01-03', 0.1),
        makeDailySentiment('2026-01-04', 0.5),
        makeDailySentiment('2026-01-05', 0.5),
        makeDailySentiment('2026-01-06', 0.5),
      ];
      const result = computeSentimentTrend(days, 3);
      expect(result.trend).toBe('improving');
      expect(result.avgScore).toBeCloseTo(0.5, 5);
    });
  });

  describe('insufficient days are excluded from averages', () => {
    it('skips insufficient days when computing trend', () => {
      const days: DailySentiment[] = [
        { date: '2026-01-01', medianScore: 0.1, predictionCount: 2, sufficient: true },
        { date: '2026-01-02', medianScore: 0.0, predictionCount: 1, sufficient: false }, // excluded
        { date: '2026-01-03', medianScore: 0.1, predictionCount: 2, sufficient: true },
        { date: '2026-01-04', medianScore: 0.5, predictionCount: 2, sufficient: true },
        { date: '2026-01-05', medianScore: 0.0, predictionCount: 0, sufficient: false }, // excluded
        { date: '2026-01-06', medianScore: 0.5, predictionCount: 2, sufficient: true },
      ];
      // Only sufficient days: [0.1, 0.1, 0.5, 0.5]
      // With window=2: recent=[0.5, 0.5] avg=0.5, prior=[0.1, 0.1] avg=0.1 → improving
      const result = computeSentimentTrend(days, 2);
      expect(result.trend).toBe('improving');
    });
  });

  describe('edge case: fewer sufficient days than window', () => {
    it('handles fewer sufficient days than windowDays gracefully', () => {
      const days = [
        makeDailySentiment('2026-01-01', 0.3),
        makeDailySentiment('2026-01-02', 0.4),
      ];
      // Only 2 sufficient days, window=7 → recent window is all 2 days, prior is empty
      const result = computeSentimentTrend(days, 7);
      expect(result.trend).toBeDefined();
      expect(result.avgScore).toBeGreaterThan(0);
    });

    it('returns correct avgScore as average of recent window', () => {
      const days = [
        makeDailySentiment('2026-01-01', 0.2),
        makeDailySentiment('2026-01-02', 0.6),
      ];
      const result = computeSentimentTrend(days, 7);
      expect(result.avgScore).toBeCloseTo(0.4, 5);
    });
  });
});
