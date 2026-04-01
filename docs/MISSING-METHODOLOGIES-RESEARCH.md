# Missing Investment Methodologies Research

## Research Date: 2026-03-30

## Existing Modules in Dhando Analyzer

Current codebase at `packages/core/src/`:
- `scoring/` -- Altman Z, Beneish M, Piotroski F, composite, valuation
- `deal-analyzer/` -- DCF, Kelly, pre-mortem, scenarios, probability
- `portfolio/` -- Brier score, Kelly rebalance, MoS alerts, traffic light
- `distress/` -- Classification, composite distress, geopolitical, sentiment

What follows are **42 specific, implementable methodologies** organized by source firm, each with formulas, data inputs, and integration notes.

---

# SECTION 1: BRIDGEWATER ASSOCIATES (RAY DALIO)

---

## 1.1 Risk Parity / All Weather Portfolio

**What it is:** Asset allocation methodology that equalizes *risk contribution* across asset classes rather than capital allocation. A 60/40 stock/bond portfolio carries ~90% of its risk in equities. Risk parity fixes this.

**Which firm and why:** Bridgewater's All Weather fund (launched 1996) pioneered this. It achieves equity-like returns with ~1/3 the drawdown.

**Key Formula -- Equal Risk Contribution (ERC):**

```
For each asset i in portfolio:
  Risk_Contribution_i = w_i * (Sigma * w)_i / sqrt(w^T * Sigma * w)

Target: Risk_Contribution_i = Risk_Contribution_j  for all i, j
```

**Naive (Inverse Volatility) Approximation:**

```
w_i = (1 / sigma_i) / SUM(1 / sigma_j)  for all j

Where:
  w_i = weight of asset i
  sigma_i = historical volatility of asset i
```

**Full Risk Budgeting Extension:**

```
w_i * (Sigma * w)_i = b_i * w^T * Sigma * w

Where:
  b_i = target risk budget for asset i (sum of all b = 1)
  Sigma = covariance matrix
```

**Data inputs needed:**
- Asset class returns (daily/weekly): equities, bonds, commodities, TIPS/inflation-linked
- Covariance matrix (rolling 1-3 year window)
- Volatility estimates per asset class
- Risk-free rate

**Integration with Dhando Analyzer:**
Add to `portfolio/` as `risk-parity.ts`. Takes the user's positions, maps to asset classes, and computes: (a) current risk contribution per position/class, (b) suggested risk-parity rebalance weights, (c) diversification ratio. Surfaces as a dashboard panel showing "your portfolio has 87% risk in equities" with suggested adjustments.

---

## 1.2 Economic Machine Model -- Debt Cycle Positioning

**What it is:** Dalio's framework maps where we are in two overlapping credit cycles to determine macro positioning.

**Which firm and why:** Bridgewater's Pure Alpha fund uses this for systematic macro trades.

**Framework -- Two Cycles:**

| Cycle | Duration | Driven By |
|-------|----------|-----------|
| Short-term debt cycle | 5-8 years | Interest rates, credit expansion/contraction |
| Long-term debt cycle | 50-75 years | Cumulative debt/income ratios, deleveraging events |

**Key Indicators to Track:**

| Indicator | Expansion Signal | Contraction Signal |
|-----------|-----------------|-------------------|
| Debt/GDP ratio | Rising steadily | Approaching historical peaks |
| Credit spread (HY - IG) | Tightening (<300bp) | Widening (>500bp) |
| Lending standards (Fed survey) | Loosening | Tightening |
| Real interest rate | Low/negative | Rising sharply |
| Debt service ratio (BIS) | Manageable (<18%) | Stressed (>22%) |
| Central bank balance sheet | Expanding | Contracting (QT) |

**Decision Logic:**

```
IF debt_to_gdp > 250% AND credit_spreads_widening AND lending_tightening:
  cycle_position = "LATE_CYCLE_DANGER"
  action = "Reduce risk, increase cash/gold allocation"

IF credit_spreads > 600bp AND VIX > 30 AND lending_frozen:
  cycle_position = "CRISIS_OPPORTUNITY"
  action = "Deploy capital into distressed assets"

IF rates_falling AND credit_expanding AND unemployment_declining:
  cycle_position = "EARLY_RECOVERY"
  action = "Maximum risk exposure, favor cyclicals"
```

**Data inputs needed:**
- Federal Reserve FRED data: GDP, Debt/GDP, Fed Funds Rate, credit spreads
- BIS debt service ratio
- Fed Senior Loan Officer Survey (lending standards)
- VIX index
- Central bank balance sheet data

**Integration:** New module `macro/cycle-position.ts`. Pulls FRED/BIS data via API, scores current position on a 1-5 cycle scale (Early Recovery -> Expansion -> Late Cycle -> Contraction -> Crisis), and feeds into the deal-analyzer as a macro overlay. "You're evaluating this company in a Late Cycle environment -- apply additional margin of safety."

---

# SECTION 2: KKR (PRIVATE EQUITY)

---

## 2.1 Operational Value Creation Scorecard

**What it is:** KKR's Capstone team uses a repeatable operational improvement toolkit applied within 100 days of acquisition. This scores the operational improvement potential of a target.

**Which firm and why:** KKR invented the "100-day plan" concept. Their Capstone team (~100 full-time operators) drives 70%+ of value creation through operational improvement, not financial engineering.

**Framework -- Value Creation Levers:**

| Lever | Sub-components | Typical Impact |
|-------|---------------|----------------|
| Revenue growth | Pricing power, new markets, cross-sell | 5-15% revenue uplift |
| Margin expansion | Procurement savings, SG&A reduction, automation | 200-500bp EBITDA improvement |
| Working capital | Inventory turns, DSO reduction, DPO extension | Cash release = 5-15% of revenue |
| Capex efficiency | Asset utilization, capex/revenue ratio | 10-20% capex reduction |
| Management upgrade | Key hires, incentive alignment, governance | Qualitative but high impact |

**Scoring Template (0-10 each lever):**

```
Operational_Value_Score = (
  Revenue_Growth_Potential * 0.25 +
  Margin_Expansion_Potential * 0.30 +
  Working_Capital_Improvement * 0.15 +
  Capex_Efficiency * 0.10 +
  Management_Quality * 0.20
)

Interpretation:
  8-10: Exceptional operational upside
  6-8:  Good improvement potential
  4-6:  Moderate -- needs specific catalysts
  0-4:  Limited operational improvement runway
```

**Data inputs needed:**
- Revenue growth history (3-5 years)
- EBITDA margin vs. peer benchmarks
- Working capital ratios: DSO, DIO, DPO
- Capex/Revenue ratio vs. peers
- Management track record (qualitative)

**Integration:** New module `private-markets/operational-value.ts`. User inputs financial data + qualitative assessments per lever. Outputs a composite score and flags specific improvement opportunities relative to peer benchmarks.

---

## 2.2 Management Assessment Framework

**What it is:** Structured evaluation of management quality across multiple dimensions, used in PE due diligence.

**Framework:**

| Dimension | Score 1-5 | Key Questions |
|-----------|-----------|---------------|
| Track record | | Has CEO delivered >15% ROIC over 5+ years? |
| Capital allocation | | History of value-accretive M&A? Buyback timing? |
| Insider ownership | | >5% ownership? Recent purchases? |
| Compensation alignment | | Variable pay tied to ROIC/FCF, not revenue? |
| Succession planning | | Clear #2? Board depth? |
| Industry expertise | | Years in sector? Competitive wins? |
| Transparency | | Consistent guidance accuracy? Clear communication? |

```
Management_Score = AVG(all dimension scores)

  4.5-5.0: Exceptional -- Buffett-grade management
  3.5-4.5: Strong -- invest with confidence
  2.5-3.5: Adequate -- monitor closely
  <2.5:    Red flag -- discount valuation or avoid
```

**Integration:** Add to `scoring/management.ts`. This is the qualitative overlay the system is currently missing entirely.

---

# SECTION 3: BLACKROCK / ALADDIN

---

## 3.1 Multi-Factor Risk Decomposition

**What it is:** Decomposing portfolio risk into systematic factors to understand *what is actually driving your returns and risk*.

**Which firm and why:** BlackRock's Aladdin platform manages $21.6T in assets and decomposes risk across: market, country, sector, style, rates, spreads, FX, and specific (idiosyncratic) factors.

**Framework -- Factor Decomposition:**

```
Portfolio_Return = Alpha + Beta_market * R_market
                        + Beta_value * R_value
                        + Beta_momentum * R_momentum
                        + Beta_quality * R_quality
                        + Beta_size * R_size
                        + Beta_volatility * R_lowvol
                        + Epsilon (idiosyncratic)

Portfolio_Risk^2 = SUM(Beta_i^2 * Var(Factor_i))
                 + 2 * SUM(Beta_i * Beta_j * Cov(Factor_i, Factor_j))
                 + Var(Epsilon)
```

**Standard Factors (Fama-French + extensions):**

| Factor | Definition | Data Source |
|--------|-----------|-------------|
| Market (MKT) | Excess return of broad market | Market index - risk-free rate |
| Value (HML) | High B/P minus Low B/P | Book/Price ratio |
| Size (SMB) | Small cap minus Large cap | Market cap |
| Momentum (WML) | Winners minus Losers (12-1 month) | Trailing returns |
| Quality (QMJ) | High quality minus Low quality | Profitability, growth, safety |
| Low Volatility (BAB) | Low beta minus High beta | Historical beta |

**Data inputs needed:**
- Position-level holdings with weights
- Factor return series (available from Ken French data library, free)
- Position-level factor exposures (calculated from financials)

**Integration:** New module `portfolio/factor-decomposition.ts`. Given the user's positions, regress portfolio returns against factor returns. Output: "Your portfolio has 0.8 market beta, 0.3 value tilt, -0.1 momentum exposure." Visualize as a radar chart of factor exposures.

---

## 3.2 Stress Testing Framework (VaR / CVaR)

**What it is:** Quantifying the probability and magnitude of extreme portfolio losses.

**Which firm and why:** BlackRock Aladdin runs Monte Carlo simulations across millions of scenarios. Every serious institutional investor uses VaR/CVaR.

**Key Formulas:**

**Parametric VaR (fastest):**
```
VaR_alpha = mu - z_alpha * sigma

Where:
  mu = expected portfolio return
  z_alpha = z-score for confidence level (1.645 for 95%, 2.326 for 99%)
  sigma = portfolio standard deviation

Example: Portfolio with mu=0.1%, sigma=1.5% daily
  VaR_95 = 0.001 - 1.645 * 0.015 = -2.37% (daily)
```

**Historical VaR:**
```
Sort historical daily returns ascending
VaR_95 = return at the 5th percentile
VaR_99 = return at the 1st percentile
```

**Conditional VaR (CVaR / Expected Shortfall):**
```
CVaR_alpha = E[Loss | Loss > VaR_alpha]
           = Average of all losses that exceed VaR

This answers: "When things go bad, HOW bad on average?"
```

**Scenario Stress Tests (implement as presets):**

| Scenario | Equity | Bonds | Credit | Commodities |
|----------|--------|-------|--------|-------------|
| 2008 GFC | -50% | +15% | -25% | -35% |
| 2020 COVID crash | -34% | +8% | -15% | -30% |
| Rising rates (2022) | -25% | -15% | -10% | +20% |
| Stagflation | -30% | -10% | -20% | +40% |
| Deflation/depression | -45% | +25% | -30% | -40% |

**Data inputs needed:**
- Daily portfolio returns (or position-level returns)
- Historical return series (minimum 2 years daily)
- Asset class mapping for scenario tests

**Integration:** New module `portfolio/stress-test.ts`. Computes VaR/CVaR at 95% and 99% confidence. Runs preset stress scenarios showing portfolio impact. "In a 2008-style event, your portfolio would lose approximately 38%."

---

## 3.3 Climate Risk / TCFD Scoring

**What it is:** Four-pillar assessment of climate-related financial risk per the Task Force on Climate-Related Financial Disclosures.

**Framework -- TCFD Four Pillars:**

| Pillar | What to Score | Data Source |
|--------|--------------|-------------|
| Governance | Board oversight of climate risk | Proxy statements, ESG reports |
| Strategy | Climate impact on business model | Company disclosures, sector analysis |
| Risk Management | Process for identifying climate risks | Sustainability reports |
| Metrics & Targets | Scope 1/2/3 emissions, reduction targets | CDP, company ESG reports |

**Simplified Scoring (1-5 per pillar):**

```
Climate_Risk_Score = (
  Governance_Score * 0.15 +
  Strategy_Score * 0.30 +
  Risk_Management_Score * 0.25 +
  Metrics_Targets_Score * 0.30
)

High-risk sectors: Oil & gas, mining, airlines, cement, agriculture
Medium-risk: Manufacturing, real estate, financial services
Lower-risk: Technology, healthcare, services
```

**Integration:** Add to `scoring/climate-risk.ts` as an optional ESG overlay. Can flag positions in high-risk sectors that lack transition plans.

---

# SECTION 4: SEQUOIA CAPITAL (GROWTH/VC)

---

## 4.1 Total Addressable Market (TAM) Analysis

**What it is:** Structured estimation of maximum revenue opportunity, used to assess whether a market is worth entering.

**Which firm and why:** Sequoia evaluates TAM not for the number itself, but to understand how founders *think* about their market segmentation.

**Three Estimation Methods:**

```
1. TOP-DOWN:
   TAM = Total_Industry_Revenue * Addressable_Percentage
   SAM = TAM * Segment_You_Can_Reach
   SOM = SAM * Realistic_Market_Share

2. BOTTOM-UP (more credible):
   TAM = Number_of_Potential_Customers * Annual_Revenue_Per_Customer
   SOM = Current_Customer_Count * ARPU * (1 + Growth_Rate)

3. VALUE-THEORY:
   TAM = Value_Created_for_Customer * Number_of_Customers * Capture_Rate
```

**Sequoia's Revenue Threshold:**
```
Can the company chart a path to $500M+ in annual revenue?
If not, the TAM is likely too small for venture-scale returns.
```

**Data inputs needed:**
- Industry size data (IBISWorld, Statista, government data)
- Customer count estimates
- Average revenue per customer (ARPU)
- Growth rates

**Integration:** Add to `private-markets/tam-analysis.ts`. User inputs market data, gets TAM/SAM/SOM pyramid with validation against the $500M threshold.

---

## 4.2 Product-Market Fit Framework (Arc PMF)

**What it is:** Sequoia's three-archetype classification system for how startups achieve product-market fit.

**Three Archetypes:**

| Archetype | Definition | Competitive Landscape | Key Risk |
|-----------|-----------|----------------------|----------|
| Hair on Fire | Solving an obvious, urgent problem better | Crowded -- many competitors | Differentiation |
| Hard Fact | Solving a problem everyone accepted as unsolvable | Less competition | Behavior change / adoption |
| Future Vision | Enabling something nobody knew they needed | No competition yet | Disbelief / long runway |

**Four Terrifying Questions (sequential gates):**
1. Does the company have an authentic right to exist? (Founder insight)
2. Is the TAM a big enough reward? ($500M+ revenue path)
3. Is there a viable value exchange? (Customers pay willingly)
4. Can you chart a path to scale?

**Integration:** Add to `private-markets/pmf-scoring.ts` as a qualitative checklist that classifies the archetype and gates progress through the four questions.

---

## 4.3 Unit Economics Model

**What it is:** Granular analysis of per-customer profitability, the foundation of growth investing valuation.

**Key Formulas:**

```
Customer Acquisition Cost (CAC):
  CAC = Total_Sales_and_Marketing_Spend / New_Customers_Acquired

Lifetime Value (LTV):
  LTV = ARPU * Gross_Margin * (1 / Churn_Rate)
  -- or --
  LTV = ARPU * Gross_Margin * Average_Customer_Lifespan

LTV/CAC Ratio:
  Healthy: >= 3.0 (customer generates 3x what it cost to acquire)
  Excellent: >= 5.0
  Danger: < 1.0 (losing money on every customer)

CAC Payback Period:
  Payback_Months = CAC / (ARPU_monthly * Gross_Margin)
  Healthy: < 12 months
  Acceptable: 12-18 months
  Danger: > 24 months
```

**Data inputs needed:**
- Sales & marketing expense
- New customer count per period
- ARPU (monthly/annual)
- Gross margin %
- Churn rate (monthly/annual)

**Integration:** New module `scoring/unit-economics.ts`. Computes CAC, LTV, LTV/CAC ratio, and payback period. Red/yellow/green thresholds per metric.

---

# SECTION 5: QUANT HEDGE FUNDS (Renaissance / Two Sigma / DE Shaw)

---

## 5.1 Momentum Indicators Suite

**What it is:** Technical signals that measure the persistence of price trends.

**Key Formulas:**

```
Relative Strength Index (RSI):
  RS = AVG(Up_moves over N periods) / AVG(Down_moves over N periods)
  RSI = 100 - (100 / (1 + RS))
  Oversold: RSI < 30
  Overbought: RSI > 70
  Typical N = 14 days

MACD (Moving Average Convergence Divergence):
  MACD_Line = EMA_12 - EMA_26
  Signal_Line = EMA_9(MACD_Line)
  Histogram = MACD_Line - Signal_Line
  Buy signal: MACD crosses above signal
  Sell signal: MACD crosses below signal

Moving Average Crossover:
  Golden Cross: SMA_50 crosses above SMA_200 (bullish)
  Death Cross: SMA_50 crosses below SMA_200 (bearish)

Rate of Change (ROC):
  ROC = (Price_today - Price_N_days_ago) / Price_N_days_ago * 100
```

**Data inputs needed:**
- Daily closing prices (minimum 200 days for SMA_200)

**Integration:** New module `screener/momentum.ts`. Computes RSI, MACD, moving average signals for any ticker. Feeds into the screener as technical overlays on fundamental analysis.

---

## 5.2 Mean Reversion Signals

**What it is:** Statistical identification of when a price has deviated far enough from its mean that reversion is probable.

**Key Formulas:**

```
Z-Score (Bollinger Band approach):
  Z = (Price - SMA_N) / StdDev_N
  Mean reversion entry: |Z| > 2.0
  Strong reversion signal: |Z| > 2.5
  Exit: Z returns to 0

Bollinger Bands:
  Upper = SMA_20 + 2 * StdDev_20
  Lower = SMA_20 - 2 * StdDev_20
  %B = (Price - Lower) / (Upper - Lower)
  Oversold: %B < 0 (price below lower band)
  Overbought: %B > 1 (price above upper band)
```

**Integration:** Add to `screener/mean-reversion.ts`. Alert when value stocks are trading at extreme deviations from their historical ranges.

---

## 5.3 Pairs Trading Engine

**What it is:** Market-neutral strategy that profits from the convergence of two historically correlated securities.

**Which firm and why:** Statistical arbitrage was pioneered by Morgan Stanley's Nunzio Tartaglia in the 1980s and perfected by Renaissance Technologies.

**Step-by-Step Methodology:**

```
1. PAIR IDENTIFICATION:
   - Screen for pairs with correlation > 0.80
   - Run Augmented Dickey-Fuller (ADF) test on spread
   - ADF p-value < 0.05 = cointegrated (mean-reverting spread)

2. HEDGE RATIO CALCULATION:
   - Regress: Price_A = beta * Price_B + alpha + epsilon
   - beta = hedge ratio

3. SPREAD COMPUTATION:
   Spread = log(Price_A) - beta * log(Price_B)

4. Z-SCORE OF SPREAD:
   Z = (Spread - Mean(Spread, lookback)) / StdDev(Spread, lookback)

5. TRADE SIGNALS:
   ENTRY: |Z| > 1.65 (or 2.0 for conservative)
     If Z > 1.65: SHORT A, LONG B (spread too wide)
     If Z < -1.65: LONG A, SHORT B (spread too narrow)
   EXIT: Z crosses 0 (spread has mean-reverted)
   STOP LOSS: |Z| > 3.0 (relationship may have broken)

6. VALIDATION:
   Re-test cointegration monthly
   If ADF p-value > 0.10, close position (relationship broken)
```

**Data inputs needed:**
- Daily prices for candidate pairs (same sector preferred)
- Volume data (for liquidity checks)
- At least 252 trading days of history

**Integration:** New module `screener/pairs-trading.ts`. Not core to value investing but useful for portfolio hedging. Could suggest "If long BHP, consider this pair trade with RIO to reduce sector risk."

---

## 5.4 Alternative Data Signals

**What it is:** Non-traditional data sources that provide informational edge.

**Signal Types Used by Top Quant Funds:**

| Signal | Source | What It Indicates |
|--------|--------|------------------|
| Satellite imagery | Planet Labs, Orbital Insight | Parking lot traffic, oil storage levels, crop yields |
| Credit card data | Second Measure, Bloomberg | Real-time revenue estimates |
| Web traffic | SimilarWeb, SEMrush | Customer interest, product demand |
| Job postings | Indeed, LinkedIn | Expansion/contraction signals |
| Patent filings | USPTO, Google Patents | Innovation pipeline |
| App downloads | Sensor Tower, App Annie | Product adoption rates |
| Shipping/port data | MarineTraffic, Panjiva | Supply chain activity |

**Integration:** Conceptual module `data/alternative-signals.ts`. Start with free/accessible signals: job posting growth rate from Indeed, web traffic trends from SimilarWeb, app download data. More of a data aggregation layer than a formula.

---

# SECTION 6: TIGER GLOBAL / COATUE (GROWTH INVESTING)

---

## 6.1 Rule of 40

**What it is:** A SaaS company's revenue growth rate plus profit margin should exceed 40%.

**Which firm and why:** Tiger Global and Coatue use this as a primary screen for growth-stage software companies. BCG's research shows top SaaS performers consistently beat 40.

**Formula:**

```
Rule_of_40 = Revenue_Growth_Rate_% + EBITDA_Margin_%

Thresholds:
  > 60%: Elite (top quartile SaaS)
  > 40%: Healthy (passing)
  20-40%: Watch -- must be trending up
  < 20%: Failing -- neither growing fast nor profitable

Variants:
  Revenue_Growth + FCF_Margin (preferred by some)
  Revenue_Growth + Operating_Margin
```

**Data inputs needed:**
- Quarterly/annual revenue and growth rate
- EBITDA margin (or FCF margin, operating margin)

**Integration:** Add to `scoring/rule-of-40.ts`. Simple computation, red/yellow/green signal. Useful for screening SaaS and tech companies.

---

## 6.2 Net Revenue Retention (NRR)

**What it is:** Measures revenue from existing customers over time, including expansion, contraction, and churn.

**Formula:**

```
NRR = (Starting_MRR + Expansion - Contraction - Churn) / Starting_MRR * 100

Where all figures are for the same customer cohort over 12 months.

Thresholds:
  > 130%: Exceptional (customers spending 30%+ more each year)
  > 120%: Strong
  100-120%: Healthy
  < 100%: Shrinking (losing more than gaining from existing customers)

Top SaaS benchmarks: Snowflake ~158%, Datadog ~130%, Twilio ~120%
```

**Data inputs needed:**
- Monthly recurring revenue (MRR) by cohort
- Expansion revenue
- Contraction and churn figures

**Integration:** Add to `scoring/net-revenue-retention.ts`. For SaaS companies that report NRR, this is a critical quality metric.

---

## 6.3 Cohort Analysis Model

**What it is:** Tracking customer behavior by acquisition period to identify retention trends and LTV accuracy.

**Framework:**

```
For each cohort (month/quarter of acquisition):
  Track: Revenue retained at Month 1, 3, 6, 12, 24, 36

Retention_Rate_Month_N = Revenue_Month_N / Revenue_Month_0

Visualize as a cohort retention matrix:
  Rows = acquisition cohort (Q1 2024, Q2 2024, etc.)
  Columns = months since acquisition
  Cells = % of original revenue retained

HEALTHY PATTERN: Retention curve flattens (reaches steady state)
DANGER PATTERN: Retention keeps declining (no steady state)
```

**Integration:** Add to `scoring/cohort-analysis.ts` as a data structure and visualization component. User inputs cohort data, gets retention curves and LTV validation.

---

# SECTION 7: BAUPOST / OAKTREE (VALUE + DISTRESSED)

---

## 7.1 Howard Marks Market Cycle Positioning Framework

**What it is:** A systematic approach to identifying where we are in the market/credit cycle and adjusting risk posture accordingly.

**Which firm and why:** Oaktree Capital ($189B AUM) was built on cycle awareness. Marks' framework is the most practical cycle-positioning system published.

**Cycle Indicator Dashboard:**

| Indicator | Data Source | Euphoria Signal | Fear Signal |
|-----------|-----------|-----------------|-------------|
| Credit spreads (HY-IG) | FRED/Bloomberg | < 300bp | > 600bp |
| VIX level | CBOE | < 12 | > 30 |
| CAPE ratio (Shiller P/E) | Shiller data | > 30 | < 15 |
| Margin debt/GDP | FINRA, FRED | Rising > 3% GDP | Declining sharply |
| IPO volume | Renaissance Capital | Record highs | Near zero |
| M&A volume | Bloomberg | Record deal values | Deal flow frozen |
| Lending standards | Fed SLOOS survey | Loosening | Tightening |
| Bond issuance quality | Moody's/S&P | Covenant-lite dominates | Only IG issuance |
| Fund flows | ICI | Massive equity inflows | Equity outflows |
| Investor surveys (AAII) | AAII | > 50% bullish | > 50% bearish |

**Composite Cycle Score:**

```
For each indicator, score 1-5:
  1 = Extreme fear/crisis (opportunity)
  2 = Below average pessimism
  3 = Neutral
  4 = Above average optimism
  5 = Extreme euphoria (danger)

Cycle_Score = AVG(all indicator scores)

Positioning Rules:
  1.0-2.0: AGGRESSIVE -- deploy capital, accept illiquidity
  2.0-3.0: MODERATE -- normal positioning
  3.0-4.0: CAUTIOUS -- raise cash, tighten quality screens
  4.0-5.0: DEFENSIVE -- maximum cash, sell weak positions
```

**Data inputs needed:**
- All indicators in table above (most available from FRED for free)
- Updated monthly at minimum

**Integration:** New module `macro/cycle-score.ts`. This is the highest-impact missing feature. It provides the "should I even be buying right now?" context that pure bottom-up analysis misses. Display as a cycle thermometer on the dashboard.

---

## 7.2 Risk-Reward Asymmetry Quantification

**What it is:** Explicitly calculating the ratio of upside potential to downside risk, then only investing where the ratio is favorable.

**Formula:**

```
Asymmetry_Ratio = Expected_Upside / Expected_Downside

Where:
  Expected_Upside = (Intrinsic_Value - Current_Price) * Probability_of_Upside
  Expected_Downside = (Current_Price - Worst_Case_Value) * Probability_of_Downside

Thresholds:
  > 3:1  Excellent asymmetry (Klarman/Marks territory)
  > 2:1  Good
  1-2:1  Mediocre
  < 1:1  Unfavorable -- pass

Integration with existing scenarios module:
  Bull case probability * bull return = weighted upside
  Bear case probability * bear loss = weighted downside
  Asymmetry = weighted upside / weighted downside
```

**Integration:** Extend `deal-analyzer/scenarios.ts` to compute and display the asymmetry ratio alongside existing scenario outputs. This is a small but high-value addition.

---

## 7.3 Contrarian Sentiment Indicators

**What it is:** Quantifying market sentiment extremes as contrarian signals.

**Indicators:**

```
AAII Sentiment Survey:
  Bulls > 55% = contrarian sell signal
  Bears > 55% = contrarian buy signal
  Bull-Bear spread > +30 = extreme optimism (caution)
  Bull-Bear spread < -30 = extreme pessimism (opportunity)

Put/Call Ratio (CBOE):
  > 1.2 = excessive fear (buy signal)
  < 0.6 = excessive complacency (sell signal)
  Normal range: 0.7-1.0

CNN Fear & Greed Index:
  0-25: Extreme Fear (buy signal)
  75-100: Extreme Greed (sell signal)

Insider Buy/Sell Ratio:
  > 2.0 = insiders heavily buying (bullish)
  < 0.3 = insiders heavily selling (bearish)
```

**Integration:** Add to `macro/sentiment-indicators.ts`. Display as a "Market Temperature" gauge that contextualizes individual stock analysis.

---

# SECTION 8: BERKSHIRE HATHAWAY (ADVANCED)

---

## 8.1 Owner's Earnings Calculation

**What it is:** Buffett's preferred measure of true economic earnings, replacing reported net income.

**Which firm and why:** Buffett introduced this in his 1986 shareholder letter. It strips out accounting noise to show the actual cash a business generates for its owners.

**Formula:**

```
Owner_Earnings = Net_Income
              + Depreciation_Amortization
              + Other_Non_Cash_Charges
              - Average_Annual_Maintenance_Capex

Where:
  Maintenance_Capex = the capex needed to maintain current competitive
                      position and unit volume (NOT growth capex)

Approximation when maintenance capex unknown:
  Maintenance_Capex ≈ Depreciation * 1.0 to 1.2 (for capital-light)
  Maintenance_Capex ≈ Depreciation * 1.5 to 2.0 (for capital-heavy)

Alternative formula:
  Owner_Earnings ≈ FCF + Growth_Capex
  (Since FCF already subtracts ALL capex, adding back growth capex
   gives you earnings available after only maintenance spend)
```

**Data inputs needed:**
- Net income, D&A, other non-cash charges (from cash flow statement)
- Total capex (from cash flow statement)
- Maintenance capex estimate (user input or % of depreciation)

**Integration:** Add to `scoring/owner-earnings.ts`. Compute alongside existing DCF module. Use owner's earnings as the cash flow input for DCF instead of (or alongside) reported FCF.

---

## 8.2 Look-Through Earnings

**What it is:** For portfolio companies where you own a minority stake, this calculates your proportional share of their total earnings (not just the dividends they pay you).

**Formula:**

```
Look_Through_Earnings =
  Reported_Operating_Earnings
  + SUM(Ownership_% * Investee_Earnings) for each investee
  - Tax_Allowance_on_Undistributed_Earnings

Where:
  Ownership_% = shares_owned / total_shares_outstanding
  Investee_Earnings = net income of the investee company
  Tax_Allowance ≈ 15-20% of undistributed earnings (dividend tax rate)

Example:
  You own 9.2% of Coca-Cola
  KO earns $10B
  Your look-through = $920M
  KO pays you $400M in dividends
  Undistributed = $520M (still working for you inside KO)
```

**Data inputs needed:**
- Portfolio positions with ownership percentages
- Earnings of each investee company
- Dividends received
- Applicable tax rate

**Integration:** Add to `portfolio/look-through-earnings.ts`. For each position, calculate the look-through earnings. Aggregate across the portfolio. This provides a fundamentally different (and more accurate) view of portfolio earnings than reported income.

---

## 8.3 Insurance Float Analysis

**What it is:** Evaluating insurance companies by the cost and growth of their float, not just their underwriting profit.

**Key Formulas:**

```
Float = Unpaid_Losses
      + Loss_Adjustment_Expenses
      + Unearned_Premiums
      + Other_Policy_Liabilities
      - Insurance_Premiums_Receivable
      - Reinsurance_Recoverable
      - Deferred_Acquisition_Costs

Cost_of_Float = Underwriting_Loss / Average_Float * 100

Value Test:
  IF Cost_of_Float < Risk_Free_Rate:
    Float is CHEAPER than borrowing -- valuable
  IF Cost_of_Float < 0 (underwriting profit):
    Being PAID to hold other people's money -- extremely valuable
  IF Cost_of_Float > Risk_Free_Rate:
    Float is EXPENSIVE -- not creating value

Float_Growth_Rate = (Float_Current - Float_Prior) / Float_Prior
```

**Data inputs needed:**
- Insurance balance sheet line items (above)
- Underwriting profit/loss
- Risk-free rate for comparison

**Integration:** Add to `scoring/float-analysis.ts`. Specialized for insurance company evaluation. Computes float, cost of float, and compares to risk-free rate.

---

## 8.4 ROIC Decomposition Tree (DuPont on Steroids)

**What it is:** Breaking ROIC into its component drivers to identify exactly where value creation (or destruction) is happening.

**Formula Tree:**

```
ROIC = NOPAT / Invested_Capital

Decompose into:
ROIC = NOPAT_Margin * Capital_Turnover

Where:
  NOPAT_Margin = NOPAT / Revenue
  Capital_Turnover = Revenue / Invested_Capital

Further decompose NOPAT_Margin:
  NOPAT_Margin = (1 - Tax_Rate) * EBIT_Margin
  EBIT_Margin = Gross_Margin - SGA_% - R&D_% - D&A_%

Further decompose Capital_Turnover:
  Capital_Turnover = 1 / (Working_Capital/Revenue + Fixed_Assets/Revenue)
  Working_Capital/Revenue = (DSO + DIO - DPO) / 365

COMPLETE TREE:
  ROIC
  ├── NOPAT Margin (operating efficiency)
  │   ├── Gross Margin
  │   ├── SG&A / Revenue
  │   ├── R&D / Revenue
  │   ├── D&A / Revenue
  │   └── Effective Tax Rate
  └── Capital Turnover (capital efficiency)
      ├── Working Capital / Revenue
      │   ├── DSO (Days Sales Outstanding)
      │   ├── DIO (Days Inventory Outstanding)
      │   └── DPO (Days Payable Outstanding)
      └── Fixed Assets / Revenue
          ├── PP&E / Revenue
          └── Intangibles / Revenue
```

**Data inputs needed:**
- Full income statement and balance sheet
- Revenue, COGS, SG&A, R&D, D&A, EBIT, NOPAT
- Receivables, inventory, payables, PP&E, intangibles

**Integration:** Add to `scoring/roic-tree.ts`. This is probably the single most valuable analytical tool for understanding a business. Visualize as an expandable tree showing exactly which lever is driving (or dragging) returns.

---

## 8.5 Capital Allocation Scoring

**What it is:** Evaluating how well management deploys capital across five options.

**Framework:**

```
Five Capital Allocation Options (in priority order):
  1. Reinvest in business (if ROIC > WACC on incremental capital)
  2. Acquisitions (if disciplined, strategic, at fair price)
  3. Debt paydown (if overleveraged or rates rising)
  4. Share buybacks (if stock < intrinsic value)
  5. Dividends (if no better use of capital)

Scoring per option (historical 5-year track record):

Reinvestment Score (0-10):
  Incremental_ROIC > WACC + 5%? → +3
  Revenue growth > industry avg? → +3
  Capex generating returns within 3 years? → +4

Acquisition Score (0-10):
  Avg acquisition price < 10x EBITDA? → +3
  Post-acquisition ROIC maintained? → +4
  No value-destructive deals > 20% of market cap? → +3

Buyback Score (0-10):
  Bought back stock below intrinsic value? → +5
  Consistent (not just during peaks)? → +3
  Reduced share count meaningfully (>2%/yr)? → +2

Overall Capital Allocation Grade:
  A (35-40): Exceptional allocator (Buffett/Malone class)
  B (25-34): Good
  C (15-24): Average
  D (0-14): Poor -- value destroyer
```

**Integration:** Add to `scoring/capital-allocation.ts`. Combines quantitative checks (ROIC vs WACC, buyback timing) with qualitative assessments.

---

# SECTION 9: HEDGE FUND OPERATIONAL SYSTEMS

---

## 9.1 Portfolio Performance Attribution (Brinson Model)

**What it is:** Decomposing portfolio returns into allocation effect, selection effect, and interaction effect.

**Which firm and why:** Every institutional investor uses Brinson attribution to understand *why* the portfolio performed as it did.

**Key Formulas:**

```
Total_Active_Return = Portfolio_Return - Benchmark_Return

Decomposed into:

Allocation_Effect = SUM[(w_p_i - w_b_i) * R_b_i]
  "Did you overweight the right sectors?"

Selection_Effect = SUM[w_b_i * (R_p_i - R_b_i)]
  "Did you pick the right stocks within each sector?"

Interaction_Effect = SUM[(w_p_i - w_b_i) * (R_p_i - R_b_i)]
  "Joint effect of allocation and selection"

Where:
  w_p_i = portfolio weight in sector i
  w_b_i = benchmark weight in sector i
  R_p_i = portfolio return in sector i
  R_b_i = benchmark return in sector i

Total_Active_Return = Allocation + Selection + Interaction
```

**Data inputs needed:**
- Portfolio positions with weights and returns by sector
- Benchmark (e.g., S&P 500) weights and returns by sector

**Integration:** New module `portfolio/attribution.ts`. Shows users: "Your outperformance was 60% from stock selection in tech and 40% from overweighting energy."

---

## 9.2 Correlation Analysis

**What it is:** Measuring pairwise correlation between all positions to identify hidden concentration risk.

**Key Formula:**

```
Correlation(A,B) = Cov(R_A, R_B) / (StdDev(R_A) * StdDev(R_B))

Interpretation:
  > 0.80: High correlation -- effectively same bet
  0.50-0.80: Moderate -- some diversification
  0.20-0.50: Low -- good diversification
  < 0.20: Uncorrelated -- excellent diversification
  < 0: Negative -- natural hedge

Portfolio Diversification Ratio:
  DR = (SUM of individual position volatilities) / Portfolio_Volatility
  DR > 1 means you're getting diversification benefit
  Higher DR = better diversified
```

**Red Flag Rules:**
```
IF any 3+ positions have pairwise correlation > 0.80:
  FLAG: "Hidden concentration -- these positions move together"
IF portfolio DR < 1.2:
  FLAG: "Poor diversification -- portfolio acts like 2-3 positions"
```

**Data inputs needed:**
- Daily returns for each position (1+ year)

**Integration:** Add to `portfolio/correlation.ts`. Output a heatmap of position correlations and a diversification ratio score.

---

## 9.3 Drawdown Analysis & Recovery Tracking

**What it is:** Tracking peak-to-trough declines and recovery periods for the portfolio.

**Key Metrics:**

```
Maximum Drawdown (MDD):
  MDD = (Trough - Peak) / Peak * 100

Time to Recovery (TTR):
  TTR = Date_New_Peak - Date_Trough (in trading days)

Underwater Chart:
  For each day: Drawdown_t = (NAV_t - Max(NAV_0..t)) / Max(NAV_0..t)
  Plot this as a time series -- shows how long you've been "underwater"

Calmar Ratio:
  Calmar = Annualized_Return / |Max_Drawdown|
  Good: > 1.0
  Excellent: > 2.0
  Poor: < 0.5

Ulcer Index (captures depth AND duration):
  UI = SQRT(AVG(Drawdown_t^2))
  Lower is better. Accounts for both magnitude and persistence.
```

**Integration:** Add to `portfolio/drawdown.ts`. Track drawdowns across the portfolio with an underwater chart visualization. Alert when current drawdown exceeds historical norms.

---

## 9.4 Risk-Adjusted Return Ratios Suite

**What it is:** A complete set of ratios to evaluate returns relative to risk taken.

**Formulas:**

```
Sharpe Ratio:
  SR = (R_p - R_f) / StdDev(R_p)
  Good: > 1.0, Excellent: > 2.0, Poor: < 0.5

Sortino Ratio (only penalizes downside):
  Sortino = (R_p - R_f) / Downside_Deviation
  Where Downside_Deviation = SQRT(AVG(min(R_t - R_f, 0)^2))
  Better than Sharpe because it doesn't penalize upside volatility

Calmar Ratio:
  Calmar = Annualized_Return / |Max_Drawdown|

Omega Ratio:
  Omega = SUM(max(R_t - threshold, 0)) / SUM(max(threshold - R_t, 0))
  Omega > 1 means more gains above threshold than losses below

Information Ratio (active return per tracking error):
  IR = (R_p - R_b) / TrackingError(R_p - R_b)
  Measures skill per unit of active risk taken
```

**Data inputs needed:**
- Daily/monthly portfolio returns
- Risk-free rate
- Benchmark returns (for IR)

**Integration:** Add to `portfolio/risk-ratios.ts`. Compute all ratios and display as a performance scorecard.

---

## 9.5 Risk Budgeting

**What it is:** Allocating a total risk budget across positions/strategies rather than allocating capital.

**Framework:**

```
Total_Portfolio_Risk_Budget = Target_Volatility (e.g., 12% annual)

Per-position risk contribution:
  RC_i = w_i * Beta_i * Portfolio_Volatility

Risk budget allocation:
  High conviction positions: Up to 15% of total risk budget
  Normal positions: 5-10% of risk budget
  Speculative: Max 3% of risk budget

Constraint:
  SUM(RC_i) = Total_Risk_Budget
  No single position > 20% of total risk
  No single sector > 35% of total risk
```

**Integration:** Add to `portfolio/risk-budget.ts`. Given the user's target volatility and positions, show how risk is distributed and flag budget violations.

---

# SECTION 10: MODERN ADDITIONS

---

## 10.1 Earnings Quality Metrics (Beyond Beneish)

**What it is:** Additional metrics that complement the Beneish M-Score for detecting earnings manipulation or low-quality earnings.

### 10.1a Sloan Accrual Ratio

```
Sloan_Ratio = (Net_Income - CFO - CFI) / Total_Assets

Interpretation:
  < 10%: High quality earnings (cash-backed)
  10-25%: Moderate -- investigate
  > 25%: Red flag -- earnings driven by accruals, not cash

Named after Professor Richard Sloan. Research shows high-accrual
companies underperform low-accrual companies by ~10% annually.
```

### 10.1b Cash Conversion Score

```
CCS = Operating_Cash_Flow / Net_Income

Interpretation:
  > 1.2: Excellent (generating more cash than reported earnings)
  0.8-1.2: Good
  0.5-0.8: Mediocre
  < 0.5: Red flag (where is the cash?)
```

### 10.1c Accruals Quality (Dechow-Dichev)

```
Regress: Working_Capital_Accruals = f(CFO_t-1, CFO_t, CFO_t+1)
Residuals from this regression = accruals quality measure
Higher residuals = lower quality earnings
```

**Integration:** Add to `scoring/earnings-quality.ts`. Compute Sloan Ratio and Cash Conversion alongside existing Beneish M-Score. Combined, these three give comprehensive earnings quality assessment.

---

## 10.2 Insider Transaction Scoring

**What it is:** Scoring insider buying/selling patterns as investment signals, going beyond 13F tracking.

**Scoring Framework:**

```
Signal Score (per transaction):
  +5: Open market purchase (strongest signal)
  +3: 10b5-1 plan purchase
  +1: Option exercise + hold
  -1: Option exercise + sell (weakest signal)
  -2: Open market sale
  -3: Large open market sale (>$1M)

Cluster Detection:
  3+ insiders buying within 30 days: +15 bonus
  5+ insiders buying within 30 days: +25 bonus
  CEO + CFO both buying: +10 bonus

Seniority Weighting:
  CEO/Chairman: 3x weight
  CFO/COO: 2x weight
  Directors: 1.5x weight
  VP and below: 1x weight

Composite_Insider_Score = SUM(Signal_Score * Seniority_Weight) + Cluster_Bonus

Interpretation:
  > 30: Strong buy signal
  15-30: Moderate bullish signal
  -15 to 15: Neutral
  < -15: Bearish signal (insiders exiting)
```

**Data inputs needed:**
- SEC Form 4 filings (available via SEC EDGAR API, free)
- Transaction type, amount, insider role, date

**Integration:** Add to `data/insider-signals.ts`. Pull from SEC EDGAR, compute signal scores, surface alongside fundamental analysis.

---

## 10.3 Short Interest Analysis

**What it is:** Using short selling data as a signal for both risk (potential squeeze) and opportunity (smart money shorting).

**Key Metrics:**

```
Short Interest Ratio (Days to Cover):
  DTC = Shares_Sold_Short / Average_Daily_Volume

Thresholds:
  < 3 days: Low short interest
  3-5 days: Moderate
  5-10 days: Elevated (squeeze potential)
  > 10 days: Extreme (high squeeze risk)

Short Interest as % of Float:
  SI% = Shares_Short / Float * 100

Thresholds:
  < 5%: Low
  5-15%: Moderate
  15-25%: High
  > 25%: Extreme

Short Squeeze Probability Score:
  High when: SI% > 15% AND DTC > 5 AND stock near 52-week high
  Also consider: Recent positive catalyst, high institutional ownership

Value Investor Warning:
  IF SI% > 20% on a stock you're analyzing:
    FLAG: "Heavy short interest -- what do shorts see that you don't?"
    Require: Extra due diligence on bear thesis
```

**Data inputs needed:**
- Short interest data (FINRA, published semi-monthly, 10-day lag)
- Average daily volume
- Float data

**Integration:** Add to `data/short-interest.ts`. Display as a warning/context overlay on stock analysis.

---

## 10.4 Options-Implied Probability Analysis

**What it is:** Extracting market-implied probabilities of price movements from options pricing.

**Key Formulas:**

```
Implied Volatility (IV):
  Solve Black-Scholes for sigma given market option price
  (numerical solution -- Newton-Raphson method)

IV Percentile:
  IV_Percentile = (Days_IV_Below_Current / Total_Days) * 100
  High IV_Percentile (>80%): Market expects big move (fear/event)
  Low IV_Percentile (<20%): Market complacent

Probability of Profit at Expiry (from option prices):
  P(Stock > Strike) ≈ Delta of call option at that strike
  P(Stock < Strike) ≈ 1 - Delta of put option at that strike

Implied Move by Expiry:
  Expected_Move = Straddle_Price / Stock_Price
  (ATM call + ATM put prices at nearest expiry)

Put Skew Analysis:
  Skew = IV(25delta_put) - IV(25delta_call)
  Positive skew: Market pricing more downside risk
  Increasing skew: Growing fear of crash
```

**Data inputs needed:**
- Options chain data (strikes, expirations, bid/ask)
- Historical implied volatility series

**Integration:** Add to `data/options-implied.ts`. For stocks with liquid options, show: "The options market is pricing a 23% probability of this stock being below $50 in 6 months." This provides a market-consensus probability to compare against your own analysis.

---

## 10.5 ESG Composite Scoring

**What it is:** A simplified ESG scoring system combining SASB materiality with TCFD climate assessment.

**Framework:**

```
SASB Materiality Approach (industry-specific):
  For each of 77 industries, SASB identifies 3-7 material ESG factors
  Score each material factor 1-5 based on company disclosure and performance

Climate Overlay (TCFD):
  Governance: 1-5
  Strategy: 1-5
  Risk Management: 1-5
  Metrics & Targets: 1-5

Combined ESG Score:
  ESG = (SASB_Material_Score * 0.60) + (TCFD_Climate_Score * 0.25) + (Controversy_Score * 0.15)

Controversy Score (1-5, lower is better):
  5: No controversies
  4: Minor controversies
  3: Moderate issues
  2: Significant controversies
  1: Severe controversies (lawsuits, regulatory action)

Investment Decision Integration:
  ESG > 4.0: No adjustment needed
  ESG 3.0-4.0: Monitor, no discount
  ESG 2.0-3.0: Apply 5-10% valuation discount
  ESG < 2.0: Apply 15-20% discount or exclude
```

**Integration:** Add to `scoring/esg.ts`. Qualitative inputs with semi-structured scoring. Feeds into valuation as an adjustment factor.

---

## 10.6 Supply Chain Risk Scoring

**What it is:** Assessing concentration risk and vulnerability in a company's supply chain.

**Framework:**

```
Revenue Concentration:
  Top_Customer_% = Revenue_from_Top_Customer / Total_Revenue
  > 20%: HIGH RISK (single customer dependency)
  10-20%: MODERATE
  < 10%: LOW

Supplier Concentration:
  Single_Source_Components = count of inputs with only 1 supplier
  > 3 single-source inputs: HIGH RISK
  1-3: MODERATE
  0: LOW

Geographic Concentration:
  Revenue_from_Single_Country = % from top country
  > 50% from any non-domestic market: HIGH RISK
  Supply_Chain_Geography: % sourced from geopolitically risky regions

Supply Chain Risk Score (0-100):
  Revenue_Concentration (0-25): 25 * (Top_Customer_%/50%)
  Supplier_Concentration (0-25): 25 * (Single_Source_Count/5)
  Geographic_Risk (0-25): 25 * (Risky_Region_%/100%)
  Disruption_History (0-25): Past 5 years disruption events

  > 70: Critical supply chain risk
  50-70: Elevated risk
  25-50: Moderate
  < 25: Low risk
```

**Data inputs needed:**
- 10-K disclosures (customer concentration, geographic revenue)
- Supplier data (often in supply chain databases like Bloomberg SPLC)
- Historical disruption events

**Integration:** Add to `scoring/supply-chain-risk.ts`. Particularly relevant for manufacturers, retailers, and companies with complex global supply chains.

---

# SECTION 11: ADDITIONAL HIGH-VALUE METHODOLOGIES

---

## 11.1 Shareholder Yield

**What it is:** Total cash returned to shareholders through dividends, buybacks, and debt reduction.

```
Shareholder_Yield = Dividend_Yield + Buyback_Yield + Debt_Paydown_Yield

Where:
  Dividend_Yield = Annual_Dividends / Market_Cap
  Buyback_Yield = Net_Share_Repurchases / Market_Cap
  Debt_Paydown_Yield = Net_Debt_Reduction / Market_Cap

Threshold:
  > 8%: Exceptional capital return
  5-8%: Strong
  2-5%: Average
  < 2%: Low
```

**Integration:** Add to `scoring/shareholder-yield.ts`. A better metric than dividend yield alone.

---

## 11.2 Quality Composite Score (Bridging Multiple Frameworks)

**What it is:** A single composite that combines multiple quality signals into one number.

```
Quality_Composite = (
  ROIC_Percentile * 0.20 +
  Earnings_Stability * 0.15 +
  Balance_Sheet_Strength * 0.15 +
  Cash_Conversion * 0.15 +
  Margin_Trend * 0.10 +
  Piotroski_F_Normalized * 0.10 +
  Sloan_Ratio_Inverted * 0.10 +
  Capital_Allocation_Score * 0.05
)

Where each component is normalized to 0-100 percentile

Quality Grades:
  > 80: A (elite quality)
  60-80: B (high quality)
  40-60: C (average)
  20-40: D (below average)
  < 20: F (poor quality -- avoid)
```

**Integration:** This ties together multiple existing and new scoring modules into a single headline number. Add as `scoring/quality-composite.ts`.

---

## 11.3 Greenblatt Extended: Earnings Yield + ROIC + Momentum

**What it is:** Extending the existing Magic Formula with a momentum factor, as research shows adding momentum improves returns.

```
Original Magic Formula Rank = Earnings_Yield_Rank + ROIC_Rank

Extended Rank = Earnings_Yield_Rank + ROIC_Rank + Momentum_Rank

Where:
  Momentum_Rank = rank by 12-month return (excluding last month)

Research basis: Cliff Asness (AQR) has shown that combining
value (Magic Formula) with momentum produces significantly
better risk-adjusted returns than either factor alone.
```

**Integration:** Extend existing `scoring/composite.ts` (Greenblatt) to add optional momentum factor.

---

# PRIORITY RANKING FOR IMPLEMENTATION

Based on impact-to-effort ratio for a value investing tool:

| Priority | Module | Effort | Impact | Why |
|----------|--------|--------|--------|-----|
| 1 | Market Cycle Score (7.1) | Medium | Very High | Macro context changes everything |
| 2 | ROIC Decomposition Tree (8.4) | Medium | Very High | Core analytical tool |
| 3 | Owner's Earnings (8.1) | Low | High | Better DCF inputs |
| 4 | Risk-Reward Asymmetry (7.2) | Low | High | Extends existing scenarios |
| 5 | Earnings Quality Suite (10.1) | Low | High | Extends existing Beneish |
| 6 | Risk-Adjusted Ratios (9.4) | Low | High | Portfolio dashboard essentials |
| 7 | Drawdown Analysis (9.3) | Low | High | Portfolio risk visibility |
| 8 | Insider Transaction Scoring (10.2) | Medium | High | Actionable signal |
| 9 | Capital Allocation Score (8.5) | Medium | High | Management quality metric |
| 10 | Correlation Analysis (9.2) | Medium | Medium-High | Hidden concentration risk |
| 11 | Stress Testing / VaR (3.2) | Medium | Medium-High | Institutional-grade risk |
| 12 | Shareholder Yield (11.1) | Low | Medium | Quick win |
| 13 | Short Interest Analysis (10.3) | Low | Medium | Warning system |
| 14 | Contrarian Sentiment (7.3) | Medium | Medium | Market temperature |
| 15 | Quality Composite (11.2) | Low | Medium | Ties modules together |
| 16 | Factor Decomposition (3.1) | High | Medium | Quant-grade analytics |
| 17 | Unit Economics (4.3) | Medium | Medium | Growth stock analysis |
| 18 | Rule of 40 (6.1) | Low | Medium | SaaS screening |
| 19 | Risk Parity (1.1) | High | Medium | Portfolio construction |
| 20 | Supply Chain Risk (10.6) | Medium | Medium | Due diligence depth |
| 21 | ESG Scoring (10.5) | Medium | Low-Medium | Modern requirement |
| 22 | Debt Cycle Model (1.2) | High | Medium | Macro overlay |
| 23 | Climate/TCFD (3.3) | Medium | Low-Medium | ESG overlay |
| 24 | Management Assessment (2.2) | Low | Medium | Qualitative framework |
| 25 | NRR/Cohort (6.2, 6.3) | Medium | Low-Medium | SaaS-specific |
| 26 | Float Analysis (8.3) | Low | Low-Medium | Insurance-specific |
| 27 | Portfolio Attribution (9.1) | Medium | Medium | Institutional feature |
| 28 | Risk Budgeting (9.5) | Medium | Medium | Advanced portfolio mgmt |
| 29 | Momentum Suite (5.1) | Medium | Low-Medium | Technical overlay |
| 30 | Mean Reversion (5.2) | Low | Low-Medium | Technical overlay |
| 31 | Pairs Trading (5.3) | High | Low | Not core to value investing |
| 32 | Options-Implied (10.4) | High | Medium | Advanced, data-intensive |
| 33 | TAM Analysis (4.1) | Low | Low | VC-specific |
| 34 | PMF Framework (4.2) | Low | Low | VC-specific |
| 35 | Alt Data (5.4) | Very High | Varies | Data sourcing challenge |
| 36 | Operational Value (2.1) | Low | Low | PE-specific |
| 37 | Greenblatt + Momentum (11.3) | Low | Medium | Quick extension |
| 38 | Look-Through Earnings (8.2) | Low | Low-Medium | Portfolio view |

---

# SUGGESTED FILE STRUCTURE

```
packages/core/src/
├── scoring/
│   ├── altman-z.ts (existing)
│   ├── beneish-m.ts (existing)
│   ├── piotroski-f.ts (existing)
│   ├── composite.ts (existing -- extend with momentum)
│   ├── valuation.ts (existing)
│   ├── owner-earnings.ts (NEW)
│   ├── roic-tree.ts (NEW)
│   ├── earnings-quality.ts (NEW -- Sloan + CCS)
│   ├── capital-allocation.ts (NEW)
│   ├── management.ts (NEW)
│   ├── unit-economics.ts (NEW)
│   ├── rule-of-40.ts (NEW)
│   ├── net-revenue-retention.ts (NEW)
│   ├── shareholder-yield.ts (NEW)
│   ├── quality-composite.ts (NEW)
│   ├── float-analysis.ts (NEW)
│   ├── esg.ts (NEW)
│   ├── climate-risk.ts (NEW)
│   └── supply-chain-risk.ts (NEW)
├── portfolio/
│   ├── brier.ts (existing)
│   ├── kelly-rebalance.ts (existing)
│   ├── mos-alert.ts (existing)
│   ├── risk-parity.ts (NEW)
│   ├── factor-decomposition.ts (NEW)
│   ├── stress-test.ts (NEW)
│   ├── attribution.ts (NEW)
│   ├── correlation.ts (NEW)
│   ├── drawdown.ts (NEW)
│   ├── risk-ratios.ts (NEW)
│   ├── risk-budget.ts (NEW)
│   └── look-through-earnings.ts (NEW)
├── macro/
│   ├── cycle-score.ts (NEW -- Howard Marks framework)
│   ├── cycle-position.ts (NEW -- Dalio debt cycles)
│   └── sentiment-indicators.ts (NEW)
├── screener/
│   ├── momentum.ts (NEW)
│   ├── mean-reversion.ts (NEW)
│   └── pairs-trading.ts (NEW)
├── data/
│   ├── insider-signals.ts (NEW)
│   ├── short-interest.ts (NEW)
│   ├── options-implied.ts (NEW)
│   └── alternative-signals.ts (NEW)
└── private-markets/
    ├── operational-value.ts (NEW)
    ├── tam-analysis.ts (NEW)
    ├── pmf-scoring.ts (NEW)
    └── cohort-analysis.ts (NEW)
```

---

# DATA SOURCES (FREE/LOW-COST)

| Data Need | Free Source | API |
|-----------|-----------|-----|
| Financial statements | SEC EDGAR | EDGAR API |
| Macro indicators | FRED (Federal Reserve) | FRED API |
| Factor returns | Ken French Data Library | CSV download |
| Insider transactions | SEC EDGAR Form 4 | EDGAR API |
| Short interest | FINRA | Semi-monthly publication |
| Options data | CBOE (delayed) | Paid for real-time |
| Sentiment (AAII) | AAII website | Manual/scrape |
| Credit spreads | FRED (BAMLH0A0HYM2) | FRED API |
| VIX | CBOE/Yahoo Finance | Free API |
| Shiller CAPE | Robert Shiller website | CSV download |
| ESG data | Company filings, CDP | Manual input |
| BIS debt service ratio | BIS statistics | CSV download |

---

Sources:
- [Bridgewater All Weather Story](https://www.bridgewater.com/research-and-insights/the-all-weather-story)
- [Risk Parity - Wikipedia](https://en.wikipedia.org/wiki/Risk_parity)
- [Risk Parity Asset Allocation - QuantPedia](https://quantpedia.com/risk-parity-asset-allocation/)
- [BlackRock Aladdin Risk Layers](https://www.blackrock.com/aladdin/products/aladdin-wealth/insights/risk-layers)
- [BlackRock Aladdin Risk](https://www.blackrock.com/aladdin/products/aladdin-risk)
- [KKR Value Creation](https://www.kkr.com/insights/value-creation-private-equity)
- [KKR Capstone](https://www.kkr.com/approach/capstone)
- [Sequoia Arc PMF Framework](https://sequoiacap.com/article/pmf-framework/)
- [Howard Marks Market Cycles](https://www.financehobbyist.com/p/market-cycles-according-to-howard)
- [Howard Marks - EBC Financial Group](https://www.ebc.com/forex/howard-marks)
- [Jim Simons Trading Strategy](https://www.quantvps.com/blog/jim-simons-trading-strategy)
- [Rule of 40 - BCG](https://www.bcg.com/publications/2025/rule-of-40-lessons-from-top-performers-software)
- [LTV/CAC Ratio - Wall Street Prep](https://www.wallstreetprep.com/knowledge/ltv-cac-ratio/)
- [Buffett Owner's Earnings - StableBread](https://stablebread.com/warren-buffett-owners-earnings/)
- [Look-Through Earnings - Investment Blog](http://theinvestmentsblog.blogspot.com/2011/07/buffett-on-look-through-earnings.html)
- [Insurance Float Analysis](https://einvestingforbeginners.com/insurance-float-ahern/)
- [ROIC DuPont Analysis - New Constructs](https://www.newconstructs.com/roic-drivers-a-more-rigorous-dupont-analysis/)
- [Capital Allocation - Morgan Stanley](https://www.morganstanley.com/im/publication/insights/articles/article_capitalallocation.pdf)
- [Sharpe/Sortino/Calmar Ratios](https://www.dakotaridgecapital.com/fearless-investor/portfolio-risk-ratios-sharpe-sortino-calmar)
- [VaR Methods - Financial Edge](https://www.fe.training/free-resources/financial-markets/value-at-risk-var/)
- [Brinson Attribution Model](https://www.kiski.com/blog-posts/understanding-brinson-analysis-as-a-performance-attribution-tool)
- [Sloan Ratio - Investing.com](https://www.investing.com/academy/analysis/sloan-ratio-definition/)
- [Insider Trading Signals - MarketTriage](https://markettriage.com/insider-trading-signals)
- [Short Interest - Wikipedia](https://en.wikipedia.org/wiki/Short_interest_ratio)
- [Pairs Trading - QuantInsti](https://blog.quantinsti.com/pairs-trading-basics/)
- [Network Effects Manual - NFX](https://www.nfx.com/post/network-effects-manual)
- [ESG Frameworks Guide](https://ecoactivetech.com/choosing-esg-framework-2025-guide/)
- [TCFD vs SASB](https://senecaesg.com/insights/tcfd-vs-sasb-key-esg-framework-differences-explained-2025/)
- [Supply Chain Risk - McKinsey](https://www.mckinsey.com/capabilities/operations/our-insights/a-practical-approach-to-supply-chain-risk-management)
- [Dalio Economic Machine](https://www.economicprinciples.org/downloads/ray_dalio__how_the_economic_machine_works__leveragings_and_deleveragings.pdf)
- [Drawdowns - Morgan Stanley](https://www.morganstanley.com/im/publication/insights/articles/article_drawdownsandrecoveries_ltr.pdf)
- [Ray Dalio EBC](https://www.ebc.com/forex/ray-dalio-strategy-explained-all-weather-risk-parity)
