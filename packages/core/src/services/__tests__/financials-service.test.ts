import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../../data/db.js';
import { getFinancialsForInvestment } from '../../data/financials-repo.js';
import { pullAndSave, saveOverride, reconcile } from '../financials-service.js';
import type { Financial } from '../../models/financial.js';

function seedInvestment(db: DatabaseConnection, id: string) {
  db.run(
    `INSERT INTO investments (id, type, name, ticker, status, created_at, updated_at)
     VALUES (?, 'equity', ?, ?, 'researching', '2025-01-01', '2025-01-01')`,
    id,
    `Co ${id}`,
    'TST',
  );
}

const partial = (year: number, revenue: number): Partial<Financial> => ({
  source: 'api',
  period: 'annual',
  year,
  quarter: null,
  apiSource: 'eodhd',
  revenue,
  netIncome: 100,
  ebitda: 200,
  totalAssets: 5000,
});

describe('financials-service', () => {
  let db: DatabaseConnection;
  beforeEach(() => {
    db = createDatabase(':memory:');
    seedInvestment(db, 'inv1');
    seedInvestment(db, 'inv2');
  });

  it('pullAndSave writes rows with source=api and apiValuesJson populated', async () => {
    const eodhd = vi.fn(async () => [partial(2025, 1000), partial(2024, 900)]);
    await pullAndSave(db, eodhd, 'inv1', 'AAPL.US', 2);
    expect(eodhd).toHaveBeenCalledWith('AAPL.US', 2);

    const rows = getFinancialsForInvestment(db, 'inv1');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === 'api')).toBe(true);
    expect(rows[0].apiValuesJson).toBeTruthy();
    expect(JSON.parse(rows[0].apiValuesJson!).revenue).toBe(1000);
    expect(rows[0].autoUpdated).toBe(true);
  });

  it('pullAndSave clears needs_manual_financials on success', async () => {
    db.run(`UPDATE investments SET needs_manual_financials = 1 WHERE id = 'inv1'`);
    const eodhd = vi.fn(async () => [partial(2025, 1000)]);
    await pullAndSave(db, eodhd, 'inv1', 'AAPL.US', 2);
    const inv = db.get<{ needs_manual_financials: number }>(
      `SELECT needs_manual_financials FROM investments WHERE id = ?`,
      'inv1',
    );
    expect(inv?.needs_manual_financials).toBe(0);
  });

  it('pullAndSave on empty EODHD result flips needs_manual_financials to 1', async () => {
    const eodhd = vi.fn(async () => []);
    await pullAndSave(db, eodhd, 'inv2', 'NODATA.JSE', 2);
    const inv = db.get<{ needs_manual_financials: number }>(
      `SELECT needs_manual_financials FROM investments WHERE id = ?`,
      'inv2',
    );
    expect(inv?.needs_manual_financials).toBe(1);
    expect(getFinancialsForInvestment(db, 'inv2')).toHaveLength(0);
  });

  it('saveOverride merges field names into overriddenFields and persists edits', async () => {
    const eodhd = vi.fn(async () => [partial(2025, 1000)]);
    await pullAndSave(db, eodhd, 'inv1', 'AAPL.US', 1);
    const fin = getFinancialsForInvestment(db, 'inv1')[0];

    saveOverride(db, { ...fin, revenue: 1234, overriddenFields: JSON.stringify(['revenue']) }, [
      'ebitda',
    ]);

    const reloaded = getFinancialsForInvestment(db, 'inv1')[0];
    expect(reloaded.revenue).toBe(1234);
    const overridden = JSON.parse(reloaded.overriddenFields!);
    expect(overridden).toEqual(expect.arrayContaining(['revenue', 'ebitda']));
    expect(overridden).toHaveLength(2); // de-duplicated
  });

  it('reconcile reports overridden fields that diverge from apiValuesJson', () => {
    const fin = {
      revenue: 9999,
      ebitda: 200,
      apiValuesJson: JSON.stringify({ revenue: 1000, ebitda: 200 }),
      overriddenFields: JSON.stringify(['revenue', 'ebitda']),
    } as Financial;

    const diffs = reconcile(fin);
    expect(diffs).toContainEqual({ field: 'revenue', apiValue: 1000, currentValue: 9999 });
    // ebitda override equals the API value → not a divergence.
    expect(diffs.find((d) => d.field === 'ebitda')).toBeUndefined();
  });

  it('reconcile returns [] when there is no apiValuesJson', () => {
    const fin = { revenue: 5, apiValuesJson: null, overriddenFields: null } as Financial;
    expect(reconcile(fin)).toEqual([]);
  });
});
