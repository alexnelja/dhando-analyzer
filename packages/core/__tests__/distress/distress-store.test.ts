import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import {
  saveDistressComponents,
  getDistressComponents,
  saveDistressSummary,
  getDistressSummary,
  saveSentiment,
  getDailySentiment,
} from '../../src/distress/distress-store.js';
import type { DistressFactors } from '../../src/distress/classification.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const INVESTMENT_ID = 'inv-distress-test';

const TEST_FACTORS: DistressFactors = {
  cause: 2,
  industry: 3,
  balanceSheet: 4,
  management: 1,
  competition: 5,
  revenueBase: 2,
  assetValue: 3,
};

function seedInvestment(db: DatabaseConnection, id: string = INVESTMENT_ID): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    'listed_stock',
    'Distress Test Co',
    'screening',
    'manual',
    'solo-investor',
    now,
    now,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('distress-store', () => {
  let db: DatabaseConnection;

  beforeEach(() => {
    db = createDatabase(':memory:');
    seedInvestment(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Distress Components ──────────────────────────────────────────────────

  describe('saveDistressComponents / getDistressComponents', () => {
    it('saves all 7 component rows for an investment', () => {
      saveDistressComponents(db, INVESTMENT_ID, TEST_FACTORS);
      const rows = getDistressComponents(db, INVESTMENT_ID);
      expect(rows).toHaveLength(7);
    });

    it('stores the correct component names', () => {
      saveDistressComponents(db, INVESTMENT_ID, TEST_FACTORS);
      const rows = getDistressComponents(db, INVESTMENT_ID);
      const components = rows.map((r) => r.component).sort();
      expect(components).toEqual([
        'asset_value',
        'balance_sheet',
        'cause',
        'competition',
        'industry',
        'management',
        'revenue_base',
      ]);
    });

    it('stores the correct factor scores', () => {
      saveDistressComponents(db, INVESTMENT_ID, TEST_FACTORS);
      const rows = getDistressComponents(db, INVESTMENT_ID);
      const byComponent = Object.fromEntries(rows.map((r) => [r.component, r.factor_score]));
      expect(byComponent.cause).toBe(2);
      expect(byComponent.industry).toBe(3);
      expect(byComponent.balance_sheet).toBe(4);
      expect(byComponent.management).toBe(1);
      expect(byComponent.competition).toBe(5);
      expect(byComponent.revenue_base).toBe(2);
      expect(byComponent.asset_value).toBe(3);
    });

    it('stores the investment_id on each component row', () => {
      saveDistressComponents(db, INVESTMENT_ID, TEST_FACTORS);
      const rows = getDistressComponents(db, INVESTMENT_ID);
      for (const row of rows) {
        expect(row.investment_id).toBe(INVESTMENT_ID);
      }
    });

    it('assigns a unique id to each component row', () => {
      saveDistressComponents(db, INVESTMENT_ID, TEST_FACTORS);
      const rows = getDistressComponents(db, INVESTMENT_ID);
      const ids = rows.map((r) => r.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(7);
    });

    it('returns empty array for investment with no components', () => {
      const rows = getDistressComponents(db, INVESTMENT_ID);
      expect(rows).toEqual([]);
    });

    it('appends rows on repeated saves (does not overwrite)', () => {
      saveDistressComponents(db, INVESTMENT_ID, TEST_FACTORS);
      saveDistressComponents(db, INVESTMENT_ID, TEST_FACTORS);
      const rows = getDistressComponents(db, INVESTMENT_ID);
      expect(rows).toHaveLength(14); // 7 × 2
    });

    it('does not return components belonging to a different investment', () => {
      seedInvestment(db, 'inv-other');
      saveDistressComponents(db, 'inv-other', TEST_FACTORS);
      const rows = getDistressComponents(db, INVESTMENT_ID);
      expect(rows).toHaveLength(0);
    });

    it('populates calculated_at with an ISO-8601 string', () => {
      saveDistressComponents(db, INVESTMENT_ID, TEST_FACTORS);
      const rows = getDistressComponents(db, INVESTMENT_ID);
      for (const row of rows) {
        expect(() => new Date(row.calculated_at)).not.toThrow();
        expect(new Date(row.calculated_at).toISOString()).toBe(row.calculated_at);
      }
    });
  });

  // ── Distress Summary ─────────────────────────────────────────────────────

  describe('saveDistressSummary / getDistressSummary', () => {
    it('saves and retrieves a distress summary', () => {
      saveDistressSummary(db, INVESTMENT_ID, 72.5, 6.1, 'uncertain');
      const row = getDistressSummary(db, INVESTMENT_ID);
      expect(row).toBeDefined();
      expect(row!.composite_score).toBe(72.5);
      expect(row!.permanence_score).toBe(6.1);
      expect(row!.classification).toBe('uncertain');
    });

    it('returns undefined when no summary exists', () => {
      const row = getDistressSummary(db, INVESTMENT_ID);
      expect(row).toBeUndefined();
    });

    it('stores the investment_id on the summary row', () => {
      saveDistressSummary(db, INVESTMENT_ID, 50, 4.0, 'uncertain');
      const row = getDistressSummary(db, INVESTMENT_ID);
      expect(row!.investment_id).toBe(INVESTMENT_ID);
    });

    it('assigns a unique id', () => {
      saveDistressSummary(db, INVESTMENT_ID, 20, 2.0, 'temporary');
      const row = getDistressSummary(db, INVESTMENT_ID);
      expect(typeof row!.id).toBe('string');
      expect(row!.id).toHaveLength(36); // UUID format
    });

    it('returns some summary when multiple exist (both values retrievable)', () => {
      saveDistressSummary(db, INVESTMENT_ID, 30, 2.5, 'temporary');
      saveDistressSummary(db, INVESTMENT_ID, 80, 7.5, 'permanent');
      // At least one summary row exists for the investment
      const row = getDistressSummary(db, INVESTMENT_ID);
      expect(row).toBeDefined();
      // The returned row should be one of the two saved values
      expect([30, 80]).toContain(row!.composite_score);
      expect(['temporary', 'permanent']).toContain(row!.classification);
    });

    it('does not return summary belonging to a different investment', () => {
      seedInvestment(db, 'inv-other');
      saveDistressSummary(db, 'inv-other', 60, 5.0, 'uncertain');
      const row = getDistressSummary(db, INVESTMENT_ID);
      expect(row).toBeUndefined();
    });

    it.each([
      ['temporary', 20, 2.0],
      ['uncertain', 55, 5.0],
      ['permanent', 85, 8.0],
    ] as Array<['temporary' | 'uncertain' | 'permanent', number, number]>)(
      'saves classification=%s correctly',
      (classification, composite, permanence) => {
        saveDistressSummary(db, INVESTMENT_ID, composite, permanence, classification);
        const row = getDistressSummary(db, INVESTMENT_ID);
        expect(row!.classification).toBe(classification);
      },
    );
  });

  // ── Sentiment ────────────────────────────────────────────────────────────

  describe('saveSentiment / getDailySentiment', () => {
    it('saves and retrieves sentiment rows', () => {
      saveSentiment(db, INVESTMENT_ID, [
        { headline: 'Company reports strong earnings', score: 0.7, confidence: 0.9, date: '2026-01-15' },
        { headline: 'Company faces regulatory probe', score: -0.5, confidence: 0.85, date: '2026-01-16' },
      ]);
      const rows = getDailySentiment(db, INVESTMENT_ID);
      expect(rows).toHaveLength(2);
    });

    it('stores correct fields on each sentiment row', () => {
      saveSentiment(db, INVESTMENT_ID, [
        { headline: 'Strong Q4 results', score: 0.8, confidence: 0.92, date: '2026-01-10', source: 'eodhd' },
      ]);
      const rows = getDailySentiment(db, INVESTMENT_ID);
      expect(rows[0].headline).toBe('Strong Q4 results');
      expect(rows[0].score).toBe(0.8);
      expect(rows[0].confidence).toBe(0.92);
      expect(rows[0].date).toBe('2026-01-10');
      expect(rows[0].source).toBe('eodhd');
    });

    it('defaults source to "manual" when not provided', () => {
      saveSentiment(db, INVESTMENT_ID, [
        { headline: 'Test', score: 0.1, confidence: 0.8, date: '2026-01-01' },
      ]);
      const rows = getDailySentiment(db, INVESTMENT_ID);
      expect(rows[0].source).toBe('manual');
    });

    it('returns empty array when no sentiment rows exist', () => {
      const rows = getDailySentiment(db, INVESTMENT_ID);
      expect(rows).toEqual([]);
    });

    it('assigns unique IDs to each sentiment row', () => {
      saveSentiment(db, INVESTMENT_ID, [
        { headline: 'H1', score: 0.3, confidence: 0.8, date: '2026-01-01' },
        { headline: 'H2', score: -0.2, confidence: 0.9, date: '2026-01-01' },
      ]);
      const rows = getDailySentiment(db, INVESTMENT_ID);
      expect(rows[0].id).not.toBe(rows[1].id);
    });

    it('does not return sentiment from a different investment', () => {
      seedInvestment(db, 'inv-other');
      saveSentiment(db, 'inv-other', [
        { headline: 'Other company news', score: 0.5, confidence: 0.9, date: '2026-01-01' },
      ]);
      const rows = getDailySentiment(db, INVESTMENT_ID);
      expect(rows).toHaveLength(0);
    });

    it('filters by days when days parameter is provided', () => {
      const today = new Date();
      const recentDate = today.toISOString().slice(0, 10);

      // A very old date that should be filtered out
      saveSentiment(db, INVESTMENT_ID, [
        { headline: 'Old news', score: 0.1, confidence: 0.8, date: '2020-01-01' },
        { headline: 'Recent news', score: 0.5, confidence: 0.9, date: recentDate },
      ]);

      const rows = getDailySentiment(db, INVESTMENT_ID, 30);
      // Only the recent one should be within 30 days
      expect(rows.every((r) => r.date >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))).toBe(true);
      expect(rows.some((r) => r.headline === 'Recent news')).toBe(true);
      expect(rows.some((r) => r.headline === 'Old news')).toBe(false);
    });

    it('returns all sentiment rows when no days parameter is provided', () => {
      saveSentiment(db, INVESTMENT_ID, [
        { headline: 'Old news', score: 0.1, confidence: 0.8, date: '2020-01-01' },
        { headline: 'Recent news', score: 0.5, confidence: 0.9, date: '2026-01-15' },
      ]);
      const rows = getDailySentiment(db, INVESTMENT_ID);
      expect(rows).toHaveLength(2);
    });
  });

  // ── FK constraints ───────────────────────────────────────────────────────

  describe('foreign key constraints', () => {
    it('throws when saving distress components for a non-existent investment', () => {
      expect(() =>
        saveDistressComponents(db, 'inv-does-not-exist', TEST_FACTORS),
      ).toThrow();
    });

    it('throws when saving distress summary for a non-existent investment', () => {
      expect(() =>
        saveDistressSummary(db, 'inv-does-not-exist', 50, 4.0, 'uncertain'),
      ).toThrow();
    });

    it('throws when saving sentiment for a non-existent investment', () => {
      expect(() =>
        saveSentiment(db, 'inv-does-not-exist', [
          { headline: 'Test', score: 0, confidence: 1, date: '2026-01-01' },
        ]),
      ).toThrow();
    });
  });
});
