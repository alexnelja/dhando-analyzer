# Shared Financial Data Store, Auto-Calculated Scores & Reconciliation

**Date:** 2026-04-13
**Status:** Draft — pending spec review
**Scope:** UX feedback items 4 (auto-calc scores), 5 (shared data store), 6 (reconciliation warnings).
**Out of scope:** percentages-vs-decimals, thesis capture, portfolio lot aggregation (follow-up spec).

## 1. Problem

Three interrelated UX complaints from the 2026-03-31 testing session:

1. Distress Radar asks users to type raw Altman-Z, Piotroski-F, Beneish-M scores. These should be computed from financial statements, not typed.
2. Financial numbers entered in one page (e.g., Screener) don't flow to other pages (Deal Analyzer, Distress Radar), forcing re-entry.
3. When the same investment has different numbers in different places, nothing warns the user.

## 2. Root Cause

- A SQLite `financials` table exists in `packages/core/src/data/schema.ts:32` with 9 numeric fields.
- `packages/desktop/src/renderer/lib/ipc.ts:809` defines `saveFinancials` and `getFinancials`, but both are **stubs in Electron mode** — they return empty / no-op, with "IPC call placeholder — not yet wired in main process" comments.
- No IPC handlers are registered in `packages/desktop/src/main/index.ts` for financials.
- No EODHD statements puller exists.
- Each page (DistressRadar, Screener, DealAnalyzer, MagicFormula, Calculator) holds local form state for financial numbers.

Fix is predominantly wiring, not greenfield.

## 3. Architecture

```
Renderer pages (Distress, Screener, DealAnalyzer, …)
        │ window.dhando.financials.*
preload.ts  — new `financials` namespace
        │ ipcMain.handle
main/index.ts — new handlers:
        dhando:financials:{get,save,list,pull,extractFromText}
        │
core/data/financials-repo.ts      (new — CRUD, 2-year fetch, source tracking)
core/api/eodhd-statements.ts      (new — public-markets puller)
core/api/claude-extractor.ts      (new — PDF/text fallback)
core/scoring/{altman,piotroski,beneish}.ts   (extended: new `*FromFinancials` adapters)
```

### 3.1 Preload bridge additions

Add to `packages/desktop/src/main/preload.ts` inside the existing `contextBridge.exposeInMainWorld('dhando', { ... })` object:

```ts
financials: {
  get: (investmentId: string) =>
    ipcRenderer.invoke('dhando:financials:get', investmentId),
  save: (financial: unknown) =>
    ipcRenderer.invoke('dhando:financials:save', financial),
  list: () =>
    ipcRenderer.invoke('dhando:financials:list'),
  pull: (investmentId: string, ticker: string, years?: number) =>
    ipcRenderer.invoke('dhando:financials:pull', investmentId, ticker, years),
  extractFromText: (investmentId: string, text: string) =>
    ipcRenderer.invoke('dhando:financials:extractFromText', investmentId, text),
  onChanged: (cb: (investmentId: string) => void) => {
    const listener = (_e: unknown, id: string) => cb(id);
    ipcRenderer.on('dhando:financials:changed', listener);
    return () => ipcRenderer.removeListener('dhando:financials:changed', listener);
  },
},
```

The `onChanged` subscription is the hook-invalidation mechanism (§6.6). Main emits `dhando:financials:changed` to all windows after every successful `save`/`pull`/`extractFromText`.

New packages touched: `core` (schema migration, repo, API clients, score signatures), `desktop/main` (handlers), `desktop/preload` (bridge), `desktop/renderer` (wire pages, drop local form state).

## 4. Data Model

### 4.0 Two existing types, one canonical going forward

Two types currently represent financials and must be reconciled:

- `Financial` in `packages/core/src/models/financial.ts` — canonical core type, 20 fields, nullable semantics, matches SQLite schema.
- `StoredFinancials` in `packages/desktop/src/renderer/lib/ipc.ts:117` — renderer-only shape with 10 required (non-nullable) fields, used by the localStorage browser fallback.

**Decision:** `Financial` is the canonical type after this spec. `StoredFinancials` is deleted. The browser-mode localStorage fallback is dropped along with it (Alex mandates Electron-only per memory `feedback_electron_mode.md`). Renderer IPC returns/accepts `Financial` rows directly. Any nullable-field handling in the UI is explicit (badges, "—" placeholders).

### 4.1 `Financial` — 13 new nullable fields

Extend `packages/core/src/models/financial.ts`:

| Field | Type | Needed by |
|-------|------|-----------|
| `retainedEarnings` | `number \| null` | Altman Z |
| `ebit` | `number \| null` | Altman Z (fallback: `ebitda − depreciation`) |
| `totalLiabilities` | `number \| null` | Altman Z, Beneish LVGI |
| `longTermDebt` | `number \| null` | Piotroski |
| `currentAssets` | `number \| null` | Piotroski (current ratio) |
| `currentLiabilities` | `number \| null` | Piotroski (current ratio) |
| `sharesOutstanding` | `number \| null` | Piotroski (share issuance) |
| `grossProfit` | `number \| null` | Piotroski margin, Beneish GMI |
| `receivables` | `number \| null` | Beneish DSRI |
| `ppe` | `number \| null` | Beneish AQI |
| `depreciation` | `number \| null` | Beneish DEPI |
| `sga` | `number \| null` | Beneish SGAI |
| `cashFromOps` | `number \| null` | Piotroski, Beneish TATA |

Two new source-tracking fields:

- `apiValuesJson: string | null` — JSON snapshot of EODHD-pulled values, preserved even after user override. Enables reconciliation badge.
- `overriddenFields: string | null` — JSON array of field names the user has manually edited.

### 4.2 `Investment` — 1 new field

- `marketCap: number | null` — snapshot at last-refresh time; not historical. Needed for Altman Z denominator.

### 4.3 Migration

Existing migration style is hand-rolled SQL inside `packages/core/src/data/db.ts` (see header comment "Using raw SQL for table creation rather than drizzle-kit push"). We follow the same pattern — no drizzle-kit introduction in this spec.

Add to `db.ts` after existing `CREATE TABLE` statements, inside the same init function, using `ALTER TABLE … ADD COLUMN` wrapped in a try/catch per column so repeated launches are idempotent (SQLite has no `IF NOT EXISTS` for columns):

```
financials: retained_earnings, ebit, total_liabilities, long_term_debt,
  current_assets, current_liabilities, shares_outstanding, gross_profit,
  receivables, ppe, depreciation, sga, cash_from_ops,
  api_values_json, overridden_fields
investments: market_cap, needs_manual_financials
```

All nullable / default NULL. No data loss. No production users so no backfill script.

`packages/core/src/data/schema.ts` (the Drizzle definition) is updated in the same commit to match, so type inference stays correct — but Drizzle is definitional only, not the migration runner.

### 4.4 Granularity

Existing key: `(investmentId, period, year, quarter)`. Auto-calc uses `period='annual'` only. On initial EODHD pull we store current + prior fiscal year (needed for Piotroski/Beneish deltas). Quarterly rows may exist but are untouched by this feature.

### 4.5 Derived fields (never stored)

- `ebit` fallback: `ebitda − depreciation` when `ebit` is null.
- Current ratio, asset turnover, gross margin, accruals-to-assets — all computed at score-calculation time.

## 5. Data Entry Flow

### 5.1 On watchlist add (happy path)

1. Save investment row.
2. Fire-and-forget: `financialsService.pullFromEODHD(investmentId, ticker, 2)`.
3. For each of (current year, prior year): write `Financial` row with `source='api'`, `apiValuesJson` populated.
4. On failure (no ticker match on EODHD, rate-limit, network): set `investment.needsManualFinancials = true`. Watchlist row shows a yellow banner: **"Financials not available from EODHD — [Enter manually] [Try Claude extract]"**.

### 5.2 Claude extract fallback

New IPC handler `dhando:financials:extractFromText` (renamed from earlier `dhando:claude:extract-financials` for namespace consistency — all financial operations live under `dhando:financials:*`).

- Input: investmentId + text block (renderer reads PDF / Excel / plain text and passes the extracted text string; PDF handling stays in renderer to avoid bundling a PDF parser in main).
- Main process calls Anthropic API using the key already loaded by today's `dotenv` fix.
- System prompt requests strict JSON matching the schema below. Claude must output only JSON (no markdown fences; if fences appear we strip them — already handled similarly in existing `claudeBrowserChat` in ipc.ts).
- Response validated against Zod schema before save. Invalid → main throws an `ExtractError` with `.rawText` attached. Renderer displays a modal: "Couldn't parse Claude's response — [show raw] [retry]".
- Saved rows marked `source='manual'`, `apiValuesJson=null`.

**Zod schema** (`packages/core/src/api/claude-extractor-schema.ts`, new file):

```ts
import { z } from 'zod';

const nn = z.number().nullable();

export const extractedFinancialSchema = z.object({
  year: z.number().int().min(1990).max(2100),
  period: z.enum(['annual', 'quarterly']),
  quarter: z.number().int().min(1).max(4).nullable(),
  // All 22 numeric fields, every one nullable:
  revenue: nn, netIncome: nn, ebitda: nn, totalAssets: nn, totalDebt: nn,
  cash: nn, capex: nn, fcf: nn, workingCapital: nn,
  retainedEarnings: nn, ebit: nn, totalLiabilities: nn, longTermDebt: nn,
  currentAssets: nn, currentLiabilities: nn, sharesOutstanding: nn,
  grossProfit: nn, receivables: nn, ppe: nn, depreciation: nn,
  sga: nn, cashFromOps: nn,
});

export const extractedFinancialsResponseSchema = z.object({
  statements: z.array(extractedFinancialSchema).min(1).max(10),
});
export type ExtractedFinancialsResponse = z.infer<typeof extractedFinancialsResponseSchema>;
```

Zod is a new dependency for `@dhando/core`. Rationale over hand-rolled validators: exhaustive by default, avoids silent schema drift as we add fields.

### 5.3 Manual edit — `Financials.tsx` (new page)

Reached from Watchlist row → "View" button. Per-investment page.

Grid layout:
- Rows = fields (grouped: Income Statement / Balance Sheet / Cash Flow).
- Columns = years (current, prior, + "Add year" button).
- Each cell: numeric input, badge `API` or `M`, reconciliation badge if applicable.
- Save on blur per cell. Flips that field's name into `overriddenFields`.
- "Re-pull from EODHD" button at top. Updates `apiValuesJson` snapshot. Non-overridden fields update silently; overridden fields stay user-entered but reconciliation badge may now appear or disappear.

### 5.4 Reconciliation badge rule

Show badge on a cell when:

```
overriddenFields.includes(field)
  && apiValuesJson !== null
  && apiValuesJson[field] !== currentValue
```

Tooltip: **"EODHD reported $4.2M; you overrode to $4.5M on 2026-04-14."** Clicking offers **"Revert to EODHD value"**. Reverting removes the field from `overriddenFields` and copies `apiValuesJson[field]` back into the cell.

## 6. Page Migrations

### 6.1 DistressRadar — pure auto-mode

- Drop every `useState` for financial inputs (altmanZ, piotroskiF, beneishM, fcfCurrent/Prior, debtToEbitda, workingCapitalCurrent/Prior).
- Replace with `useFinancials(investmentId)` hook returning `{ current: Financial | null, prior: Financial | null, status: 'loaded' | 'missing' | 'incomplete', missingFields: string[] }`.
- `loaded` → render computed Altman Z / Piotroski F / Beneish M / composite score, read-only, with "How is this calculated?" info tooltips.
- `missing` → CTA card: "Enter financials" (opens Financials tab) or "Pull from EODHD" (retry).
- `incomplete` → list missing fields by name, link to Financials tab with cells pre-scrolled.

### 6.6 `useFinancials` invalidation strategy

The hook is a small custom hook, not React Query (adding a new dep isn't justified for a single consumer pattern). Strategy:

1. On mount, call `window.dhando.financials.get(investmentId)`.
2. Subscribe to `window.dhando.financials.onChanged` (see §3.1). When main emits `dhando:financials:changed` with a matching `investmentId`, re-fetch.
3. Unsubscribe on unmount (cleanup function returned by `onChanged`).
4. Expose `refetch()` for manual triggers (e.g., after a user clicks "Pull from EODHD" on this page; the pull handler also emits `changed`, so refetch is belt-and-braces).

Main process emits `changed` from exactly three places: `save`, `pull`, `extractFromText` handlers. No other path mutates financials.

Hook output also includes `apiValuesJson: Record<string, number | null> | null` so `Financials.tsx` can render reconciliation badges without a second IPC round-trip.

### 6.7 Score function refactor strategy

Existing functions accept shape-specific input types (`AltmanZInputs`, `PiotroskiInputs`, `BeneishInputs`). We add **new adapter functions** alongside — no overloading, no breaking changes:

```ts
// NEW — in altman-z.ts
export function calculateAltmanZFromFinancials(
  current: Financial,
  investment: { marketCap: number | null },
): AltmanZResult | { status: 'insufficient'; missingFields: string[] };

// NEW — in piotroski-f.ts
export function calculatePiotroskiFFromFinancials(
  current: Financial, prior: Financial,
): PiotroskiFResult | { status: 'insufficient'; missingFields: string[] };

// NEW — in beneish-m.ts
export function calculateBeneishMFromFinancials(
  current: Financial, prior: Financial,
): BeneishMResult | { status: 'insufficient'; missingFields: string[] };
```

Each adapter performs null-checks, computes `ebit` fallback (`ebitda − depreciation`) when needed, and returns either the existing result type or an `insufficient` marker with `missingFields: string[]` listing the null inputs that blocked calculation.

Legacy `calculateAltmanZ(inputs: AltmanZInputs)` etc. stay untouched. They're deleted in rollout Step 6 after no consumer remains.

### 6.2 Screener

- Keep screening-criteria state (P/E threshold, ROIC threshold, etc.).
- For each candidate, read financials from shared store; evaluate criteria against them.
- Remove local numeric-input state.

### 6.3 DealAnalyzer

- Pre-fill DCF inputs from shared store (revenue, margins, capex, working capital).
- Keep local state for *projection assumptions* (growth rate, discount rate, terminal multiple) — those are user judgment, not data.

### 6.4 MagicFormula, Calculator

- Read shared store. Retire local input forms for values in the store.
- Price / shares / market cap can stay local for what-if analysis where they don't match stored values.

### 6.5 PrivateMarkets — out of scope

Private-market data doesn't come from EODHD. Only wire: *if* shared store has fields, consume them; otherwise keep existing local form.

## 7. Testing Strategy (TDD)

Tests written before implementation, in this order:

1. `financials-repo.test.ts` — CRUD, 2-year fetch, source tracking, `overriddenFields` persistence. In-memory SQLite.
2. `eodhd-statements.test.ts` — mock fetch; field mapping EODHD→Financial; missing-ticker and rate-limit paths.
3. `claude-extractor.test.ts` — mock Anthropic client; schema validation rejects malformed output; nullable fields handled.
4. Score-function contract tests (`altman.test.ts`, `piotroski.test.ts`, `beneish.test.ts`) — now accept `Financial[]`; verify ebit-fallback; verify "insufficient data" returns `null`, not NaN.
5. `financials-service.test.ts` — pull → save → read round-trip; reconciliation diff logic.
6. `main/__tests__/financials-ipc.test.ts` — in-memory DB; call handlers; verify shapes.
7. `useFinancials.test.tsx` — mocks `window.dhando.financials`; verifies status-state transitions.
8. Page smoke tests for DistressRadar, DealAnalyzer (happy + missing + incomplete paths).

**In-scope test suites:** 1–8 above. Out-of-scope: Screener/MagicFormula/Calculator page smoke tests (covered by existing suites, only data-source wire is changing), PrivateMarkets (no change this round), quarterly-period paths, multi-currency paths.

## 8. Rollout Order

Each step keeps the app buildable and green.

1. Schema migration + repo + score-function refactor. Other pages keep working via legacy signatures (temporary overload) until Step 4+.
2. EODHD puller + Claude extractor + IPC handlers + preload bridge.
3. Financials page (new, no existing page affected).
4. DistressRadar migration (first page to switch; also removes legacy score-function overload).
5. Screener, DealAnalyzer, MagicFormula, Calculator migrations.
6. Delete dead code: local form state, localStorage fallback in renderer IPC stubs, any remaining legacy overloads.

## 9. Risks & Open Questions

- **EODHD coverage for JSE stocks** — likely incomplete. Claude-extract fallback mitigates.
- **Ebit-fallback correctness** — `ebitda − depreciation` assumes no non-operating items. Good enough for most; Beneish sensitivity is low.
- **marketCap handling** — **Decided:** on-demand refresh at score time. `calculateAltmanZFromFinancials` requires `investment.marketCap`; the DistressRadar handler path (and any future caller) is responsible for calling `dhando:stock:quote` (existing EODHD real-time endpoint) immediately before scoring and passing the fresh value. The `investment.market_cap` column stores the last-seen value for display purposes only (Watchlist row, Financials page header). Scoring never reads the stored value. This keeps the score accurate without introducing a cache-invalidation layer.
- **Claude extraction cost** — each run ~$0.02–0.10 depending on doc size. Acceptable for a power-user tool.

## 10. Non-Goals

- Percentages-vs-decimals display sweep (follow-up).
- Thesis capture on watchlist (follow-up).
- Portfolio lot aggregation (follow-up).
- Private Markets financials migration.
- Quarterly-period auto-calc (annual only).
- Multi-currency handling.
- Historical `marketCap` time series.
