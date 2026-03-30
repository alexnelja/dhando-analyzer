# Dhando Analyzer — Design Specification

**Date:** 2026-03-30
**Author:** Alex Nelja
**Status:** Approved

---

## 1. Overview

The Dhando Analyzer is a systematic investment analysis platform based on Mohnish Pabrai's "The Dhandho Investor," enhanced with frameworks from Graham, Buffett, Munger, Greenblatt, and Dalio. It encodes investment principles as testable, auditable rules — transforming qualitative wisdom into algorithmic decision-making.

The platform serves as both an analysis tool and a personal investing knowledge base, accumulating rules from books, meetings with investors, industry experts, and past mistakes.

**Core philosophy:** "Heads I win, tails I don't lose much" — systematized.

### Target User

Solo value investor focused on the South African market (JSE), with exposure to global listed equities, private equity, and emerging markets.

### Platforms

- **Desktop:** Electron + React (primary interface)
- **CLI:** Node.js Commander.js (quick lookups, automation, scripting)
- **Future:** Web app (shared `core` package, private GitHub for hosting)

---

## 2. Architecture

### Monorepo Structure

```
dhando-analyzer/
├── packages/
│   ├── core/                 ← Shared TypeScript library
│   │   ├── models/           ← Investment, Portfolio, Score, Rule types
│   │   ├── scoring/          ← Dhandho framework + composite scoring engine
│   │   ├── rules-engine/     ← Dalio-style algorithmic decision system
│   │   ├── kelly/            ← Kelly criterion with calibration & Bayesian updating
│   │   ├── distress/         ← Distress radar (Z/F/M scores + sentiment)
│   │   ├── private-markets/  ← PE/EM analysis module
│   │   ├── data/             ← SQLite/Turso access layer
│   │   ├── api/              ← EODHD, Yahoo Finance, GDELT, FinBERT clients
│   │   └── journal/          ← Decision journal + Brier score tracking
│   ├── cli/                  ← Commander.js CLI
│   └── desktop/              ← Electron + React + Tailwind
├── rules/                    ← User-defined decision rules (YAML)
├── templates/                ← Deal input templates (SME, franchise, property, etc.)
├── turbo.json
└── package.json
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript throughout |
| Desktop | Electron + React + Tailwind CSS |
| CLI | Commander.js |
| Database | better-sqlite3 (local) + Turso (cloud sync) |
| APIs | EODHD (primary), Yahoo Finance (fallback), GDELT, Dataroma |
| Sentiment | FinBERT via HuggingFace (runs locally) |
| Testing | Vitest |

---

## 3. Five Components

### Component 1 — Screener

Filters the investment universe down to candidates worth researching.

**Quantitative layer:**
- Composite score (0-100) combining Altman Z-Score, Piotroski F-Score, Beneish M-Score
- Valuation metrics: EV/EBITDA (Acquirer's Multiple), P/E, P/B, FCF yield
- Dhandho-specific filters: low capex intensity, recurring revenue %, debt/EBITDA

**Qualitative layer (scored 1-5):**
- Moat durability (Buffett)
- Business simplicity (Pabrai — slow-change industries)
- Management quality (Munger)
- Circle of competence fit

**Super investor overlay:**
- Track SA investors: Allan Gray, Coronation, RE:CM, Contrarius, Anchor Capital
- Track global value investors: Pabrai, Klarman, Burry, Li Lu
- Flag convergence signals — if >= 3 independent super investors have accumulated in the same stock within the last 6 quarters, flag as "multi-investor convergence" and add +10 to composite score (soft signal, not hard gate)

**Output:** Ranked watchlist with composite scores, feeding into the deal pipeline funnel:
Universe → Screen → Research → Deep Dive → Ready to Buy

### Component 2 — Deal Analyzer

Deep analysis of a single investment opportunity.

- **Three-case scenario model** (bear/base/bull) with probability weights
- **Kelly criterion calculator** with half-Kelly default
  - Fermi decomposition: breaks the probability estimate into 4-5 sub-questions
  - Bayesian updating: prior from base rates → adjust with quantitative scores → adjust with qualitative evidence → adjust with sentiment
  - Ensemble: median of multiple independent estimates
  - Overconfidence correction built in
- **Investment memo generator** — auto-populated from analysis: thesis (5 sentences max), moat, risks, valuation, exit criteria
- **Pre-mortem prompt** — "How could this lose money?" with structured framework (Blackstone method)
- **Pabrai's ~98 question checklist** organized by category (valuation errors, leverage, management, moat, biases)

### Component 3 — Portfolio Tracker

Monitor existing positions through the Dhandho lens.

- **Position dashboard** — traffic-light scoring (green/amber/red) across 5-10 factors per position
- **Margin of safety erosion alerts** — when price approaches intrinsic value estimate
- **Kelly rebalancing signals** — when position sizes drift from optimal allocation
- **Decision journal** — record thesis, confidence, assumptions at entry; review quarterly
- **Brier score tracker** — track prediction accuracy over time, calibrate future estimates
- **Post-mortem system** — structured review on every exit (process vs outcome analysis)

### Component 4 — Distress Radar

Flag turnaround opportunities, focused on SA market.

- **Composite distress score (0-100)** weighting Z-score, F-score trend, M-score, cash flow deterioration, leverage, working capital
- **News sentiment** via FinBERT (runs locally) on EODHD news feed for JSE companies
- **Geopolitical impact matrix** — maps events (dedollarization, oil price, BRICS dynamics, load shedding, AGOA) to affected SA sectors and companies
- **Temporary vs permanent distress classification** — 7-factor framework, each scored 0-10 (0 = strongest recovery signal, 10 = permanent impairment):
  1. Cause of distress (0 = purely external/cyclical, 10 = structural/secular decline)
  2. Industry dynamics (0 = growing/stable, 10 = terminal decline)
  3. Balance sheet strength (0 = net cash/low debt, 10 = insolvent)
  4. Management quality and response (0 = proven turnaround team, 10 = incompetent/misaligned)
  5. Competitive position during distress (0 = gaining share, 10 = losing to competitors)
  6. Revenue base (0 = 80%+ recurring/contracted, 10 = entirely one-time/discretionary)
  7. Asset value (0 = hard assets > liabilities, 10 = negative tangible book)

  **Classification formula:**
  `distress_permanence = f1*0.20 + f2*0.15 + f3*0.20 + f4*0.15 + f5*0.10 + f6*0.10 + f7*0.10`
  - Score < 3.5 → **Temporary** (turnaround candidate)
  - Score 3.5-6.5 → **Uncertain** (requires deeper analysis, soft gate)
  - Score > 6.5 → **Permanent** (avoid or short)
- **Industry-level signals** — sector margin compression, inventory build-ups, management turnover clustering
- **Historical pattern matching** — compare current distress to past SA recovery patterns (load shedding 2022-24, COVID, 2015-16 commodity crash)

### Component 5 — Private & Emerging Markets

Dedicated module for unlisted companies and EM opportunities where Dhandho principles apply most.

- **Manual input + templates** for deal types: SME acquisition, franchise, buy-to-let property, private equity, EM listed stocks
- **Dhandho fit scoring** — each principle scored 0-10 (0 = completely violated, 10 = perfectly aligns):
  1. Existing business (not startup)
  2. Simple business in slow-change industry
  3. Distressed business in distressed industry
  4. Durable competitive advantage
  5. Bet heavily when odds are in your favor
  6. Arbitrage opportunity
  7. Significant margin of safety
  8. Low risk, high uncertainty
  9. Copycat, not innovator

  **Aggregation:** Sum of all 9 scores (max 90). Investment gate: sum >= 54 (60% fit). Principles #4, #7, #8 are weighted 1.5x as core Dhandho pillars: `dhandho_fit = (p1+p2+p3+p5+p6+p9) + 1.5*(p4+p7+p8)` (max 105).
- **Owner earnings calculator** (Buffett: net income + depreciation - capex)
- **PE-style deal pipeline** — NDA → Initial Screen → Management Meeting → Deep Due Diligence → IC Memo → Final Bid
- **EM risk overlay** — currency risk, political risk, regulatory risk, liquidity risk scoring
- **Comparable transaction database** — store and reference past deals for valuation benchmarks
- **Future (Phase 2):** PDF/document parsing and LLM-assisted extraction for financial statements and deal memos

---

## 4. Rules Engine (Dalio-Inspired Core)

Investment principles encoded as testable, auditable rules.

### Rule Schema (YAML)

```yaml
name: Margin of Safety Gate
category: valuation
type: hard_gate
source_type: book
source_detail: "Pabrai - Dhandho Investor, Ch. 7"
description: Never buy without significant margin of safety

conditions:
  - metric: intrinsic_value_discount
    operator: gte
    value: 0.30
    weight: 1.0
  - metric: bear_case_loss
    operator: lte
    value: 0.15
    weight: 0.8

action: pass | fail | warn
severity: hard_gate
```

### Three Rule Types

1. **Hard gates** — investment cannot proceed if it fails (e.g., margin of safety below 30%, M-score flags manipulation)
2. **Soft gates** — warnings requiring explicit override with written justification (e.g., management quality below threshold)
3. **Scoring rules** — contribute to composite score without blocking (e.g., super investor overlap)

### Rule Categories

| Category | Source | Examples |
|----------|--------|---------|
| Valuation | Graham, Pabrai | Margin of safety >= 30%, EV/EBITDA below sector median |
| Risk | Pabrai, Munger | Bear case loss <= 15%, Altman Z > 1.81 |
| Quality | Buffett, Munger | Moat score >= 3/5, ROIC > WACC for 5+ years |
| Behaviour | Kahneman, Tetlock | Overconfidence check, base rate deviation alert |
| Position sizing | Kelly, Thorp | Half-Kelly max, portfolio concentration limits |
| Distress | Pabrai (Ch. 3) | Z-score declining but F-score improving = turnaround candidate |
| EM/Private | Dhandho principles | Dhandho fit score >= 7/9, EM risk below threshold |

### Source Attribution

The `source_type` field supports:
- `book` — "Pabrai - Dhandho Investor, Ch. 7"
- `meeting` — "Meeting with John Smith, RE:CM, 2026-04-15"
- `expert` — "Advice from [name], [context]"
- `mistake` — "Loss on [investment], [date] — lesson learned"

### Backtesting & Believability

- Every decision is logged with which rules fired and what scores were produced
- Outcomes are tracked against predicted scenarios
- Rules accumulate a `believability_score` based on track record (Dalio's principle)
- Rules with better track records get higher weight automatically
- Quarterly review cycle: adjust weights or retire underperforming rules

### Pre-Seeded Rule Sets

The tool ships with these frameworks pre-encoded as default rules:
- **Pabrai's 9 Dhandho principles**
- **Pabrai's ~98 question checklist** (5 categories)
- **Munger's 5-point investment checklist**
- **Graham's margin of safety criteria**
- **Buffett's moat and owner earnings tests**

---

## 5. Data Architecture

### SQLite Schema

**investments** — id, type (listed_stock | private_equity | property | franchise | em_stock), name, ticker, exchange, sector, industry, status (screening | researching | deep_dive | ready_to_buy | held | exited | rejected), pe_deal_stage (nullable; nda_pending | screening | meeting_scheduled | deep_dd | ic_memo | bidding | closed | rejected — used for PE/private deals only), data_source (eodhd | yahoo | manual), intrinsic_value (decimal, nullable), intrinsic_value_calculated_at, moat_score (1-5, nullable), management_score (1-5, nullable), circle_of_competence_fit (1-5, nullable), user_id (string, default 'solo-investor'), created_at, updated_at

**financials** — investment_id, source (api | manual), period (annual | quarterly), year, quarter, revenue, net_income, ebitda, total_assets, total_debt, cash, capex, fcf, working_capital, auto_updated (boolean), last_refresh, api_source

**scores** — investment_id, score_type (altman_z | piotroski_f | beneish_m | composite_distress | dhandho_fit | moat | management | kelly | composite), value, calculated_at, inputs_json, financials_version_id (FK to financials row used), data_staleness_hours (integer), stale_warning (boolean)

**distress_components** — investment_id, component (cause | industry | balance_sheet | management | competition | revenue_base | asset_value), factor_score (0-10), calculated_at

**distress_summary** — investment_id, composite_score (0-100), permanence_score (0-10), classification (temporary | uncertain | permanent), calculated_at

**rules** — id, name, version (auto-incremented on edit), category, type (hard_gate | soft_gate | scoring), source_type (book | meeting | mistake | expert), source_detail, conditions_yaml, weight, active, active_from, active_to (nullable — null = currently active), created_at, times_fired, times_correct, believability_score. Semantic condition changes reset believability to default; minor edits (weight, description) preserve it.

**rule_audit_log** — investment_id, rule_id, rule_version (version at time of firing), fired_at, result (pass | fail | warn), override (boolean), override_reason

**scenarios** — investment_id, case (bear | base | bull), revenue_growth, margin, multiple, probability_weight, target_price, expected_value

**decision_journal** — investment_id, entry_type, thesis, confidence, key_assumptions_json, predicted_probability, actual_outcome (nullable until resolved), brier_score (nullable until resolved), lessons. Entry types:
  - `pre_investment` — thesis + confidence logged at entry; predicted_probability set, actual_outcome null
  - `pre_mortem` — structured "how could this lose?" analysis (Blackstone method); no outcome tracking
  - `quarterly_review` — updated confidence + assumptions; predicted_probability may be revised
  - `position_exit` — actual_outcome and brier_score populated; binary: success if return > 0
  - `post_mortem` — process vs outcome analysis after exit
  - Partial exits: treated as separate bets (each tranche gets its own `position_exit` entry)
  - Live positions with no outcome yet: marked as "incomplete" at quarterly review

**super_investor_positions** — investor_name, ticker, action (buy | sell | hold), quarter, shares, value

**sentiment** — investment_id, source (eodhd | gdelt | manual), headline, score (-1.0 to 1.0), date

**comparable_transactions** — id, deal_type, sector, industry, valuation_metric, valuation_multiple, date, notes

**geopolitical_events** — id, event_type (dedollarization | oil_price | brics | load_shedding | agoa | conflict | other), event_pattern (regex for GDELT matching), affected_sectors (JSON array), affected_tickers (JSON array, nullable), relevance_weight (0-1), trigger_threshold (e.g., mentions > 50/month), last_triggered, active

**sync_conflict_log** — id, table_name, record_id, local_value, cloud_value, conflict_at, resolved (boolean), resolution (local_wins | cloud_wins | manual)

**decision_snapshots** — id, investment_id, snapshot_at, active_rules_json, scores_json, kelly_position, scenario_json (captures full state at decision time for backtesting replay)

### Sync Strategy

- Local SQLite enables full offline operation for analysis, manual input, and rule management
- API-sourced data has freshness requirements: prices < 24h, fundamentals < 72h for decision-quality analysis; stale data is flagged, not blocked
- Turso cloud sync enabled per-table (user chooses what syncs)
- Priority sync order: rules and journal entries first (knowledge base is most valuable)
- Offline reconciliation: incremental sync on reconnect via timestamps; conflicts logged in `sync_conflict_log` table for manual review; sync runs as single transaction per table

---

## 6. API Integration

### Data Sources

| Source | Covers | Cost | Used For |
|--------|--------|------|----------|
| EODHD | JSE + global exchanges | $60/mo | Fundamentals, historical prices, news + sentiment |
| Yahoo Finance | Global (free tier) | Free | Fallback for price data, basic fundamentals |
| GDELT | Global events | Free | Geopolitical event detection, macro signals |
| FinBERT | N/A (runs locally) | Free | SA news sentiment scoring |
| Dataroma | Super investor 13Fs | Free | Guru portfolio tracking |

### Auto vs Manual Data Flow

| Data Point | Listed (JSE/Global) | Private/EM Unlisted |
|------------|---------------------|---------------------|
| Price | API (auto, daily) | Manual (deal price) |
| Financials | API (auto, quarterly) | Manual + templates |
| Scores (Z/F/M) | Auto-calculated from API data | Auto-calculated from manual input |
| News sentiment | API + FinBERT (auto) | Manual notes / GDELT for industry |
| Super investor overlap | API (Dataroma, quarterly) | N/A |
| Geopolitical impact | GDELT (auto) | GDELT (auto) |
| Moat / management | Manual (scored 1-5) | Manual (scored 1-5) |

### Refresh Schedule

- **Prices:** Daily (end of day batch or on-demand)
- **Fundamentals:** On quarterly earnings release
- **Scores:** Recalculated when underlying financials update
- **Sentiment:** Daily batch + on-demand for watchlist
- **Super investor positions:** Quarterly (13F schedule)
- **GDELT geopolitical:** Daily scan for SA-relevant events
- **Rules engine:** Runs automatically on upstream data changes, fires alerts if held position triggers a hard gate

### API Client Architecture

```
core/api/
├── eodhd.ts        ← Primary: fundamentals, prices, news
├── yahoo.ts        ← Fallback: prices, basic data
├── dataroma.ts     ← Super investor positions
├── gdelt.ts        ← Geopolitical events
├── finbert.ts      ← Local sentiment model wrapper
└── provider.ts     ← Unified interface, handles failover
```

Every API-sourced data point stores its origin (`api_source`), refresh timestamp (`last_refresh`), and whether it has been manually overridden.

---

## 7. Kelly Criterion & Probability Calibration

### Kelly Formula

f* = W/A - (1-W)/B

Where W = win probability, A = potential loss fraction (must be > 0), B = potential gain fraction (must be > 0).

**Domain constraints:**
- f* is clamped to [0, 1] — negative values mean "don't bet," values > 1 mean "use leverage" (not supported in v1)
- A and B must both be > 0 (certain outcomes are excluded — use scenario model instead)
- If W < A/(A+B), Kelly returns 0 (no edge, don't invest)

**Default: Half-Kelly** — `position_size = max(f* / 2, 0)`. Returns ~75% of optimal growth with 25% of the variance.

**Portfolio Kelly:** Individual f* values cannot simply be summed. When multiple opportunities exist, model the covariance matrix of expected returns across positions. Re-optimize portfolio weights to maximize expected log wealth subject to:
- No single position > half-Kelly individual f*
- Total portfolio allocation <= 100% (no leverage in v1)
- Correlated positions (e.g., two SA mining stocks) treated as partially overlapping bets

**Data staleness impact:** Scores calculated from data > 72 hours old carry a reliability penalty: `adjusted_kelly = kelly * 0.8` with stale_warning flag.

### Probability Estimation Pipeline

1. **Base rate** — historical success rate for the reference class (e.g., "distressed SA mining stocks bought at >30% discount to book")
2. **Fermi decomposition** — break the estimate into 4-5 independently estimable sub-questions
3. **Quantitative adjustment** — composite score (Z/F/M) shifts probability up or down
4. **Qualitative adjustment** — moat, management, circle of competence
5. **Sentiment adjustment** — FinBERT + GDELT signals
6. **Ensemble** — take median of 3-5 independent estimates
7. **Overconfidence correction** — systematic deflation (research shows 90% confidence is correct only 50-70% of the time)
8. **Pre-mortem** — "How could this lose?" reduces overconfidence ~30%

### Calibration System

- **Brier score tracking** — every probability estimate is logged, outcomes recorded, Brier score calculated
- **Calibration dashboard** — shows how well your 70% predictions actually hit 70% of the time
- **Decision journal** — records thesis, confidence, assumptions pre-investment for post-mortem comparison
- **Rule believability** — rules that produce better-calibrated probabilities get higher weight over time

---

## 8. Future Roadmap

### Phase 2 (After v1 stable)
- PDF/document parsing for financial statements
- LLM-assisted extraction from deal memos and CMAs
- CIPC integration (SA company registration data)
- Property APIs (Lightstone, Property24 comparables)

### Phase 3 (Web hosting)
- Add `packages/web/` consuming shared `core` package
- Deploy from private GitHub repo
- Multi-device sync via Turso

---

## 9. Cross-Cutting Concerns

### API Failover & Data Staleness

```typescript
type FailoverPolicy = {
  maxStalenessHours: number;        // max age before data is considered stale
  fallbackChain: DataProvider[];     // e.g. [eodhd, yahoo, localCache]
  onPartialFailure: 'serve_partial' | 'fail_hard' | 'use_cache';
  cacheBehavior: 'prefer_fresh' | 'prefer_available';
};
```

- Every API call specifies a failover policy
- Stale data is visually flagged in the UI (amber indicator + last refresh timestamp)
- Scores calculated from stale data carry a `stale_warning` flag
- Default: EODHD → Yahoo → local cache (max 7 days staleness for fundamentals, 1 day for prices)

### Rule Versioning & Auditability

- Rules table includes `version` (auto-incremented on edit), `active_from`, `active_to`
- `rule_audit_log` references `rule_version` at time of firing, not current state
- "Rules snapshot" export captures all active rules at any given date for full decision replay
- Retired rules are soft-deleted (`active_to` set), never hard-deleted

### Turso/SQLite Sync Semantics

```yaml
sync_config:
  rules:          { direction: bidirectional, conflict: last_write_wins, priority: highest }
  decision_journal: { direction: bidirectional, conflict: last_write_wins, priority: high }
  investments:    { direction: bidirectional, conflict: cloud_precedence, priority: high }
  financials:     { direction: cloud_to_local, conflict: cloud_overwrites, priority: medium }
  scores:         { direction: local_to_cloud, conflict: local_precedence, priority: medium }
```

- Single user = no true conflicts expected; `last_write_wins` with timestamp is sufficient
- All tables include `user_id` field (hardcoded to 'solo-investor' in v1, enables Phase 3 multi-user)
- Offline reconciliation: incremental sync on reconnect, with conflict log for manual review

### FinBERT Deployment

- **Distribution:** Lazy download on first use (not bundled — keeps Electron build small)
- **Size:** ~500MB, progress indicator during download
- **Hardware:** CPU-only inference (no GPU requirement)
- **Fallback:** If model fails to load, use EODHD's built-in sentiment scores (lower quality but available)
- **Updates:** Manual trigger (check for new model version in settings)

### Sentiment Aggregation

- Aggregate sentiment end-of-day UTC for each ticker
- Calculate median of FinBERT predictions with confidence > 75% (pre-aggregation filter)
- If < 2 qualifying predictions for a day, mark as "insufficient data" (not neutral — absence of signal is not a signal)
- SA language adjustment: lower weight for ambiguous predictions
- Days with 0 articles: carry forward previous day's score with decaying confidence (halves every 3 days)
- Track sentiment prediction vs actual 5-day price movement to build validation baseline

### Kelly Believability Algorithm

```typescript
function calculateBelievability(rule: Rule): number {
  const baseRate = rule.timesCorrect / rule.timesFired;
  // Exponential decay: recent outcomes weighted more (half-life = 365 days)
  const recencyWeight = exponentialDecay(rule.outcomeTimestamps, halfLifeDays: 365);
  // Bayesian shrinkage toward 50% prior when sample size is small
  const bayesian = (baseRate * rule.timesFired + 0.5 * priorWeight) / (rule.timesFired + priorWeight);
  return bayesian * recencyWeight;
}
```

- Quarterly auto-review: flag rules with believability below 0.4 for manual review
- Rules with < 5 firings carry default weight (not enough data to differentiate)

### PE Deal Pipeline State Machine

States: `nda_pending` → `screening` → `meeting_scheduled` → `deep_dd` → `ic_memo` → `bidding` → `closed` | `rejected`

- Each transition logged with timestamp, trigger, and notes
- `rejected` state includes `revisit_after` date and reason
- Exit criteria defined per stage (e.g., screening requires composite score > threshold)
- Multi-round bidding tracked as sub-states of `bidding`

### Component Contracts

- All five components consume `core` via typed interfaces defined in `core/contracts/`
- Interfaces are versioned; fields can be added but never removed without major version bump
- Contract tests validate that `core` output matches expected schemas

### Error Handling & Logging

- Structured JSON logging (timestamp, level, component, message, context)
- Log levels: error, warn, info, debug
- API errors: retry with backoff (3 attempts), then failover, then log + alert
- Rule parsing errors: skip rule + warn user, never silently ignore
- DB errors: surface to user immediately (financial data integrity is critical)

### Testing Strategy

- **Unit tests:** All scoring functions, rule evaluation, Kelly calculations (Vitest)
- **Integration tests:** API clients against fixture data (offline mode)
- **E2E tests:** Full Screener → Deal Analyzer → Portfolio flow
- **Reference fixtures:** Known-good investments with pre-calculated scores for regression testing
- **Coverage target:** 80%+ for `core` package

### Migration Strategy

- Drizzle ORM for schema management and auto-versioning
- Migrations run automatically on app startup
- Backward-compatible schema changes only (additive columns, no destructive changes)

---

## 10. Non-Goals (v1)

- Machine learning / AI-driven predictions (the system learns via transparent rule performance, not black-box ML)
- Real-time trading or order execution
- Multi-user collaboration (single user, single knowledge base — but `user_id` in schema for Phase 3)
- Mobile app (desktop + CLI + future web covers the need)

---

## Appendix A: Glossary of Models, Ratios & Frameworks

Every metric, score, and framework used in this system is documented below with its source, formula, interpretation, and how it connects to the Dhandho Analyzer's decision pipeline.

### A.1 Quantitative Scoring Models

#### Altman Z-Score
- **Source:** Edward Altman, "Financial Ratios, Discriminant Analysis and the Prediction of Corporate Bankruptcy" (1968)
- **Book reference:** Referenced in Pabrai's checklist under "leverage risks"
- **What it measures:** Probability of bankruptcy within 2 years
- **Formula:** `Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E`
  - A = Working Capital / Total Assets (liquidity)
  - B = Retained Earnings / Total Assets (cumulative profitability)
  - C = EBIT / Total Assets (operating efficiency)
  - D = Market Value of Equity / Total Liabilities (solvency)
  - E = Revenue / Total Assets (asset turnover)
- **Interpretation:**
  - Z > 2.99 → Safe zone (low bankruptcy risk)
  - Z 1.81-2.99 → Grey zone (moderate risk)
  - Z < 1.81 → Distress zone (high bankruptcy risk)
- **Why it matters for Dhandho:** Pabrai's principle #3 is "buy distressed businesses in distressed industries." Z-Score identifies genuinely distressed companies. A declining Z-Score entering the distress zone, combined with a rising F-Score, signals a potential turnaround — the sweet spot for Dhandho investing.
- **Used in:** Screener (composite score), Distress Radar (composite distress score), Rules Engine (hard gate: Z < 1.81 triggers distress flag)

#### Piotroski F-Score
- **Source:** Joseph Piotroski, "Value Investing: The Use of Historical Financial Statement Information to Separate Winners from Losers" (2000)
- **What it measures:** Financial strength of a company using 9 binary signals (0 or 1 each)
- **Formula (9 criteria, 1 point each):**
  - **Profitability (4 points):**
    1. Net income > 0
    2. Operating cash flow > 0
    3. Return on assets (ROA) increasing year-over-year
    4. Cash flow from operations > net income (earnings quality)
  - **Leverage & Liquidity (3 points):**
    5. Long-term debt ratio decreasing
    6. Current ratio increasing
    7. No new shares issued (no dilution)
  - **Operating Efficiency (2 points):**
    8. Gross margin increasing
    9. Asset turnover increasing
- **Interpretation:**
  - F = 8-9 → Strong (buy signal among cheap stocks)
  - F = 5-7 → Average
  - F = 0-2 → Weak (avoid or investigate further)
- **Why it matters for Dhandho:** The F-Score separates value from value traps. A cheap stock (low P/B) with a high F-Score is genuinely undervalued; one with a low F-Score may be cheap for a reason. For turnaround detection, look for F-Score *improving from a low base* — this indicates a company fixing its fundamentals before the market notices.
- **Used in:** Screener (composite score), Distress Radar (F-Score trend is a leading recovery indicator), Rules Engine (scoring rule: F >= 7 adds to composite)

#### Beneish M-Score
- **Source:** Messod Beneish, "The Detection of Earnings Manipulation" (1999)
- **What it measures:** Likelihood that a company is manipulating its earnings (accounting fraud detection)
- **Formula:** `M = -4.84 + 0.92*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI - 0.172*SGAI + 4.679*TATA - 0.327*LVGI`
  - DSRI = Days Sales in Receivables Index (are receivables growing faster than revenue?)
  - GMI = Gross Margin Index (are margins deteriorating?)
  - AQI = Asset Quality Index (are assets being inflated?)
  - SGI = Sales Growth Index (is growth sustainable?)
  - DEPI = Depreciation Index (are depreciation policies changing?)
  - SGAI = SGA Expense Index (are selling expenses being managed?)
  - TATA = Total Accruals to Total Assets (is income coming from cash or accounting?)
  - LVGI = Leverage Index (is debt increasing?)
- **Interpretation:**
  - M > -1.78 → Likely manipulator (red flag)
  - M < -1.78 → Unlikely manipulator
- **Why it matters for Dhandho:** Pabrai's checklist category #1 is "valuation errors." The M-Score is a fraud filter — it catches companies where the numbers look good but are fabricated. This protects you from value traps where the "margin of safety" is illusory because the financials are unreliable.
- **Research finding:** Combining Z-Score and M-Score yields 862 basis points of annual outperformance (LSEG research), versus 132 bps for Z alone. This is why we use a composite score, not individual metrics.
- **Used in:** Screener (composite score), Rules Engine (hard gate: M > -1.78 blocks investment), Deal Analyzer (flagged in investment memo risk section)

#### Composite Quantitative Score (0-100)
- **Source:** Dhando Analyzer internal model, informed by LSEG research on combined scoring
- **What it measures:** Overall financial health by combining Z, F, and M scores
- **Formula:**
  - Normalize each score to 0-100 range
  - `composite = 0.35 * Z_normalized + 0.35 * F_normalized + 0.30 * M_normalized`
  - Z and F are positive signals (higher = healthier); M is an inverse signal (lower/more negative = more trustworthy)
- **Why these weights:** Z and F measure complementary aspects of health (solvency + operational strength). M is a fraud filter — equally important but different in kind (it vetoes rather than endorses).
- **Used in:** Screener (primary ranking metric), Rules Engine (scoring rules and thresholds)

### A.2 Valuation Metrics

#### EV/EBITDA (Enterprise Value / EBITDA) — "The Acquirer's Multiple"
- **Source:** Tobias Carlisle, "The Acquirer's Multiple" (2017); originally from corporate finance M&A practice
- **What it measures:** How cheap or expensive a company is relative to its operating earnings, accounting for debt
- **Formula:** `EV/EBITDA = (Market Cap + Total Debt - Cash) / EBITDA`
- **Interpretation:** Lower = cheaper. Typically: < 8 is cheap, 8-12 is fair, > 12 is expensive (varies by industry)
- **Why it matters for Dhandho:** Unlike P/E, this metric accounts for debt — critical for Pabrai's principle of understanding the full enterprise cost. Carlisle's research shows buying the cheapest EV/EBITDA stocks in the market consistently outperforms more complex strategies.
- **Used in:** Screener (valuation filter), Rules Engine (valuation category)

#### P/E Ratio (Price / Earnings)
- **Source:** Benjamin Graham, "The Intelligent Investor" (1949)
- **What it measures:** How much you're paying per dollar of earnings
- **Formula:** `P/E = Share Price / Earnings Per Share`
- **Interpretation:** Lower = cheaper. Graham recommended P/E < 15 for defensive investors.
- **Why it matters for Dhandho:** The simplest valuation check. Pabrai looks for low P/E as an initial filter, but always digs deeper because P/E ignores debt and can be distorted by one-time items.
- **Used in:** Screener (valuation filter)

#### P/B Ratio (Price / Book Value)
- **Source:** Benjamin Graham, "Security Analysis" (1934)
- **What it measures:** How much you're paying relative to the company's net asset value
- **Formula:** `P/B = Share Price / (Total Assets - Total Liabilities) per share`
- **Interpretation:** P/B < 1 means the stock trades below its book value — potentially a deep value opportunity or a sign of trouble. Graham required P/B < 1.5.
- **Why it matters for Dhandho:** For asset-heavy businesses (mining, property, manufacturing — common in SA), P/B is a proxy for liquidation value — the "tails I don't lose much" floor. If you can buy at P/B < 1 with solid assets, your downside is protected.
- **Used in:** Screener (valuation filter), Distress Radar (low P/B + improving F-Score = turnaround signal)

#### FCF Yield (Free Cash Flow Yield)
- **Source:** Widely used; popularized by Joel Greenblatt in "The Little Book That Beats the Market" (2005)
- **What it measures:** How much free cash the business generates relative to its price
- **Formula:** `FCF Yield = Free Cash Flow / Market Cap` (or per share: FCF per share / Share Price)
- **Interpretation:** Higher = more cash generation per dollar invested. FCF Yield > 10% is generally attractive.
- **Why it matters for Dhandho:** Cash is king. Unlike earnings (which can be manipulated — see M-Score), free cash flow is hard to fake. Buffett's "owner earnings" concept is essentially FCF. A high FCF yield means the business is generating real cash you can reinvest or extract.
- **Used in:** Screener (valuation filter), Deal Analyzer (feeds into scenario models)

#### Owner Earnings
- **Source:** Warren Buffett, Berkshire Hathaway Annual Letter (1986)
- **What it measures:** The true economic earnings available to the owner, after maintenance investment
- **Formula:** `Owner Earnings = Net Income + Depreciation/Amortization - Maintenance CapEx`
- **Interpretation:** More conservative than reported earnings because it subtracts the capital needed to maintain (not grow) the business. If owner earnings are significantly lower than reported earnings, the business is capital-intensive.
- **Why it matters for Dhandho:** Pabrai's principle #1 is "buy existing businesses." Owner earnings tell you what the business actually throws off to the owner — the real return on your investment. This is the number used to calculate intrinsic value.
- **Used in:** Component 5 (Private Markets — owner earnings calculator), Deal Analyzer (intrinsic value calculation)

#### Intrinsic Value
- **Source:** Benjamin Graham, "Security Analysis" (1934); refined by Buffett
- **What it measures:** The estimated true worth of a business based on its future cash flows
- **Formula:** `IV = Sum of (Owner Earnings in Year N / (1 + Discount Rate)^N)` for years 1 through projected holding period, plus terminal value
- **Interpretation:** If market price < intrinsic value, there's a margin of safety. Pabrai requires >= 30% discount.
- **Why it matters for Dhandho:** This is the foundation of the entire system. Every Dhandho bet is built on the gap between intrinsic value and market price. The wider the gap, the bigger the margin of safety, the more asymmetric the bet.
- **Used in:** Deal Analyzer (central calculation), Portfolio Tracker (margin of safety erosion alerts), Rules Engine (hard gate: intrinsic_value_discount >= 30%)

### A.3 Qualitative Scoring Criteria

#### Moat Durability (scored 1-5)
- **Source:** Warren Buffett, multiple Berkshire Hathaway letters; Pat Dorsey, "The Little Book That Builds Wealth" (2008)
- **What it measures:** How defensible the company's competitive advantage is over 10+ years
- **Scoring guide:**
  - 5 = Wide moat: brand, network effects, patents, regulatory license, high switching costs (e.g., Visa, Capitec)
  - 4 = Solid moat: strong brand or cost advantage, some competitive pressure
  - 3 = Narrow moat: identifiable advantage but eroding or challenged
  - 2 = Weak moat: commodity business with slight differentiation
  - 1 = No moat: pure commodity, no pricing power, no switching costs
- **Moat sources:** Brand (Coca-Cola), network effects (Naspers/Prosus), switching costs (SAP), cost advantage (Anglo American at low quartile), regulatory (MTN license), patents, scale
- **Why it matters for Dhandho:** Pabrai principle #4: "Buy businesses with durable competitive advantages." A wide moat means competitors can't easily replicate the business — protecting your investment over time. This is weighted 1.5x in the Dhandho fit scoring because without a moat, even a cheap price doesn't protect you.
- **Used in:** Screener (qualitative layer), Dhandho fit score (principle #4, weighted 1.5x), Rules Engine (soft gate: moat < 3 triggers warning)

#### Business Simplicity (scored 1-5)
- **Source:** Mohnish Pabrai, "The Dhandho Investor," Ch. 2-3; Charlie Munger's circle of competence
- **What it measures:** How easy the business is to understand and how slowly the industry changes
- **Scoring guide:**
  - 5 = Very simple: single product/service, industry unchanged for decades (e.g., brick manufacturing, funeral services)
  - 4 = Simple: clear business model, slow-moving industry
  - 3 = Moderate: understandable but some complexity or faster change
  - 2 = Complex: multiple business lines, rapid industry evolution
  - 1 = Very complex: highly technical, unpredictable disruption risk (e.g., biotech, cutting-edge tech)
- **Why it matters for Dhandho:** Pabrai principle #2: "Buy simple businesses in industries with ultra-slow rates of change." Simple businesses are predictable, making your probability estimates more reliable — which directly improves your Kelly criterion accuracy.
- **Used in:** Screener (qualitative layer), Dhandho fit score (principle #2)

#### Management Quality (scored 1-5)
- **Source:** Charlie Munger's 5-point investment checklist (point #3); Philip Fisher, "Common Stocks and Uncommon Profits" (1958)
- **What it measures:** Integrity, competence, and shareholder alignment of leadership
- **Scoring guide:**
  - 5 = Exceptional: proven capital allocator, significant insider ownership, long tenure, transparent
  - 4 = Strong: good track record, aligned incentives, competent
  - 3 = Adequate: acceptable but no strong signal either way
  - 2 = Concerning: poor capital allocation history, excessive compensation, dilutive actions
  - 1 = Red flag: fraud history, misaligned incentives, revolving door leadership
- **Key indicators:** Insider ownership %, capital allocation track record (ROIC on reinvested earnings), compensation vs performance, candor in shareholder letters
- **Why it matters for Dhandho:** Even the cheapest stock with the widest moat can destroy value under bad management. Munger: "Show me the incentive and I will show you the outcome."
- **Used in:** Screener (qualitative layer), Distress classification (factor #4), Rules Engine (soft gate: management < 2 triggers warning)

#### Circle of Competence Fit (scored 1-5)
- **Source:** Warren Buffett & Charlie Munger; Munger's checklist point #1
- **What it measures:** How well YOU (the investor) understand this business, industry, and competitive dynamics
- **Scoring guide:**
  - 5 = Deep expertise: you've worked in this industry or studied it for years (e.g., Alex's SA bulk minerals knowledge)
  - 4 = Strong understanding: you've researched extensively and understand the key drivers
  - 3 = Working knowledge: you understand the basics but would miss nuance
  - 2 = Surface level: you understand the product but not the competitive dynamics
  - 1 = Outside competence: you're relying on others' analysis, not your own understanding
- **Why it matters for Dhandho:** Knowing the boundaries of your competence is Munger's #1 investment principle. Your probability estimates (and therefore Kelly sizing) are only as good as your understanding. A low circle-of-competence score should reduce your Kelly position size because your estimates are less reliable.
- **Used in:** Screener (qualitative layer), Kelly adjustment (low CoC → reduce position size), Rules Engine (hard gate: CoC = 1 blocks investment)

### A.4 Decision & Calibration Frameworks

#### Kelly Criterion
- **Source:** John Kelly Jr., "A New Interpretation of Information Rate" (1956); adapted for investing by Ed Thorp, "Beat the Dealer" (1962) and "A Man for All Markets" (2017)
- **Book reference:** Pabrai, "The Dhandho Investor," Ch. 12-13: "Few Bets, Big Bets, Infrequent Bets"
- **What it measures:** The optimal fraction of your bankroll to bet given your edge and odds
- **Formula:** `f* = W/A - (1-W)/B` where W = win probability, A = loss fraction, B = gain fraction
- **Why Half-Kelly:** Full Kelly maximizes long-term growth rate but with extreme volatility. Ed Thorp proved that half-Kelly returns ~75% of optimal growth with only ~25% of the variance. Virtually every serious practitioner (including Thorp himself) uses fractional Kelly.
- **Connection to Dhandho:** Pabrai explicitly references Kelly in his "few bets, big bets" framework. When you find a Dhandho-worthy opportunity (high margin of safety, wide moat, simple business, low downside), Kelly tells you to bet big. When the edge is small, Kelly tells you to bet small or pass.
- **Used in:** Deal Analyzer (position sizing), Portfolio Tracker (rebalancing signals)

#### Brier Score
- **Source:** Glenn Brier, "Verification of Forecasts Expressed in Terms of Probability" (1950); popularized for investing by Philip Tetlock, "Superforecasting" (2015)
- **What it measures:** The accuracy of your probability predictions over time
- **Formula:** `BS = (1/N) * Sum of (predicted_probability - actual_outcome)^2`
  - actual_outcome is 0 (loss) or 1 (win)
  - Perfect score = 0.0 (all predictions exactly right)
  - Random guessing = 0.25
  - Worst possible = 1.0
- **Why it matters for Dhandho:** Your Kelly sizing is only as good as your probability estimates. The Brier score tells you whether you're actually well-calibrated (your 70% bets win 70% of the time) or systematically overconfident. Over time, tracking your Brier score reveals your personal biases and improves your future estimates.
- **Used in:** Portfolio Tracker (calibration dashboard), Decision Journal (scored on each resolved prediction)

#### Bayesian Updating
- **Source:** Thomas Bayes, "An Essay Towards Solving a Problem in the Doctrine of Chances" (1763); applied to investing by multiple practitioners
- **What it measures:** How to rationally update your probability estimate as new evidence arrives
- **Process:** Start with a prior probability (base rate) → multiply by likelihood ratio of new evidence → get updated posterior probability
- **Example:** Base rate for SA mining turnarounds = 40%. You discover the company has cut costs 30% and insider buying is up → likelihood ratio 2.0 → posterior = ~57%
- **Why it matters for Dhandho:** Instead of anchoring to your first estimate (a known bias), Bayesian updating gives you a disciplined framework to incorporate new information — both positive and negative — without overreacting or underreacting.
- **Used in:** Deal Analyzer (probability estimation pipeline step 3-5), Kelly calculator (input probability)

#### Fermi Decomposition
- **Source:** Enrico Fermi; applied to forecasting by Philip Tetlock, "Superforecasting" (2015)
- **What it measures:** Breaks a hard-to-estimate probability into 4-5 simpler sub-questions
- **Example:** "Will this SA retailer double in 3 years?" becomes:
  1. Will SA consumer spending grow? (P = 0.6)
  2. Will this company gain market share? (P = 0.5)
  3. Will margins expand? (P = 0.4)
  4. Will the P/E multiple re-rate? (P = 0.7)
  5. Will management execute? (P = 0.6)
  - Combined: 0.6 * 0.5 * 0.4 * 0.7 * 0.6 = ~5% (much lower than gut feeling might suggest)
- **Why it matters for Dhandho:** Overconfidence is the #1 cognitive bias (Kahneman). Fermi decomposition forces you to justify each component of your thesis, and errors in sub-estimates tend to cancel out, producing more accurate overall estimates.
- **Used in:** Deal Analyzer (probability estimation pipeline step 2)

#### Pre-Mortem Analysis
- **Source:** Gary Klein, "The Power of Intuition" (2004); adopted by Blackstone Group's investment committee
- **What it measures:** Identifies failure modes before you commit capital
- **Process:** Assume the investment has already failed. Work backward: what went wrong? List 3-5 specific scenarios.
- **Why it matters for Dhandho:** Research shows pre-mortems reduce overconfidence by ~30%. Blackstone requires every investment proposal to answer "how could this lose money?" and then demonstrate it's unlikely. This directly improves the accuracy of your Kelly probability estimates.
- **Used in:** Deal Analyzer (pre-mortem prompt), Decision Journal (entry_type: pre_mortem)

#### Believability-Weighted Decision Making
- **Source:** Ray Dalio, "Principles" (2017); Bridgewater Associates internal system
- **What it measures:** The track record of each decision rule, weighted by demonstrated accuracy
- **How it works in the Dhando Analyzer:** Each rule accumulates a believability_score based on how often it correctly predicted outcomes, with exponential decay favoring recent results. Rules that perform better get higher weight in the composite scoring.
- **Why it matters for Dhandho:** Not all rules are equally predictive. A rule learned from a costly mistake that has prevented 5 subsequent losses is more "believable" than a theoretical rule never tested. The system automatically learns which principles are most valuable for YOUR specific investment style.
- **Used in:** Rules Engine (believability_score on each rule), Kelly Believability Algorithm (Section 9)

### A.5 Distress & Risk Indicators

#### Debt/EBITDA (Leverage Ratio)
- **Source:** Standard corporate finance metric; used extensively in PE (KKR, Blackstone)
- **What it measures:** How many years of operating earnings it would take to pay off all debt
- **Formula:** `Debt/EBITDA = Total Debt / EBITDA`
- **Interpretation:** < 2x = conservative, 2-4x = moderate, > 4x = highly leveraged, > 6x = distressed
- **Why it matters for Dhandho:** Pabrai's checklist category #2 is "leverage risks." High leverage is the #1 killer of value investments — a company can be fundamentally sound but go bankrupt if it can't service its debt during a downturn. This is the "tails I don't lose much" check.
- **Used in:** Screener (Dhandho filter), Distress Radar (distress component: balance sheet strength), Rules Engine (hard gate: debt/EBITDA > 6x blocks investment)

#### Capex Intensity
- **Source:** Warren Buffett, preference for "capital-light" businesses; Pabrai principle #1
- **What it measures:** How much capital the business must reinvest just to maintain operations
- **Formula:** `Capex Intensity = CapEx / Revenue`
- **Interpretation:** < 5% = capital-light (ideal), 5-15% = moderate, > 15% = capital-heavy
- **Why it matters for Dhandho:** Capital-light businesses generate more free cash flow per dollar of revenue. Less capex = more owner earnings = higher intrinsic value. Pabrai's motel examples in the book are capital-light businesses with high returns on invested capital.
- **Used in:** Screener (Dhandho-specific filter), Owner earnings calculation

#### ROIC (Return on Invested Capital)
- **Source:** Joel Greenblatt, "The Little Book That Beats the Market" (2005); Michael Mauboussin, "Measuring the Moat" (2002)
- **What it measures:** How efficiently a company generates returns on the capital invested in the business
- **Formula:** `ROIC = NOPAT / Invested Capital` (NOPAT = Net Operating Profit After Tax; Invested Capital = Total Assets - Cash - Non-interest-bearing Liabilities)
- **Interpretation:** ROIC > WACC (Weighted Average Cost of Capital) = creating value. ROIC > 15% sustained for 5+ years = strong moat evidence.
- **Why it matters for Dhandho:** ROIC is the single best quantitative measure of moat. A company that consistently earns ROIC > WACC has a competitive advantage that prevents competitors from eroding its returns. Greenblatt's "Magic Formula" ranks stocks by combining high ROIC with low EV/EBITDA — essentially finding quality companies at cheap prices, which is the Dhandho thesis in a formula.
- **Used in:** Rules Engine (quality category: ROIC > WACC for 5+ years), Moat durability assessment

#### WACC (Weighted Average Cost of Capital)
- **Source:** Franco Modigliani & Merton Miller (1958); standard corporate finance
- **What it measures:** The minimum return a company must earn on its assets to satisfy its debt holders and equity investors
- **Formula:** `WACC = (E/V * Re) + (D/V * Rd * (1-T))` where E = equity, D = debt, V = total value, Re = cost of equity, Rd = cost of debt, T = tax rate
- **Why it matters for Dhandho:** WACC is the discount rate used to calculate intrinsic value. A lower WACC means future cash flows are worth more today. ROIC > WACC is the fundamental test of whether a business creates or destroys value.
- **Used in:** Deal Analyzer (intrinsic value DCF calculation), Rules Engine (ROIC vs WACC comparison)

### A.6 The Dhandho Framework (9 Principles)

All principles from Mohnish Pabrai, "The Dhandho Investor" (2007).

| # | Principle | Chapter | What to Look For | Why It Matters |
|---|-----------|---------|------------------|----------------|
| 1 | Buy existing businesses | Ch. 2 | Operating history, proven revenue, real customers | Eliminates startup risk — you're buying a track record, not a promise |
| 2 | Buy simple businesses in slow-change industries | Ch. 3 | Few products, understandable model, industry stable for decades | Simple = predictable = better probability estimates = more accurate Kelly |
| 3 | Buy distressed businesses in distressed industries | Ch. 4 | Low valuations, negative sentiment, temporary problems | Dhandho's edge: market confuses uncertainty (unknowable timing) with risk (permanent loss). You buy when others flee. |
| 4 | Buy businesses with durable competitive advantages | Ch. 5 | Moat score >= 3, ROIC > WACC sustained | **Core pillar (1.5x weight).** Without a moat, the business erodes. The moat protects your margin of safety over time. |
| 5 | Bet heavily when odds are overwhelmingly in your favor | Ch. 12-13 | Kelly f* > 0.10 (before halving), high conviction | Concentration, not diversification. Pabrai typically holds 5-10 positions. Kelly tells you how much to bet. |
| 6 | Focus on arbitrage opportunities | Ch. 6 | Merger arb, spinoff, event-driven catalyst | Look for situations where the outcome is likely but the market hasn't priced it in yet. |
| 7 | Buy at a significant margin of safety | Ch. 7 | Intrinsic value discount >= 30% | **Core pillar (1.5x weight).** The margin of safety is your buffer against being wrong. Graham's #1 rule. |
| 8 | Buy businesses with low risk and high uncertainty | Ch. 8 | Low downside (bear case loss <= 15%) with unclear timing/catalyst | **Core pillar (1.5x weight).** This is the Dhandho edge — the market prices uncertainty as if it were risk. You profit from the gap. |
| 9 | Invest in copycats rather than innovators | Ch. 9 | Proven business model being replicated in new market/geography | Copycats have de-risked the model. The original innovator proved it works; the copycat just executes. |

### A.7 Complementary Checklists

#### Munger's 5-Point Investment Checklist
- **Source:** Charlie Munger, various speeches; compiled in Tren Griffin, "Charlie Munger: The Complete Investor" (2015)
1. **Circle of Competence** — Can you thoroughly understand this business?
2. **Sustainable Competitive Advantage** — What unique advantage protects this company?
3. **Quality Management** — Is leadership competent, honest, and aligned with shareholders?
4. **Financial Strength** — Low debt, high profitability, strong free cash flow?
5. **Valuation with Margin of Safety** — Is the price significantly below intrinsic value?

**How it connects:** Munger's checklist overlaps with Dhandho principles #1, #4, #7. In the Analyzer, these are encoded as both qualitative scores (moat, management, CoC) and hard gates (margin of safety, financial strength).

#### Pabrai's ~98 Question Checklist (5 Categories)
- **Source:** Mohnish Pabrai, developed post-2008; described in Guy Spier, "The Education of a Value Investor" (2014)
- Each question derives from a documented mistake by Pabrai or another investor.
1. **Valuation errors** — Am I anchoring to the wrong metric? Is the earnings power sustainable? Are there hidden liabilities?
2. **Leverage risks** — Can the company service its debt in a downturn? Are there covenant triggers? Off-balance-sheet obligations?
3. **Management & ownership problems** — Is management diluting shareholders? Insider selling? Poor capital allocation history?
4. **Moat deterioration** — Is the competitive advantage weakening? New competitors? Technology disruption? Regulatory change?
5. **Personal biases** — Am I buying because I want to be right? Anchoring to my purchase price? Falling for a compelling narrative?

**How it connects:** These 5 categories map directly to rule categories in the Rules Engine. Each of the ~98 questions becomes a rule that fires during the Deal Analyzer's pre-investment process.

#### Graham's Margin of Safety Criteria
- **Source:** Benjamin Graham, "The Intelligent Investor," Ch. 20 (1949)
- **Key criteria for defensive investors:**
  - P/E < 15
  - P/B < 1.5
  - P/E * P/B < 22.5 (Graham Number)
  - Current ratio > 2
  - Earnings growth > 0 for 10 consecutive years
  - Dividend record: uninterrupted for 20 years
- **How it connects:** Graham is the foundation. Pabrai built on Graham by adding qualitative judgment (moats, management) and concentration (Kelly sizing). Graham's quantitative screens are pre-seeded as scoring rules in the Rules Engine.

### A.8 How Everything Ties Together

The Dhandho Analyzer's decision pipeline chains these models in a specific order:

```
1. SCREEN (filter universe)
   ├── Quantitative: Z-Score (bankruptcy?), F-Score (quality?), M-Score (fraud?)
   ├── Valuation: EV/EBITDA, P/E, P/B, FCF Yield (cheap?)
   ├── Dhandho filters: Capex intensity, debt/EBITDA (capital-light? safe?)
   └── Super investor overlay (are experts buying?)

2. ANALYZE (deep dive on candidates)
   ├── Qualitative: Moat, Management, Simplicity, Circle of Competence
   ├── Scenario model: Bear/Base/Bull with probability weights
   ├── Intrinsic value: DCF using Owner Earnings, discounted at WACC
   ├── Margin of safety: Current price vs intrinsic value (>= 30% required)
   ├── Kelly sizing: Probability from Bayesian pipeline → half-Kelly position
   ├── Pre-mortem: "How could this lose?" (Blackstone method)
   └── Pabrai checklist: 98 questions across 5 categories

3. RULES ENGINE (algorithmic gates)
   ├── Hard gates: Margin of safety, M-Score, Circle of Competence
   ├── Soft gates: Management, leverage, F-Score minimum
   ├── Scoring rules: Composite quantitative, super investor overlap
   └── All weighted by believability (Dalio)

4. TRACK (monitor positions)
   ├── Traffic-light dashboard: green/amber/red per factor
   ├── Margin of safety erosion: price approaching intrinsic value
   ├── Kelly rebalancing: position drift from optimal
   ├── Brier score: calibrate your probability estimates over time
   └── Decision journal: thesis → outcome → lessons

5. DISTRESS RADAR (find turnarounds)
   ├── Composite distress score: Z + F trend + M + cash flow + leverage
   ├── Sentiment: FinBERT on news (negative sentiment + improving fundamentals = opportunity)
   ├── Geopolitical: GDELT events mapped to SA sectors
   ├── Temp vs permanent: 7-factor classification
   └── Historical patterns: compare to past SA recoveries

6. PRIVATE/EM MARKETS (unlisted deals)
   ├── Dhandho fit: 9-principle scoring (weighted)
   ├── Owner earnings: Buffett's true earnings metric
   ├── Deal pipeline: PE-style stages with gates
   └── EM risk overlay: currency, political, regulatory, liquidity
```

**The feedback loop:** Every decision feeds back into the system. Outcomes update Brier scores, rule believability adjusts, and your personal checklist grows. Over years, the system becomes a codified version of your investing wisdom — tested, scored, and continuously refined.
