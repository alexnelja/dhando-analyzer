# dhando-shared-financials

## Overview

A git worktree of `dhando-analyzer` dedicated to the **shared financial data store** feature branch (`feature/shared-financials-store`). Despite the directory name suggesting a standalone library, this is the same pnpm + Turbo monorepo as `dhando-analyzer` — an Electron + CLI investment tool with a Dalio-style rules engine — checked out on a feature branch that unifies financial data across the Analyzer's core packages (core, cli, desktop) with auto-calc fields and reconciliation logic.

## Status

- **Branch**: `feature/shared-financials-store` (worktree of `/Users/alexnelja/projects/dhando-analyzer/.git`)
- **Root `package.json` name**: `dhando-analyzer` (same codebase)
- Recent work on this branch:
  - `feat(core): extend Financial + Investment schemas with auto-calc fields`
  - `docs: shared financial data store + auto-calc + reconciliation spec`
  - `docs: implementation plan for shared financial data store`
- Design spec: `docs/superpowers/specs/2026-04-13-shared-financial-data-store-design.md`
- Implementation plan: `docs/superpowers/plans/2026-04-13-shared-financial-data-store.md`
- Relationship to `dhando-analyzer`: this is **not** a separate consumable library — it is the same repo. Merge back into `dhando-analyzer` main when the feature is complete; do not treat as an independent package.

## Setup & Run

```bash
cp .env.example .env    # populate EODHD, FRED, Finnhub, ANTHROPIC keys
pnpm install
pnpm build               # turbo build across packages
pnpm test                # turbo test (vitest in @dhando/core)
pnpm dev                 # turbo dev (watch mode)

# Desktop (Electron)
pnpm --filter @dhando/desktop dev

# CLI
pnpm --filter @dhando/cli build && node packages/cli/dist/index.js
```

## Architecture

- **pnpm workspace** (`packages/*`) + **Turbo** task runner.
- `packages/core` (`@dhando/core`) — TypeScript library: schemas (zod), drizzle-orm + better-sqlite3 persistence, rules engine, scoring, screener, portfolio, deal-analyzer, private-markets, distress, game-theory, API clients (Polymarket, Claude, EODHD, FRED, Finnhub). Vitest suite under `__tests__/`.
- `packages/cli` (`@dhando/cli`) — `dhando` binary built on commander, consumes `@dhando/core` via `workspace:*`.
- `packages/desktop` (`@dhando/desktop`) — Electron 34 + Vite + React 18 + Tailwind renderer, esbuild-bundled main/preload, shares `@dhando/core`.
- `rules/` — YAML rule packs evaluated by `packages/core/src/rules-engine/` (`graham-criteria.yaml`, `munger-5-checklist.yaml`, `pabrai-9-principles.yaml`). Engine modules: `engine.ts`, `evaluator.ts`, `yaml-parser.ts`, `believability.ts`, `audit.ts`, `snapshots.ts`, `crud.ts`.
- `docs/superpowers/{specs,plans}/` — design specs and phased implementation plans (phase 1 foundation → phase 5 portfolio tracker, plus shared-financials).

## Roadmap

See `ROADMAP.md` and `docs/superpowers/plans/`.

## Known Bugs

See `BUGS.md`.
