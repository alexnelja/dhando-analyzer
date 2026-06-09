# Roadmap

Workflow: tests-first TDD. Write the failing test, then implement.

## Done
- [x] Shared financial data store — `docs/superpowers/plans/2026-04-13-shared-financial-data-store.md`
  - [x] extended Financial/Investment schemas + idempotent migrations (Task 1)
  - [x] `financials-repo` CRUD + upsert + 2-year fetch (Task 2)
  - [x] Altman/Piotroski/Beneish `*FromFinancials` adapters w/ insufficient-field detection (Tasks 3–5)
  - [x] EODHD statements puller + Claude zod-validated text extractor (Tasks 6–7)
  - [x] `financials-service` pull/save/reconcile + needs-manual flag (Task 8)
  - [x] core exports (Task 9); IPC handlers + preload bridge + `changed` event (Tasks 10–11)
  - [x] `useFinancials` hook + Financials page (Tasks 12–13)
  - [x] DistressRadar real-adapter scores; Watchlist auto-pull + manual-needed banner (Tasks 14–16)
  - [x] cleanup + full verification: monorepo build clean (Task 17)
  - [x] MagicFormula + Calculator Valuation tab pre-fill from the store
  - Verified: 1027 core + 101 desktop tests green

## Next
- [ ] Phase 5 — portfolio tracker (`docs/superpowers/plans/2026-03-31-phase5-portfolio-tracker.md`)
- [ ] Phase 4 — deal analyzer (`docs/superpowers/plans/2026-03-31-phase4-deal-analyzer.md`)

## Research to productionise
- [ ] Missing methodologies (`docs/MISSING-METHODOLOGIES-RESEARCH.md`)
- [ ] Paid data sources integration (`docs/paid-data-sources-analysis.md`)
- [ ] Polymarket / game-theory UI flows beyond current predictions page
- [ ] Quiver Quantitative alt-data integration (`research/quiver-quant-alt-data.md`) — congressional trades, lobbying, insider flow, patents. Surfaced during polyalexous Phase 1 research; better fit here than Polymarket.

## Backlog
- [ ] Additional YAML rulesets beyond graham / munger / pabrai
- [ ] Packaged Electron distributables (electron-builder config exists; release flow TBD)
