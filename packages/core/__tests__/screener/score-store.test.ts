import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../src/data/db.js';
import { saveScore, getLatestScore, listScoresForInvestment } from '../../src/screener/score-store.js';

let db: DatabaseConnection;

/** Insert a minimal investments row so FK constraints are satisfied. */
function seedInvestment(db: DatabaseConnection, id: string): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO investments (id, type, name, status, data_source, user_id, created_at, updated_at)
     VALUES (?, 'listed_stock', 'Test Co', 'screening', 'manual', 'solo-investor', ?, ?)`,
    id, now, now,
  );
}

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

describe('saveScore', () => {
  it('inserts a score and returns a non-empty id', () => {
    seedInvestment(db, 'inv-1');
    const id = saveScore(db, {
      investmentId: 'inv-1',
      scoreType: 'altman_z',
      value: 3.5,
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('score is retrievable after saving', () => {
    seedInvestment(db, 'inv-1');
    saveScore(db, { investmentId: 'inv-1', scoreType: 'piotroski_f', value: 7 });

    const latest = getLatestScore(db, 'inv-1', 'piotroski_f');
    expect(latest).toBeDefined();
    expect(latest!.value).toBe(7);
    expect(latest!.score_type).toBe('piotroski_f');
  });

  it('does not set stale_warning when dataStalenessHours <= 72', () => {
    seedInvestment(db, 'inv-1');
    saveScore(db, { investmentId: 'inv-1', scoreType: 'composite', value: 55, dataStalenessHours: 72 });

    const row = getLatestScore(db, 'inv-1', 'composite');
    expect(row!.stale_warning).toBe(0);
  });

  it('auto-sets stale_warning to true when dataStalenessHours > 72', () => {
    seedInvestment(db, 'inv-1');
    saveScore(db, { investmentId: 'inv-1', scoreType: 'altman_z', value: 2.1, dataStalenessHours: 73 });

    const row = getLatestScore(db, 'inv-1', 'altman_z');
    expect(row!.stale_warning).toBe(1);
  });

  it('respects an explicit staleWarning override', () => {
    seedInvestment(db, 'inv-1');
    // dataStalenessHours is 10 but staleWarning is forced true.
    saveScore(db, {
      investmentId: 'inv-1',
      scoreType: 'beneish_m',
      value: -2.3,
      dataStalenessHours: 10,
      staleWarning: true,
    });

    const row = getLatestScore(db, 'inv-1', 'beneish_m');
    expect(row!.stale_warning).toBe(1);
  });

  it('persists inputsJson correctly', () => {
    seedInvestment(db, 'inv-1');
    saveScore(db, {
      investmentId: 'inv-1',
      scoreType: 'composite',
      value: 60,
      inputsJson: { z: 3.5, f: 7, m: -2.1 },
    });

    const row = getLatestScore(db, 'inv-1', 'composite');
    expect(JSON.parse(row!.inputs_json)).toEqual({ z: 3.5, f: 7, m: -2.1 });
  });
});

describe('getLatestScore', () => {
  it('returns undefined when no scores exist', () => {
    seedInvestment(db, 'inv-1');
    expect(getLatestScore(db, 'inv-1', 'altman_z')).toBeUndefined();
  });

  it('returns the most recent score when multiple exist for the same type', () => {
    seedInvestment(db, 'inv-1');
    saveScore(db, {
      investmentId: 'inv-1',
      scoreType: 'altman_z',
      value: 2.0,
      calculatedAt: '2025-01-01T00:00:00.000Z',
    });
    saveScore(db, {
      investmentId: 'inv-1',
      scoreType: 'altman_z',
      value: 3.5,
      calculatedAt: '2025-06-01T00:00:00.000Z',
    });

    const latest = getLatestScore(db, 'inv-1', 'altman_z');
    expect(latest!.value).toBe(3.5);
  });

  it('does not mix score types', () => {
    seedInvestment(db, 'inv-1');
    saveScore(db, { investmentId: 'inv-1', scoreType: 'altman_z', value: 4.0 });
    saveScore(db, { investmentId: 'inv-1', scoreType: 'piotroski_f', value: 8 });

    const altman = getLatestScore(db, 'inv-1', 'altman_z');
    expect(altman!.score_type).toBe('altman_z');
    expect(altman!.value).toBe(4.0);
  });
});

describe('listScoresForInvestment', () => {
  it('returns an empty array when no scores exist', () => {
    seedInvestment(db, 'inv-1');
    expect(listScoresForInvestment(db, 'inv-1')).toHaveLength(0);
  });

  it('returns all scores for an investment', () => {
    seedInvestment(db, 'inv-1');
    saveScore(db, { investmentId: 'inv-1', scoreType: 'altman_z', value: 3.5 });
    saveScore(db, { investmentId: 'inv-1', scoreType: 'piotroski_f', value: 7 });
    saveScore(db, { investmentId: 'inv-1', scoreType: 'composite', value: 65 });

    expect(listScoresForInvestment(db, 'inv-1')).toHaveLength(3);
  });

  it('orders scores by calculated_at descending', () => {
    seedInvestment(db, 'inv-1');
    saveScore(db, {
      investmentId: 'inv-1',
      scoreType: 'altman_z',
      value: 2.0,
      calculatedAt: '2025-01-01T00:00:00.000Z',
    });
    saveScore(db, {
      investmentId: 'inv-1',
      scoreType: 'altman_z',
      value: 4.0,
      calculatedAt: '2025-06-01T00:00:00.000Z',
    });

    const rows = listScoresForInvestment(db, 'inv-1');
    expect(rows[0].value).toBe(4.0);
    expect(rows[1].value).toBe(2.0);
  });

  it('does not return scores for a different investment', () => {
    seedInvestment(db, 'inv-1');
    seedInvestment(db, 'inv-2');
    saveScore(db, { investmentId: 'inv-1', scoreType: 'altman_z', value: 3.5 });
    saveScore(db, { investmentId: 'inv-2', scoreType: 'altman_z', value: 1.2 });

    const scores = listScoresForInvestment(db, 'inv-1');
    expect(scores).toHaveLength(1);
    expect(scores[0].value).toBe(3.5);
  });
});
