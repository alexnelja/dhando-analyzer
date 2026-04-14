# Investment Analysis Tool Research -- South African Market Focus

Research conducted 2026-03-30. Findings organized by topic with specific tools, APIs, websites, and frameworks suitable for integration into a desktop application.

---

## TOPIC 1: Value Investing Websites and Investor Indicators

### 1.1 Top Value Investing Websites

#### Tier 1 -- Primary Data Sources

| Platform | Free Tier | Paid Tier | Key Data | Best For |
|---|---|---|---|---|
| **GuruFocus** | Limited screens, delayed data | $549/yr (Premium), higher for All-In-One | 30yr financials, 500+ screening filters, 8000+ institutional investor tracking, GF Score, GF Value | Guru portfolio tracking, valuation models |
| **Dataroma** | Fully free | N/A | 13F filings of ~70 super investors, portfolio overlap, buy/sell activity | Free super investor tracking |
| **ValueInvestorsClub (VIC)** | 45-day delayed ideas | Membership by application (submit a stock pitch, max 250 members) | 2-5 new investment ideas daily, rated 1-5, comments | Curated high-conviction ideas from skilled analysts |
| **WhaleWisdom** | Basic 13F lookup | Premium (tiered) | 13F Heat Map 2.0, fund overlap analysis, WhaleScore, EDGAR parsing | Multi-investor convergence signals |
| **The Acquirer's Multiple** | Free screener (limited) | N/A (mostly free) | EV/Operating Earnings screener, 13F tracking, deep value focus | Tobias Carlisle's deep value methodology |
| **Old School Value** | Limited | Subscription | DCF, Graham formula, EBIT multiples, Piotroski F/Altman Z/Beneish M built in, 12 premium value screens | Multi-model intrinsic value triangulation |

#### Tier 2 -- Complementary Tools

| Platform | Key Differentiator | SA/EM Coverage | Pricing |
|---|---|---|---|
| **Simply Wall St** | Visual snowflake analysis, 30-point checks, 120k+ global stocks | JSE supported | Free tier + paid plans |
| **TIKR** | Clean terminal-style interface, global coverage | Partial EM | Free tier + paid |
| **Gainify** | Custom screening + top investor tracking | Limited | $95.88/yr (Investor) |
| **Stock Rover** | Portfolio analytics, screening | US-focused | $79.99/yr |
| **SumZero** | Buy-side analyst community (VIC alternative) | Global | Membership required |
| **Undervalued-Shares.com** | Swen Lorenz, EM/frontier focus, contrarian | Strong EM + SA coverage | Newsletter |

#### Screening Capabilities to Replicate in Your Tool

- **Valuation screens**: EV/EBITDA, P/FCF, P/B, P/E, PEG, Acquirer's Multiple (EV/Operating Earnings)
- **Quality screens**: Piotroski F-Score, Altman Z-Score, Beneish M-Score, ROIC, ROE
- **Momentum/contrarian**: 52-week low proximity, RSI, mean reversion signals
- **Custom formula builder**: Allow users to create their own composite scores (like Old School Value)

---

### 1.2 Notable Investors to Track (13F Filers)

#### Deep Value / Dhandho / Contrarian

| Investor | Fund | Style | What to Watch |
|---|---|---|---|
| **Mohnish Pabrai** | Dalal Street, LLC | Dhandho, concentrated, small/mid-cap out-of-favor | 4 holdings, ~$402M, coal/energy focus (HCC, AMR, RIG, VAL) |
| **Warren Buffett** | Berkshire Hathaway | Quality + value, wide moat | Mega-cap moves, sector bets |
| **Seth Klarman** | Baupost Group | Deep value, distressed, event-driven | Large positions in out-of-favor sectors |
| **Howard Marks** | Oaktree Capital | Distressed debt, contrarian cycles | Credit cycle positioning |
| **David Einhorn** | Greenlight Capital | Value + activist | Short positions signal overvaluation |
| **Michael Burry** | Scion Asset Management | Contrarian, macro bets | Sector concentration shifts |
| **Joel Greenblatt** | Gotham Asset Management | Magic Formula (ROIC + Earnings Yield) | Systematic value approach |
| **Li Lu** | Himalaya Capital | EM value, China + Asia focus | EM positioning |
| **Tobias Carlisle** | Acquirer's Funds | Deep value, Acquirer's Multiple | Systematic deep value |
| **Guy Spier** | Aquamarine Capital | Pabrai-influenced, global value | EM allocation shifts |

#### South African Value Investors

| Investor / Firm | Notes |
|---|---|
| **Contrarius** | R36bn global contrarian manager, launched 3 SA unit trusts (BCI Equity, SA Equity, Balanced) |
| **Anchor Capital** | Publishes annual JSE stock picks, fundamental value approach |
| **Allan Gray** | SA's largest independent asset manager, contrarian philosophy |
| **Coronation Fund Managers** | Deep fundamental research, long-term value orientation |
| **RE:CM (Regarding Capital Management)** | Pure value shop, Pabrai/Buffett-influenced, SA-focused |
| **Laurium Capital** | SA and Africa equity specialists |
| **Abax Investments** | Value-oriented, SA small/mid-cap focus |

#### Emerging Market Value Investors

| Investor / Fund | Focus |
|---|---|
| **Pavel Begun / 3G Capital Management** | Value-based, frontier + EM since 2009 |
| **Lazard Emerging Markets Fund** | Contrarian, buys depressed prices across China, India, Brazil, SA |
| **Jean van de Walle** | The Emerging Markets Investor blog, deep value in EM |
| **Juan Torres Rodriguez** | EM value investing, Indonesia, Taiwan, China focus |
| **Avantis EM Value ETF (AVES)** | Systematic EM value factor exposure |

---

### 1.3 Super Investor Overlap Tracking (Convergence Signals)

**The core principle**: When multiple independent value investors buy the same stock, it is a significantly stronger signal than any single position. WhaleWisdom's research shows this convergence often precedes outperformance.

#### How to Build This Into Your Tool

1. **Data source**: Parse SEC EDGAR 13F filings (free, 45-day delay) or use WhaleWisdom/GuruFocus APIs
2. **Define your "guru universe"**: Curate 20-50 value investors whose philosophy aligns (Dhandho/deep value/contrarian)
3. **Calculate overlap metrics**:
   - TFI (Total Filers Increasing) -- number of gurus adding to a position
   - TFD (Total Filers Decreasing) -- number of gurus reducing
   - Conviction score = TFI / (TFI + TFD)
   - Overlap count = number of gurus holding the same stock
4. **Signal thresholds**:
   - 3+ gurus = "interesting"
   - 5+ gurus = "strong signal"
   - New position by 3+ gurus in same quarter = "high conviction new idea"
5. **Weight by quality**: Not all 13F filers are equal. Weight by historical alpha, concentration (more concentrated = higher conviction), and AUM

#### WhaleWisdom Heat Map Metrics to Replicate
- Total filers increasing/starting positions
- Total filers decreasing/exiting positions
- Net change in institutional ownership
- Quarter-over-quarter position size changes

---

### 1.4 Logic Tests and Validation Frameworks

**Quantitative screens these platforms use to validate theses:**

| Test | What It Validates | Threshold |
|---|---|---|
| Piotroski F-Score (0-9) | Financial strength improving | >=7 = strong |
| Altman Z-Score | Bankruptcy risk | >2.67 safe, <1.81 distress |
| Beneish M-Score | Earnings manipulation risk | >-1.78 = likely manipulation |
| Magic Formula rank | Combined ROIC + earnings yield | Lower rank = better |
| Acquirer's Multiple | Deep value (EV/Operating Earnings) | Lower = cheaper |
| FCF Yield | Cash generation relative to price | Higher = better, >8% interesting |
| Debt/Equity trend | Leverage trajectory | Declining preferred |
| Insider buying | Management conviction | Cluster buys = strong signal |

**Combined scoring approach** (from academic research): Using Altman Z + Beneish M together yields 862 basis points annual outperformance vs 132 bps (Z alone) or 207 bps (M alone). The combination catches both bankruptcy risk AND earnings manipulation.

---

## TOPIC 2: Distressed Company/Industry Signaling

### 2.1 Quantitative Distress Indicators

#### Primary Scoring Models

**Altman Z-Score** (Bankruptcy Prediction)
```
Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E

A = Working Capital / Total Assets
B = Retained Earnings / Total Assets
C = EBIT / Total Assets
D = Market Value of Equity / Total Liabilities
E = Sales / Total Assets

Zones:
  Z > 2.67  = Safe
  1.81-2.67 = Grey zone (monitor closely)
  Z < 1.81  = Distress zone

Notes:
- Accurate forecaster up to 2 years prior to failure
- Variants exist for private companies (Z') and non-manufacturing (Z'')
- For EM companies, use Z'' variant (drops Sales/Total Assets ratio)
```

**Piotroski F-Score** (Financial Strength, 0-9)
```
Profitability (4 points):
  +1 if Net Income > 0
  +1 if Operating Cash Flow > 0
  +1 if ROA increased year-over-year
  +1 if Cash Flow from Operations > Net Income (quality of earnings)

Leverage/Liquidity (3 points):
  +1 if Long-term Debt ratio decreased
  +1 if Current Ratio increased
  +1 if No new equity issuance

Efficiency (2 points):
  +1 if Gross Margin increased
  +1 if Asset Turnover increased

Scoring:
  8-9 = Strong (buy signal for value stocks)
  0-3 = Weak (avoid or short)
  For distressed screens: look for F-Score IMPROVING from low base (turnaround signal)
```

**Beneish M-Score** (Earnings Manipulation Detection)
```
M = -4.84 + 0.920*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI
    + 0.115*DEPI - 0.172*SGAI + 4.679*TATA - 0.327*LVGI

Variables:
  DSRI = Days Sales in Receivables Index
  GMI  = Gross Margin Index
  AQI  = Asset Quality Index
  SGI  = Sales Growth Index
  DEPI = Depreciation Index
  SGAI = SG&A Expense Index
  TATA = Total Accruals to Total Assets
  LVGI = Leverage Index

Threshold:
  M > -1.78 = Likely earnings manipulator (RED FLAG)
  M < -1.78 = Unlikely manipulator

Use case: Screen OUT companies with high M-Scores before investing in "cheap" stocks.
This prevents value traps where cheapness is driven by fraudulent financials.
```

#### Additional Distress Indicators to Implement

| Indicator | Calculation | Signal |
|---|---|---|
| **Interest Coverage Ratio** | EBIT / Interest Expense | <1.5x = danger, <1.0x = acute distress |
| **Cash Burn Rate** | (Cash + Short-term Investments) / Monthly Operating Cash Outflow | <6 months = critical |
| **Quick Ratio** | (Cash + Receivables) / Current Liabilities | <0.5 = liquidity crisis |
| **Debt Covenant Proximity** | Actual ratio vs covenant threshold | <10% buffer = breach risk |
| **Working Capital Trend** | QoQ change in (Current Assets - Current Liabilities) | 3+ consecutive declines = squeeze |
| **Days Sales Outstanding (DSO)** | Accounts Receivable / (Revenue/365) | Rising DSO = collection problems |
| **Days Payable Outstanding (DPO)** | Accounts Payable / (COGS/365) | Rising DPO = stretching suppliers |
| **Accruals Ratio** | (Net Income - Operating Cash Flow) / Total Assets | High accruals = low earnings quality |
| **Sloan Ratio** | (Net Income - Cash from Ops - Cash from Investing) / Total Assets | >0.25 = red flag |

#### Composite Distress Score (Proposed for Your Tool)

```
Distress Score (0-100, higher = more distressed):

  Altman Z component:    25 pts (scaled: Z<1.0=25, Z=1.81=15, Z=2.67=5, Z>3.0=0)
  Piotroski F component: 20 pts (scaled: F=0 -> 20pts, F=9 -> 0pts, inverted)
  Beneish M component:   15 pts (M > -1.78 = 15, M > -2.22 = 8, else 0)
  Cash flow component:   15 pts (negative OCF=15, declining OCF 3 qtrs=10, etc.)
  Leverage component:    15 pts (ICR<1=15, ICR<1.5=10, D/E>3=5, etc.)
  Working capital:       10 pts (negative WC=10, declining 3 qtrs=7, etc.)

  Interpretation:
    0-20  = Healthy
    20-40 = Watch list
    40-60 = Stressed (potential turnaround candidate)
    60-80 = Distressed (high risk, high reward if temporary)
    80-100 = Acute distress (likely permanent impairment)
```

---

### 2.2 News Sentiment Analysis for Distress Detection

#### Commercial APIs and Tools

| Tool | Coverage | SA/EM Support | Pricing | Integration |
|---|---|---|---|---|
| **RavenPack Edge** | 45,000+ companies, 143 countries, 7000+ event topics, 12M+ named entities | Explicit SA coverage, BRICS nowcasting model | Enterprise (expensive) | REST API, streaming |
| **EODHD Financial News API** | Global coverage, sentiment scores | JSE supported | $19.99-59.99/mo | REST API, JSON |
| **Alpaca News API** | Real-time US news with sentiment | US-focused | Free tier available | REST API |
| **Arya.ai Sentiment API** | Financial text sentiment classification | General | API pricing | REST API |

#### Open Source / Self-Hosted Models

| Model | Source | Best For | How to Deploy |
|---|---|---|---|
| **FinBERT (ProsusAI)** | HuggingFace, GitHub | Financial sentiment (positive/neutral/negative) | Python, `transformers` library, `from_pretrained('ProsusAI/finbert')` |
| **FinBERT-tone** | HuggingFace (`yiyanghkust/finbert-tone`) | Tone analysis of financial communications | Same as above |
| **GDELT** | gdeltproject.org | Global event database, tone/sentiment on news | Free bulk download, BigQuery |
| **VADER + custom financial lexicon** | NLTK | Lightweight rule-based sentiment | Python, very fast, good for high-volume |

**Recommended architecture for your tool:**
1. Use EODHD News API for JSE-specific news feed (affordable, JSE coverage)
2. Run FinBERT locally for sentiment scoring (free, no API costs, offline capable)
3. Aggregate sentiment by company and sector over rolling windows (7d, 30d, 90d)
4. Flag "sentiment deterioration" when 30d average drops below threshold
5. Combine sentiment score with financial distress indicators for composite signal

#### SA-Specific News Sources to Monitor
- **Moneyweb** (moneyweb.co.za) -- JSE-focused financial news
- **BusinessDay / Financial Mail** -- In-depth SA business coverage
- **SENS announcements** (JSE regulatory disclosures) -- Most important for material events
- **News24 Business** -- Broad SA business news
- **BizNews** -- Investment-focused SA content
- **Daily Maverick Business** -- Investigative financial journalism

---

### 2.3 Industry-Level Distress Signals

#### Sector Rotation Framework

Based on the economic cycle, sectors behave predictably:

```
Early Recovery:   Financials, Consumer Discretionary lead
Mid Expansion:    Industrials, Technology take leadership
Late Cycle:       Energy, Materials, Commodities outperform
Recession:        Utilities, Consumer Staples, Healthcare defensive

SA-Specific additions:
  - Mining/Resources: Commodity price cycle driven (platinum, gold, coal, iron ore)
  - Banking: Interest rate cycle + credit growth
  - Retail: Consumer confidence + ZAR strength
  - Property/REITs: Interest rate sensitive + load shedding impact (historically)
```

#### Quantitative Industry Distress Signals

| Signal | Measurement | Data Source |
|---|---|---|
| **Sector margin compression** | Median operating margin declining 2+ quarters across sector peers | Financial statements via EODHD API |
| **Revenue growth deceleration** | Sector median revenue growth turning negative | Same |
| **Rising sector default rates** | CDS spreads widening, credit downgrades clustering | Rating agencies, bond spreads |
| **Inventory build-up** | Sector median inventory/sales rising | Financial statements |
| **Capex cuts** | Sector median capex declining while depreciation continues | Financial statements |
| **Management turnover** | Unusual CEO/CFO departures clustering in sector | SENS, news monitoring |
| **Supply chain stress** | Supplier payment terms extending, supplier bankruptcies | Trade credit data, news |

#### SA-Specific Industry Signals
- **Eskom/energy dependency**: Monitor grid stability metrics, load shedding stages
- **ZAR volatility**: Sudden depreciation hits importers immediately, benefits exporters with lag
- **Commodity prices**: PGM basket, gold, coal, iron ore directly impact 30%+ of JSE market cap
- **Consumer confidence**: FNB/BER Consumer Confidence Index
- **PMI**: Absa/BER Purchasing Managers Index for manufacturing health

---

## TOPIC 3: South African Market Focus + Macro/Geopolitical Impact

### 3.1 South African Market Data Sources

#### JSE Direct Data

| Product | Data Type | Access Method | Cost |
|---|---|---|---|
| **JSE Market Data Connect** | Real-time + delayed equities, derivatives, bonds, indices | Cloud-based portal, FTP | Vendor licensing fees |
| **JSE SENS** | Regulatory announcements | Live feed via Regulatory News Gateway, or SENS+ via IDP (FTP) | Licensed |
| **JSE Historical Tick Data** | Equity, Equity Derivatives, Currency Derivatives | CME DataMine cloud platform | Per-dataset pricing |
| **JSE Reference Data** | Instrument master, corporate actions | API/file delivery | Licensed |

#### Third-Party Data Providers (More Accessible for Desktop App)

| Provider | Coverage | API | Pricing | Best For |
|---|---|---|---|---|
| **EODHD** | JSE historical prices, fundamentals, news, sentiment | REST API (JSON) | $19.99-59.99/mo | **Primary recommendation** -- affordable, good JSE coverage, fundamentals + news |
| **LSEG (Refinitiv)** | JSE Level 1 + Level 2, all asset types | Enterprise API | Enterprise pricing | Professional-grade, expensive |
| **Simply Wall St** | JSE valuations, snowflake analysis | No public API (web scraping needed) | Free + paid plans | Visual analysis, limited programmatic use |
| **Sharenet** | JSE prices, fundamentals, analytics | Web portal (MySharenet) | Competitive pricing for licensed JSE data | SA-specific, good local coverage |
| **ProfileData** | JSE data to brokers, fund managers, portals | Data feeds | B2B pricing | Industry standard SA data supplier |
| **ShareData Online** | JSE share prices, company info | Web portal | Free basic | Quick reference |

#### CIPC (Company Registration Data)

| Provider | Data | Access | Pricing |
|---|---|---|---|
| **CIPC eServices** | Company name, registration number, directors, status | Web portal (manual) | Free lookup |
| **Datanamix CIPC API** | Full company verification, directors, auditors, filing history | REST API | Commercial |
| **Standard Bank SearchWorks CIPC API** | Company data from CIPC register | API marketplace | Commercial |
| **Lexis SA Company / WinDeed** | Comprehensive company database sourced from CIPC | Web portal + bulk | Subscription |
| **OpenCorporates** | Basic SA company data | API | Free tier + paid |

#### Recommended Data Stack for Desktop App

```
Primary financial data:  EODHD API ($59.99/mo for fundamentals)
  - Historical prices (JSE suffix: .JSE)
  - Fundamental data (balance sheet, income statement, cash flow)
  - Financial news + sentiment
  - Supports Python, JS, and direct HTTP

News + SENS monitoring:  EODHD News API + Moneyweb RSS + SENS scraping
Sentiment analysis:      FinBERT (local, free) on news text
Company verification:    Datanamix CIPC API (for corporate governance checks)
Super investor tracking:  SEC EDGAR 13F (free) + Dataroma (free scraping)
Valuation models:        Build in-app using EODHD fundamental data
```

---

### 3.2 Geopolitical Impact Analysis Frameworks

#### De-dollarization Impact on SA Businesses

**Current State**: South Africa supports increased use of national currencies in BRICS trade but has explicitly distanced itself from creating a BRICS currency or formally de-dollarizing. The BRICS Cross-Border Payment Initiative (BCBPI) promotes trade in national currencies.

**Impact Matrix for SA Companies:**

| Company Type | Short-term Impact | Long-term Impact | Indicators to Monitor |
|---|---|---|---|
| **Commodity exporters** (Anglo, BHP SA ops, Sasol) | Limited -- commodities still priced in USD | Potentially negative if USD pricing erodes; positive if ZAR weakens | USD/ZAR, commodity pricing conventions, BRICS trade settlement volumes |
| **Commodity importers** (oil, electronics) | Neutral | Could benefit from ZAR-denominated trade reducing FX costs | Oil price in ZAR, bilateral trade agreements |
| **SA banks** (Absa, Standard Bank, FirstRand, Nedbank) | Opportunity in FX services | Standard Bank (ICBC partnership) positioned for RMB trade | Trade finance volumes, RMB/ZAR activity |
| **SA retailers** (Shoprite, Pick n Pay, Woolworths) | Minimal direct impact | Benefit if ZAR strengthens through diversified trade | Consumer confidence, import cost trends |
| **Mining (PGMs, gold)** | Gold as reserve alternative could boost demand | Structural demand shift if central banks diversify from USD to gold | Central bank gold purchases, PGM demand from BRICS |

#### War/Conflict Impact Framework

| Scenario | SA Transmission Mechanism | Companies Most Affected | Leading Indicators |
|---|---|---|---|
| **Middle East escalation / Iran tensions** | Oil price spike -> transport costs, inflation | Sasol (complex: oil producer + consumer), airlines (Comair successor), logistics (Imperial) | Brent crude, Strait of Hormuz traffic, SA fuel levy |
| **Russia-Ukraine prolonged** | Grain prices, fertilizer costs, sanctions complexity | Agricultural sector (grain importers), Omnia/AECI (fertilizer), Standard Bank (Russia exposure) | Wheat futures, fertilizer prices, sanctions lists |
| **China-Taiwan tensions** | Supply chain disruption, commodity demand shifts | Tech importers, mining (China is top export destination) | Taiwan Strait shipping, China PMI, SA export volumes to China |
| **AGOA / US-SA trade tensions** | Tariff impacts on SA auto exports, citrus | BMW SA, Toyota SA, Volkswagen SA, agricultural exporters | AGOA renewal status, US trade policy announcements |

#### BRICS Dynamics and SA Trade Flows

Key metrics to track:
- **Intra-BRICS trade volume** as % of SA total trade
- **ZAR bilateral swap line usage** with BRICS partners
- **New Development Bank (NDB) lending** to SA projects
- **SA current account balance** with BRICS vs non-BRICS
- **Foreign direct investment flows** from BRICS members

---

### 3.3 Temporary vs. Permanent Distress -- Scoring Framework

#### Distinguishing Framework

**The core question**: Is the cash flow disruption caused by a reversible external shock, or does it reflect permanent structural deterioration?

| Factor | Temporary (Recoverable) | Permanent (Impaired) | Score |
|---|---|---|---|
| **Cause of distress** | External shock (COVID, load shedding, commodity crash, ZAR spike) | Structural (technology disruption, permanent demand destruction, governance failure) | 0-15 |
| **Industry dynamics** | Industry intact, competitors also affected | Industry structurally declining, substitutes gaining | 0-15 |
| **Balance sheet strength** | Adequate cash, manageable debt, no covenant breach | Overleveraged, covenant breaches, unable to refinance | 0-15 |
| **Management quality** | Track record of navigating downturns, insider buying | Management turnover, insider selling, governance concerns | 0-15 |
| **Competitive position** | Market share stable or gaining during distress | Losing share to competitors or substitutes | 0-15 |
| **Revenue base** | Customer contracts intact, recurring revenue | Customer churn accelerating, one-time revenue | 0-10 |
| **Asset value** | Tangible assets retain value (property, equipment, inventory) | Intangible/goodwill heavy, asset write-downs | 0-15 |

**Total Score Interpretation (0-100):**
```
70-100 = High probability of recovery (strong turnaround candidate)
50-69  = Moderate recovery probability (requires deep analysis)
30-49  = Low recovery probability (avoid or wait for more data)
0-29   = Likely permanent impairment (avoid)
```

#### Historical SA Recovery Patterns

**Load Shedding Crisis (2022-2024)**
- JSE delivered 37.7% returns in 2025 after the acute crisis period
- Companies that invested in self-generation (solar, batteries) recovered faster
- Pattern: 18-24 month distress -> structural adaptation -> recovery
- Winners: Companies that turned constraint into competitive advantage

**COVID-19 (2020-2021)**
- Sector-specific impact: hospitality/tourism devastated, tech/e-commerce benefited
- JSE recovered to pre-COVID levels within ~12 months for most sectors
- Key differentiator: balance sheet strength entering the crisis
- Companies with <2x Debt/EBITDA recovered; those >4x faced permanent damage

**Commodity Crash (2015-2016)**
- PGM miners, coal producers severely distressed
- Anglo American restructured (sold assets, cut debt), recovered dramatically
- Lonmin did not recover (merged into Sibanye)
- Pattern: companies that cut costs and preserved cash survived; those that maintained capex failed

**Key SA Recovery Indicators to Monitor:**
1. Eskom Energy Availability Factor (EAF) -- grid stability proxy
2. FNB/BER Business Confidence Index
3. SA PMI (Absa/BER)
4. SARB interest rate trajectory
5. ZAR/USD trend
6. Load shedding stages (now largely resolved as of 2025)
7. Government bond spreads (sovereign risk)

#### Decision Tree for Your Tool

```
START: Company shows distress signals (Z-Score < 2.0, falling margins, negative sentiment)
  |
  +--> Is the distress industry-wide or company-specific?
  |      |
  |      +--> Industry-wide: Check if industry is structurally declining
  |      |     |
  |      |     +--> Yes: AVOID (permanent)
  |      |     +--> No: Potential sector turnaround -> score all peers, pick strongest
  |      |
  |      +--> Company-specific: Check governance (Beneish M, insider activity)
  |             |
  |             +--> Red flags: AVOID (fraud/governance = permanent)
  |             +--> Clean: Analyze balance sheet resilience
  |
  +--> Does the company have enough cash to survive 12+ months of distress?
  |      |
  |      +--> No: AVOID unless recapitalization likely
  |      +--> Yes: Continue analysis
  |
  +--> Are multiple super investors buying?
  |      |
  |      +--> Yes: Strong confirmation signal
  |      +--> No: Rely on own analysis
  |
  +--> Is the competitive position intact (market share, customer retention)?
  |      |
  |      +--> Deteriorating: Downgrade recovery probability
  |      +--> Stable/improving: Strong turnaround candidate
  |
  +--> SCORE and RANK among turnaround candidates
```

---

## INTEGRATION ARCHITECTURE SUMMARY

For a desktop investment analysis application targeting the SA market:

### Data Layer
- **EODHD API** -- Primary financial data + news ($59.99/mo)
- **SEC EDGAR** -- 13F filings for guru tracking (free)
- **Dataroma** -- Super investor portfolios (free, scrape)
- **CIPC via Datanamix** -- Company verification (commercial API)
- **GDELT** -- Global event/sentiment data (free)

### Analysis Engine
- **FinBERT** (Python/local) -- News sentiment scoring
- **Custom scoring models** -- Altman Z, Piotroski F, Beneish M, composite distress score
- **Guru overlap calculator** -- 13F convergence signals
- **Temporary vs permanent framework** -- Scoring rubric above
- **Sector rotation model** -- Economic cycle positioning

### Signal Generation
- **Distress alert**: Z-Score drops below 1.81 + negative sentiment trend
- **Turnaround candidate**: Distress score 40-60 + F-Score improving + guru buying
- **Deep value screen**: Acquirer's Multiple bottom decile + M-Score clean + guru overlap
- **Geopolitical impact**: Event detection (GDELT) -> impact matrix lookup -> affected company list

### Key Python Libraries
- `transformers` (HuggingFace) -- FinBERT sentiment
- `requests` -- API calls to EODHD, EDGAR
- `pandas` -- Financial data manipulation
- `numpy` / `scipy` -- Scoring calculations
- `beautifulsoup4` -- Web scraping (Dataroma, SENS)
- `sqlite3` or `sqlalchemy` -- Local data storage
- `plotly` or `matplotlib` -- Charting

---

## SOURCES AND REFERENCES

### Value Investing Platforms
- [GuruFocus](https://www.gurufocus.com/)
- [Dataroma](https://www.dataroma.com/)
- [ValueInvestorsClub](https://valueinvestorsclub.com/)
- [WhaleWisdom](https://whalewisdom.com/)
- [The Acquirer's Multiple](https://acquirersmultiple.com/)
- [Old School Value](https://www.oldschoolvalue.com/)
- [Simply Wall St -- SA Market](https://simplywall.st/markets/za)
- [TIKR](https://www.tikr.com/)
- [Gainify -- GuruFocus Alternatives](https://www.gainify.io/blog/gurufocus-alternatives)
- [Beanvest -- Best Value Investing Software](https://beanvest.com/blog/best-investing-software)

### Super Investor Tracking
- [Mohnish Pabrai -- GuruFocus](https://www.gurufocus.com/guru/mohnish+pabrai/summary)
- [Pabrai 13F -- HedgeFollow](https://hedgefollow.com/funds/Dalal+Street)
- [WhaleWisdom 13F Heat Map](https://whalewisdom.com/report/heat_map)
- [VIC Best Ideas Summary](https://thematicedge.substack.com/p/the-best-of-the-legendary-value-investors)

### Distress Indicators
- [Altman Z-Score -- Wikipedia](https://en.wikipedia.org/wiki/Altman_Z-score)
- [EODHD -- Altman Z and Piotroski](https://eodhd.medium.com/altman-z-score-and-piotrosky-score-99328ab325f3)
- [Combined Z + M Score Research](https://www.researchgate.net/publication/347761022_Beneish_M-score_and_Altman_Z-score_as_a_catalyst_for_corporate_fraud_detection)
- [CFA UK -- Scoring Models Evolution](https://www.cfauk.org/pi-listing/man-machine-the-evolution-of-fundamental-scoring-models-and-ml-implications)
- [LSEG -- Beneish + Altman Combined](https://developers.lseg.com/en/article-catalog/article/Beneish-M-Score-and-Altman-Z-Score-for-analyzing-stock-returns-of-the-companies-listed-in-the-SP500)

### Sentiment Analysis
- [FinBERT -- GitHub](https://github.com/ProsusAI/finBERT)
- [FinBERT -- HuggingFace](https://huggingface.co/ProsusAI/finbert)
- [RavenPack -- BRICS Nowcasting](https://www.ravenpack.com/research/from-real-time-news-sentiment-to-economic-activity-nowcasting-bris-countries)
- [EODHD News Sentiment API](https://eodhd.com/financial-apis/stock-market-financial-news-api)
- [Alpaca Sentiment Analysis](https://alpaca.markets/learn/sentiment-analysis-with-news-api-and-transformers)

### South African Market Data
- [JSE Market Data](https://www.jse.co.za/market-data)
- [JSE Market Data Connect Portal](https://www.jse.co.za/jse-market-data-connect-portal)
- [JSE SENS Announcements](https://www.jse.co.za/market-data/market-announcements)
- [EODHD -- JSE Exchange](https://eodhd.com/exchange/jse)
- [Sharenet](https://www.sharenet.co.za/)
- [ShareData Online](https://www.sharedata.co.za/)
- [Datanamix CIPC API](https://www.datanamix.com/bureau-partners/cipc-company-search/)
- [Standard Bank SearchWorks CIPC](https://corporateandinvestment.standardbank.com/cib/global/products-and-services/onehub/api-marketplace/cipc-information)
- [CIPC eServices](https://eservices.cipc.co.za/Search.aspx)

### SA Value Investing and Market Analysis
- [Anchor Capital -- 2026 Stock Picks](https://anchorcapital.co.za/local-research/anchors-local-stock-picks-for-2026/)
- [Contrarius -- R36bn Contrarian Manager](https://citywire.com/za/news/this-r36bn-global-contrarian-manager-has-launched-three-sa-funds/a2456255)
- [SA Shares -- Undervalued JSE Stocks](https://sashares.co.za/best-undervalued-shares-on-jse/)
- [InvestingFox -- SA Undervalued](https://investingfox.com/en/investing-in-south-africa-stocks-are-undervalued-but-risk-is-high)

### Geopolitical / BRICS
- [Nedbank -- BRICS Currency Impact on SA](https://personal.nedbank.co.za/learn/blog/brics-currency-plan-impact-south-africa.html)
- [Carnegie -- BRICS Dedollarization Realities](https://carnegieendowment.org/research/2023/12/the-difficult-realities-of-the-brics-dedollarization-effortsand-the-renminbis-role)
- [IOL -- SA Lessons from India on Dedollarization](https://www.iol.co.za/mercury/opinion/bricss-de-dollarisation-project-is-an-inevitability-south-africas-lessons-from-india-e2babb11-ffc0-46fa-ba16-cfcb246ad197)
- [JDSupra -- BRICS Dedollarization Stalled?](https://www.jdsupra.com/legalnews/hot-topics-in-international-trade-2591362/)

### Recovery and Turnaround Patterns
- [JSE 37.7% Returns in 2025](https://serrarigroup.com/jse-delivers-37-7-returns-in-2025-as-african-equities-outperform-broader-emerging-markets/)
- [Investec -- Load Shedding Sector Impact](https://www.investec.com/en_za/focus/economy/sa-s-load-shedding-how-the-sectors-are-being-affected.html)
- [COVID-19 Impact on JSE by Sector](https://jefjournal.org.za/index.php/jef/article/view/801/1508)
- [SA Energy Crisis -- Wikipedia](https://en.wikipedia.org/wiki/South_African_energy_crisis)
- [SA Blackouts and Stock Markets](https://www.sciencedirect.com/science/article/abs/pii/S1544612324007591)

### Sector Rotation
- [Fidelity -- Sector Rotation Strategies](https://www.fidelity.com/learning-center/trading-investing/markets-sectors/intro-sector-rotation-strats)
- [StockCharts -- Sector Rotation Analysis](https://chartschool.stockcharts.com/table-of-contents/market-analysis/sector-rotation-analysis)

### Emerging Market Value Investing
- [Undervalued-Shares.com -- EM Value Investing](https://www.undervalued-shares.com/weekly-dispatches/value-investing-in-a-global-setting-risk-perception-versus-reality/)
- [The Emerging Markets Investor](https://www.theemergingmarketsinvestor.com/)
- [Acquirer's Multiple -- Juan Torres on EM Value](https://acquirersmultiple.com/2026/02/value-after-hours-s08-e06-juan-torres-on-emerging-market-value-investing-china-indonesia-and-taiwan/)
- [Morningstar -- Value Investing Outside US](https://www.morningstar.com/stocks/why-value-investing-has-worked-better-outside-us)
