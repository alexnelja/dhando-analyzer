import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runDistressRadar, type DistressRadarInput } from '../../src/distress/pipeline.js';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import { getDistressSummary, getDistressComponents, getDailySentiment } from '../../src/distress/distress-store.js';
import type { DistressFactors } from '../../src/distress/classification.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedInvestment(db: DatabaseConnection, id: string): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    'listed_stock',
    'Pipeline Test Co',
    'screening',
    'manual',
    'solo-investor',
    now,
    now,
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Distressed but temporary — turnaround candidate. */
const TEMPORARY_FACTORS: DistressFactors = {
  cause: 1,       // external/cyclical
  industry: 2,    // stable industry
  balanceSheet: 3,
  management: 1,  // proven turnaround team
  competition: 2,
  revenueBase: 2,
  assetValue: 2,
};

/** Permanent impairment — no turnaround. */
const PERMANENT_FACTORS: DistressFactors = {
  cause: 9,
  industry: 8,
  balanceSheet: 9,
  management: 8,
  competition: 8,
  revenueBase: 7,
  assetValue: 9,
};

/** Base financial inputs that produce a high composite distress score (>60). */
const HIGH_DISTRESS_FINANCIALS = {
  altmanZ: 0.8,
  piotroskiFCurrent: 6,
  piotroskiFPrior: 4,          // improving F-score
  beneishM: -1.5,
  fcfCurrent: -200_000,
  fcfPrior: 100_000,
  debtToEbitda: 5.5,
  workingCapitalCurrent: -50_000,
  workingCapitalPrior: 100_000,
};

const BASE_TURNAROUND_INPUT: DistressRadarInput = {
  investmentId: 'inv-pipeline-test',
  ...HIGH_DISTRESS_FINANCIALS,
  distressFactors: TEMPORARY_FACTORS,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDistressRadar', () => {
  describe('turnaround candidate detection', () => {
    it('detects turnaround candidate when classification=temporary, F improving, score>60', () => {
      const result = runDistressRadar(BASE_TURNAROUND_INPUT);
      expect(result.classification).toBe('temporary');
      expect(result.compositeDistressScore).toBeGreaterThan(60);
      expect(BASE_TURNAROUND_INPUT.piotroskiFCurrent).toBeGreaterThan(BASE_TURNAROUND_INPUT.piotroskiFPrior);
      expect(result.isTurnaroundCandidate).toBe(true);
    });

    it('is NOT a turnaround candidate when classification=permanent', () => {
      const result = runDistressRadar({
        ...BASE_TURNAROUND_INPUT,
        distressFactors: PERMANENT_FACTORS,
      });
      expect(result.classification).toBe('permanent');
      expect(result.isTurnaroundCandidate).toBe(false);
    });

    it('is NOT a turnaround candidate when F-score is declining', () => {
      const result = runDistressRadar({
        ...BASE_TURNAROUND_INPUT,
        piotroskiFCurrent: 3,
        piotroskiFPrior: 7,  // declining
        distressFactors: TEMPORARY_FACTORS,
      });
      expect(result.isTurnaroundCandidate).toBe(false);
    });

    it('is NOT a turnaround candidate when composite score <= 60', () => {
      // Use a healthy financial profile that produces a low score
      const result = runDistressRadar({
        ...BASE_TURNAROUND_INPUT,
        altmanZ: 4.5,
        piotroskiFCurrent: 8,
        piotroskiFPrior: 6,
        beneishM: -3.0,
        fcfCurrent: 500_000,
        fcfPrior: 400_000,
        debtToEbitda: 0.5,
        workingCapitalCurrent: 1_000_000,
        workingCapitalPrior: 800_000,
        distressFactors: TEMPORARY_FACTORS,
      });
      expect(result.compositeDistressScore).toBeLessThanOrEqual(60);
      expect(result.isTurnaroundCandidate).toBe(false);
    });

    it('is NOT a turnaround candidate when F-score is equal (not strictly greater)', () => {
      const result = runDistressRadar({
        ...BASE_TURNAROUND_INPUT,
        piotroskiFCurrent: 5,
        piotroskiFPrior: 5,
        distressFactors: TEMPORARY_FACTORS,
      });
      expect(result.isTurnaroundCandidate).toBe(false);
    });
  });

  describe('composite distress score', () => {
    it('returns compositeDistressScore in [0, 100]', () => {
      const result = runDistressRadar(BASE_TURNAROUND_INPUT);
      expect(result.compositeDistressScore).toBeGreaterThanOrEqual(0);
      expect(result.compositeDistressScore).toBeLessThanOrEqual(100);
    });

    it('returns compositeComponents with all six keys', () => {
      const result = runDistressRadar(BASE_TURNAROUND_INPUT);
      const expectedKeys = ['altmanZ', 'piotroskiTrend', 'beneishM', 'fcfDeterioration', 'leverage', 'workingCapital'];
      for (const key of expectedKeys) {
        expect(result.compositeComponents).toHaveProperty(key);
      }
    });
  });

  describe('classification', () => {
    it('returns correct permanenceScore for temporary factors', () => {
      const result = runDistressRadar(BASE_TURNAROUND_INPUT);
      expect(result.permanenceScore).toBeLessThan(3.5);
      expect(result.classification).toBe('temporary');
    });

    it('returns permanent classification for severe factors', () => {
      const result = runDistressRadar({
        ...BASE_TURNAROUND_INPUT,
        distressFactors: PERMANENT_FACTORS,
      });
      expect(result.classification).toBe('permanent');
      expect(result.permanenceScore).toBeGreaterThan(6.5);
    });
  });

  describe('sentiment (optional)', () => {
    it('omits sentimentTrend when no headlines provided', () => {
      const result = runDistressRadar(BASE_TURNAROUND_INPUT);
      expect(result.sentimentTrend).toBeUndefined();
    });

    it('computes sentimentTrend when headlines are provided', () => {
      const headlines = Array.from({ length: 20 }, (_, i) => ({
        score: i < 10 ? -0.5 : 0.3,
        confidence: 0.9,
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      }));
      const result = runDistressRadar({ ...BASE_TURNAROUND_INPUT, headlines });
      expect(result.sentimentTrend).toBeDefined();
      expect(['improving', 'deteriorating', 'stable']).toContain(result.sentimentTrend!.trend);
    });

    it('omits sentimentTrend when headlines array is empty', () => {
      const result = runDistressRadar({ ...BASE_TURNAROUND_INPUT, headlines: [] });
      expect(result.sentimentTrend).toBeUndefined();
    });
  });

  describe('geopolitical (optional)', () => {
    it('omits geopoliticalMatches when no articles or rules provided', () => {
      const result = runDistressRadar(BASE_TURNAROUND_INPUT);
      expect(result.geopoliticalMatches).toBeUndefined();
    });

    it('computes geopolitical matches when articles and rules are provided', () => {
      const articles = [
        { title: 'Eskom announces load shedding stage 4', tone: -2.5 },
        { title: 'Load shedding hits SA economy', tone: -3.0 },
        { title: 'Load shedding extended through winter', tone: -2.0 },
      ];
      const rules = [
        {
          eventType: 'load_shedding',
          eventPattern: 'load.?shedding|eskom',
          affectedSectors: ['mining', 'manufacturing'],
          relevanceWeight: 0.8,
          triggerThreshold: 2,
        },
      ];
      const result = runDistressRadar({ ...BASE_TURNAROUND_INPUT, articles, geopoliticalRules: rules });
      expect(result.geopoliticalMatches).toBeDefined();
      expect(result.geopoliticalMatches).toHaveLength(1);
      expect(result.geopoliticalMatches![0].triggered).toBe(true);
    });

    it('omits geopoliticalMatches when rules array is empty', () => {
      const result = runDistressRadar({
        ...BASE_TURNAROUND_INPUT,
        articles: [{ title: 'Some headline', tone: 0 }],
        geopoliticalRules: [],
      });
      expect(result.geopoliticalMatches).toBeUndefined();
    });
  });

  describe('database persistence (optional)', () => {
    let db: DatabaseConnection;

    beforeEach(() => {
      db = createDatabase(':memory:');
      seedInvestment(db, 'inv-pipeline-test');
    });

    afterEach(() => {
      db.close();
    });

    it('persists distress summary when db is provided', () => {
      runDistressRadar(BASE_TURNAROUND_INPUT, db);
      const summary = getDistressSummary(db, 'inv-pipeline-test');
      expect(summary).toBeDefined();
      expect(summary!.classification).toBe('temporary');
    });

    it('persists distress components when db is provided', () => {
      runDistressRadar(BASE_TURNAROUND_INPUT, db);
      const components = getDistressComponents(db, 'inv-pipeline-test');
      expect(components).toHaveLength(7);
    });

    it('persists sentiment when headlines are provided and db is available', () => {
      const headlines = [
        { score: 0.5, confidence: 0.9, date: '2026-01-01' },
        { score: 0.3, confidence: 0.85, date: '2026-01-01' },
      ];
      runDistressRadar({ ...BASE_TURNAROUND_INPUT, headlines }, db);
      const rows = getDailySentiment(db, 'inv-pipeline-test');
      expect(rows).toHaveLength(2);
    });

    it('does not persist when db is not provided', () => {
      // Run without db — no error should be thrown
      expect(() => runDistressRadar(BASE_TURNAROUND_INPUT)).not.toThrow();
    });

    it('returns identical result whether db is provided or not', () => {
      const withoutDb = runDistressRadar(BASE_TURNAROUND_INPUT);
      const withDb = runDistressRadar(BASE_TURNAROUND_INPUT, db);
      // Core analysis should be identical
      expect(withoutDb.compositeDistressScore).toBe(withDb.compositeDistressScore);
      expect(withoutDb.classification).toBe(withDb.classification);
      expect(withoutDb.permanenceScore).toBe(withDb.permanenceScore);
      expect(withoutDb.isTurnaroundCandidate).toBe(withDb.isTurnaroundCandidate);
    });
  });

  describe('result shape', () => {
    it('always includes compositeDistressScore, classification, permanenceScore, isTurnaroundCandidate', () => {
      const result = runDistressRadar(BASE_TURNAROUND_INPUT);
      expect(result).toHaveProperty('compositeDistressScore');
      expect(result).toHaveProperty('compositeComponents');
      expect(result).toHaveProperty('classification');
      expect(result).toHaveProperty('permanenceScore');
      expect(result).toHaveProperty('isTurnaroundCandidate');
    });
  });
});
