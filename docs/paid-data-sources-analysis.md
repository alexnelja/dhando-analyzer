# Paid Data Sources Analysis for Dhando Analyzer

> Researched 2026-03-30. Prices and availability subject to change.
> Target: South African investment analysis tool covering 42 methodologies.

---

## Table of Contents

1. [Sharenet Pro](#1-sharenet-pro)
2. [Refinitiv / LSEG Workspace](#2-refinitiv--lseg-workspace)
3. [RavenPack](#3-ravenpack)
4. [Polymarket & Prediction Markets](#4-polymarket--prediction-markets)
5. [Formula Coverage Matrix](#5-formula-coverage-matrix)
6. [Comparative Verdict](#6-comparative-verdict)
7. [Recommended Integration Architecture](#7-recommended-integration-architecture)

---

## 1. Sharenet Pro

### Overview

Sharenet is a licensed JSE data vendor based in South Africa, providing market data, fundamentals, SENS announcements, and trading services. It is the most widely-used retail-grade JSE data platform in the country.

Website: https://www.sharenet.co.za

### API Availability

**Sharenet does NOT offer a public API.** There is no developer portal, no REST API documentation, no API keys, and no programmatic access advertised for any subscription tier. All data is delivered through their web platform only.

Implications:
- No JSON/XML/CSV endpoints to call programmatically
- The only export option is CSV download of historical price data (up to 5 years) and Excel portfolio export
- Any programmatic access would require web scraping, which violates their Terms & Conditions (data is licensed from the JSE)
- SENS announcements are displayed on-site but not available via feed

### Data Coverage

| Data Category | Available? | Details |
|---|---|---|
| Real-time JSE prices | Yes (Premium) | R1,435/month; lower tiers get 15-min delayed |
| Delayed JSE prices | Yes | 15-min delayed at R180/month |
| SENS announcements | Yes | Current (7-day) and historical archive |
| Balance sheet data | Partial | "Over 100 company financial metrics" from income statement, balance sheet, cash flow — but only via web, no API |
| Income statement data | Partial | Same as above, subscription required |
| Cash flow statement data | Partial | Same as above |
| Fundamental ratios | Yes | 25+ ratios including P/E, P/B, PEG, dividend yield |
| Broker consensus forecasts | Yes | Arithmetic average of sell-side analyst estimates |
| Insider transactions | No | Not mentioned in any product tier |
| ESG scores | No | Not available |
| Credit ratings | No | Not available |
| Private company data | No | JSE-listed companies only |
| Historical data depth | Moderate | Up to 10 years on charts, 5 years downloadable CSV |

### Pricing

| Tier | Monthly Cost (incl. VAT) | Key Features |
|---|---|---|
| Registered User | Free | Basic delayed prices, limited features |
| MySharenet | R180/month (~$10 USD) | 15-min delayed data, fundamentals, SENS, alerts |
| MySharenet LIVE | R520/month (~$29 USD) | Real-time data + all MySharenet features |
| Daily Download | R470/month (~$26 USD) | End-of-day data downloads |
| Premium | R1,435/month (~$80 USD) | Real-time feed, advanced charts, full fundamentals, analytics scanner |

### Specific Metric Availability

| Metric | Available? | Notes |
|---|---|---|
| Revenue | Yes | Via detailed financials (subscription) |
| Net Income | Yes | Via detailed financials |
| EBITDA | Likely | Part of 100+ metrics claim |
| Total Assets | Yes | Balance sheet data |
| Total Debt | Yes | Balance sheet data |
| Cash | Yes | Balance sheet data |
| CapEx | Uncertain | May be in cash flow data |
| FCF | Uncertain | May need to be calculated |
| Working Capital | Uncertain | May need to be calculated from components |
| Shares Outstanding | Yes | Shown in fundamentals |
| Dividends | Yes | Dividend declarations tracked |
| Insider Transactions | No | Not available |
| P/E | Yes | Directly provided |
| P/B | Yes | Directly provided |
| EV/EBITDA | Uncertain | EV not confirmed; EBITDA likely available |

### Sharenet Verdict

- **Biggest gap it fills**: Cheapest source of JSE fundamentals and SENS for a South African audience
- **Biggest limitation**: No API whatsoever. All data is web-only. This is a dealbreaker for automated integration with Dhando Analyzer
- **Worth it for solo investor?**: Yes, as a research companion — but not as a data source for programmatic analysis
- **SA public companies**: Partial coverage (web-only, no API)
- **SA private companies**: No
- **Recommendation**: Use Sharenet for manual research and SENS monitoring. Do NOT plan integration around it. Consider scraping as a last resort but note JSE licensing restrictions.

---

## 2. Refinitiv / LSEG Workspace

### Overview

LSEG Data & Analytics (formerly Refinitiv, formerly Thomson Reuters Financial) is the second-largest financial data terminal after Bloomberg. It provides comprehensive global financial data including deep coverage of JSE-listed companies via the Workspace desktop application and programmatic APIs.

Website: https://www.lseg.com/en/data-analytics

### API Availability

LSEG provides multiple API access paths:

**1. LSEG Data Library for Python** (`pip install lseg-data`)
- Modern Python SDK with Access Layer (simple), Content Layer (structured objects), and Delivery Layer (streaming)
- Runs in Jupyter Notebooks, scripts, or applications
- Requires active Workspace desktop session OR RDP (Refinitiv Data Platform) cloud credentials
- Also available for TypeScript/JavaScript

**2. Eikon Data API** (legacy, `pip install eikon`)
- Older Python API, still functional
- Requires Eikon Desktop running locally
- Data does not leave the desktop (licensing restriction)

**3. LSEG Data Platform (RDP) REST API**
- Cloud-based REST endpoints
- Requires separate RDP license (more expensive than desktop-only)
- Enables server-side integration without desktop dependency

**Key API Capabilities:**
- `ld.get_data()` — fetch any fundamental, estimate, or calculated field for any universe
- `ld.get_history()` — historical pricing time series
- `ld.content.search` — screen and search companies by criteria
- `ld.content.fundamental_and_reference` — full financial statements
- `ld.content.esg` — ESG scores and pillars
- `ld.content.estimates` — I/B/E/S consensus estimates
- Streaming real-time prices via WebSocket

**Data Format:** JSON (API responses), pandas DataFrames (Python SDK)

**Rate Limits:** Governed by entitlement and fair-use policy; typically 5,000-10,000 requests/day for standard desktop license. No hard published limits.

### Data Coverage for JSE

| Data Category | Available? | Details |
|---|---|---|
| Real-time JSE prices | Yes | Licensed, streaming via WebSocket |
| Delayed JSE prices | Yes | Included in all tiers |
| Full income statements | Yes | Annual + quarterly, standardized + as-reported |
| Full balance sheets | Yes | Annual + quarterly, standardized + as-reported |
| Full cash flow statements | Yes | Annual + quarterly, standardized + as-reported |
| Historical financials depth | Yes | 10-20+ years for major companies |
| ESG scores | Yes | LSEG ESG Scores (formerly Refinitiv ESG) — pillar scores (E, S, G), combined score, controversy score. Coverage of ~250 SA companies |
| Analyst estimates (I/B/E/S) | Yes | Consensus estimates for ~80-100 JSE companies |
| Credit ratings | Yes | From S&P, Moody's, Fitch — for rated SA corporates and sovereigns |
| Insider transactions | Partial | Director dealings from SENS, but not a structured insider transaction database like SEC Form 4 |
| Private company data | Limited | Some private company profiles exist but financial statements are sparse |
| SENS announcements | Yes | Via news feed, searchable |
| Macroeconomic data | Yes | SA GDP, CPI, interest rates, trade data via Datastream |
| Bond/credit data | Yes | SA government bonds, corporate bonds, yield curves |

### Specific Data Fields (TR. codes)

All fields needed for quantitative analysis are available via TR. field codes:

| Field | TR. Code | Available for JSE? |
|---|---|---|
| Revenue | TR.Revenue | Yes |
| Net Income | TR.NetIncome | Yes |
| EBITDA | TR.EBITDA | Yes |
| EBIT | TR.EBIT | Yes |
| Total Assets | TR.TotalAssets | Yes |
| Total Liabilities | TR.TotalLiabilities | Yes |
| Total Debt | TR.TotalDebt | Yes |
| Cash & Equivalents | TR.CashAndSTInvestments | Yes |
| CapEx | TR.CapitalExpenditures | Yes |
| OCF (Operating Cash Flow) | TR.OperatingCashFlow | Yes |
| FCF | TR.FreeCashFlow | Yes |
| Working Capital | TR.WorkingCapital | Yes |
| Retained Earnings | TR.RetainedEarnings | Yes |
| Shares Outstanding | TR.SharesOutstanding | Yes |
| Market Cap | TR.CompanyMarketCap | Yes |
| Dividends Per Share | TR.DividendPerShare | Yes |
| Gross Margin | TR.GrossMargin | Yes |
| ROA | TR.ReturnOnAssets | Yes |
| ROIC | TR.ROIC | Yes |
| Current Ratio | TR.CurrentRatio | Yes |
| Asset Turnover | TR.AssetTurnover | Yes |
| PPE (Net) | TR.PropertyPlantEquipmentNet | Yes |
| Depreciation | TR.DepreciationAmortization | Yes |
| SGA Expenses | TR.SellingGeneralAdmin | Yes |
| Receivables | TR.AccountsReceivable | Yes |
| Long-term Debt | TR.LongTermDebt | Yes |
| NOPAT | Calculated (EBIT * (1-tax)) | Inputs available |
| EV | TR.EnterpriseValue | Yes |
| WACC | TR.WACC | Yes (for covered companies) |

### Pricing

LSEG does not publish transparent pricing. Based on market intelligence:

| Tier | Estimated Annual Cost | Notes |
|---|---|---|
| Workspace Basic (limited data) | ~$3,600/year ($300/month) | Stripped-down, may lack full fundamentals |
| Workspace Standard | ~$12,000-$22,000/year | Standard desktop with fundamentals, estimates, ESG |
| Workspace + RDP API | ~$22,000-$36,000/year | Adds cloud API access for server-side integration |
| Enterprise (10-25 users) | $150,000-$400,000/year | Full data suite + redistribution rights |

**Important pricing notes:**
- API access (Python/JS SDK) is included with any Workspace desktop license at no extra charge — but data cannot leave the desktop
- RDP (cloud API) access for server-side use requires additional licensing
- Pricing is heavily negotiated; LSEG sales reps have significant discretion
- No free tier or trial for the full platform (ESG data has had limited free trials)
- Annual contracts, typically 1-3 year terms with auto-renewal

### LSEG Verdict

- **Biggest gap it fills**: The ONLY realistic source for complete, structured financial statement data for JSE companies with programmatic API access. This is the single most important data source for Dhando Analyzer.
- **Biggest limitation**: Price. $12,000-22,000/year is steep for a solo investor. The desktop-bound API restriction means you cannot run a headless server pulling data without RDP licensing.
- **Worth it for solo investor?**: Only if investing is your primary profession/income. The Workspace Basic at ~$3,600/year might be viable if it includes sufficient fundamentals.
- **SA public companies**: Comprehensive coverage — all JSE-listed companies with full financial statements
- **SA private companies**: Very limited
- **Recommendation**: This is the best-in-class option for JSE fundamental data. Explore Workspace Basic tier pricing with LSEG sales. If budget allows, this single source can provide ALL inputs for Altman Z-Score, Piotroski F-Score, Beneish M-Score, Magic Formula, DCF, ROIC decomposition, and Sloan Accrual Ratio.

---

## 3. RavenPack

### Overview

RavenPack (via its Bigdata.com API platform) is the leading provider of structured news sentiment analytics for financial markets. Founded in 2003, it processes 40,000+ news and social media sources in 13 languages, recognizing 12 million+ named entities across 7,000+ event categories.

Website: https://www.ravenpack.com
API Platform: https://bigdata.com

### API Availability

**Bigdata.com REST API:**
- RESTful API with JSON responses
- Authentication via API key
- Supports historical and real-time data
- MCP connectors available for enterprise AI integration
- Partnership with Economist Intelligence Unit (EIU) for macroeconomic data

**Data Delivery Options:**
- REST API (on-demand queries)
- Bulk data feeds (historical archives)
- Real-time streaming (premium tier)
- SFTP delivery for bulk datasets

### Data Coverage

| Data Category | Available? | Details |
|---|---|---|
| News sentiment per company | Yes | Sentiment score (-1 to +1) for each entity mention |
| News sentiment per sector | Yes | Aggregated from entity-level scores |
| Relevance scoring | Yes | How relevant the news item is to the entity (0-100) |
| Novelty tracking | Yes | Whether the news is new information or a repeat |
| Event categorization | Yes | 7,000+ event types (earnings, M&A, lawsuits, etc.) |
| Entity coverage | Yes | 12M+ entities: companies (public + private), people, locations, products |
| South African companies | Yes, but limited | SA companies are in the entity universe, but SA news source coverage is thinner than US/EU |
| SA news sources | Partial | International sources covering SA (Reuters, Bloomberg, FT) are included. Local SA sources (Business Day, Fin24, Daily Investor) coverage is uncertain |
| Historical depth | Yes | Full archive back to 2000 |
| Real-time updates | Yes | Sub-second processing of news |
| Geopolitical risk scoring | Yes | Via event taxonomy — war, sanctions, elections, policy changes are tagged |
| BRIS/BRICS nowcasting | Yes | Published research showing 5-25% improvement in GDP nowcasting accuracy for Brazil, Russia, India, South Africa |

### BRICS Nowcasting Model (South Africa)

RavenPack published research on using news sentiment to nowcast GDP growth for BRIS countries (Brazil, Russia, India, South Africa):

- **What it measures**: Current-quarter GDP growth estimates using high-frequency news sentiment as a leading indicator
- **Methodology**: Combines traditional macro variables with aggregated news sentiment signals over 30-day and 90-day rolling windows
- **Accuracy improvement**: Out-of-sample forecasting error improved by 5-25% depending on country and prediction period
- **Key insight**: News sentiment adds the most value "during periods with a sparsity of core macroeconomic releases" — exactly when you need it most
- **South Africa specifically**: Included as one of four countries studied; SA economic news flows through international wire services

### Geopolitical Risk Scoring

RavenPack tracks geopolitical events via its event taxonomy:
- War/conflict escalation/de-escalation
- Sanctions (imposition, removal, speculation)
- Trade agreement negotiations
- Election outcomes and policy changes
- Sovereign credit events
- Diplomatic incidents

Each event gets a sentiment score, relevance score, and novelty score. These can be aggregated into country-level or region-level geopolitical risk indices.

### Can It Replace FinBERT + GDELT?

| Dimension | FinBERT + GDELT (current) | RavenPack |
|---|---|---|
| Accuracy | Good for English financial text; GDELT is noisy | Superior — purpose-built for finance with 20+ years of refinement |
| Coverage | GDELT is broad but unstructured | 40,000+ curated sources with structured output |
| Entity resolution | Basic (requires custom NER) | 12M+ entities with disambiguation |
| SA coverage | GDELT has broad SA news; FinBERT is English-only | International coverage of SA is strong; local SA sources uncertain |
| Cost | Free (open source) | $50,000-$200,000+/year (estimated) |
| Latency | Minutes to hours (batch processing) | Sub-second (real-time) |
| Maintenance | High (custom pipeline) | Low (managed service) |

**Verdict on replacement**: RavenPack is objectively superior in accuracy and structure. However, the cost makes it impractical for a solo investor. FinBERT + GDELT is "good enough" for the Dhando Analyzer use case.

### Integration Mapping

How RavenPack data maps to Dhando Analyzer modules:

| Dhando Module | RavenPack Input | How |
|---|---|---|
| Distress Radar | Company-level negative sentiment spikes | Aggregate sentiment below threshold triggers alert |
| Kelly Criterion probability | Sentiment-derived probability adjustment | Use sentiment momentum as Bayesian prior update |
| Market Cycle Indicator | Macro sentiment index | Aggregate cross-sector sentiment trend |
| Credit Cycle | Sovereign/banking sector sentiment | Track credit-related event frequency and tone |
| Nowcasting overlay | BRIS GDP nowcast | Complement traditional macro indicators |

### Pricing

RavenPack does NOT publish pricing. Based on industry intelligence:

| Tier | Estimated Annual Cost | Notes |
|---|---|---|
| Academic (via WRDS) | Included in university subscriptions | Access to historical data only |
| Startup/Small Fund | ~$50,000-$80,000/year | Limited entity universe, API access |
| Professional | ~$100,000-$200,000/year | Full universe, real-time, all event types |
| Enterprise | ~$200,000+/year | Redistribution rights, custom feeds, dedicated support |

There is NO individual investor tier. RavenPack targets hedge funds, asset managers, and banks.

### RavenPack Verdict

- **Biggest gap it fills**: Structured, high-quality news sentiment with entity resolution and event categorization — the gold standard for sentiment-driven signals
- **Biggest limitation**: Pricing is completely prohibitive for a solo investor ($50K+ annually minimum)
- **Worth it for solo investor?**: No. Absolutely not at current pricing.
- **SA public companies**: Yes, covered via international news sources
- **SA private companies**: Partial coverage (12M+ entity universe includes some private companies)
- **Recommendation**: Do NOT integrate RavenPack. Continue with FinBERT + GDELT as the sentiment layer. If the Dhando Analyzer grows to serve a fund or advisory firm, revisit RavenPack then. For SA-specific sentiment, consider supplementing GDELT with RSS feeds from Business Day, Fin24, Moneyweb, and BizNews processed through FinBERT.

---

## 4. Polymarket & Prediction Markets

### Overview

Polymarket is the world's largest prediction market, where users trade on the outcomes of real-world events. Prices of outcome tokens directly represent implied probabilities. Polymarket runs on Polygon (blockchain) with USDC settlement.

Website: https://polymarket.com
Docs: https://docs.polymarket.com

### API Availability

Polymarket has a well-documented, free API with three service tiers:

**1. Gamma API** (Market Discovery) — `gamma-api.polymarket.com`
- Public, no authentication required
- Endpoints: `/markets`, `/events`, `/series`, `/tags`, `/search`
- Returns market metadata, prices, volumes, liquidity
- ~1 second indexing latency

**2. CLOB API** (Trading & Order Book) — `clob.polymarket.com`
- Read endpoints are public (no auth)
- Write endpoints require API key + EIP-712 signature
- Endpoints: `/price`, `/book`, `/midpoint`, `/price-history`, `/spread`, `/tick-size`
- Order placement: `/order`, `/orders` (batch up to 15)

**3. Data API** (User Positions) — `data-api.polymarket.com`
- `/positions`, `/trades`, `/activity`, `/holders`

**4. WebSocket Streams**
- `wss://ws-subscriptions-clob.polymarket.com/ws/` — order book updates (~100ms latency)
- `wss://ws-live-data.polymarket.com` — external data feeds

**Authentication Tiers:**
- Level 0: No auth — browse markets, read prices (sufficient for Dhando Analyzer)
- Level 1: Wallet signature — derive API credentials
- Level 2: API key + HMAC headers — place trades

**Data Format:** JSON. Prices as strings for precision (e.g., "0.6500").

**Rate Limits:**
- Gamma API: 4,000 requests per 10 seconds
- CLOB read endpoints: 15,000 requests per 10 seconds
- No API key needed for read-only access
- Free for all read operations

**SDKs:**
- Python: `py-clob-client`
- TypeScript: `@polymarket/clob-client`
- Go: `poly-market-sdk`
- Rust CLI: `polymarket` (Homebrew)

### Price-to-Probability Mapping

Outcome token prices ARE probabilities:
- A "Yes" token priced at $0.65 implies a 65% probability of the event occurring
- A "No" token priced at $0.35 implies a 35% probability
- Yes + No prices sum to ~$1.00 (minus spread)
- The `outcomePrices` field in the market object provides these directly

**For Kelly Criterion**: `p = outcomePrices[0]` (for Yes outcome), directly usable as the probability input. The bid-ask spread represents market uncertainty.

### Relevant Markets for Investment Analysis

**Currently active on Polymarket (as of March 2026):**

| Category | Example Markets | Relevance to Dhando |
|---|---|---|
| Recession | "US recession by end of 2026?" (65% No) | Market cycle indicator |
| Fed interest rates | Fed funds rate target ranges | Discount rate / WACC input |
| Inflation | "Eurozone Annual Inflation 2026" | Macro cycle |
| Geopolitical | War/peace outcomes, sanctions | Geopolitical risk overlay |
| Elections | US, EU elections | Policy change probability |
| Commodity prices | Limited — some gold/oil bets | Sector analysis |
| Crypto | Extensive | Less relevant |

**NOT available on Polymarket:**
- SARB interest rate decisions
- ZAR/USD exchange rate moves
- SA-specific elections or policy
- JSE index levels
- Individual company events (earnings beats, etc.)

### Alternative Prediction Markets

| Platform | Strengths | SA Coverage | API Quality | Cost |
|---|---|---|---|---|
| **Kalshi** | CFTC-regulated, strong macro markets (rates, inflation, jobs) | No SA-specific markets | Excellent REST + WebSocket, RSA auth | Free reads, trading requires account |
| **Metaculus** | Best calibration (0.111 Brier score), academic rigor | Occasional SA questions | Public API, JSON | Free |
| **Manifold Markets** | Play money, experimental, generous API | Some SA questions possible | Good REST API | Free |
| **FinFeedAPI** | Aggregates Polymarket + Kalshi + Manifold + Myriad | Aggregated coverage | Normalized REST schema | Paid (pricing varies) |

### Academic Evidence on Prediction Market Accuracy

Key findings from research:

1. **vs. Expert Forecasts**: "Prediction market prices have yielded impressively accurate predictions for a wide array of outcomes, typically exceeding the accuracy of opinion polls or expert forecasts" (multiple NBER studies)

2. **vs. Surveys**: "The market-based forecast encompasses the information in the survey-based forecasts, and moreover, the behavioral anomalies noted in survey-based forecasts are not evident in market-based forecasts" (Wolfers & Zitzewitz, NBER)

3. **Long-horizon accuracy**: "Ex post, prediction markets prove accurate at long and short forecasting horizons, in absolute terms and relative to natural alternative forecasts" (ScienceDirect)

4. **Information aggregation**: "Greater accuracy lies largely in superior aggregation methods rather than superior quality or informativeness of responses" (Cambridge Core)

5. **Calibration**: When a prediction market says 70%, the event occurs approximately 70% of the time — they are well-calibrated probability estimators.

### Kelly Criterion Integration

Converting Polymarket prices to Kelly inputs:

```
p = polymarket_yes_price  (e.g., 0.65)
q = 1 - p                  (e.g., 0.35)
b = odds offered by your investment thesis

Kelly fraction = (b * p - q) / b
```

**Practical integration approach:**
1. Query Polymarket for macro event probabilities (recession, rate changes)
2. Use these as calibrated priors in scenario analysis
3. Adjust DCF scenarios: weight bull/bear/base cases by prediction market probabilities
4. Feed into Kelly position sizing: macro-adjusted probability of investment thesis success

### Polymarket Verdict

- **Biggest gap it fills**: Calibrated probability estimates for macro events, directly usable in Kelly Criterion and scenario weighting — something no other data source provides
- **Biggest limitation**: Zero SA-specific markets. No SARB rates, no ZAR, no SA elections. All macro signals are US/global-centric.
- **Worth it for solo investor?**: Yes — it is FREE for read-only API access with generous rate limits
- **SA public companies**: No direct coverage
- **SA private companies**: No
- **Recommendation**: Integrate Polymarket (and Kalshi for rates/macro) as a probability oracle for global macro scenarios. Use these probabilities to weight DCF scenarios, adjust Kelly position sizing, and inform market cycle timing. Accept that SA-specific probabilities must come from other sources (potentially Metaculus community forecasts or custom models).

---

## 5. Formula Coverage Matrix

### Data Source Mapping to 10 Key Methodologies

| # | Methodology | Key Inputs Needed | Sharenet | LSEG | RavenPack | Polymarket |
|---|---|---|---|---|---|---|
| 1 | **Altman Z-Score** | Working capital, total assets, retained earnings, EBIT, market cap, total liabilities, revenue | Partial (web) | **COMPLETE** | N/A | N/A |
| 2 | **Piotroski F-Score** | Net income, OCF, ROA, LT debt, current ratio, shares out, gross margin, asset turnover (curr + prior year) | Partial (web) | **COMPLETE** | N/A | N/A |
| 3 | **Beneish M-Score** | Revenue, receivables, gross margin, total assets, PPE, depreciation, SGA, net income, OCF, total debt (curr + prior year) | Partial (web) | **COMPLETE** | N/A | N/A |
| 4 | **Magic Formula** | EBIT, enterprise value, net working capital, net fixed assets | Partial (web) | **COMPLETE** | N/A | N/A |
| 5 | **DCF** | Owner earnings, growth rate, terminal growth, discount rate/WACC | Partial (web) | **COMPLETE** (incl. WACC, analyst growth estimates) | Macro growth overlay | Scenario probability weights |
| 6 | **Kelly Criterion** | Probability estimates | N/A | N/A | Sentiment-derived adjustments | **PRIMARY SOURCE** for macro probabilities |
| 7 | **Sharpe/Sortino** | Historical returns, risk-free rate | Price history (CSV) | **COMPLETE** (price history + SA govt bond yields) | N/A | N/A |
| 8 | **ROIC Decomposition** | NOPAT, invested capital, margin breakdown | Partial (web) | **COMPLETE** | N/A | N/A |
| 9 | **Sloan Accrual Ratio** | Net income, OCF, total assets | Partial (web) | **COMPLETE** | N/A | N/A |
| 10 | **Credit/Market Cycle** | Credit spreads, VIX, yield curve, sentiment | N/A | **COMPLETE** (spreads, yields, VIX) | **Sentiment overlay** | **Recession/macro probabilities** |

### Coverage Summary

| Platform | Methodologies Fully Served | Methodologies Partially Served | No Coverage |
|---|---|---|---|
| Sharenet | 0 (no API) | 8 (data exists but web-only) | Kelly, Credit Cycle |
| LSEG Workspace | **9 out of 10** | Kelly (needs probability input) | — |
| RavenPack | 0 | 3 (DCF growth, Kelly adjustment, Credit Cycle sentiment) | 7 |
| Polymarket | 0 | 3 (DCF scenario weights, Kelly probabilities, Market Cycle) | 7 |

---

## 6. Comparative Verdict

### Platform Rankings

| Criterion | #1 | #2 | #3 | #4 |
|---|---|---|---|---|
| SA fundamental data completeness | LSEG | Sharenet | — | — |
| API quality / programmability | Polymarket | LSEG | — | Sharenet (none) |
| Cost for solo investor | Polymarket (free) | Sharenet (R180/mo) | LSEG ($3,600+/yr) | RavenPack ($50K+) |
| Unique value proposition | LSEG (fundamentals) | Polymarket (probabilities) | RavenPack (sentiment) | Sharenet (SA-focused) |
| SA-specific coverage depth | LSEG | Sharenet | RavenPack (partial) | Polymarket (none) |

### Decision Matrix

| Platform | Integrate? | Priority | Rationale |
|---|---|---|---|
| **LSEG Workspace** | YES (if budget allows) | P0 — Critical | Only source that can fill ALL inputs for 9/10 core methodologies for JSE companies via API |
| **Polymarket** | YES | P1 — High | Free, excellent API, provides unique calibrated probability estimates for Kelly Criterion and scenario analysis |
| **Sharenet** | NO (as data source) | P3 — Low | No API. Use manually for research and SENS monitoring |
| **RavenPack** | NO | Not viable | $50K+ annual cost is prohibitive. Continue with FinBERT + GDELT |

### Cost-Benefit Analysis for Solo Investor

**Minimum Viable Paid Stack:**
1. Polymarket API (free) — macro probabilities
2. Kalshi API (free reads) — US macro rates/inflation
3. Sharenet MySharenet (R180/month) — manual SA research
4. **Total: ~R180/month (~$10 USD/month)**

**Optimal Paid Stack (if budget allows):**
1. LSEG Workspace Basic (~$300/month) — full JSE fundamentals via API
2. Polymarket + Kalshi APIs (free) — macro probabilities
3. Sharenet MySharenet (R180/month) — SENS, manual backup
4. **Total: ~$310 USD/month (~R5,600/month)**

**Enterprise Stack (fund/advisory level):**
1. LSEG Workspace Standard (~$1,500/month) — full data + RDP API
2. RavenPack (~$4,000-$6,000/month) — sentiment analytics
3. Polymarket + Kalshi + Metaculus — probability layer
4. **Total: ~$5,500-$7,500 USD/month**

---

## 7. Recommended Integration Architecture

### Phase 1: Free/Cheap (Now)

```
Polymarket API ──────► Probability Engine ──► Kelly Criterion
Kalshi API ──────────►                    ──► DCF Scenario Weights
                                          ──► Market Cycle Indicator

FinBERT + GDELT ─────► Sentiment Engine ──► Distress Radar
(existing)                               ──► Credit Cycle

Free data sources ───► Fundamentals ─────► Altman Z, Piotroski F, etc.
(Yahoo Finance,                          (limited JSE coverage)
 JSE website)
```

### Phase 2: LSEG Integration (When Budget Allows)

```
LSEG Data Library ───► Fundamentals ─────► ALL 9 formula methodologies
(Python SDK)          (complete JSE)      (complete inputs)
                  ───► ESG Scores ───────► ESG overlay
                  ───► Analyst Estimates ► Growth rate inputs
                  ───► Macro Data ───────► Credit spreads, yield curve
                  ───► Price History ────► Sharpe/Sortino

Polymarket + Kalshi ─► Probabilities ────► Kelly, DCF scenarios

FinBERT + GDELT ─────► Sentiment ────────► Distress Radar
```

### Phase 3: Premium Sentiment (If Scaling to Fund)

```
LSEG ────────────────► Fundamentals + Macro (complete)
RavenPack ───────────► Sentiment (replaces FinBERT + GDELT)
                      ► BRIS Nowcasting (SA GDP)
                      ► Geopolitical Risk
Polymarket + Kalshi ─► Probabilities (unchanged)
```

### API Integration Priority

| Integration | Effort | Value | Priority |
|---|---|---|---|
| Polymarket Gamma API | Low (free, public, simple REST) | Medium (macro probabilities) | **Do first** |
| Kalshi read API | Low (free, public, REST) | Medium (rates/macro) | **Do second** |
| LSEG Data Library Python | Medium (requires license, SDK setup) | **Very High** (all fundamentals) | **Do when budget allows** |
| RavenPack Bigdata API | Medium (requires license, API key) | High (sentiment quality) | **Do if scaling to fund** |

---

## Sources

### Sharenet
- [Sharenet Homepage](https://www.sharenet.co.za/)
- [MySharenet Products](https://www2.sharenet.co.za/v3/products/mysharenet.php)
- [Sharenet Features Comparison](https://www.sharenet.co.za/v3/products/features.php?level=TRADDAT)
- [Sharenet Data Terms & Conditions](https://www.sharenet.co.za/terms/)
- [Sharenet Analytics](https://www.sharenet.co.za/v3/products/powerstocks/)

### LSEG / Refinitiv
- [LSEG Data & Analytics](https://www.lseg.com/en/data-analytics)
- [LSEG JSE Market Data](https://www.lseg.com/en/data-analytics/financial-data/pricing-and-market-data/equities-market-data/johannesburg-stock-exchange-market)
- [LSEG Company Fundamentals](https://www.lseg.com/en/data-analytics/financial-data/company-data/company-fundamentals-data)
- [LSEG Data Library for Python](https://developers.lseg.com/en/api-catalog/lseg-data-platform/lseg-data-library-for-python)
- [Eikon Data API](https://developers.lseg.com/en/api-catalog/eikon/eikon-data-api)
- [LSEG Data Library Python on PyPI](https://pypi.org/project/lseg-data/)
- [LSEG Workspace Pricing (TrustRadius)](https://www.trustradius.com/products/lseg-workspace/pricing)
- [LSEG Workspace Pricing (Vendr)](https://www.vendr.com/marketplace/refinitiv)
- [Bloomberg Terminal Alternatives 2026](https://www.bluegamma.io/post/bloomberg-terminal-alternatives)
- [LSEG ESG Scores Methodology](https://lsegissuerservices.com/spark-insights/understanding-refinitiv-esg-data-scores/understanding-esg-data-and-scores-from-refinitiv)
- [LSEG Developer Community — Financial Variables](https://community.developers.refinitiv.com/discussion/131635/how-to-get-financial-variables-e-g-total-assets-net-sales-and-roe-for-the-end-of-calendar-year)
- [LSEG GitHub Examples](https://github.com/LSEG-API-Samples/Example.DataLibrary.Python)

### RavenPack
- [RavenPack Homepage](https://www.ravenpack.com/)
- [RavenPack News Analytics](https://www.ravenpack.com/products/edge/data/news-analytics)
- [RavenPack Edge Platform](https://www.ravenpack.com/products/edge)
- [BRIS Nowcasting Research](https://www.ravenpack.com/research/from-real-time-news-sentiment-to-economic-activity-nowcasting-bris-countries)
- [RavenPack Sentiment Index](https://www.ravenpack.com/research/introducing-ravenpack-sentiment-index)
- [RavenPack + EIU Partnership](https://www.ravenpack.com/blog/ravenpack-and-economist-intelligence-unit-eiu-bring-decades-of-global-economic-research-into-enterprise-ai-workflows)
- [RavenPack on Datarade](https://datarade.ai/data-providers/ravenpack/profile)
- [RavenPack on WRDS](https://wrds-www.wharton.upenn.edu/pages/about/data-vendors/ravenpack/)

### Polymarket & Prediction Markets
- [Polymarket Documentation](https://docs.polymarket.com/)
- [Polymarket API Architecture (Medium)](https://medium.com/@gwrx2005/the-polymarket-api-architecture-endpoints-and-use-cases-f1d88fa6c1bf)
- [Polymarket Economy Markets](https://polymarket.com/economy)
- [Polymarket Macro Dashboard](https://polymarket.com/dashboards/macro)
- [Prediction Market API Reference 2026 (AgentBets)](https://agentbets.ai/guides/prediction-market-api-reference/)
- [Best Prediction Market APIs](https://newyorkcityservers.com/blog/best-prediction-market-apis)
- [Polymarket Python SDK (PyPI)](https://pypi.org/project/polymarket-apis/)
- [Kalshi vs Metaculus Comparison](https://www.alphascope.app/blog/kalshi-vs-metaculus)
- [Prediction Markets Accuracy (JSTOR Daily)](https://daily.jstor.org/how-accurate-are-prediction-markets/)
- [NBER — Prediction Markets for Economic Forecasting](https://www.nber.org/system/files/working_papers/w18222/w18222.pdf)
- [Prediction Market Accuracy in the Long Run (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S0169207008000320)
- [Prediction Markets — Does Money Matter? (Wolfers)](https://users.nber.org/~jwolfers/Papers/DoesMoneyMatter.pdf)
- [Yale Insights — Improving Prediction Market Accuracy](https://insights.som.yale.edu/insights/to-improve-the-accuracy-of-prediction-markets-just-ask)
