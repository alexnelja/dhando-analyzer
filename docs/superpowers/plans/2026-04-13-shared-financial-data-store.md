# Shared Financial Data Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `financials` SQLite table end-to-end so all pages share one data source, auto-compute Altman/Piotroski/Beneish scores, and warn on EODHD-vs-manual divergences.

**Architecture:** Extend `Financial` model (+13 fields), add CRUD repo + EODHD puller + Claude extractor in `@dhando/core`, expose via new `dhando:financials:*` IPC handlers + preload bridge, replace per-page form state with a shared `useFinancials` hook that auto-invalidates on a `dhando:financials:changed` IPC event.

**Tech Stack:** TypeScript, Electron, React, better-sqlite3, Vitest, Zod (new dep), Anthropic SDK (existing), EODHD REST API (existing client style).

**Spec:** `docs/superpowers/specs/2026-04-13-shared-financial-data-store-design.md`

---

## File Structure

**Created:**
- `packages/core/src/data/financials-repo.ts` — CRUD + 2-year fetch
- `packages/core/src/data/__tests__/financials-repo.test.ts`
- `packages/core/src/api/eodhd-statements.ts` — EODHD fundamentals→Financial mapper
- `packages/core/src/api/__tests__/eodhd-statements.test.ts`
- `packages/core/src/api/claude-extractor.ts` — Claude → Financial[]
- `packages/core/src/api/claude-extractor-schema.ts` — Zod schemas
- `packages/core/src/api/__tests__/claude-extractor.test.ts`
- `packages/core/src/services/financials-service.ts` — pull / save / reconcile orchestration
- `packages/core/src/services/__tests__/financials-service.test.ts`
- `packages/core/src/scoring/__tests__/altman-z-from-financials.test.ts`
- `packages/core/src/scoring/__tests__/piotroski-f-from-financials.test.ts`
- `packages/core/src/scoring/__tests__/beneish-m-from-financials.test.ts`
- `packages/desktop/src/main/__tests__/financials-ipc.test.ts`
- `packages/desktop/src/renderer/hooks/useFinancials.ts`
- `packages/desktop/src/renderer/hooks/__tests__/useFinancials.test.tsx`
- `packages/desktop/src/renderer/pages/Financials.tsx`

**Modified:**
- `packages/core/src/models/financial.ts` — +13 fields
- `packages/core/src/models/investment.ts` — +`marketCap`, +`needsManualFinancials`
- `packages/core/src/data/db.ts` — `ALTER TABLE` migration block
- `packages/core/src/data/schema.ts` — Drizzle defs (type-only)
- `packages/core/src/scoring/altman-z.ts` — add `calculateAltmanZFromFinancials`
- `packages/core/src/scoring/piotroski-f.ts` — add `calculatePiotroskiFFromFinancials`
- `packages/core/src/scoring/beneish-m.ts` — add `calculateBeneishMFromFinancials`
- `packages/core/src/index.ts` — export new modules
- `packages/desktop/src/main/index.ts` — register handlers, emit `changed` events
- `packages/desktop/src/main/preload.ts` — add `financials` namespace
- `packages/desktop/src/renderer/lib/ipc.ts` — replace stubs with IPC calls; remove `StoredFinancials` + `browserFinancials`
- `packages/desktop/src/renderer/App.tsx` — route for new `Financials` page
- `packages/desktop/src/renderer/pages/DistressRadar.tsx` — drop local form state, use hook
- `packages/desktop/src/renderer/pages/Screener.tsx` — read from store
- `packages/desktop/src/renderer/pages/DealAnalyzer.tsx` — pre-fill from store
- `packages/desktop/src/renderer/pages/MagicFormula.tsx` — read from store
- `packages/desktop/src/renderer/pages/Calculator.tsx` — read from store
- `packages/desktop/src/renderer/pages/Watchlist.tsx` — yellow banner + actions

---

## Task 1: Migration + extend `Financial` model

**Files:**
- Modify: `packages/core/src/models/financial.ts`
- Modify: `packages/core/src/models/investment.ts`
- Modify: `packages/core/src/data/db.ts` (add `runMigrations` after `sqlite.exec(CREATE_TABLES_SQL)`)
- Modify: `packages/core/src/data/schema.ts` (add new columns to Drizzle defs)
- Test: `packages/core/src/data/__tests__/migrations.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/data/__tests__/migrations.test.ts
import { describe, it, expect } from 'vitest';
import { createDatabase } from '../db';

describe('migrations', () => {
  it('adds new financial columns idempotently', () => {
    const db = createDatabase(':memory:');
    const cols = db.all<{ name: string }>(`PRAGMA table_info(financials)`).map(c => c.name);
    expect(cols).toEqual(expect.arrayContaining([
      'retained_earnings', 'ebit', 'total_liabilities', 'long_term_debt',
      'current_assets', 'current_liabilities', 'shares_outstanding',
      'gross_profit', 'receivables', 'ppe', 'depreciation', 'sga',
      'cash_from_ops', 'api_values_json', 'overridden_fields',
    ]));
    db.close();
  });

  it('adds market_cap + needs_manual_financials to investments', () => {
    const db = createDatabase(':memory:');
    const cols = db.all<{ name: string }>(`PRAGMA table_info(investments)`).map(c => c.name);
    expect(cols).toContain('market_cap');
    expect(cols).toContain('needs_manual_financials');
    db.close();
  });

  it('is safe to run on a re-opened database', () => {
    const db1 = createDatabase('/tmp/dhando-mig-test.db');
    db1.close();
    expect(() => {
      const db2 = createDatabase('/tmp/dhando-mig-test.db');
      db2.close();
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run src/data/__tests__/migrations.test.ts`
Expected: FAIL — new columns absent.

- [ ] **Step 3: Add migrations + extend types**

In `packages/core/src/data/db.ts`, after `sqlite.exec(CREATE_TABLES_SQL);` add:

```ts
function runMigrations(sqlite: Database.Database): void {
  const addColumn = (table: string, col: string, decl: string) => {
    try { sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`); } catch (e: any) {
      if (!String(e.message).includes('duplicate column')) throw e;
    }
  };
  const financialCols: [string, string][] = [
    ['retained_earnings', 'REAL'], ['ebit', 'REAL'], ['total_liabilities', 'REAL'],
    ['long_term_debt', 'REAL'], ['current_assets', 'REAL'], ['current_liabilities', 'REAL'],
    ['shares_outstanding', 'REAL'], ['gross_profit', 'REAL'], ['receivables', 'REAL'],
    ['ppe', 'REAL'], ['depreciation', 'REAL'], ['sga', 'REAL'], ['cash_from_ops', 'REAL'],
    ['api_values_json', 'TEXT'], ['overridden_fields', 'TEXT'],
  ];
  for (const [c, t] of financialCols) addColumn('financials', c, t);
  addColumn('investments', 'market_cap', 'REAL');
  addColumn('investments', 'needs_manual_financials', 'INTEGER DEFAULT 0');
}
```

Call `runMigrations(sqlite)` immediately after `sqlite.exec(CREATE_TABLES_SQL)`.

Update `packages/core/src/models/financial.ts`:

```ts
export interface Financial {
  // ...existing 20 fields...
  retainedEarnings: number | null;
  ebit: number | null;
  totalLiabilities: number | null;
  longTermDebt: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  sharesOutstanding: number | null;
  grossProfit: number | null;
  receivables: number | null;
  ppe: number | null;
  depreciation: number | null;
  sga: number | null;
  cashFromOps: number | null;
  apiValuesJson: string | null;
  overriddenFields: string | null;
}
```

Update `packages/core/src/models/investment.ts` to include `marketCap: number | null` and `needsManualFinancials: boolean`.

Update `packages/core/src/data/schema.ts` Drizzle defs to mirror the new columns (`real('retained_earnings')`, etc.).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run src/data/__tests__/migrations.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/{data,models}
git commit -m "feat(core): extend Financial + Investment schemas with auto-calc fields"
```

---

## Task 2: `financials-repo` — CRUD + 2-year fetch

**Files:**
- Create: `packages/core/src/data/financials-repo.ts`
- Test: `packages/core/src/data/__tests__/financials-repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/data/__tests__/financials-repo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../db';
import { saveFinancial, getFinancialsForInvestment, getCurrentAndPrior } from '../financials-repo';

const fixture = (overrides: any = {}) => ({
  id: overrides.id ?? 'f1',
  investmentId: overrides.investmentId ?? 'inv1',
  source: 'api' as const,
  period: 'annual' as const,
  year: overrides.year ?? 2025,
  quarter: null,
  revenue: 1000, netIncome: 100, ebitda: 200, totalAssets: 5000, totalDebt: 1000,
  cash: 500, capex: 100, fcf: 80, workingCapital: 800,
  retainedEarnings: 2000, ebit: 180, totalLiabilities: 2500, longTermDebt: 800,
  currentAssets: 1500, currentLiabilities: 700, sharesOutstanding: 1_000_000,
  grossProfit: 400, receivables: 200, ppe: 3000, depreciation: 50, sga: 150,
  cashFromOps: 120,
  autoUpdated: false, lastRefresh: null, apiSource: 'eodhd',
  apiValuesJson: null, overriddenFields: null,
  ...overrides,
});

describe('financials-repo', () => {
  let db: DatabaseConnection;
  beforeEach(() => {
    db = createDatabase(':memory:');
    db.run(`INSERT INTO investments (id, name, ticker, status) VALUES (?, ?, ?, ?)`,
      'inv1', 'Test', 'TST', 'researching');
  });

  it('round-trips all 22 numeric fields', () => {
    saveFinancial(db, fixture());
    const rows = getFinancialsForInvestment(db, 'inv1');
    expect(rows).toHaveLength(1);
    expect(rows[0].retainedEarnings).toBe(2000);
    expect(rows[0].cashFromOps).toBe(120);
  });

  it('returns current + prior in correct order', () => {
    saveFinancial(db, fixture({ id: 'f24', year: 2024 }));
    saveFinancial(db, fixture({ id: 'f25', year: 2025 }));
    saveFinancial(db, fixture({ id: 'f23', year: 2023 }));
    const { current, prior } = getCurrentAndPrior(db, 'inv1');
    expect(current?.year).toBe(2025);
    expect(prior?.year).toBe(2024);
  });

  it('upsert: same investmentId+period+year+quarter overwrites', () => {
    saveFinancial(db, fixture());
    saveFinancial(db, fixture({ revenue: 2000 }));
    const rows = getFinancialsForInvestment(db, 'inv1');
    expect(rows).toHaveLength(1);
    expect(rows[0].revenue).toBe(2000);
  });

  it('persists overriddenFields as JSON array', () => {
    saveFinancial(db, fixture({ overriddenFields: JSON.stringify(['revenue', 'ebitda']) }));
    const rows = getFinancialsForInvestment(db, 'inv1');
    expect(JSON.parse(rows[0].overriddenFields!)).toEqual(['revenue', 'ebitda']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run src/data/__tests__/financials-repo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement repo**

Create `packages/core/src/data/financials-repo.ts` with three exports: `saveFinancial`, `getFinancialsForInvestment`, `getCurrentAndPrior`. Use parameterised SQL. Use a single `mapRow` helper that converts snake_case columns to camelCase `Financial`. Use upsert pattern: `INSERT … ON CONFLICT(investmentId, period, year, quarter) DO UPDATE SET …`. Add a unique index in `db.ts` migration if not present: `CREATE UNIQUE INDEX IF NOT EXISTS idx_financials_unique ON financials(investment_id, period, year, quarter)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run src/data/__tests__/financials-repo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/data/financials-repo.ts packages/core/src/data/__tests__/financials-repo.test.ts packages/core/src/data/db.ts
git commit -m "feat(core): financials-repo CRUD with upsert + 2-year fetch"
```

---

## Task 3: `calculateAltmanZFromFinancials` adapter

**Files:**
- Modify: `packages/core/src/scoring/altman-z.ts`
- Test: `packages/core/src/scoring/__tests__/altman-z-from-financials.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { calculateAltmanZFromFinancials } from '../altman-z';

const f = (overrides: any = {}) => ({
  workingCapital: 800, totalAssets: 5000, retainedEarnings: 2000,
  ebit: 180, totalLiabilities: 2500, ebitda: 200, depreciation: 50,
  revenue: 1000,
  ...overrides,
}) as any;

describe('calculateAltmanZFromFinancials', () => {
  it('returns Z-score when all fields present', () => {
    const r = calculateAltmanZFromFinancials(f(), { marketCap: 4_000_000 });
    expect('z' in r ? r.z : null).toBeGreaterThan(0);
  });
  it('falls back to ebitda - depreciation when ebit is null', () => {
    const r = calculateAltmanZFromFinancials(f({ ebit: null }), { marketCap: 4e6 });
    expect('z' in r).toBe(true);
  });
  it('returns insufficient when retainedEarnings is null and no fallback', () => {
    const r = calculateAltmanZFromFinancials(f({ retainedEarnings: null }), { marketCap: 4e6 });
    expect((r as any).status).toBe('insufficient');
    expect((r as any).missingFields).toContain('retainedEarnings');
  });
  it('returns insufficient when marketCap is null', () => {
    const r = calculateAltmanZFromFinancials(f(), { marketCap: null });
    expect((r as any).status).toBe('insufficient');
    expect((r as any).missingFields).toContain('marketCap');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (function not exported).

- [ ] **Step 3: Implement adapter** in `altman-z.ts`. Compute `effectiveEbit = current.ebit ?? (current.ebitda != null && current.depreciation != null ? current.ebitda - current.depreciation : null)`. Collect missing-field names; if any, return `{ status: 'insufficient', missingFields }`. Otherwise call existing `calculateAltmanZ`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scoring/altman-z.ts packages/core/src/scoring/__tests__/altman-z-from-financials.test.ts
git commit -m "feat(core): altman-z adapter accepting Financial + marketCap"
```

---

## Task 4: `calculatePiotroskiFFromFinancials` adapter

**Files:**
- Modify: `packages/core/src/scoring/piotroski-f.ts`
- Test: `packages/core/src/scoring/__tests__/piotroski-f-from-financials.test.ts`

- [ ] **Step 1: Write failing test** — same pattern as Task 3. Two `Financial` args (current, prior). Tests: full-data happy path, missing `cashFromOps` returns insufficient, missing prior returns insufficient.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement adapter** wrapping existing `calculatePiotroskiF`. Compute deltas (current ratio change, debt/asset change, gross margin change, asset turnover change, share issuance) inside the adapter.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(core): piotroski-f adapter accepting current+prior Financial"
```

---

## Task 5: `calculateBeneishMFromFinancials` adapter

**Files:**
- Modify: `packages/core/src/scoring/beneish-m.ts`
- Test: `packages/core/src/scoring/__tests__/beneish-m-from-financials.test.ts`

- [ ] Steps 1–5: same TDD pattern. Adapter takes `(current, prior)`. Computes 8 ratios (DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA) from raw fields. TATA = `(netIncome - cashFromOps) / totalAssets`.

```bash
git commit -am "feat(core): beneish-m adapter accepting current+prior Financial"
```

---

## Task 6: EODHD statements client

**Files:**
- Create: `packages/core/src/api/eodhd-statements.ts`
- Test: `packages/core/src/api/__tests__/eodhd-statements.test.ts`

- [ ] **Step 1: Write failing test** — mock global `fetch` (Vitest `vi.stubGlobal`). Test cases: maps `Financials::Income_Statement::yearly[<year>].totalRevenue → revenue` etc. for all 22 fields; returns `[]` on 404; throws on 429 (rate limit).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `pullStatements(apiKey: string, ticker: string, years: number): Promise<Partial<Financial>[]>`. Endpoint: `https://eodhd.com/api/fundamentals/${ticker}?api_token=${apiKey}&fmt=json`. Map fields per EODHD docs; pure mapping function `mapEodhdToFinancial(year: string, raw: any): Partial<Financial>` separately exported for testability.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api/eodhd-statements.ts packages/core/src/api/__tests__/eodhd-statements.test.ts
git commit -m "feat(core): EODHD fundamentals → Financial mapper"
```

---

## Task 7: Claude extractor + Zod schema

**Files:**
- Create: `packages/core/src/api/claude-extractor-schema.ts`
- Create: `packages/core/src/api/claude-extractor.ts`
- Test: `packages/core/src/api/__tests__/claude-extractor.test.ts`

- [ ] **Step 0: Add Zod dependency**

```bash
cd packages/core && pnpm add zod
```

- [ ] **Step 1: Write the schema** in `claude-extractor-schema.ts` exactly as in spec §5.2.

- [ ] **Step 2: Write failing test** — mock the existing `createClaudeClient`. Cases: valid JSON → returns parsed `Financial[]`; markdown-fenced JSON → strips fences and parses; invalid JSON → throws `ExtractError` with `.rawText`; missing required `year` → throws.

- [ ] **Step 3: Implement** `extractFinancialsFromText(client, investmentId, text): Promise<Financial[]>`. System prompt instructs "Output only JSON matching this schema {…}". Strip fences using existing regex pattern from `ipc.ts:954`. Validate with Zod. Map to full `Financial` with `source='manual'`, `apiValuesJson=null`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api/claude-extractor* packages/core/src/api/__tests__/claude-extractor.test.ts packages/core/package.json packages/core/../../pnpm-lock.yaml
git commit -m "feat(core): claude extractor with zod-validated output"
```

---

## Task 8: `financials-service` — orchestration

**Files:**
- Create: `packages/core/src/services/financials-service.ts`
- Test: `packages/core/src/services/__tests__/financials-service.test.ts`

- [ ] **Step 1: Write failing test** — uses in-memory db + mocked `pullStatements`. Cases:
  - `pullAndSave(db, eodhdFn, investmentId, ticker, 2)` writes 2 rows with `source='api'` and `apiValuesJson` populated.
  - `saveOverride(db, financial, ['revenue', 'ebitda'])` merges into `overriddenFields`.
  - `reconcile(financial)` returns `{ field, apiValue, currentValue }[]` for fields where override ≠ apiValue.
  - `pullAndSave` on EODHD-empty result sets `investments.needs_manual_financials = 1`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Service composes `financials-repo` + `eodhd-statements`. Uses transactions for multi-row pulls.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(core): financials-service orchestrating pull+save+reconcile"
```

---

## Task 9: Export new modules from `@dhando/core`

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1:** Add re-exports for `financials-repo`, `eodhd-statements`, `claude-extractor`, `claude-extractor-schema`, `financials-service`, and the three new `*FromFinancials` adapter functions.

- [ ] **Step 2: Run** `cd packages/core && pnpm build` → expect green.

- [ ] **Step 3: Commit**

```bash
git commit -am "chore(core): export new financials modules"
```

---

## Task 10: IPC handlers + preload bridge

**Files:**
- Modify: `packages/desktop/src/main/index.ts`
- Modify: `packages/desktop/src/main/preload.ts`
- Test: `packages/desktop/src/main/__tests__/financials-ipc.test.ts`

- [ ] **Step 1: Write failing integration test** — simulate IPC calls by directly invoking the registered handler functions (export them by name from `index.ts` for testability). Cases: `get`, `save`, `pull` (mocked EODHD), `extractFromText` (mocked Claude).

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement handlers** in `main/index.ts`:

```ts
ipcMain.handle('dhando:financials:get', (_e, investmentId: string) => {
  return getFinancialsForInvestment(getDb(), investmentId);
});
ipcMain.handle('dhando:financials:save', (_e, financial: Financial) => {
  saveFinancial(getDb(), financial);
  emitChanged(financial.investmentId);
});
ipcMain.handle('dhando:financials:pull', async (_e, investmentId: string, ticker: string, years = 2) => {
  const apiKey = process.env.EODHD_API_KEY ?? '';
  await pullAndSave(getDb(), (t, y) => pullStatements(apiKey, t, y), investmentId, ticker, years);
  emitChanged(investmentId);
});
ipcMain.handle('dhando:financials:extractFromText', async (_e, investmentId: string, text: string) => {
  if (!claudeClient) throw new Error('ANTHROPIC_API_KEY not configured');
  const rows = await extractFinancialsFromText(claudeClient, investmentId, text);
  for (const row of rows) saveFinancial(getDb(), row);
  emitChanged(investmentId);
});

function emitChanged(investmentId: string) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('dhando:financials:changed', investmentId);
  }
}
```

Add the `financials` namespace to `preload.ts` exactly per spec §3.1.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(desktop): financials IPC handlers + preload bridge + changed event"
```

---

## Task 11: Replace renderer IPC stubs

**Files:**
- Modify: `packages/desktop/src/renderer/lib/ipc.ts`

- [ ] **Step 1:** Delete `StoredFinancials` interface, `browserFinancials` array, and the `loadFromStorage('dhando_financials', …)` line. Replace `saveFinancials`/`getFinancials` bodies with direct IPC calls:

```ts
export async function saveFinancials(financial: Financial): Promise<void> {
  return (window as any).dhando.financials.save(financial);
}
export async function getFinancials(investmentId: string): Promise<Financial[]> {
  return (window as any).dhando.financials.get(investmentId);
}
export async function pullFinancials(investmentId: string, ticker: string, years = 2) {
  return (window as any).dhando.financials.pull(investmentId, ticker, years);
}
export async function extractFinancialsFromText(investmentId: string, text: string) {
  return (window as any).dhando.financials.extractFromText(investmentId, text);
}
```

Re-export `Financial` from `@dhando/core` so renderer types stay consistent.

- [ ] **Step 2: Run** `pnpm --filter @dhando/desktop build` → green.

- [ ] **Step 3: Commit**

```bash
git commit -am "refactor(desktop): renderer ipc.ts uses real financials IPC, drop StoredFinancials"
```

---

## Task 12: `useFinancials` hook

**Files:**
- Create: `packages/desktop/src/renderer/hooks/useFinancials.ts`
- Test: `packages/desktop/src/renderer/hooks/__tests__/useFinancials.test.tsx`

- [ ] **Step 1: Write failing test** — `@testing-library/react`. Mock `window.dhando.financials.get` + `onChanged`. Cases:
  - Initial load returns `{ status: 'loaded', current, prior, missingFields: [] }` when 2 rows exist.
  - `missing` when 0 rows.
  - `incomplete` when 1 row but Altman/Piotroski/Beneish all need 2.
  - Hook re-fetches when `onChanged` fires with matching investmentId.
  - Hook ignores `onChanged` for other investmentIds.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** the hook. Uses `useEffect` for initial fetch + subscription. Returns `{ current, prior, status, missingFields, apiValuesJson, refetch }`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/src/renderer/hooks/
git commit -m "feat(desktop): useFinancials hook with onChanged invalidation"
```

---

## Task 13: New `Financials.tsx` page

**Files:**
- Create: `packages/desktop/src/renderer/pages/Financials.tsx`
- Modify: `packages/desktop/src/renderer/App.tsx` (add route `/financials/:investmentId`)

- [ ] **Step 1:** Build the page per spec §5.3. Grid: rows = field groups (Income/Balance/Cash Flow), columns = years. Each cell: input + badge + reconciliation indicator. Top bar: ticker, "Re-pull from EODHD" button, "Extract from text…" button (opens modal with textarea → calls `extractFinancialsFromText`).

- [ ] **Step 2: Smoke test manually** — launch app, navigate to `/financials/<id>`. Verify load, edit, save round-trip, reconciliation badge appears after override.

- [ ] **Step 3: Commit**

```bash
git add packages/desktop/src/renderer/pages/Financials.tsx packages/desktop/src/renderer/App.tsx
git commit -m "feat(desktop): Financials page — single source of truth view"
```

---

## Task 14: Migrate `DistressRadar`

**Files:**
- Modify: `packages/desktop/src/renderer/pages/DistressRadar.tsx`

- [ ] **Step 1:** Delete every `useState` for financial inputs (`altmanZ`, `piotroskiF`, `beneishM`, `fcfCurrent`, `fcfPrior`, `debtToEbitda`, `workingCapitalCurrent`, `workingCapitalPrior`). Delete the input form JSX.

- [ ] **Step 2:** Add `const fin = useFinancials(selectedId)`. Render based on `fin.status`:
  - `loaded`: call `calculateAltmanZFromFinancials`, `calculatePiotroskiFFromFinancials`, `calculateBeneishMFromFinancials` and existing `runDistressCheck` IPC. Render score cards.
  - `missing`: CTA card with two buttons.
  - `incomplete`: list `fin.missingFields` and link to Financials page.

- [ ] **Step 3: Manual smoke** — pick an investment with EODHD data → see scores. Pick one without → see CTA.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(desktop): DistressRadar reads from useFinancials, drops form"
```

---

## Task 15: Migrate Screener / DealAnalyzer / MagicFormula / Calculator

**Files:**
- Modify: each of `Screener.tsx`, `DealAnalyzer.tsx`, `MagicFormula.tsx`, `Calculator.tsx`

- [ ] **Step 1: Screener** — strip useState for revenue/income/etc; for each candidate call `getFinancials` (or batch via new `dhando:financials:list`); evaluate criteria.

- [ ] **Step 2: DealAnalyzer** — pre-fill DCF defaults from `useFinancials`; keep growth/discount/terminal as user-editable.

- [ ] **Step 3: MagicFormula** — use shared store for EBIT, totalAssets etc.

- [ ] **Step 4: Calculator** — use shared store; keep per-scenario "what-if" overrides as local state (not persisted).

- [ ] **Step 5: Manual smoke each.**

- [ ] **Step 6: Commit per page**

```bash
git commit -am "refactor(desktop): <PageName> reads from shared financials store"
```

(Four commits, one per page.)

---

## Task 16: Watchlist banner + auto-pull on add

**Files:**
- Modify: `packages/desktop/src/main/index.ts` (`dhando:watchlist:add` handler)
- Modify: `packages/desktop/src/renderer/pages/Watchlist.tsx`

- [ ] **Step 1:** In the existing `dhando:watchlist:add` handler, after the row is saved, fire-and-forget call `pullAndSave(db, …, ticker, 2)` if a ticker is present. Wrap in try/catch — failure sets `needsManualFinancials = true` (already done by the service).

- [ ] **Step 2:** In `Watchlist.tsx`, when `row.needsManualFinancials` is true, render a yellow banner inside the row: "Financials not available from EODHD — [Enter manually] [Try Claude extract]". Both buttons navigate to `/financials/<id>`.

- [ ] **Step 3: Manual smoke** — add a known JSE ticker and a known ADR; verify EODHD pull happens for the latter, banner shows for the former.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(desktop): auto-pull EODHD on watchlist add + manual-needed banner"
```

---

## Task 17: Cleanup — delete legacy code paths

**Files:**
- Modify: `packages/core/src/scoring/{altman-z,piotroski-f,beneish-m}.ts`
- Modify: `packages/desktop/src/renderer/lib/ipc.ts`

- [ ] **Step 1:** Verify no consumer uses legacy `calculateAltmanZ(AltmanZInputs)` etc. Run `grep -rn "calculateAltmanZ\b" packages/`. If clean, delete the legacy fn + its `*Inputs` interface. Repeat for Piotroski + Beneish.

- [ ] **Step 2:** Delete any remaining `loadFromStorage('dhando_financials', …)` traces if not already removed in Task 11.

- [ ] **Step 3: Run full test suite** `pnpm test` → all green.

- [ ] **Step 4: Commit**

```bash
git commit -am "chore: delete legacy score signatures + browser-fallback financials store"
```

---

## Final verification

- [ ] `pnpm test` green across all packages
- [ ] `pnpm build` green
- [ ] Manual: launch app, add a US ticker → financials populate → DistressRadar shows scores → override a value → reconciliation badge appears → "Re-pull" preserves override but updates non-overridden fields.
- [ ] Manual: add a JSE ticker (likely no EODHD data) → banner appears → use Claude extract on a pasted income statement → financials saved → DistressRadar updates within ~1s of save (via `onChanged`).
