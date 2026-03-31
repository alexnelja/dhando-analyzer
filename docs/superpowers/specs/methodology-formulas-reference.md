# Methodology Formulas Reference -- All 42 Investment Frameworks

> Definitive formula reference for the Dhando Analyzer platform.
> Every formula is fully specified with input variables, data sources, thresholds, and integration targets.
> An engineer reading this document should be able to implement any methodology without external references.

**Last updated:** 2026-03-30
**Covers:** 42 methodologies across 8 categories
**Codebase root:** `packages/core/src/`

---

## Table of Contents

1. [Macro / Cycle Indicators](#1-macro--cycle-indicators) (7 methodologies)
2. [Valuation Metrics](#2-valuation-metrics) (7 methodologies)
3. [Earnings Quality](#3-earnings-quality) (4 methodologies)
4. [Risk Metrics](#4-risk-metrics) (8 methodologies)
5. [Growth Metrics](#5-growth-metrics) (5 methodologies)
6. [Momentum / Technical](#6-momentum--technical) (4 methodologies)
7. [Portfolio Analytics](#7-portfolio-analytics) (3 methodologies)
8. [Alternative Signals](#8-alternative-signals) (4 methodologies)

---

# 1. MACRO / CYCLE INDICATORS

---

### 1. Howard Marks Market Cycle Score

**Source:** Howard Marks, Oaktree Capital ($189B AUM). Published in "Mastering the Market Cycle" (2018).
**Category:** Macro
**Purpose:** Determine whether the current market environment favors aggressive capital deployment or defensive positioning.

**Formula:**
```
Cycle_Score = (1/N) * SUM(Indicator_Score_i)  for i = 1..N

Where N = 10 indicators, each scored 1 to 5:
  1 = Extreme fear / crisis (opportunity)
  2 = Below-average pessimism
  3 = Neutral
  4 = Above-average optimism
  5 = Extreme euphoria (danger)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| credit_spread_hy_ig | High-yield minus investment-grade spread | basis points | FRED (BAMLH0A0HYM2, BAMLC0A4CBBB) | No -- new macro module |
| vix | CBOE Volatility Index | index level | CBOE / Yahoo Finance | No -- new macro module |
| cape_ratio | Shiller Cyclically Adjusted P/E | ratio | Robert Shiller dataset | No -- new macro module |
| margin_debt_gdp | FINRA margin debt as % of GDP | percentage | FINRA + FRED (GDP) | No -- new macro module |
| ipo_volume | Number of IPOs in trailing 12 months | count | Renaissance Capital / SEC | No -- manual input |
| ma_volume | M&A deal volume in trailing 12 months | USD billions | Bloomberg / Refinitiv | No -- manual input |
| lending_standards | Fed Senior Loan Officer Survey net tightening | percentage | FRED (DRTSCILM) | No -- new macro module |
| bond_issuance_quality | Ratio of covenant-lite issuance to total | ratio | Moody's / LCD | No -- manual input |
| fund_flows_equity | Net equity fund flows (ICI data) | USD billions | ICI / FRED | No -- manual input |
| aaii_bull_bear | AAII Sentiment Survey bull-bear spread | percentage points | AAII weekly survey | No -- new macro module |

**Interpretation:**
- 1.0 -- 2.0 --> AGGRESSIVE: Deploy capital, accept illiquidity, buy distressed
- 2.0 -- 3.0 --> MODERATE: Normal positioning, standard margin of safety
- 3.0 -- 4.0 --> CAUTIOUS: Raise cash, tighten quality screens, avoid leverage
- 4.0 -- 5.0 --> DEFENSIVE: Maximum cash, sell weak positions, accept underperformance

**Individual Indicator Scoring Thresholds:**

| Indicator | Score = 1 (Fear) | Score = 3 (Neutral) | Score = 5 (Euphoria) |
|-----------|-----------------|--------------------|--------------------|
| Credit spread (HY-IG) | > 600bp | 350-450bp | < 300bp |
| VIX | > 30 | 15-20 | < 12 |
| CAPE | < 15 | 18-22 | > 30 |
| Margin debt/GDP | Declining sharply | Stable ~2% | Rising > 3% |
| IPO volume | Near zero | Average | Record highs |
| M&A volume | Deal flow frozen | Average | Record deal values |
| Lending standards | Tightening sharply | Neutral | Loosening significantly |
| Bond issuance quality | Only IG issuance | Mixed | Covenant-lite dominates |
| Fund flows | Equity outflows | Neutral | Massive equity inflows |
| AAII bull-bear | < -30 | -10 to +10 | > +30 |

**Integration:** Maps to `packages/core/src/macro/cycle-score.ts` (new module)

---

### 2. Bridgewater Economic Machine Model

**Source:** Ray Dalio, Bridgewater Associates ($150B AUM). Published in "How the Economic Machine Works" (2013) and "Principles for Navigating Big Debt Crises" (2018).
**Category:** Macro
**Purpose:** Identify the current phase of the short-term and long-term debt cycle to set macro positioning and adjust portfolio risk tolerance.

**Formula:**
```
Short-Term Cycle Position (5-8 year cycle):

Phase = classify(debt_to_gdp_trend, credit_spread_trend, lending_standards, real_rate, debt_service_ratio, cb_balance_sheet_trend)

Decision Logic (rule-based):

IF debt_to_gdp > 250%
   AND credit_spreads widening (delta > +50bp over 3 months)
   AND lending_standards tightening:
     phase = "LATE_CYCLE_DANGER"

IF credit_spreads > 600bp
   AND vix > 30
   AND lending_frozen (net tightening > 40%):
     phase = "CRISIS_OPPORTUNITY"

IF rates_falling (delta < -100bp over 6 months)
   AND credit_expanding (loan_growth > 5% YoY)
   AND unemployment_declining (delta < -0.5% over 6 months):
     phase = "EARLY_RECOVERY"

IF all_indicators_neutral:
     phase = "MID_CYCLE_EXPANSION"

IF rates_rising
   AND credit_still_expanding
   AND asset_prices_elevated (CAPE > 25):
     phase = "LATE_EXPANSION"
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| debt_to_gdp | Total non-financial debt to GDP | percentage | FRED (TCMDO / GDP) | No -- new macro module |
| credit_spread_hy_ig | High-yield minus investment-grade spread | basis points | FRED (BAMLH0A0HYM2) | No -- shared with #1 |
| lending_standards | Net % of banks tightening standards | percentage | FRED (DRTSCILM) | No -- shared with #1 |
| real_interest_rate | Fed Funds Rate minus CPI YoY | percentage | FRED (FEDFUNDS - CPIAUCSL) | No -- new macro module |
| debt_service_ratio | Debt payments as % of income (BIS) | percentage | BIS statistics | No -- new macro module |
| cb_balance_sheet | Central bank total assets | USD trillions | FRED (WALCL) | No -- new macro module |
| unemployment_rate | U-3 unemployment rate | percentage | FRED (UNRATE) | No -- new macro module |
| loan_growth_yoy | Commercial bank loan growth YoY | percentage | FRED (TOTLL) | No -- new macro module |
| vix | CBOE Volatility Index | index level | CBOE | No -- shared with #1 |
| cape_ratio | Shiller CAPE | ratio | Shiller dataset | No -- shared with #1 |

**Interpretation:**
- EARLY_RECOVERY --> Maximum risk exposure, favor cyclicals and distressed
- MID_CYCLE_EXPANSION --> Normal positioning, favor quality growth
- LATE_EXPANSION --> Begin reducing risk, favor defensive quality
- LATE_CYCLE_DANGER --> Reduce risk aggressively, increase cash and gold
- CRISIS_OPPORTUNITY --> Deploy capital into distressed assets at max conviction

**Integration:** Maps to `packages/core/src/macro/cycle-position.ts` (new module)

---

### 3. Risk Parity / All Weather Portfolio Construction

**Source:** Ray Dalio, Bridgewater Associates. All Weather fund launched 1996.
**Category:** Macro / Portfolio
**Purpose:** Construct a portfolio where each asset class contributes equal risk, achieving equity-like returns with roughly one-third the drawdown.

**Formula:**
```
Naive (Inverse Volatility) Approximation:
  w_i = (1 / sigma_i) / SUM(1 / sigma_j)  for all j in portfolio

  Where:
    w_i = weight of asset i
    sigma_i = annualized volatility of asset i (StdDev of returns * sqrt(252))

Full Equal Risk Contribution (ERC):
  For each asset i:
    RC_i = w_i * (Sigma * w)_i / sqrt(w^T * Sigma * w)

  Target: RC_i = RC_j  for all i, j  (equal risk contribution)

  Solved via optimization:
    minimize  SUM_i SUM_j (RC_i - RC_j)^2
    subject to  SUM(w_i) = 1, w_i >= 0

Risk Budgeting Extension:
  w_i * (Sigma * w)_i = b_i * (w^T * Sigma * w)

  Where b_i = target risk budget for asset i (SUM(b_i) = 1)

Diversification Ratio:
  DR = SUM(w_i * sigma_i) / sqrt(w^T * Sigma * w)
  DR > 1 indicates diversification benefit. Higher = better.
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| w_i | Weight of asset i in portfolio | decimal (0-1) | Portfolio positions | Yes -- portfolio/position.ts |
| sigma_i | Annualized volatility of asset i | decimal | Calculated from daily returns | No -- needs price history |
| Sigma | Covariance matrix of asset returns | matrix | Calculated from daily returns (rolling 1-3yr) | No -- new computation |
| b_i | Target risk budget per asset | decimal (0-1) | User-defined | No -- new input |
| R_f | Risk-free rate (3-month T-bill) | decimal | FRED (DTB3) | No -- new macro module |

**Interpretation:**
- If portfolio risk contribution from equities > 70% --> portfolio is NOT risk-balanced
- DR < 1.2 --> poor diversification, portfolio behaves like 2-3 correlated positions
- DR > 2.0 --> excellent diversification across uncorrelated assets

**Integration:** Maps to `packages/core/src/portfolio/risk-parity.ts` (new module)

---

### 4. Shiller CAPE Ratio

**Source:** Robert Shiller, Yale University. Published in "Irrational Exuberance" (2000). Nobel Prize 2013.
**Category:** Macro / Valuation
**Purpose:** Assess whether the overall stock market is overvalued or undervalued relative to long-run average earnings, smoothing out cyclical fluctuations.

**Formula:**
```
CAPE = Current_Real_Price / Average_Real_Earnings_10yr

Where:
  Current_Real_Price = S&P 500 index level / (CPI_current / CPI_base)
  Average_Real_Earnings_10yr = (1/10) * SUM(Real_EPS_year_t)  for t = -9..0
  Real_EPS_year_t = Nominal_EPS_year_t / (CPI_year_t / CPI_base)

Excess CAPE Yield (ECY):
  ECY = (1 / CAPE) - Real_Bond_Yield
  ECY represents the expected real return premium of equities over bonds.
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| sp500_price | S&P 500 index level | index points | Yahoo Finance / FRED | No -- new macro module |
| sp500_eps_10yr | S&P 500 reported EPS for each of last 10 years | USD | S&P Global / Shiller dataset | No -- new macro module |
| cpi_current | Current CPI-U index level | index | FRED (CPIAUCSL) | No -- new macro module |
| cpi_historical | CPI-U for each of last 10 years | index | FRED (CPIAUCSL) | No -- new macro module |
| real_bond_yield | 10-year TIPS yield | percentage | FRED (DFII10) | No -- new macro module |

**Interpretation:**
- CAPE < 15 --> Market significantly undervalued (strong buy signal historically)
- CAPE 15-20 --> Fairly valued
- CAPE 20-25 --> Mildly overvalued
- CAPE 25-30 --> Overvalued, expect below-average forward returns
- CAPE > 30 --> Significantly overvalued, historically precedes major corrections
- Long-run average (1881-2025): ~17
- ECY > 3% --> Equities attractive vs bonds; ECY < 0% --> Bonds preferred

**Integration:** Maps to `packages/core/src/macro/cape-ratio.ts` (new module)

---

### 5. Credit Spread Indicator

**Source:** Institutional standard. Used by every major fixed income desk (PIMCO, Bridgewater, BlackRock).
**Category:** Macro
**Purpose:** Measure credit market stress as a leading indicator of economic downturns and equity market corrections. Credit spreads typically widen 3-6 months before equity corrections.

**Formula:**
```
Credit_Spread = Yield_High_Yield_Index - Yield_Investment_Grade_Index

IG_Spread = Yield_IG_Corporate - Yield_Treasury_Same_Maturity

OAS = Option_Adjusted_Spread (accounts for embedded call options in bonds)

Z-Score of Spread (for signal generation):
  Z_spread = (Current_Spread - Mean_Spread_5yr) / StdDev_Spread_5yr
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| yield_hy | ICE BofA US High Yield Index effective yield | percentage | FRED (BAMLH0A0HYM2) | No -- new macro module |
| yield_ig | ICE BofA US Corporate Index effective yield | percentage | FRED (BAMLC0A4CBBB) | No -- new macro module |
| yield_treasury | US Treasury yield (matched maturity) | percentage | FRED (DGS10, DGS5, DGS2) | No -- new macro module |
| spread_5yr_mean | Rolling 5-year average of HY-IG spread | basis points | Derived | No -- computed |
| spread_5yr_std | Rolling 5-year standard deviation of spread | basis points | Derived | No -- computed |

**Interpretation:**
- HY-IG spread < 300bp --> Complacency (risk-off signal)
- HY-IG spread 300-500bp --> Normal range
- HY-IG spread 500-700bp --> Elevated stress (caution)
- HY-IG spread > 700bp --> Crisis levels (contrarian opportunity)
- Z_spread > 2.0 --> Spreads abnormally wide (buy signal for credit and equity)
- Z_spread < -1.5 --> Spreads abnormally tight (risk building)

**Integration:** Maps to `packages/core/src/macro/credit-spreads.ts` (new module)

---

### 6. Yield Curve Signal

**Source:** Federal Reserve research (Estrella & Mishkin, 1996). Every inversion of the 10Y-2Y spread since 1955 has preceded a recession within 6-24 months.
**Category:** Macro
**Purpose:** Detect yield curve inversions as recession warning signals and gauge bond market expectations for economic growth and monetary policy.

**Formula:**
```
Yield_Curve_Spread = Yield_10Y_Treasury - Yield_2Y_Treasury

Term Premium Approximation:
  Term_Premium = Yield_10Y - Expected_Average_Short_Rate_10yr
  (Adrian, Crump, Moench model -- available from NY Fed)

Near-Term Forward Spread (Fed preferred indicator):
  NTFS = Forward_Rate_6Q_Ahead - Yield_3M_Treasury
  (More accurate recession predictor than 10Y-2Y per Fed research)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| yield_10y | 10-Year US Treasury Constant Maturity Rate | percentage | FRED (DGS10) | No -- new macro module |
| yield_2y | 2-Year US Treasury Constant Maturity Rate | percentage | FRED (DGS2) | No -- new macro module |
| yield_3m | 3-Month US Treasury Bill Rate | percentage | FRED (DTB3) | No -- new macro module |
| forward_rate_6q | 6-quarter ahead instantaneous forward rate | percentage | NY Fed / FRED | No -- new macro module |

**Interpretation:**
- Spread > 200bp --> Steep curve, expansionary, favor cyclicals
- Spread 50-200bp --> Normal, economy growing
- Spread 0-50bp --> Flattening, late cycle warning
- Spread < 0bp (inverted) --> Recession warning, historically 6-24 month lead time
- NTFS < 0 --> Stronger recession signal than 10Y-2Y inversion
- Un-inversion after prolonged inversion --> Recession typically imminent (0-6 months)

**Integration:** Maps to `packages/core/src/macro/yield-curve.ts` (new module)

---

### 7. VIX Fear/Greed Indicator

**Source:** CBOE (Chicago Board Options Exchange). VIX created in 1993, current methodology since 2003.
**Category:** Macro / Sentiment
**Purpose:** Gauge market fear levels as a contrarian indicator. Extreme fear readings historically mark buying opportunities; extreme complacency marks danger zones.

**Formula:**
```
VIX (CBOE calculation):
  VIX^2 = (2 / T) * SUM(delta_K_i / K_i^2 * e^(RT) * Q(K_i)) - (1/T) * (F/K_0 - 1)^2

  Where:
    T = time to expiration (in years)
    K_i = strike price of i-th out-of-the-money option
    delta_K_i = interval between adjacent strikes
    R = risk-free rate
    Q(K_i) = midpoint of bid-ask for option at strike K_i
    F = forward index level derived from options
    K_0 = first strike below forward price

VIX Percentile (more useful for signals):
  VIX_Percentile = Rank(VIX_current, VIX_history_1yr) / N * 100

VIX Term Structure Signal:
  VIX_Contango = VIX_2nd_Month / VIX_1st_Month
  Contango (ratio > 1.0): Normal, complacent
  Backwardation (ratio < 1.0): Acute fear, markets stressed
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| vix_level | Current VIX index close | index points | CBOE / Yahoo Finance (^VIX) | No -- new macro module |
| vix_1yr_history | Daily VIX closes for trailing 252 days | array | CBOE / Yahoo Finance | No -- new macro module |
| vix_1st_month | VIX front-month futures price | index points | CBOE Futures | No -- new macro module |
| vix_2nd_month | VIX second-month futures price | index points | CBOE Futures | No -- new macro module |

**Interpretation:**
- VIX < 12 --> Extreme complacency (contrarian sell signal)
- VIX 12-16 --> Low volatility, calm markets
- VIX 16-20 --> Normal volatility
- VIX 20-30 --> Elevated fear, market stress
- VIX 30-40 --> High fear (historically good entry point)
- VIX > 40 --> Panic (exceptional buying opportunity historically)
- VIX Backwardation --> Acute stress, short-term dislocations likely
- VIX Percentile > 90th --> Extreme fear; < 10th --> Extreme complacency

**Integration:** Maps to `packages/core/src/macro/vix-indicator.ts` (new module)

---

# 2. VALUATION METRICS

---

### 8. ROIC Decomposition Tree

**Source:** McKinsey ("Valuation" textbook, Koller/Goedhart/Wessels), extended DuPont analysis. Used by every strategy consulting firm and fundamental investor.
**Category:** Valuation / Quality
**Purpose:** Identify exactly which operational or capital efficiency lever is driving (or dragging) a company's return on invested capital. The single most important analytical tool for understanding a business.

**Formula:**
```
ROIC = NOPAT / Invested_Capital

Decomposition Level 1:
  ROIC = NOPAT_Margin * Capital_Turnover

  Where:
    NOPAT_Margin = NOPAT / Revenue
    Capital_Turnover = Revenue / Invested_Capital

Decomposition Level 2 -- NOPAT Margin:
  NOPAT = Revenue * (1 - Tax_Rate) * EBIT_Margin
  EBIT_Margin = Gross_Margin - SGA_Pct - RD_Pct - DA_Pct

  Where:
    Gross_Margin = (Revenue - COGS) / Revenue
    SGA_Pct = SGA / Revenue
    RD_Pct = RD_Expense / Revenue
    DA_Pct = Depreciation_Amortization / Revenue
    Tax_Rate = Income_Tax / Pretax_Income

Decomposition Level 2 -- Capital Turnover:
  Capital_Turnover = 1 / (NWC_Revenue_Ratio + Fixed_Asset_Revenue_Ratio)

  NWC_Revenue_Ratio = Net_Working_Capital / Revenue
                    = (Receivables + Inventory - Payables) / Revenue

  Fixed_Asset_Revenue_Ratio = Net_Fixed_Assets / Revenue
                            = (PPE + Intangibles) / Revenue

Working Capital Sub-Components (in days):
  DSO = (Accounts_Receivable / Revenue) * 365
  DIO = (Inventory / COGS) * 365
  DPO = (Accounts_Payable / COGS) * 365
  Cash_Conversion_Cycle = DSO + DIO - DPO

Invested Capital:
  IC = Total_Equity + Total_Debt - Excess_Cash
  -- OR --
  IC = Net_Working_Capital + Net_Fixed_Assets + Other_Operating_Assets

NOPAT:
  NOPAT = EBIT * (1 - Effective_Tax_Rate)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| revenue | Total revenue | USD | Income Statement | Yes -- Financial model |
| cogs | Cost of goods sold | USD | Income Statement | No -- needs addition to Financial model |
| sga | Selling, general & administrative expense | USD | Income Statement | No -- needs addition |
| rd_expense | Research & development expense | USD | Income Statement | No -- needs addition |
| depreciation | Depreciation and amortization | USD | Income Statement / Cash Flow | Partial -- in ValuationInputs |
| ebit | Earnings before interest and taxes | USD | Income Statement | No -- needs addition |
| pretax_income | Income before tax | USD | Income Statement | No -- needs addition |
| income_tax | Income tax expense | USD | Income Statement | No -- needs addition |
| net_income | Net income | USD | Income Statement | Yes -- Financial model |
| accounts_receivable | Trade receivables | USD | Balance Sheet | No -- needs addition |
| inventory | Inventories | USD | Balance Sheet | No -- needs addition |
| accounts_payable | Trade payables | USD | Balance Sheet | No -- needs addition |
| ppe_net | Net property, plant & equipment | USD | Balance Sheet | No -- needs addition |
| intangibles_net | Net intangible assets + goodwill | USD | Balance Sheet | No -- needs addition |
| total_equity | Total shareholders' equity | USD | Balance Sheet | No -- needs addition |
| total_debt | Total interest-bearing debt | USD | Balance Sheet | Yes -- Financial model |
| cash | Cash and equivalents | USD | Balance Sheet | Yes -- Financial model |
| total_assets | Total assets | USD | Balance Sheet | Yes -- Financial model |

**Interpretation:**
- ROIC > 20% --> Exceptional business (wide moat likely)
- ROIC 12-20% --> Good business, earning above cost of capital
- ROIC 8-12% --> Average, roughly at cost of capital
- ROIC < 8% --> Destroying value (below typical WACC)
- Incremental ROIC (change in NOPAT / change in IC) --> Most important: is new investment creating value?

**Integration:** Maps to `packages/core/src/scoring/roic-tree.ts` (new module)

---

### 9. Risk-Reward Asymmetry Ratio

**Source:** Seth Klarman (Baupost Group, $27B AUM), Howard Marks (Oaktree Capital). Core to distressed and deep-value investing.
**Category:** Valuation / Risk
**Purpose:** Only invest where the probability-weighted upside significantly exceeds the probability-weighted downside. Ensures every position has favorable asymmetry.

**Formula:**
```
Asymmetry_Ratio = Expected_Upside / Expected_Downside

Where:
  Expected_Upside = (Intrinsic_Value - Current_Price) * P_upside
  Expected_Downside = (Current_Price - Worst_Case_Value) * P_downside

Extended (three-scenario):
  Expected_Value = P_bull * V_bull + P_base * V_base + P_bear * V_bear
  Expected_Upside = max(Expected_Value - Current_Price, 0)
  Expected_Downside = max(Current_Price - Expected_Value, 0)

  -- OR more precisely --
  Weighted_Upside = P_bull * max(V_bull - Current_Price, 0)
                  + P_base * max(V_base - Current_Price, 0)
  Weighted_Downside = P_bear * max(Current_Price - V_bear, 0)
                    + P_base * max(Current_Price - V_base, 0)

  Asymmetry_Ratio = Weighted_Upside / Weighted_Downside
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| current_price | Current market price | USD | Market data | Yes -- via API |
| intrinsic_value | Calculated fair value (from DCF or multiples) | USD | deal-analyzer/dcf.ts | Yes -- DCF module |
| worst_case_value | Bear-case valuation | USD | deal-analyzer/scenarios.ts | Yes -- scenarios module |
| v_bull | Bull-case valuation | USD | deal-analyzer/scenarios.ts | Yes -- scenarios module |
| v_base | Base-case valuation | USD | deal-analyzer/scenarios.ts | Yes -- scenarios module |
| v_bear | Bear-case valuation | USD | deal-analyzer/scenarios.ts | Yes -- scenarios module |
| p_bull | Probability of bull case | decimal (0-1) | deal-analyzer/probability.ts | Yes -- probability module |
| p_base | Probability of base case | decimal (0-1) | deal-analyzer/probability.ts | Yes -- probability module |
| p_bear | Probability of bear case | decimal (0-1) | deal-analyzer/probability.ts | Yes -- probability module |

**Interpretation:**
- Ratio > 3:1 --> Excellent asymmetry (Klarman/Marks territory, strong buy)
- Ratio 2:1 -- 3:1 --> Good asymmetry (proceed with conviction)
- Ratio 1:1 -- 2:1 --> Mediocre, insufficient margin of safety
- Ratio < 1:1 --> Unfavorable, pass on this opportunity

**Integration:** Maps to `packages/core/src/deal-analyzer/scenarios.ts` (extend existing module)

---

### 10. Look-Through Earnings

**Source:** Warren Buffett, Berkshire Hathaway. Introduced in 1990 annual letter.
**Category:** Valuation / Portfolio
**Purpose:** Calculate the true economic earnings of a portfolio by including your proportional share of each investee's total earnings, not just dividends received. Provides a fundamentally more accurate view of portfolio income.

**Formula:**
```
Look_Through_Earnings = Reported_Operating_Earnings
                      + SUM(Ownership_Pct_i * Investee_Net_Income_i)  for each investee i
                      - Tax_on_Undistributed_Earnings

Where:
  Ownership_Pct_i = Shares_Owned_i / Total_Shares_Outstanding_i
  Undistributed_Earnings_i = (Ownership_Pct_i * Investee_Net_Income_i) - Dividends_Received_i
  Tax_on_Undistributed = SUM(Undistributed_Earnings_i) * Assumed_Tax_Rate
  Assumed_Tax_Rate = 0.15 to 0.20 (dividend tax rate)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| reported_operating_earnings | Your own operating earnings (if applicable) | USD | Income Statement | No -- manual input |
| shares_owned_i | Number of shares held in investee i | shares | Portfolio positions | Yes -- portfolio/position.ts |
| total_shares_outstanding_i | Total diluted shares of investee i | shares | Investee financials / API | Partial -- in ValuationInputs |
| investee_net_income_i | Net income of investee company i | USD | Investee financials / API | Yes -- Financial model |
| dividends_received_i | Dividends received from investee i | USD | Portfolio income records | No -- needs addition |
| assumed_tax_rate | Tax rate on undistributed earnings | decimal | User input (default 0.15) | No -- new parameter |

**Interpretation:**
- Look-through earnings growing > 10% annually --> Portfolio earnings power increasing
- Significant gap between dividends received and look-through --> Retained earnings compounding inside investees
- Look-through P/E (portfolio value / look-through earnings) < 15 --> Portfolio undervalued on earnings basis

**Integration:** Maps to `packages/core/src/portfolio/look-through-earnings.ts` (new module)

---

### 11. Owner's Earnings

**Source:** Warren Buffett, Berkshire Hathaway. Introduced in 1986 annual letter.
**Category:** Valuation
**Purpose:** Calculate the true cash-generating power of a business by adjusting reported earnings for non-cash items and separating maintenance capex from growth capex. Superior to reported net income or even standard FCF for valuation.

**Formula:**
```
Owner_Earnings = Net_Income
              + Depreciation_Amortization
              + Other_Non_Cash_Charges
              - Maintenance_Capex
              +/- Changes_in_Working_Capital (normalized)

Maintenance Capex Estimation (when not disclosed):
  Capital-light businesses: Maintenance_Capex = Depreciation * 1.0 to 1.2
  Capital-moderate businesses: Maintenance_Capex = Depreciation * 1.2 to 1.5
  Capital-heavy businesses: Maintenance_Capex = Depreciation * 1.5 to 2.0

Alternative Calculation:
  Owner_Earnings = FCF + Growth_Capex
  (Since FCF = Operating_CF - Total_Capex, adding back growth capex
   isolates earnings after only maintenance spend)

Owner Earnings Yield:
  OE_Yield = Owner_Earnings / Enterprise_Value
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| net_income | Net income | USD | Income Statement | Yes -- Financial model |
| depreciation | Depreciation and amortization | USD | Cash Flow Statement | Yes -- ValuationInputs |
| other_non_cash | Stock-based comp, impairments, etc. | USD | Cash Flow Statement | No -- needs addition |
| total_capex | Total capital expenditures | USD | Cash Flow Statement | Yes -- Financial model (capex) |
| maintenance_capex | Capex to maintain current operations | USD | Estimated or manual | No -- new input/calculation |
| growth_capex | Capex for expansion | USD | total_capex - maintenance_capex | No -- derived |
| working_capital_change | Change in net working capital | USD | Cash Flow Statement | No -- needs addition |
| enterprise_value | Market cap + debt - cash | USD | Derived from existing fields | Yes -- computable from ValuationInputs |
| maintenance_capex_ratio | Multiplier of depreciation for estimation | decimal | User input or industry default | No -- new parameter |

**Interpretation:**
- OE_Yield > 8% --> Attractive (especially if growing)
- OE_Yield 5-8% --> Fair
- OE_Yield < 5% --> Expensive
- Owner Earnings >> Net Income --> Accounting conservatism (positive)
- Owner Earnings << Net Income --> Earnings quality concern

**Integration:** Maps to `packages/core/src/scoring/owner-earnings.ts` (new module)

---

### 12. Enterprise Value to Free Cash Flow (EV/FCF)

**Source:** Standard institutional valuation metric. Preferred by value investors (Greenblatt, Klarman) over P/E because it is capital-structure neutral and cash-based.
**Category:** Valuation
**Purpose:** Value a business based on its cash generation relative to its total cost of acquisition (equity + debt - cash), removing the distortions of leverage and accounting choices.

**Formula:**
```
EV/FCF = Enterprise_Value / Free_Cash_Flow

Where:
  Enterprise_Value = Market_Cap + Total_Debt + Preferred_Stock + Minority_Interest - Cash
  Free_Cash_Flow = Operating_Cash_Flow - Capital_Expenditures

FCF Yield (inverse):
  FCF_Yield = FCF / EV * 100

Normalized EV/FCF (smooths cyclicality):
  EV/FCF_normalized = EV / Average_FCF_3yr
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| market_cap | Market capitalization | USD | shares * price | Yes -- ValuationInputs |
| total_debt | Total interest-bearing debt | USD | Balance Sheet | Yes -- ValuationInputs / Financial model |
| preferred_stock | Preferred stock (if any) | USD | Balance Sheet | No -- needs addition (often zero) |
| minority_interest | Minority / non-controlling interest | USD | Balance Sheet | No -- needs addition (often zero) |
| cash | Cash and equivalents | USD | Balance Sheet | Yes -- ValuationInputs / Financial model |
| operating_cf | Operating cash flow | USD | Cash Flow Statement | No -- needs addition |
| capex | Capital expenditures | USD | Cash Flow Statement | Yes -- Financial model |
| fcf | Free cash flow | USD | Derived or reported | Yes -- Financial model |

**Interpretation:**
- EV/FCF < 10 --> Cheap (strong buy territory for quality businesses)
- EV/FCF 10-15 --> Fairly valued
- EV/FCF 15-25 --> Expensive, needs high growth to justify
- EV/FCF > 25 --> Very expensive
- FCF Yield > 10% --> Deep value; FCF Yield < 4% --> Overvalued
- Negative FCF --> Cannot use this metric; investigate why

**Integration:** Maps to `packages/core/src/scoring/valuation.ts` (extend existing module)

---

### 13. PEG Ratio

**Source:** Peter Lynch, Fidelity Magellan Fund. Published in "One Up on Wall Street" (1989).
**Category:** Valuation / Growth
**Purpose:** Adjust the P/E ratio for growth rate to determine whether a stock is cheap or expensive relative to its earnings growth trajectory.

**Formula:**
```
PEG = (Price / EPS) / EPS_Growth_Rate

Where:
  Price = current share price
  EPS = trailing twelve months diluted EPS (or forward EPS)
  EPS_Growth_Rate = annualized EPS growth rate (in percentage, e.g., 15 not 0.15)

Variants:
  Forward PEG = Forward_PE / Expected_EPS_Growth_Rate
  Trailing PEG = Trailing_PE / Historical_EPS_CAGR_5yr

CAGR Calculation:
  EPS_CAGR = (EPS_current / EPS_N_years_ago)^(1/N) - 1
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| share_price | Current share price | USD | Market data / API | Yes -- ValuationInputs |
| eps_ttm | Trailing twelve months diluted EPS | USD | Income Statement | Derivable (netIncome / sharesOutstanding) |
| eps_forward | Consensus forward EPS estimate | USD | Analyst estimates API | No -- needs external data |
| eps_growth_rate | Annualized EPS growth rate | percentage | Calculated or consensus | No -- needs calculation |
| eps_historical | EPS for past 5 years | array of USD | Historical financials | Partial -- multiple Financial records |

**Interpretation:**
- PEG < 0.5 --> Significantly undervalued relative to growth
- PEG 0.5-1.0 --> Undervalued (Lynch's buy zone)
- PEG 1.0 --> Fairly valued (growth priced in)
- PEG 1.0-2.0 --> Overvalued relative to growth
- PEG > 2.0 --> Significantly overvalued
- PEG meaningless when: EPS negative, EPS growth negative, or EPS growth < 5%

**Integration:** Maps to `packages/core/src/scoring/valuation.ts` (extend existing module)

---

### 14. Dividend Discount Model (Gordon Growth)

**Source:** Myron Gordon (1959). Foundation of dividend-based valuation theory.
**Category:** Valuation
**Purpose:** Value a stock based on the present value of all future dividend payments, assuming dividends grow at a constant rate in perpetuity.

**Formula:**
```
Single-Stage Gordon Growth Model:
  V_0 = D_1 / (r - g)

  Where:
    V_0 = intrinsic value today
    D_1 = expected dividend next year = D_0 * (1 + g)
    D_0 = most recent annual dividend per share
    r = required rate of return (cost of equity)
    g = perpetual dividend growth rate
    Constraint: r > g (otherwise model is invalid)

Two-Stage DDM (high growth then stable):
  V_0 = SUM(D_0 * (1+g1)^t / (1+r)^t, t=1..N) + (D_N+1 / (r - g2)) / (1+r)^N

  Where:
    g1 = high-growth rate for first N years
    g2 = stable long-term growth rate (usually 2-4%, near GDP growth)
    N = number of high-growth years

Cost of Equity (CAPM):
  r = R_f + Beta * (R_m - R_f)

  Where:
    R_f = risk-free rate
    Beta = stock's systematic risk
    R_m - R_f = equity risk premium (typically 4-6%)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| d_0 | Most recent annual dividend per share | USD | Financials / API | No -- needs addition |
| g | Perpetual dividend growth rate | decimal | Estimated from history or analyst consensus | No -- needs calculation |
| g1 | High-growth phase growth rate | decimal | Analyst estimates / historical | No -- manual input |
| g2 | Stable-phase growth rate | decimal | Default 2-4% (GDP-like) | No -- manual input |
| r | Required rate of return (cost of equity) | decimal | CAPM calculation | No -- new computation |
| R_f | Risk-free rate | decimal | FRED (DGS10) | No -- shared with macro module |
| beta | Stock beta vs market | decimal | Regression or API | No -- needs addition |
| equity_risk_premium | Expected market return minus risk-free | decimal | Damodaran estimates (~5%) | No -- parameter |
| N | High-growth phase duration | years | User input | No -- manual input |

**Interpretation:**
- V_0 > Current_Price by > 30% --> Undervalued with margin of safety
- V_0 within 10% of Current_Price --> Fairly valued
- V_0 < Current_Price --> Overvalued
- Implied growth rate: solve for g given current price --> compare to realistic expectations
- Model works best for: mature dividend-paying companies, utilities, REITs, banks

**Integration:** Maps to `packages/core/src/deal-analyzer/ddm.ts` (new module)

---

# 3. EARNINGS QUALITY

---

### 15. Sloan Accrual Ratio

**Source:** Professor Richard Sloan, University of Michigan (1996). Research shows high-accrual companies underperform low-accrual companies by approximately 10% annually.
**Category:** Quality
**Purpose:** Detect companies where reported earnings are driven by accounting accruals rather than cash, a red flag for earnings sustainability and potential manipulation.

**Formula:**
```
Balance Sheet Approach:
  Accruals = (Delta_CA - Delta_Cash) - (Delta_CL - Delta_STD - Delta_TP) - DA

  Where:
    Delta_CA = change in current assets
    Delta_Cash = change in cash and equivalents
    Delta_CL = change in current liabilities
    Delta_STD = change in short-term debt (within current liabilities)
    Delta_TP = change in taxes payable
    DA = depreciation and amortization

Cash Flow Statement Approach (simpler, preferred):
  Sloan_Ratio = (Net_Income - CFO - CFI) / Total_Assets

  Where:
    CFO = cash flow from operations
    CFI = cash flow from investing activities

Simplified Version:
  Sloan_Ratio = (Net_Income - CFO) / Total_Assets
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| net_income | Net income | USD | Income Statement | Yes -- Financial model |
| cfo | Cash flow from operations | USD | Cash Flow Statement | No -- needs addition |
| cfi | Cash flow from investing activities | USD | Cash Flow Statement | No -- needs addition |
| total_assets | Total assets | USD | Balance Sheet | Yes -- Financial model |
| delta_current_assets | YoY change in current assets | USD | Balance Sheet | No -- needs addition |
| delta_cash | YoY change in cash | USD | Balance Sheet | Derivable from Financial model |
| delta_current_liabilities | YoY change in current liabilities | USD | Balance Sheet | No -- needs addition |
| depreciation | Depreciation and amortization | USD | Cash Flow Statement | Yes -- ValuationInputs |

**Interpretation:**
- Sloan Ratio < -10% --> High quality (cash exceeds reported earnings significantly)
- Sloan Ratio -10% to +5% --> Normal quality
- Sloan Ratio 5% to 10% --> Below average, investigate accrual sources
- Sloan Ratio 10% to 25% --> Poor quality, earnings driven by accruals
- Sloan Ratio > 25% --> Red flag, potential earnings manipulation

**Integration:** Maps to `packages/core/src/scoring/earnings-quality.ts` (new module)

---

### 16. Cash Conversion Score

**Source:** Institutional standard. Used by quality-factor investors (AQR, GMO) and fundamental analysts.
**Category:** Quality
**Purpose:** Measure how effectively a company converts reported accounting earnings into actual cash. Companies with persistent low cash conversion often have hidden problems.

**Formula:**
```
Cash_Conversion_Score = Operating_Cash_Flow / Net_Income

Multi-year version (more reliable):
  CCS_3yr = SUM(OCF, t=-2..0) / SUM(Net_Income, t=-2..0)

Free Cash Flow Conversion:
  FCF_Conversion = Free_Cash_Flow / Net_Income
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| operating_cf | Operating cash flow | USD | Cash Flow Statement | No -- needs addition |
| net_income | Net income | USD | Income Statement | Yes -- Financial model |
| fcf | Free cash flow | USD | Cash Flow Statement | Yes -- Financial model |
| ocf_3yr | Operating cash flow for last 3 years | array of USD | Historical financials | No -- needs historical data |
| ni_3yr | Net income for last 3 years | array of USD | Historical financials | Partial -- multiple Financial records |

**Interpretation:**
- CCS > 1.2 --> Excellent (generating more cash than reported earnings)
- CCS 1.0-1.2 --> Good
- CCS 0.8-1.0 --> Acceptable
- CCS 0.5-0.8 --> Mediocre, investigate working capital and accrual patterns
- CCS < 0.5 --> Red flag, severe disconnect between earnings and cash
- Consistently CCS > 1.0 over 5+ years --> High-quality business indicator

**Integration:** Maps to `packages/core/src/scoring/earnings-quality.ts` (new module, combined with Sloan)

---

### 17. Revenue Quality Score

**Source:** Institutional quality analysis framework. Used by forensic accounting firms and short sellers (Muddy Waters, Citron).
**Category:** Quality
**Purpose:** Assess the durability and reliability of a company's revenue stream by distinguishing recurring, contractual revenue from one-time, volatile sources.

**Formula:**
```
Revenue_Quality_Score = (
  Recurring_Revenue_Pct * 0.30 +
  Revenue_Concentration_Score * 0.20 +
  Revenue_Growth_Consistency * 0.20 +
  DSO_Trend_Score * 0.15 +
  Deferred_Revenue_Trend * 0.15
)

Where:
  Recurring_Revenue_Pct = Recurring_Revenue / Total_Revenue
    Scoring: >80% = 5, 60-80% = 4, 40-60% = 3, 20-40% = 2, <20% = 1

  Revenue_Concentration_Score = inverse of top-customer dependency
    Top customer <10% of revenue = 5
    10-20% = 4, 20-30% = 3, 30-50% = 2, >50% = 1

  Revenue_Growth_Consistency = StdDev(quarterly growth rates) inverted
    Low variance = 5 (steady growth), High variance = 1 (erratic)

  DSO_Trend_Score = based on DSO trend over 4 quarters
    Declining DSO = 5 (collecting faster), Rising DSO = 1 (red flag)

  Deferred_Revenue_Trend = YoY growth in deferred revenue
    Growing deferred revenue = 5 (future revenue secured)
    Declining = 2 (pipeline shrinking)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| recurring_revenue | Subscription / contractual recurring revenue | USD | Company reports / 10-K | No -- manual input |
| total_revenue | Total revenue | USD | Income Statement | Yes -- Financial model |
| top_customer_pct | Revenue from largest customer | percentage | 10-K disclosure | No -- manual input |
| quarterly_revenue_4q | Quarterly revenue for last 4+ quarters | array of USD | Historical financials | Partial -- quarterly Financial records |
| dso | Days sales outstanding | days | Derived: (AR / Revenue) * 365 | No -- needs AR data |
| deferred_revenue | Deferred / unearned revenue | USD | Balance Sheet | No -- needs addition |
| deferred_revenue_prior | Prior year deferred revenue | USD | Balance Sheet | No -- needs addition |

**Interpretation:**
- Score 4.0-5.0 --> High-quality revenue (predictable, diversified, cash-backed)
- Score 3.0-4.0 --> Good quality
- Score 2.0-3.0 --> Average, some concentration or consistency concerns
- Score < 2.0 --> Low quality, unpredictable revenue base

**Integration:** Maps to `packages/core/src/scoring/earnings-quality.ts` (new module, revenue quality section)

---

### 18. Earnings Persistence Score

**Source:** Academic research (Dechow & Dichev 2002, Francis et al. 2004). Used by quality-factor quant funds.
**Category:** Quality
**Purpose:** Measure the degree to which current earnings predict future earnings. High-persistence earnings are more reliable for valuation; low-persistence earnings indicate one-time items or manipulation.

**Formula:**
```
Regression Approach:
  Earnings_t+1 = alpha + beta * Earnings_t + epsilon

  Persistence = beta (slope coefficient)
  beta = 1.0 means perfectly persistent
  beta = 0.0 means no predictive power

Practical Approximation (no regression needed):
  Earnings_Stability = 1 - CoV(EPS, 5yr)
  CoV = StdDev(EPS_5yr) / |Mean(EPS_5yr)|

  Where EPS_5yr = array of annual EPS for last 5 years

Earnings Surprise Consistency:
  Surprise_Score = Count(quarters beating estimates) / Total_Quarters_Tracked
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| eps_annual_5yr | Annual EPS for last 5 years | array of USD | Historical financials | Partial -- multiple Financial records |
| eps_quarterly_8q | Quarterly EPS for last 8 quarters | array of USD | Historical financials | Partial -- quarterly Financial records |
| eps_estimate_8q | Consensus EPS estimates for last 8 quarters | array of USD | Analyst estimates API | No -- needs external data |
| eps_actual_8q | Actual reported EPS for last 8 quarters | array of USD | Historical financials | Partial |

**Interpretation:**
- Persistence (beta) > 0.85 --> Highly persistent (use current earnings confidently in DCF)
- Persistence 0.60-0.85 --> Moderately persistent
- Persistence < 0.60 --> Low persistence (normalize earnings before valuing)
- Stability > 0.80 --> Very stable earnings
- Stability < 0.50 --> Volatile, cyclical, or one-time-driven earnings
- Surprise Score > 75% --> Consistently beating estimates (management under-promises)

**Integration:** Maps to `packages/core/src/scoring/earnings-quality.ts` (new module, persistence section)

---

# 4. RISK METRICS

---

### 19. Value at Risk (VaR)

**Source:** JP Morgan RiskMetrics (1994). Institutionalized by Basel banking regulations. Used by every bank, hedge fund, and institutional investor.
**Category:** Risk
**Purpose:** Estimate the maximum expected portfolio loss over a given time horizon at a specified confidence level.

**Formula:**
```
Parametric VaR (assumes normal distribution):
  VaR_alpha = -(mu_p + z_alpha * sigma_p) * Portfolio_Value

  Where:
    mu_p = expected daily portfolio return
    z_alpha = z-score for confidence level
      95% confidence: z = -1.645
      99% confidence: z = -2.326
    sigma_p = daily portfolio standard deviation

  Portfolio variance:
    sigma_p^2 = w^T * Sigma * w
    Where w = weight vector, Sigma = covariance matrix

  Scaling to different horizons:
    VaR_T_days = VaR_1_day * sqrt(T)

Historical VaR:
  1. Collect N days of historical portfolio returns
  2. Sort returns ascending
  3. VaR_95 = return at percentile rank floor(N * 0.05)
  4. VaR_99 = return at percentile rank floor(N * 0.01)
  5. Convert to dollar amount: VaR_$ = |VaR_%| * Portfolio_Value

Monte Carlo VaR:
  1. Estimate return distribution parameters (mu, sigma, or full distribution)
  2. Generate M simulated return paths (M >= 10,000)
  3. For each simulation, compute portfolio return
  4. Sort simulated returns, take percentile as VaR
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| portfolio_value | Total portfolio market value | USD | Portfolio positions | Yes -- portfolio/summary.ts |
| w | Position weight vector | array of decimals | Portfolio positions | Yes -- portfolio/position.ts |
| daily_returns | Historical daily returns per position | array of arrays | Price history API | No -- needs price data |
| mu_p | Expected daily portfolio return | decimal | Calculated from daily_returns | No -- derived |
| sigma_p | Daily portfolio standard deviation | decimal | Calculated from daily_returns | No -- derived |
| Sigma | Covariance matrix of position returns | matrix | Calculated from daily_returns | No -- derived |
| confidence_level | VaR confidence level | decimal (0.95 or 0.99) | User parameter | No -- new parameter |
| horizon_days | Time horizon for VaR | integer | User parameter (default: 1) | No -- new parameter |

**Interpretation:**
- "95% VaR of $50,000" means: On 95% of days, losses will not exceed $50,000
- "99% VaR of $120,000" means: Only 1 in 100 days should see losses > $120,000
- VaR > 5% of portfolio --> High risk
- VaR > 10% of portfolio --> Extreme risk, consider de-risking
- VaR does NOT capture tail risk (use CVaR for that)

**Integration:** Maps to `packages/core/src/portfolio/stress-test.ts` (new module)

---

### 20. Conditional VaR (CVaR / Expected Shortfall)

**Source:** Artzner et al. (1999), "Coherent Measures of Risk". Required by Basel III banking regulations as supplement to VaR.
**Category:** Risk
**Purpose:** Answer "when losses exceed VaR, how bad are they on average?" CVaR is a coherent risk measure (unlike VaR) and better captures tail risk.

**Formula:**
```
CVaR_alpha = E[Loss | Loss > VaR_alpha]

Historical CVaR:
  1. Identify all returns worse than VaR_alpha
  2. CVaR = average of those returns
  3. CVaR_$ = |CVaR_%| * Portfolio_Value

Parametric CVaR (normal distribution):
  CVaR_alpha = -(mu_p - sigma_p * phi(z_alpha) / (1 - alpha)) * Portfolio_Value

  Where:
    phi(z) = standard normal PDF evaluated at z
    alpha = confidence level (0.95 or 0.99)
    phi(-1.645) / 0.05 = 2.063 (for 95%)
    phi(-2.326) / 0.01 = 2.665 (for 99%)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| var_alpha | VaR at specified confidence | USD or % | Computed from VaR (#19) | No -- from VaR computation |
| returns_beyond_var | All historical returns worse than VaR | array of decimals | Filtered from daily_returns | No -- derived |
| mu_p | Expected portfolio return | decimal | From VaR computation | No -- shared with #19 |
| sigma_p | Portfolio standard deviation | decimal | From VaR computation | No -- shared with #19 |
| alpha | Confidence level | decimal | User parameter | No -- shared with #19 |

**Interpretation:**
- CVaR is always >= VaR (it measures the average of the tail, not just the boundary)
- CVaR/VaR ratio > 1.5 --> Fat tails present, distribution is non-normal
- "95% CVaR of $80,000" means: When losses exceed VaR, expect $80,000 average loss
- CVaR > 8% of portfolio at 95% --> Consider tail-risk hedging

**Integration:** Maps to `packages/core/src/portfolio/stress-test.ts` (new module, alongside VaR)

---

### 21. Maximum Drawdown

**Source:** Standard risk metric used universally across hedge funds and asset management.
**Category:** Risk
**Purpose:** Measure the worst peak-to-trough decline in portfolio value, capturing the magnitude of the worst loss an investor would have experienced.

**Formula:**
```
Maximum Drawdown:
  MDD = min((NAV_t - Max_NAV_up_to_t) / Max_NAV_up_to_t)  for all t

  Equivalently:
  For each day t:
    Running_Max_t = max(NAV_0, NAV_1, ..., NAV_t)
    Drawdown_t = (NAV_t - Running_Max_t) / Running_Max_t
  MDD = min(Drawdown_t)  for all t  (most negative value)

Time to Recovery (TTR):
  TTR = Date_of_New_Peak - Date_of_Trough  (in trading days)

Underwater Duration:
  Duration = Date_of_New_Peak - Date_of_Previous_Peak  (total time underwater)

Ulcer Index (captures both depth and duration):
  UI = sqrt((1/N) * SUM(Drawdown_t^2))  for all t in period
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| nav_series | Daily portfolio net asset value series | array of USD | Portfolio valuations | No -- needs daily tracking |
| nav_t | Portfolio value at time t | USD | Portfolio positions * prices | Yes -- computable from positions |
| running_max | Running maximum NAV | USD | Derived from nav_series | No -- derived |
| drawdown_series | Daily drawdown series | array of decimals | Derived | No -- derived |

**Interpretation:**
- MDD > -10% --> Mild drawdown
- MDD -10% to -20% --> Moderate (typical bear market)
- MDD -20% to -30% --> Severe
- MDD -30% to -50% --> Extreme (2008 GFC territory)
- MDD > -50% --> Catastrophic (concentrated or leveraged portfolio)
- TTR > 252 trading days (1 year) --> Extended recovery period, position sizing was too aggressive
- UI < 5% --> Low pain index; UI > 15% --> High pain index

**Integration:** Maps to `packages/core/src/portfolio/drawdown.ts` (new module)

---

### 22. Sharpe Ratio

**Source:** William Sharpe, Stanford University (1966). Nobel Prize 1990.
**Category:** Risk
**Purpose:** Measure risk-adjusted return by quantifying excess return earned per unit of total risk (volatility). The most widely used risk-adjusted performance metric.

**Formula:**
```
Sharpe_Ratio = (R_p - R_f) / sigma_p

Where:
  R_p = annualized portfolio return
  R_f = annualized risk-free rate
  sigma_p = annualized portfolio standard deviation

Annualization (from daily):
  R_p_annual = (1 + R_p_daily)^252 - 1  (or approximate: R_p_daily * 252)
  sigma_p_annual = sigma_p_daily * sqrt(252)

Ex-ante Sharpe (forward-looking):
  SR = (E[R_p] - R_f) / sigma_p
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| portfolio_returns | Daily or monthly portfolio returns | array of decimals | Portfolio valuation series | No -- needs tracking |
| R_p | Annualized portfolio return | decimal | Calculated from returns | No -- derived |
| R_f | Annualized risk-free rate | decimal | FRED (DTB3 or DGS1) | No -- new macro module |
| sigma_p | Annualized portfolio volatility | decimal | StdDev of returns * sqrt(252) | No -- derived |

**Interpretation:**
- Sharpe < 0 --> Losing money relative to risk-free (very bad)
- Sharpe 0 -- 0.5 --> Poor risk-adjusted returns
- Sharpe 0.5 -- 1.0 --> Acceptable
- Sharpe 1.0 -- 2.0 --> Good (most top hedge funds fall here)
- Sharpe > 2.0 --> Excellent (sustained > 2.0 is rare)
- Sharpe > 3.0 --> Investigate for data errors or extreme leverage

**Integration:** Maps to `packages/core/src/portfolio/risk-ratios.ts` (new module)

---

### 23. Sortino Ratio

**Source:** Frank Sortino, Pension Research Institute (1980s). Improvement over Sharpe that only penalizes downside volatility.
**Category:** Risk
**Purpose:** Measure risk-adjusted return using only downside deviation, which is more relevant to investors who care about losses (not upside "risk").

**Formula:**
```
Sortino_Ratio = (R_p - R_f) / DD

Where:
  DD = Downside_Deviation = sqrt((1/N) * SUM(min(R_t - MAR, 0)^2))
  MAR = Minimum Acceptable Return (often R_f, sometimes 0)
  N = number of periods
  R_t = return in period t

Only negative excess returns contribute to DD.
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| portfolio_returns | Periodic portfolio returns | array of decimals | Portfolio valuation series | No -- needs tracking |
| R_p | Annualized portfolio return | decimal | Calculated | No -- derived |
| R_f | Risk-free rate | decimal | FRED | No -- shared with macro module |
| MAR | Minimum acceptable return | decimal | User parameter (default: R_f) | No -- new parameter |
| downside_returns | Returns below MAR | array of decimals | Filtered from portfolio_returns | No -- derived |

**Interpretation:**
- Sortino > Sharpe --> Portfolio has positive skew (more upside than downside volatility)
- Sortino < Sharpe --> Portfolio has negative skew (more downside risk)
- Sortino < 1.0 --> Inadequate compensation for downside risk
- Sortino 1.0-2.0 --> Good
- Sortino > 2.0 --> Excellent downside-adjusted performance
- Sortino > 3.0 --> Exceptional

**Integration:** Maps to `packages/core/src/portfolio/risk-ratios.ts` (new module)

---

### 24. Calmar Ratio

**Source:** Terry Young, California Managed Accounts Reports newsletter (1991). Name derives from "California Managed Accounts Reports."
**Category:** Risk
**Purpose:** Measure return relative to maximum drawdown risk, directly connecting performance to the worst-case loss experience.

**Formula:**
```
Calmar_Ratio = Annualized_Return / |Maximum_Drawdown|

Where:
  Annualized_Return = CAGR over the measurement period
  Maximum_Drawdown = absolute value of worst peak-to-trough decline

  CAGR = (Ending_Value / Beginning_Value)^(1 / Years) - 1

Standard measurement period: trailing 36 months
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| annualized_return | Portfolio CAGR | decimal | Calculated from NAV series | No -- derived |
| max_drawdown | Maximum drawdown (absolute value) | decimal | From MDD calculation (#21) | No -- shared with #21 |
| nav_series | Daily portfolio NAV | array of USD | Portfolio valuations | No -- needs tracking |
| period_years | Measurement period length | years | Default: 3 | No -- parameter |

**Interpretation:**
- Calmar < 0.5 --> Poor (large drawdowns relative to returns)
- Calmar 0.5-1.0 --> Acceptable
- Calmar 1.0-2.0 --> Good
- Calmar > 2.0 --> Excellent (returns significantly exceed worst drawdown)
- Calmar > 3.0 --> Exceptional (rare, typically low-volatility strategies)

**Integration:** Maps to `packages/core/src/portfolio/risk-ratios.ts` (new module)

---

### 25. Beta (Systematic Risk)

**Source:** William Sharpe (CAPM, 1964), John Lintner (1965). Fundamental concept in modern portfolio theory.
**Category:** Risk
**Purpose:** Measure a stock's or portfolio's sensitivity to overall market movements, quantifying systematic (non-diversifiable) risk.

**Formula:**
```
Beta = Cov(R_stock, R_market) / Var(R_market)

Equivalently:
  Beta = rho(R_stock, R_market) * (sigma_stock / sigma_market)

  Where:
    rho = correlation coefficient
    sigma = standard deviation

Regression form:
  R_stock_t = alpha + beta * R_market_t + epsilon_t
  alpha = Jensen's alpha (excess return not explained by market)
  R^2 = proportion of return variance explained by market

Adjusted Beta (Bloomberg method):
  Adjusted_Beta = (2/3) * Raw_Beta + (1/3) * 1.0
  (Shrinks toward 1.0, accounts for mean-reversion in betas)

Portfolio Beta:
  Beta_portfolio = SUM(w_i * Beta_i)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| stock_returns | Daily stock returns (minimum 252 days) | array of decimals | Price history API | No -- needs price data |
| market_returns | Daily market index returns (e.g., S&P 500) | array of decimals | Price history API (^GSPC) | No -- needs price data |
| w_i | Portfolio weight of position i | decimal | Portfolio positions | Yes -- portfolio/position.ts |
| beta_i | Beta of position i | decimal | Calculated per position | No -- derived |

**Interpretation:**
- Beta = 1.0 --> Moves with the market
- Beta > 1.0 --> More volatile than market (amplifies market moves)
- Beta < 1.0 --> Less volatile than market (defensive)
- Beta < 0 --> Moves opposite to market (rare, hedging asset)
- Beta = 0 --> Uncorrelated with market
- Portfolio Beta > 1.2 --> Aggressive positioning
- Portfolio Beta < 0.8 --> Defensive positioning

**Integration:** Maps to `packages/core/src/portfolio/risk-ratios.ts` (new module)

---

### 26. Correlation Matrix

**Source:** Harry Markowitz, Modern Portfolio Theory (1952). Nobel Prize 1990.
**Category:** Risk / Portfolio
**Purpose:** Identify hidden concentration risk by measuring pairwise correlation between all positions, revealing positions that move together and undermine diversification.

**Formula:**
```
Correlation(A, B) = Cov(R_A, R_B) / (sigma_A * sigma_B)

Where:
  Cov(R_A, R_B) = (1/(N-1)) * SUM((R_A_t - mean_A) * (R_B_t - mean_B))
  sigma_A = StdDev(R_A)
  sigma_B = StdDev(R_B)

Full Correlation Matrix (NxN for N positions):
  C[i][j] = Correlation(R_i, R_j)
  Diagonal = 1.0 (self-correlation)
  Symmetric: C[i][j] = C[j][i]

Portfolio Diversification Ratio:
  DR = SUM(w_i * sigma_i) / sigma_portfolio
  Where sigma_portfolio = sqrt(w^T * Sigma * w)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| returns_matrix | Daily returns for each position (NxT matrix) | matrix of decimals | Price history API | No -- needs price data |
| w | Position weight vector | array of decimals | Portfolio positions | Yes -- portfolio/position.ts |
| sigma_i | Volatility of each position | array of decimals | Derived from returns | No -- derived |
| sigma_portfolio | Portfolio volatility | decimal | Derived from covariance matrix | No -- derived |

**Interpretation:**
- Correlation > 0.80 --> High: effectively the same bet, hidden concentration
- Correlation 0.50-0.80 --> Moderate: some diversification benefit
- Correlation 0.20-0.50 --> Low: good diversification
- Correlation < 0.20 --> Uncorrelated: excellent diversification
- Correlation < 0 --> Negative: natural hedge
- DR < 1.2 --> Poor diversification (portfolio acts like 2-3 positions)
- DR > 2.0 --> Well-diversified
- Red flag: 3+ positions with pairwise correlation > 0.80

**Integration:** Maps to `packages/core/src/portfolio/correlation.ts` (new module)

---

# 5. GROWTH METRICS

---

### 27. Rule of 40

**Source:** Brad Feld, Foundry Group (popularized ~2015). Used by Tiger Global, Coatue, and Bessemer as primary SaaS screening tool. BCG research validates the threshold.
**Category:** Growth
**Purpose:** Screen software/SaaS companies by combining growth rate and profitability into a single metric. Companies above 40 are either growing fast enough or profitable enough to be attractive.

**Formula:**
```
Rule_of_40 = Revenue_Growth_Rate_Pct + Profit_Margin_Pct

Preferred variants (in order of reliability):
  1. Revenue_Growth_YoY + FCF_Margin
  2. Revenue_Growth_YoY + EBITDA_Margin
  3. Revenue_Growth_YoY + Operating_Margin

Where:
  Revenue_Growth_YoY = (Revenue_Current - Revenue_Prior) / Revenue_Prior * 100
  FCF_Margin = FCF / Revenue * 100
  EBITDA_Margin = EBITDA / Revenue * 100
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| revenue_current | Current period revenue | USD | Income Statement | Yes -- Financial model |
| revenue_prior | Prior period revenue | USD | Historical Financial record | Yes -- Financial model (prior year) |
| fcf | Free cash flow | USD | Cash Flow Statement | Yes -- Financial model |
| ebitda | EBITDA | USD | Income Statement | Yes -- Financial model |

**Interpretation:**
- Score > 60% --> Elite (top quartile SaaS, e.g., growing 40% with 20% margins)
- Score > 40% --> Healthy, passing the threshold
- Score 20-40% --> Below threshold, must be trending upward to justify investment
- Score < 20% --> Failing, neither growing fast enough nor profitable enough

**Integration:** Maps to `packages/core/src/scoring/rule-of-40.ts` (new module)

---

### 28. Net Revenue Retention (NRR)

**Source:** SaaS industry standard. Key metric tracked by Bessemer Venture Partners, Tiger Global, Coatue Management.
**Category:** Growth / Quality
**Purpose:** Measure revenue growth from existing customers over time, the single best indicator of product-market fit and pricing power in subscription businesses.

**Formula:**
```
NRR = (Starting_MRR + Expansion_MRR - Contraction_MRR - Churned_MRR) / Starting_MRR * 100

Where all figures are for the SAME customer cohort measured over 12 months:
  Starting_MRR = Monthly recurring revenue at start of period from that cohort
  Expansion_MRR = Additional revenue from upsells/cross-sells to same customers
  Contraction_MRR = Revenue reduction from downgrades by same customers
  Churned_MRR = Revenue lost from customers who cancelled entirely

Gross Revenue Retention (GRR) -- excludes expansion:
  GRR = (Starting_MRR - Contraction_MRR - Churned_MRR) / Starting_MRR * 100
  GRR is always <= 100% and always <= NRR
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| starting_mrr | Cohort MRR at period start | USD | Company SaaS metrics / 10-K | No -- manual input |
| expansion_mrr | Expansion revenue from existing customers | USD | Company SaaS metrics | No -- manual input |
| contraction_mrr | Revenue lost to downgrades | USD | Company SaaS metrics | No -- manual input |
| churned_mrr | Revenue lost to cancellations | USD | Company SaaS metrics | No -- manual input |

**Interpretation:**
- NRR > 130% --> Exceptional (customers spending 30%+ more each year, e.g., Snowflake ~158%)
- NRR 120-130% --> Strong (e.g., Datadog ~130%)
- NRR 100-120% --> Healthy, net expansion from existing base
- NRR < 100% --> Shrinking: losing more from existing customers than gaining
- GRR > 90% --> Low churn, sticky product
- GRR < 80% --> High churn, product-market fit concern

**Integration:** Maps to `packages/core/src/scoring/net-revenue-retention.ts` (new module)

---

### 29. CAC/LTV Ratio

**Source:** David Skok (Matrix Partners), standardized by SaaS venture capital industry. Core unit economics metric.
**Category:** Growth
**Purpose:** Determine whether a company is spending its customer acquisition dollars efficiently by comparing the cost to acquire a customer against the total revenue that customer generates over their lifetime.

**Formula:**
```
Customer Acquisition Cost:
  CAC = Total_Sales_and_Marketing_Spend / New_Customers_Acquired

Customer Lifetime Value:
  LTV = ARPU * Gross_Margin_Pct * (1 / Monthly_Churn_Rate)

  Alternatively:
  LTV = ARPU * Gross_Margin_Pct * Average_Customer_Lifespan_Months

LTV/CAC Ratio:
  LTV_CAC = LTV / CAC

CAC Payback Period:
  Payback_Months = CAC / (Monthly_ARPU * Gross_Margin_Pct)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| sales_marketing_spend | Total S&M expense for period | USD | Income Statement | No -- needs SGA breakdown |
| new_customers | Number of new customers acquired | count | Company metrics / 10-K | No -- manual input |
| arpu_monthly | Average revenue per user per month | USD | Derived or reported | No -- manual input |
| gross_margin_pct | Gross margin percentage | decimal | Income Statement | No -- derivable if COGS added |
| monthly_churn_rate | Monthly customer churn rate | decimal | Company metrics | No -- manual input |
| avg_customer_lifespan | Average months a customer stays | months | 1 / monthly_churn_rate | No -- derived |

**Interpretation:**
- LTV/CAC > 5.0 --> Excellent, very efficient customer acquisition
- LTV/CAC 3.0-5.0 --> Healthy (3.0 is the standard benchmark)
- LTV/CAC 1.0-3.0 --> Below optimal, acquisition may not pay for itself quickly
- LTV/CAC < 1.0 --> Losing money on every customer acquired
- Payback < 12 months --> Healthy
- Payback 12-18 months --> Acceptable
- Payback > 24 months --> Danger, cash-intensive growth

**Integration:** Maps to `packages/core/src/scoring/unit-economics.ts` (new module)

---

### 30. TAM/SAM/SOM Analysis

**Source:** Sequoia Capital's standard market-sizing framework. Used by every venture capital firm.
**Category:** Growth
**Purpose:** Assess the maximum revenue opportunity for a business to determine whether the market is large enough to generate venture-scale (or public-market-relevant) returns.

**Formula:**
```
Top-Down:
  TAM = Total_Industry_Revenue * Addressable_Percentage
  SAM = TAM * Segment_Reachable_Percentage
  SOM = SAM * Realistic_Market_Share_Percentage

Bottom-Up (more credible):
  TAM = Number_of_Potential_Customers * Annual_Revenue_Per_Customer
  SAM = Reachable_Customers * Annual_Revenue_Per_Customer
  SOM = Current_Customers * ARPU * (1 + Growth_Rate)

Value Theory:
  TAM = Value_Created_for_Customer * Number_of_Customers * Value_Capture_Rate
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| total_industry_revenue | Total industry revenue | USD | IBISWorld, Statista, government data | No -- manual input |
| addressable_pct | Percentage of industry actually addressable | decimal | Analyst estimate | No -- manual input |
| reachable_pct | Percentage of TAM reachable given go-to-market | decimal | Analyst estimate | No -- manual input |
| market_share_pct | Realistic market share achievable | decimal | Competitive analysis | No -- manual input |
| potential_customers | Total number of potential customers | count | Industry data | No -- manual input |
| arpu_annual | Annual revenue per customer | USD | Company data | No -- manual input |
| current_customers | Current customer count | count | Company data | No -- manual input |
| growth_rate | Expected growth rate | decimal | Analyst estimate | No -- manual input |

**Interpretation:**
- TAM > $10B --> Large market (public-market relevant)
- TAM $1-10B --> Medium market (niche but viable)
- TAM < $1B --> Small market (limited scale potential)
- SOM/SAM > 20% --> Dominant position
- SOM/SAM 5-20% --> Strong position
- SOM/SAM < 5% --> Early stage or commoditized
- Sequoia threshold: Can the company chart a path to $500M+ annual revenue?

**Integration:** Maps to `packages/core/src/private-markets/tam-analysis.ts` (new module)

---

### 31. Unit Economics Model

**Source:** David Skok (Matrix Partners), Bill Gurley (Benchmark Capital). Foundation of growth-stage company valuation.
**Category:** Growth
**Purpose:** Analyze per-customer profitability to determine whether scaling the business creates value or destroys it.

**Formula:**
```
Unit Economics P&L (per customer):
  Revenue_Per_Customer = ARPU * Months_Active
  COGS_Per_Customer = Direct_Cost * Months_Active
  Gross_Profit_Per_Customer = Revenue_Per_Customer - COGS_Per_Customer
  Contribution_Margin = Gross_Profit_Per_Customer - CAC
  Contribution_Margin_Ratio = Contribution_Margin / Revenue_Per_Customer

Fully-Loaded Unit Economics:
  Fully_Loaded_CAC = (Sales_Marketing + Onboarding_Cost) / New_Customers
  Fully_Loaded_LTV = ARPU * Gross_Margin * Avg_Lifespan - Ongoing_Support_Cost
  Net_Unit_Margin = Fully_Loaded_LTV - Fully_Loaded_CAC

Magic Number (SaaS sales efficiency):
  Magic_Number = Net_New_ARR / Prior_Quarter_Sales_Marketing_Spend
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| arpu | Average revenue per user (monthly) | USD | Company metrics | No -- manual input |
| direct_cost_per_customer | Direct cost to serve per customer per month | USD | COGS breakdown | No -- manual input |
| cac | Customer acquisition cost | USD | From CAC calculation (#29) | No -- shared with #29 |
| onboarding_cost | Average onboarding cost per customer | USD | Company operations data | No -- manual input |
| avg_lifespan | Average customer lifespan in months | months | From churn rate | No -- shared with #29 |
| gross_margin | Gross margin percentage | decimal | Income Statement | No -- derivable |
| ongoing_support_cost | Ongoing support cost per customer over lifetime | USD | Company operations data | No -- manual input |
| net_new_arr | Net new annual recurring revenue | USD | Company SaaS metrics | No -- manual input |
| prior_q_sm_spend | Prior quarter sales & marketing spend | USD | Income Statement | No -- needs quarterly data |

**Interpretation:**
- Contribution_Margin_Ratio > 30% --> Strong unit economics
- Contribution_Margin_Ratio 10-30% --> Acceptable, improving with scale
- Contribution_Margin_Ratio < 10% --> Weak, need scale or pricing improvement
- Magic_Number > 1.0 --> Efficient, invest more in sales
- Magic_Number 0.5-1.0 --> Acceptable
- Magic_Number < 0.5 --> Inefficient sales spend

**Integration:** Maps to `packages/core/src/scoring/unit-economics.ts` (new module)

---

# 6. MOMENTUM / TECHNICAL

---

### 32. Relative Strength Index (RSI)

**Source:** J. Welles Wilder Jr. (1978), "New Concepts in Technical Trading Systems."
**Category:** Momentum
**Purpose:** Identify overbought and oversold conditions in a stock's price by measuring the speed and magnitude of recent price movements.

**Formula:**
```
RS = Average_Gain_N / Average_Loss_N

RSI = 100 - (100 / (1 + RS))

Where:
  First calculation (simple average):
    Average_Gain_N = SUM(gains over N periods) / N
    Average_Loss_N = SUM(|losses| over N periods) / N

  Subsequent (exponential smoothing):
    Average_Gain_t = (Previous_Avg_Gain * (N-1) + Current_Gain) / N
    Average_Loss_t = (Previous_Avg_Loss * (N-1) + Current_Loss) / N

  Standard N = 14 periods (days)
  Gain = max(Close_t - Close_t-1, 0)
  Loss = max(Close_t-1 - Close_t, 0)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| close_prices | Daily closing prices (minimum N+1 days) | array of USD | Price history API | No -- needs price data |
| N | RSI lookback period | integer (default: 14) | Parameter | No -- new parameter |

**Interpretation:**
- RSI > 70 --> Overbought (potential sell signal or short-term pullback)
- RSI 50-70 --> Bullish territory
- RSI 30-50 --> Bearish territory
- RSI < 30 --> Oversold (potential buy signal for value investors)
- RSI divergence from price --> Trend reversal signal (e.g., price makes new high but RSI does not)

**Integration:** Maps to `packages/core/src/screener/momentum.ts` (new module)

---

### 33. MACD (Moving Average Convergence Divergence)

**Source:** Gerald Appel (1979). One of the most widely used technical indicators.
**Category:** Momentum
**Purpose:** Identify changes in trend momentum, direction, and strength by analyzing the relationship between two exponential moving averages.

**Formula:**
```
MACD_Line = EMA_12(Close) - EMA_26(Close)
Signal_Line = EMA_9(MACD_Line)
Histogram = MACD_Line - Signal_Line

Where:
  EMA_N(t) = Close_t * k + EMA_N(t-1) * (1 - k)
  k = 2 / (N + 1)  (smoothing factor)

  For EMA_12: k = 2/13 = 0.1538
  For EMA_26: k = 2/27 = 0.0741
  For EMA_9:  k = 2/10 = 0.2000

Initial EMA = SMA for the first N periods:
  SMA_N = (1/N) * SUM(Close_t, t=1..N)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| close_prices | Daily closing prices (minimum 35 days for initial EMA_26 + signal) | array of USD | Price history API | No -- needs price data |

**Interpretation:**
- MACD crosses above Signal Line --> Bullish signal (buy)
- MACD crosses below Signal Line --> Bearish signal (sell)
- Histogram positive and growing --> Strengthening bullish momentum
- Histogram negative and growing more negative --> Strengthening bearish momentum
- MACD divergence from price --> Trend reversal warning
- Zero-line crossover (MACD crosses 0) --> Confirms trend change

**Integration:** Maps to `packages/core/src/screener/momentum.ts` (new module)

---

### 34. Moving Average Crossover (50/200 Day)

**Source:** Standard technical analysis. The "Golden Cross" and "Death Cross" patterns are among the most widely followed signals by institutional and retail investors.
**Category:** Momentum
**Purpose:** Identify long-term trend direction changes by detecting when the shorter-term moving average crosses the longer-term moving average.

**Formula:**
```
SMA_50 = (1/50) * SUM(Close_t, t=-49..0)
SMA_200 = (1/200) * SUM(Close_t, t=-199..0)

Signals:
  Golden_Cross = SMA_50 crosses ABOVE SMA_200  (bullish)
  Death_Cross = SMA_50 crosses BELOW SMA_200  (bearish)

  Detection:
    IF SMA_50_today > SMA_200_today AND SMA_50_yesterday <= SMA_200_yesterday:
      signal = "GOLDEN_CROSS"
    IF SMA_50_today < SMA_200_today AND SMA_50_yesterday >= SMA_200_yesterday:
      signal = "DEATH_CROSS"

Price relative to MAs:
  Price_vs_SMA200 = (Close - SMA_200) / SMA_200 * 100
  Percent above/below the 200-day moving average
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| close_prices | Daily closing prices (minimum 201 days) | array of USD | Price history API | No -- needs price data |

**Interpretation:**
- Golden Cross --> Long-term bullish signal, historically market gains average 10%+ in following 12 months
- Death Cross --> Long-term bearish signal, risk of extended decline
- Price > SMA_200 --> Stock in uptrend
- Price < SMA_200 --> Stock in downtrend
- Price > 20% above SMA_200 --> Extended, potential mean reversion risk
- Price > 20% below SMA_200 --> Deeply oversold (for value investors: investigate)

**Integration:** Maps to `packages/core/src/screener/momentum.ts` (new module)

---

### 35. Mean Reversion Z-Score

**Source:** Statistical arbitrage community. Used by Renaissance Technologies, DE Shaw, Two Sigma for pairs trading and mean-reversion strategies.
**Category:** Momentum
**Purpose:** Quantify how far a price (or spread) has deviated from its statistical mean, identifying extreme deviations that are likely to revert.

**Formula:**
```
Z-Score:
  Z = (Price - SMA_N) / StdDev_N

  Where:
    SMA_N = simple moving average over N periods
    StdDev_N = standard deviation over same N periods
    Standard N = 20 days (for Bollinger Bands) or 60-120 days (for value investors)

Bollinger Bands:
  Upper_Band = SMA_20 + 2 * StdDev_20
  Lower_Band = SMA_20 - 2 * StdDev_20
  %B = (Price - Lower_Band) / (Upper_Band - Lower_Band)

Fundamental Z-Score (valuation mean reversion):
  Z_valuation = (Current_PE - Mean_PE_10yr) / StdDev_PE_10yr
  (Applies mean reversion to valuation multiples rather than prices)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| close_prices | Daily closing prices (minimum N days) | array of USD | Price history API | No -- needs price data |
| N | Lookback period for mean and StdDev | integer (default: 20 or 60) | Parameter | No -- new parameter |
| pe_ratio_history | Historical P/E ratios (for valuation Z-score) | array of ratios | Historical financials + prices | No -- derivable |

**Interpretation:**
- |Z| > 2.0 --> Price significantly deviates from mean (reversion entry signal)
- |Z| > 2.5 --> Strong reversion signal
- |Z| > 3.0 --> Extreme deviation, investigate for fundamental reason vs mean-reversion opportunity
- Z returns to 0 --> Mean reversion complete (exit signal)
- %B < 0 --> Below lower Bollinger Band (oversold)
- %B > 1 --> Above upper Bollinger Band (overbought)
- Z_valuation > 2.0 --> Valuation multiple significantly above historical average (expensive)
- Z_valuation < -2.0 --> Significantly below (potential value opportunity)

**Integration:** Maps to `packages/core/src/screener/mean-reversion.ts` (new module)

---

# 7. PORTFOLIO ANALYTICS

---

### 36. Portfolio Attribution Analysis (Brinson Model)

**Source:** Brinson, Hood, and Beebower (1986), "Determinants of Portfolio Performance." Standard institutional performance attribution methodology.
**Category:** Portfolio
**Purpose:** Decompose portfolio outperformance (or underperformance) versus a benchmark into allocation effect (sector bets), selection effect (stock picking), and interaction effect.

**Formula:**
```
Total_Active_Return = R_portfolio - R_benchmark

Allocation_Effect = SUM[(w_p_i - w_b_i) * R_b_i]  for all sectors i
  "Did you overweight the right sectors?"

Selection_Effect = SUM[w_b_i * (R_p_i - R_b_i)]  for all sectors i
  "Did you pick the right stocks within each sector?"

Interaction_Effect = SUM[(w_p_i - w_b_i) * (R_p_i - R_b_i)]  for all sectors i
  "Joint effect of overweighting sectors where you also outperformed"

Verification:
  Total_Active_Return = Allocation_Effect + Selection_Effect + Interaction_Effect

Where:
  w_p_i = portfolio weight in sector i
  w_b_i = benchmark weight in sector i
  R_p_i = portfolio return in sector i
  R_b_i = benchmark return in sector i
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| w_p_i | Portfolio weight per sector | decimal | Aggregated from positions | Yes -- derivable from portfolio/position.ts |
| w_b_i | Benchmark weight per sector | decimal | Benchmark composition (e.g., S&P 500) | No -- needs benchmark data |
| R_p_i | Portfolio return per sector | decimal | Calculated from position returns | No -- needs return tracking |
| R_b_i | Benchmark return per sector | decimal | Benchmark sector returns | No -- needs benchmark data |

**Interpretation:**
- Positive Allocation Effect --> Good sector bets (overweighted outperforming sectors)
- Positive Selection Effect --> Good stock picking (outperformed within sectors)
- Large Interaction Effect --> Skill or luck in combining sector and stock bets
- Selection dominates Allocation --> Bottom-up stock picker
- Allocation dominates Selection --> Top-down macro-driven returns

**Integration:** Maps to `packages/core/src/portfolio/attribution.ts` (new module)

---

### 37. Risk Budgeting

**Source:** Risk Metrics Group, MSCI. Standard institutional portfolio management framework.
**Category:** Portfolio
**Purpose:** Allocate a total portfolio risk budget (target volatility) across positions and sectors, ensuring no single position or sector consumes a disproportionate share of the risk allowance.

**Formula:**
```
Total Portfolio Risk Budget:
  Target_Volatility = user-defined (e.g., 12% annualized)

Marginal Risk Contribution of position i:
  MRC_i = (Sigma * w)_i / sigma_portfolio

Risk Contribution of position i:
  RC_i = w_i * MRC_i = w_i * (Sigma * w)_i / sigma_portfolio

Percentage Risk Contribution:
  PRC_i = RC_i / sigma_portfolio * 100

Risk Budget Constraints:
  SUM(RC_i) = sigma_portfolio = Target_Volatility
  Max per position: RC_i <= 0.15 * Target_Volatility (no single position > 15% of risk)
  Max per sector: SUM(RC_j in sector) <= 0.35 * Target_Volatility (no sector > 35%)

Position Sizing from Risk Budget:
  w_i = Risk_Budget_i / (Beta_i * sigma_portfolio)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| target_volatility | Portfolio target annualized volatility | decimal | User input (e.g., 0.12) | No -- new parameter |
| w | Position weight vector | array of decimals | Portfolio positions | Yes -- portfolio/position.ts |
| Sigma | Covariance matrix | matrix | Calculated from returns | No -- shared with #3 and #26 |
| sigma_portfolio | Portfolio volatility | decimal | sqrt(w^T * Sigma * w) | No -- derived |
| beta_i | Beta of each position | decimal | From Beta calculation (#25) | No -- shared with #25 |
| sector_mapping | Sector assignment per position | mapping | Position metadata | No -- needs sector data |

**Interpretation:**
- Any position > 20% of total risk --> Concentration warning
- Any sector > 35% of total risk --> Sector concentration warning
- Actual portfolio volatility > Target + 2% --> Over-budget, needs rebalancing
- If high-conviction position consumes > 15% risk, explicitly acknowledge risk budget override

**Integration:** Maps to `packages/core/src/portfolio/risk-budget.ts` (new module)

---

### 38. Drawdown Recovery Analysis

**Source:** Standard institutional risk analytics. Every hedge fund and institutional investor tracks recovery metrics.
**Category:** Portfolio
**Purpose:** Analyze the time required to recover from drawdowns and the pattern of recovery, providing insight into portfolio resilience and position sizing appropriateness.

**Formula:**
```
For each drawdown event:

Drawdown Magnitude:
  DD_magnitude = (Trough_NAV - Peak_NAV) / Peak_NAV

Time to Trough:
  T_decline = Date_Trough - Date_Peak  (in trading days)

Time to Recovery:
  T_recovery = Date_New_Peak - Date_Trough  (in trading days)
  If not yet recovered: T_recovery = "ongoing"

Total Underwater Period:
  T_underwater = T_decline + T_recovery

Recovery Ratio:
  Recovery_Ratio = T_recovery / T_decline
  (How long it takes to recover relative to how long the decline lasted)

Required Recovery Return:
  R_required = -1 / (1 + DD_magnitude) + 1
  (e.g., a -50% drawdown requires a +100% gain to recover)

  More precisely:
  R_required = (Peak_NAV / Trough_NAV) - 1

Pain Index (comprehensive):
  Pain_Index = (1/N) * SUM(|Drawdown_t|)  for all t in period
  (Average of absolute drawdowns -- penalizes both depth and duration)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| nav_series | Daily portfolio NAV | array of USD | Portfolio valuations | No -- needs daily tracking |
| drawdown_events | List of peak-trough-recovery tuples | array of objects | Derived from nav_series | No -- derived |
| peak_dates | Dates of portfolio peaks | array of dates | Derived | No -- derived |
| trough_dates | Dates of portfolio troughs | array of dates | Derived | No -- derived |
| recovery_dates | Dates of new peaks after troughs | array of dates | Derived | No -- derived |

**Interpretation:**
- Recovery_Ratio < 1.0 --> Fast recovery (V-shaped), healthy portfolio construction
- Recovery_Ratio 1.0-2.0 --> Normal recovery
- Recovery_Ratio > 2.0 --> Slow recovery, potential position sizing issue
- Recovery_Ratio > 3.0 --> Very slow, fundamental damage to portfolio thesis
- Required Recovery after -20%: +25%; after -33%: +50%; after -50%: +100%
- Pain_Index < 3% --> Low pain; > 10% --> High pain, portfolio too volatile for investor risk tolerance

**Integration:** Maps to `packages/core/src/portfolio/drawdown.ts` (new module, alongside MDD from #21)

---

# 8. ALTERNATIVE SIGNALS

---

### 39. Insider Transaction Score

**Source:** SEC Form 4 filings (public data). Studied extensively by Lakonishok & Lee (2001) and others. Used by Insider Monkey, WhaleWisdom, and institutional investors.
**Category:** Sentiment / Alternative
**Purpose:** Score insider buying and selling patterns as investment signals. Insiders buying is one of the strongest bullish signals; clustered insider buying is even more powerful.

**Formula:**
```
Per-Transaction Signal Score:
  +5: Open market purchase (strongest signal)
  +3: 10b5-1 plan purchase
  +1: Option exercise + hold
  -1: Option exercise + sell (routine, weakest signal)
  -2: Open market sale (moderate bearish)
  -3: Large open market sale (> $1M)

Seniority Weighting:
  CEO / Chairman: 3.0x
  CFO / COO: 2.0x
  Directors: 1.5x
  VP and below: 1.0x

Cluster Bonus (within trailing 30 days):
  3+ insiders buying: +15 bonus
  5+ insiders buying: +25 bonus
  CEO + CFO both buying: +10 bonus

Composite Score:
  Insider_Score = SUM(Transaction_Signal * Seniority_Weight) + Cluster_Bonus

Magnitude Adjustment:
  Purchase > 10% of insider's reported holdings: multiply score by 1.5
  Purchase > 25% of insider's reported holdings: multiply score by 2.0
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| transaction_type | Type of insider transaction | enum | SEC EDGAR Form 4 (free API) | No -- new data source |
| transaction_amount | Dollar amount of transaction | USD | SEC EDGAR Form 4 | No -- new data source |
| insider_role | Title/role of insider | string | SEC EDGAR Form 4 | No -- new data source |
| transaction_date | Date of transaction | date | SEC EDGAR Form 4 | No -- new data source |
| insider_holdings | Total holdings of insider before transaction | shares | SEC EDGAR Form 4 | No -- new data source |
| shares_transacted | Number of shares in transaction | shares | SEC EDGAR Form 4 | No -- new data source |
| is_10b5_1 | Whether transaction is under a 10b5-1 plan | boolean | SEC EDGAR Form 4 | No -- new data source |

**Interpretation:**
- Score > 30 --> Strong buy signal (insiders are loading up)
- Score 15-30 --> Moderate bullish signal
- Score -15 to 15 --> Neutral (routine transactions)
- Score < -15 --> Bearish signal (insiders exiting)
- Clustered buying + stock near 52-week low --> Very strong contrarian buy signal
- Clustered selling + stock near 52-week high --> Consider taking profits

**Integration:** Maps to `packages/core/src/data/insider-signals.ts` (new module)

---

### 40. Short Interest Signal

**Source:** FINRA short interest data (published semi-monthly). Used by hedge funds, momentum investors, and risk managers.
**Category:** Sentiment / Alternative
**Purpose:** Assess short-selling pressure on a stock as both a risk indicator (what do shorts know?) and an opportunity indicator (potential short squeeze).

**Formula:**
```
Short Interest Ratio (Days to Cover):
  DTC = Shares_Sold_Short / Average_Daily_Volume

Short Interest as % of Float:
  SI_Pct = Shares_Short / Float * 100

Short Squeeze Probability Score (0-100):
  Base_Score = 0
  IF SI_Pct > 15%: Base_Score += 25
  IF SI_Pct > 25%: Base_Score += 15 (additional)
  IF DTC > 5: Base_Score += 20
  IF DTC > 10: Base_Score += 10 (additional)
  IF price_near_52wk_high: Base_Score += 15
  IF recent_positive_catalyst: Base_Score += 15

Cost to Borrow (CTB) Signal:
  CTB_annual = Borrow_Fee_Rate
  CTB > 20%: Extreme (shorts very confident or crowded)
  CTB > 50%: Unsustainable short position
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| shares_short | Number of shares sold short | shares | FINRA (semi-monthly, 10-day lag) | No -- new data source |
| float | Public float | shares | Company filings / API | No -- needs addition |
| avg_daily_volume | Average daily trading volume (30-day) | shares | Price/volume API | No -- needs price data |
| price_52wk_high | 52-week high price | USD | Price API | No -- needs price data |
| current_price | Current share price | USD | Price API | Yes -- via API |
| borrow_fee_rate | Annual cost to borrow shares for shorting | percentage | Prime brokerage data / Interactive Brokers | No -- specialized data |

**Interpretation:**
- SI_Pct < 5% --> Low short interest, no signal
- SI_Pct 5-15% --> Moderate, some skepticism
- SI_Pct 15-25% --> High, investigate the short thesis
- SI_Pct > 25% --> Extreme, potential squeeze OR shorts see something fundamental
- DTC < 3 --> Low squeeze potential
- DTC 5-10 --> Elevated squeeze potential
- DTC > 10 --> Extreme squeeze potential
- Value investor warning: IF SI_Pct > 20% on a stock you are buying --> REQUIRE extra due diligence on the bear thesis

**Integration:** Maps to `packages/core/src/data/short-interest.ts` (new module)

---

### 41. ESG Composite Score

**Source:** SASB (Sustainability Accounting Standards Board) materiality framework + TCFD (Task Force on Climate-Related Financial Disclosures). Used by BlackRock, Vanguard, and all major asset managers.
**Category:** Alternative / Quality
**Purpose:** Score a company's environmental, social, and governance performance with a focus on financially material ESG factors, and integrate into valuation as a risk discount or premium.

**Formula:**
```
ESG_Composite = SASB_Material_Score * 0.60
              + TCFD_Climate_Score * 0.25
              + Controversy_Score * 0.15

SASB Material Score (industry-specific, scored 1-5 per factor):
  SASB_Material_Score = AVG(Material_Factor_Scores)
  Each industry has 3-7 material factors defined by SASB
  Score each factor: 1 = poor, 2 = below avg, 3 = average, 4 = good, 5 = leader

TCFD Climate Score (scored 1-5 per pillar):
  TCFD_Score = (
    Governance * 0.15 +
    Strategy * 0.30 +
    Risk_Management * 0.25 +
    Metrics_Targets * 0.30
  )

Controversy Score (1-5, inverted -- lower controversy = higher score):
  5 = No controversies
  4 = Minor controversies
  3 = Moderate issues
  2 = Significant controversies
  1 = Severe controversies (lawsuits, regulatory action, environmental disaster)

Valuation Adjustment:
  IF ESG_Composite < 2.0: Apply 15-20% valuation discount
  IF ESG_Composite 2.0-3.0: Apply 5-10% discount
  IF ESG_Composite 3.0-4.0: No adjustment
  IF ESG_Composite > 4.0: No adjustment (potential premium for ESG-focused buyers)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| sasb_factor_scores | Scores for each material SASB factor | array of 1-5 | Manual assessment / MSCI ESG | No -- manual input |
| industry_sasb_factors | List of material factors for industry | array of strings | SASB standards (public) | No -- reference data |
| tcfd_governance | TCFD governance pillar score | 1-5 | Manual from company disclosures | No -- manual input |
| tcfd_strategy | TCFD strategy pillar score | 1-5 | Manual from company disclosures | No -- manual input |
| tcfd_risk_mgmt | TCFD risk management pillar score | 1-5 | Manual from company disclosures | No -- manual input |
| tcfd_metrics | TCFD metrics and targets pillar score | 1-5 | Manual from company disclosures / CDP | No -- manual input |
| controversy_score | Controversy assessment | 1-5 | News analysis / RepRisk | No -- manual input |

**Interpretation:**
- ESG > 4.0 --> Leader, no valuation adjustment needed
- ESG 3.0-4.0 --> Average, monitor trends
- ESG 2.0-3.0 --> Below average, apply 5-10% valuation discount for risk
- ESG < 2.0 --> Poor, apply 15-20% discount or consider exclusion
- Sector-relative scoring more meaningful than absolute (compare to industry peers)

**Integration:** Maps to `packages/core/src/scoring/esg.ts` (new module)

---

### 42. Capital Allocation Scoring (Berkshire Method)

**Source:** Warren Buffett, Berkshire Hathaway. Framework articulated in annual letters (1984-present) and codified by William Thorndike in "The Outsiders" (2012).
**Category:** Quality / Alternative
**Purpose:** Evaluate how effectively management deploys capital across the five options available to them, focusing on whether reinvested earnings generate returns above the cost of capital.

**Formula:**
```
Five Capital Allocation Levers (each scored 0-10):

1. Reinvestment Score:
   IF Incremental_ROIC > WACC + 5%:  +3 points
   IF Revenue_Growth > Industry_Avg:  +3 points
   IF Capex generating returns within 3 years:  +4 points

   Incremental_ROIC = Delta_NOPAT / Delta_Invested_Capital (over 3 years)

2. Acquisition Score:
   IF Avg_Acquisition_Price < 10x EBITDA:  +3 points
   IF Post-acquisition ROIC maintained (within 2% of pre-acq):  +4 points
   IF No value-destructive deal > 20% of market cap:  +3 points

3. Debt Management Score:
   IF Debt/EBITDA < 2.0x:  +4 points
   IF Interest coverage > 5x:  +3 points
   IF Debt reduction when rates rising:  +3 points

4. Buyback Score:
   IF Bought back stock when P/E < 5yr avg P/E:  +5 points
   IF Buybacks consistent (not just during peaks):  +3 points
   IF Net share count reduced > 2% per year:  +2 points

5. Dividend Score:
   IF Dividend payout ratio < 50% (retained for reinvestment):  +3 points
   IF Dividend growing > inflation:  +3 points
   IF No dividend cut in past 10 years:  +4 points

Composite Capital Allocation Grade:
  Total = Reinvestment + Acquisition + Debt + Buyback + Dividend
  A (40-50): Exceptional allocator (Buffett/Malone/Singleton class)
  B (30-39): Good
  C (20-29): Average
  D (10-19): Below average
  F (0-9): Poor, value destroyer

ROIC on Reinvested Earnings (Buffett's Key Test):
  ROIC_reinvested = (EPS_current - EPS_5yr_ago) / Cumulative_Retained_EPS_5yr
  (Measures what return management earned on the earnings they kept)
```

**Variables:**

| Variable | Description | Unit | Source | Already in System? |
|----------|-------------|------|--------|-------------------|
| incremental_roic | Change in NOPAT / Change in invested capital (3yr) | decimal | Derived from financials | No -- needs multi-year data |
| revenue_growth | Revenue CAGR | decimal | Historical Financial records | Yes -- derivable from Financial model |
| industry_avg_growth | Industry average revenue growth | decimal | Industry data / manual | No -- manual input |
| acquisition_prices | Historical acquisition multiples | array of multiples | 10-K, press releases | No -- manual input |
| post_acq_roic | ROIC after each major acquisition | decimal | Historical financials | No -- manual analysis |
| debt_to_ebitda | Net Debt / EBITDA | ratio | Balance Sheet + Income Statement | Partial -- debt and ebitda in Financial model |
| interest_coverage | EBIT / Interest Expense | ratio | Income Statement | No -- needs interest expense |
| buyback_history | Share repurchase amounts by year | array of USD | Cash Flow Statement / 10-K | No -- manual input |
| pe_5yr_avg | 5-year average P/E ratio | ratio | Historical data | No -- needs calculation |
| share_count_history | Diluted shares outstanding by year | array | Historical financials | Partial -- in ValuationInputs |
| dividend_history | Annual dividends per share by year | array of USD | Historical financials | No -- needs addition |
| eps_5yr_history | EPS for last 5 years | array of USD | Historical financials | Partial |
| retained_eps_5yr | Cumulative retained EPS over 5 years | USD | EPS - DPS, summed | No -- derived |

**Interpretation:**
- Grade A (40-50) --> World-class capital allocator, buy with high conviction
- Grade B (30-39) --> Good management, standard investment case
- Grade C (20-29) --> Average, management is not a positive catalyst
- Grade D (10-19) --> Below average, discount valuation by 10-15%
- Grade F (0-9) --> Poor allocator, avoid or require activist involvement
- ROIC_reinvested > 15% --> Management creating significant value with retained earnings
- ROIC_reinvested < 8% --> Management destroying value, should return capital to shareholders

**Integration:** Maps to `packages/core/src/scoring/capital-allocation.ts` (new module)

---

# APPENDIX A: MODULE FILE STRUCTURE

```
packages/core/src/
+-- macro/                              (NEW DIRECTORY)
|   +-- cycle-score.ts                  (#1 Howard Marks)
|   +-- cycle-position.ts              (#2 Bridgewater)
|   +-- cape-ratio.ts                  (#4 Shiller CAPE)
|   +-- credit-spreads.ts             (#5 Credit Spread)
|   +-- yield-curve.ts                (#6 Yield Curve)
|   +-- vix-indicator.ts             (#7 VIX)
|   +-- index.ts
|
+-- scoring/
|   +-- altman-z.ts                    (existing)
|   +-- beneish-m.ts                   (existing)
|   +-- piotroski-f.ts                 (existing)
|   +-- composite.ts                   (existing)
|   +-- valuation.ts                   (existing -- extend with #12 EV/FCF, #13 PEG)
|   +-- roic-tree.ts                   (NEW -- #8)
|   +-- owner-earnings.ts             (NEW -- #11)
|   +-- earnings-quality.ts           (NEW -- #15 Sloan, #16 CCS, #17 RevQual, #18 Persistence)
|   +-- rule-of-40.ts                 (NEW -- #27)
|   +-- net-revenue-retention.ts      (NEW -- #28)
|   +-- unit-economics.ts             (NEW -- #29 CAC/LTV, #31 Unit Econ)
|   +-- esg.ts                         (NEW -- #41)
|   +-- capital-allocation.ts          (NEW -- #42)
|   +-- index.ts                       (existing -- extend exports)
|
+-- deal-analyzer/
|   +-- dcf.ts                         (existing)
|   +-- scenarios.ts                   (existing -- extend with #9 Asymmetry)
|   +-- ddm.ts                         (NEW -- #14 Gordon Growth)
|   +-- kelly.ts                       (existing)
|   +-- premortem.ts                   (existing)
|   +-- probability.ts                 (existing)
|   +-- index.ts                       (existing)
|
+-- portfolio/
|   +-- brier.ts                       (existing)
|   +-- kelly-rebalance.ts            (existing)
|   +-- mos-alert.ts                   (existing)
|   +-- traffic-light.ts              (existing)
|   +-- risk-parity.ts                (NEW -- #3)
|   +-- stress-test.ts                (NEW -- #19 VaR, #20 CVaR)
|   +-- drawdown.ts                    (NEW -- #21 MDD, #38 Recovery)
|   +-- risk-ratios.ts                (NEW -- #22 Sharpe, #23 Sortino, #24 Calmar, #25 Beta)
|   +-- correlation.ts                (NEW -- #26)
|   +-- look-through-earnings.ts      (NEW -- #10)
|   +-- attribution.ts                (NEW -- #36 Brinson)
|   +-- risk-budget.ts                (NEW -- #37)
|   +-- index.ts                       (existing -- extend exports)
|
+-- screener/
|   +-- pipeline.ts                    (existing)
|   +-- watchlist.ts                   (existing)
|   +-- momentum.ts                    (NEW -- #32 RSI, #33 MACD, #34 MA Cross)
|   +-- mean-reversion.ts             (NEW -- #35)
|   +-- index.ts                       (existing)
|
+-- data/                              (existing directory)
|   +-- insider-signals.ts            (NEW -- #39)
|   +-- short-interest.ts             (NEW -- #40)
|
+-- private-markets/                   (existing directory)
|   +-- tam-analysis.ts               (NEW -- #30)
|
+-- models/
|   +-- financial.ts                   (existing -- NEEDS EXTENSION, see Appendix B)
```

---

# APPENDIX B: REQUIRED EXTENSIONS TO FINANCIAL MODEL

The existing `Financial` interface at `packages/core/src/models/financial.ts` must be extended to support the new methodologies. Below are all fields that need to be added:

```typescript
export interface Financial {
  // --- EXISTING FIELDS ---
  id: string;
  investmentId: string;
  source: 'api' | 'manual';
  period: 'annual' | 'quarterly';
  year: number;
  quarter: number | null;
  revenue: number | null;
  netIncome: number | null;
  ebitda: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  cash: number | null;
  capex: number | null;
  fcf: number | null;
  workingCapital: number | null;
  autoUpdated: boolean;
  lastRefresh: Date | null;
  apiSource: string | null;

  // --- NEW FIELDS (required for 42 methodologies) ---

  // Income Statement additions
  cogs: number | null;                     // #8 ROIC tree, #29 gross margin
  grossProfit: number | null;              // #8, #27, #29
  sga: number | null;                      // #8 ROIC tree
  rdExpense: number | null;                // #8 ROIC tree
  depreciation: number | null;             // #8, #11, #15 (already in ValuationInputs)
  ebit: number | null;                     // #8, #42
  interestExpense: number | null;          // #42 interest coverage
  pretaxIncome: number | null;             // #8 tax rate
  incomeTax: number | null;               // #8 effective tax rate

  // Balance Sheet additions
  accountsReceivable: number | null;       // #8 DSO, #17 revenue quality
  inventory: number | null;                // #8 DIO
  currentAssets: number | null;            // #15 Sloan accruals
  accountsPayable: number | null;          // #8 DPO
  currentLiabilities: number | null;       // #15 Sloan accruals
  shortTermDebt: number | null;            // #15 Sloan accruals
  totalEquity: number | null;              // #8 invested capital
  ppeNet: number | null;                   // #8 capital turnover
  intangiblesNet: number | null;           // #8 capital turnover
  deferredRevenue: number | null;          // #17 revenue quality

  // Cash Flow Statement additions
  operatingCashFlow: number | null;        // #15, #16, #19
  investingCashFlow: number | null;        // #15 Sloan ratio
  stockBasedComp: number | null;           // #11 non-cash charges
  dividendsPaid: number | null;            // #10, #14, #42
  shareRepurchases: number | null;         // #42 buyback analysis

  // Per-share data
  sharesOutstanding: number | null;        // #13, #25, #42
  eps: number | null;                      // #13, #18, #42
  dps: number | null;                      // #14 DDM, #42
}
```

---

# APPENDIX C: EXTERNAL DATA SOURCES REQUIRED

| Source | Free? | Data Provided | Used By Methodologies |
|--------|-------|--------------|----------------------|
| FRED (Federal Reserve) | Yes | Rates, GDP, CPI, credit spreads, unemployment | #1, #2, #4, #5, #6, #7 |
| Robert Shiller Dataset | Yes | CAPE, historical P/E, S&P earnings | #4 |
| AAII Sentiment Survey | Yes (partial) | Weekly bull/bear readings | #1 |
| SEC EDGAR | Yes | Form 4 insider transactions, 10-K filings | #39 |
| FINRA | Yes | Short interest data (semi-monthly) | #40 |
| Yahoo Finance API | Yes (rate-limited) | Prices, volumes, basic financials | #7, #19-26, #32-35 |
| Ken French Data Library | Yes | Factor returns (Fama-French + extensions) | #36 (attribution), #25 (beta) |
| BIS Statistics | Yes | Debt service ratios, international data | #2 |
| CBOE | Partial | VIX index, VIX futures | #1, #7 |
| NY Fed | Yes | Term premium, forward rates | #6 |
| SASB Standards | Yes | Industry materiality maps | #41 |
| Damodaran Online | Yes | Cost of capital data, ERP estimates | #14 (DDM) |

---

# APPENDIX D: CROSS-REFERENCE MATRIX -- DATA SHARING

Many methodologies share the same input variables. This matrix shows which variables are reused across multiple formulas, enabling efficient data fetching.

| Shared Variable | Used By Methodology Numbers |
|----------------|---------------------------|
| credit_spread_hy_ig | #1, #2, #5 |
| vix_level | #1, #2, #7 |
| cape_ratio | #1, #2, #4 |
| risk_free_rate | #3, #14, #19, #22, #23 |
| net_income | #8, #11, #15, #16, #18 |
| revenue | #8, #12, #17, #27, #29 |
| total_assets | #8, #15 |
| depreciation | #8, #11, #15 |
| ebitda | #12, #27, #42 |
| fcf | #12, #16, #27 |
| daily_returns (portfolio) | #3, #19, #20, #21, #22, #23, #24, #25, #26, #37, #38 |
| daily_prices (per stock) | #32, #33, #34, #35 |
| position_weights | #3, #19, #25, #26, #36, #37 |
| covariance_matrix | #3, #19, #26, #37 |
| operating_cash_flow | #11, #15, #16 |

---

# APPENDIX E: IMPLEMENTATION PRIORITY

Based on impact-to-effort ratio for a value investing platform:

| Priority | # | Methodology | Effort | Impact | Dependencies |
|----------|---|------------|--------|--------|-------------|
| 1 | 1 | Market Cycle Score | Medium | Very High | FRED API |
| 2 | 8 | ROIC Decomposition | Medium | Very High | Extended Financial model |
| 3 | 11 | Owner's Earnings | Low | High | Minimal |
| 4 | 9 | Risk-Reward Asymmetry | Low | High | Existing scenarios module |
| 5 | 15-16 | Sloan + Cash Conversion | Low | High | CFO field addition |
| 6 | 22-23 | Sharpe + Sortino | Low | High | Daily return tracking |
| 7 | 21 | Maximum Drawdown | Low | High | Daily NAV tracking |
| 8 | 39 | Insider Transactions | Medium | High | SEC EDGAR API |
| 9 | 42 | Capital Allocation | Medium | High | Multi-year financials |
| 10 | 26 | Correlation Matrix | Medium | Medium-High | Daily returns |
| 11 | 19-20 | VaR / CVaR | Medium | Medium-High | Daily returns |
| 12 | 12 | EV/FCF | Low | Medium | Already nearly in system |
| 13 | 40 | Short Interest | Low | Medium | FINRA data |
| 14 | 4 | Shiller CAPE | Low | Medium | Shiller dataset |
| 15 | 27 | Rule of 40 | Low | Medium | Minimal |
| 16 | 13 | PEG Ratio | Low | Medium | EPS growth calculation |
| 17 | 25 | Beta | Low | Medium | Daily returns |
| 18 | 6 | Yield Curve | Low | Medium | FRED API |
| 19 | 36 | Attribution (Brinson) | Medium | Medium | Benchmark data |
| 20 | 5 | Credit Spreads | Low | Medium | FRED API |
| 21 | 17-18 | Revenue Quality + Persistence | Medium | Medium | Extended data |
| 22 | 32-34 | RSI + MACD + MA Cross | Medium | Low-Medium | Price data |
| 23 | 3 | Risk Parity | High | Medium | Covariance matrix |
| 24 | 14 | DDM (Gordon Growth) | Medium | Medium | Cost of equity |
| 25 | 37 | Risk Budgeting | Medium | Medium | Covariance matrix |
| 26 | 2 | Economic Machine | High | Medium | Multiple macro APIs |
| 27 | 29 | CAC/LTV | Medium | Medium | SaaS-specific data |
| 28 | 41 | ESG Composite | Medium | Low-Medium | Manual inputs |
| 29 | 28 | NRR | Low | Low-Medium | SaaS-specific data |
| 30 | 35 | Mean Reversion Z-Score | Low | Low-Medium | Price data |
| 31 | 10 | Look-Through Earnings | Low | Low-Medium | Portfolio + investee data |
| 32 | 30 | TAM/SAM/SOM | Low | Low | Manual inputs |
| 33 | 31 | Unit Economics | Medium | Low-Medium | SaaS-specific data |
| 34 | 38 | Drawdown Recovery | Low | Low-Medium | Daily NAV |
| 35 | 24 | Calmar Ratio | Low | Low | Daily NAV |
| 36 | 7 | VIX Fear/Greed | Low | Low-Medium | CBOE data |

---

*End of reference. All 42 methodologies fully specified.*
