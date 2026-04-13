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
        dhando:financials:{get,save,list,pull,reconcile}
        dhando:claude:extract-financials
        │
core/data/financials-repo.ts      (new — CRUD, 2-year fetch, source tracking)
core/api/eodhd-statements.ts      (new — public-markets puller)
core/api/claude-extractor.ts      (new — PDF/text fallback)
core/scoring/{altman,piotroski,beneish}.ts   (refactored: accept Financial[])
```

New packages touched: `core` (schema migration, repo, API clients, score signatures), `desktop/main` (handlers), `desktop/preload` (bridge), `desktop/renderer` (wire pages, drop local form state).

## 4. Data Model

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

`ALTER TABLE financials ADD COLUMN …` for each of the 13 + 2 source-tracking fields. `ALTER TABLE investments ADD COLUMN market_cap`. All nullable. No data loss. No production users so no backfill script.

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

New IPC handler `dhando:claude:extract-financials`:

- Input: investmentId + PDF file path OR pasted text block.
- Main process reads file, calls Anthropic API using the key already loaded by today's `dotenv` fix.
- System prompt specifies strict JSON schema with all 22 Financial fields nullable. Claude must output only JSON.
- Response validated (zod or hand-rolled) before save. Invalid → error returned to renderer with raw Claude text for user inspection.
- Saved rows marked `source='manual'`, `apiValuesJson=null`.

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
- **marketCap staleness** — `marketCap` stored on `Investment` is a snapshot. For Altman Z we want current market cap. On-demand refresh in scoring code using existing quote API, OR accept staleness. Decision deferred to implementation; favor on-demand refresh.
- **Claude extraction cost** — each run ~$0.02–0.10 depending on doc size. Acceptable for a power-user tool.

## 10. Non-Goals

- Percentages-vs-decimals display sweep (follow-up).
- Thesis capture on watchlist (follow-up).
- Portfolio lot aggregation (follow-up).
- Private Markets financials migration.
- Quarterly-period auto-calc (annual only).
- Multi-currency handling.
- Historical `marketCap` time series.
