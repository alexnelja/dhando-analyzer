# Dhando Analyzer

Electron + CLI investment analysis tool that applies a Dalio-style rules engine and Dhandho-investor principles (Pabrai, Munger, Graham) to equities and deals. Core library scores opportunities against YAML-defined rulesets, pulls fundamentals from multiple market-data providers (EODHD, FRED, Finnhub, Yahoo Finance, Polymarket), and surfaces results through a React/Electron desktop app or a `dhando` CLI.

## Status

Built:
- `@dhando/core` — rules engine, scoring, screener, deal-analyzer, distress, portfolio, game-theory (Mesquita stakeholder model), private-markets, Polymarket + Claude API clients, Drizzle/SQLite persistence.
- `@dhando/cli` — commands: `analyze`, `distress`, `financials`, `init`, `portfolio`, `rules`, `screen`, `watchlist`.
- `@dhando/desktop` — Electron app (Vite + React + Tailwind + react-router), IPC to core, JSE stock search w/ ZAC→ZAR conversion, Yahoo Finance live prices, Magic Formula auto-fetch, Polymarket predictions page, AI-powered stakeholder analysis.
- Rulesets: `rules/graham-criteria.yaml`, `rules/munger-5-checklist.yaml`, `rules/pabrai-9-principles.yaml`.
- **Shared financial data store** — one SQLite-backed source of truth for company statements. `financials-repo` (CRUD/upsert), EODHD fundamentals puller, Claude text extractor (zod-validated), and `financials-service` (pull/save/reconcile). Auto-computes Altman Z / Piotroski F / Beneish M via `*FromFinancials` adapters. Exposed over `dhando:financials:*` IPC with a `changed` broadcast; the renderer's `useFinancials` hook auto-invalidates. New **Financials** page (editable year grid, EODHD re-pull, Claude extract, reconciliation badges); DistressRadar reads real scores from the store; Watchlist auto-pulls EODHD on add and flags manual-entry-needed; Magic Formula and the Calculator's Valuation tab pre-fill from the store.

WIP:
- Missing methodologies research (see `docs/MISSING-METHODOLOGIES-RESEARCH.md`).

## Setup and Run

```bash
pnpm install
cp .env.example .env   # add EODHD, FRED, Finnhub, ANTHROPIC keys as needed

# Full monorepo build
pnpm build

# Electron desktop (main + renderer, dev server on :5273)
pnpm --filter @dhando/desktop dev

# CLI (build once, then invoke)
pnpm --filter @dhando/cli build
node packages/cli/dist/index.js --help
# or: pnpm --filter @dhando/cli dev   (tsc --watch)

# Tests (vitest in core + desktop)
pnpm test
```

Electron is the intended runtime — do not run the renderer browser-only.

### Native module ABI (better-sqlite3)

`better-sqlite3` is a native module, and Electron and Node use different ABIs.
The shared `node_modules` can hold only one build at a time, so the scripts
toggle it automatically:

- `pnpm --filter @dhando/desktop dev` runs a `predev` hook that rebuilds it for
  **Electron** (`scripts/rebuild-electron.mjs` → prebuild-install for Electron's
  target; the `electron-rebuild` CLI is broken on Node 26).
- `pnpm test` runs a `pretest` hook that rebuilds it for **Node**.

If you ever hit `NODE_MODULE_VERSION` errors, just run the matching command —
`pnpm --filter @dhando/desktop rebuild:electron` or `…rebuild:node`.

## Architecture

pnpm workspace + turbo monorepo.

```
packages/
  core/        @dhando/core    — rules engine, scoring, screener, deal-analyzer,
                                 distress, portfolio, game-theory, private-markets,
                                 api clients, contracts, models, data (Drizzle + SQLite)
  cli/         @dhando/cli     — commander-based CLI, depends on core
  desktop/     @dhando/desktop — Electron main + preload bridge + React renderer
rules/         YAML rulesets consumed by core/rules-engine
                 (graham-criteria, munger-5-checklist, pabrai-9-principles)
docs/
  superpowers/specs/   design specs
  superpowers/plans/   phased implementation plans (phase1–5 + shared store)
```

Rules are declarative YAML (metric / operator / value / weight) loaded by the rules-engine and applied by scoring to produce per-rule and aggregate scores. The desktop app calls core via Electron IPC; the CLI imports core directly.

UX conventions: percentages (not decimals) in UI, thesis capture on analysis, lot aggregation in portfolio, auto-calc scores, shared data across components.

## Roadmap

Workflow: tests-first TDD — write failing tests before implementation.

- [ ] Shared financial data store — implement per `docs/superpowers/plans/2026-04-13-shared-financial-data-store.md` (preload bridge, invalidation, extractor schema, auto-calc + reconciliation).
- [ ] Phase 5 portfolio tracker — finish per `docs/superpowers/plans/2026-03-31-phase5-portfolio-tracker.md`.
- [ ] Phase 4 deal analyzer — finish per `docs/superpowers/plans/2026-03-31-phase4-deal-analyzer.md`.
- [ ] Address missing methodologies (`docs/MISSING-METHODOLOGIES-RESEARCH.md`).
- [ ] Expand rulesets beyond Graham/Munger/Pabrai as new methodologies land.

See `ROADMAP.md` for the live list.

## Known Bugs

See `BUGS.md`. None identified from code TODO/FIXME at time of writing.
