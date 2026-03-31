# Data Sources Mapping for 42 Investment Methodology Calculators

> Last updated: 2026-03-30
> Existing subscription: EODHD ($60/mo) -- stock fundamentals, prices, news, JSE coverage

---

## Summary: Source Ranking by Coverage and Cost-Effectiveness

| Rank | Source | Cost | Data Points Covered | SA Coverage | Update Freq | Reliability |
|------|--------|------|---------------------|-------------|-------------|-------------|
| 1 | **FRED API** | Free | VIX, credit spreads, yield curve, fed funds, M2, consumer sentiment, credit growth | No | Daily | High |
| 2 | **EODHD** (existing) | $60/mo | Full financials, prices, dividends, earnings, JSE, news | Yes | Daily | High |
| 3 | **Finnhub** | Free | Insider transactions, institutional holdings, ESG, sentiment | No | Daily | High |
| 4 | **yfinance** | Free | Prices, dividends, earnings, basic financials, JSE tickers | Yes | Real-time | Medium |
| 5 | **World Bank API** | Free | SA macro (GDP, CPI, interest rates), global indicators | Yes | Quarterly | High |
| 6 | **BIS Data Portal** | Free | Credit-to-GDP gap, total credit to private sector (SA included) | Yes | Quarterly | High |
| 7 | **SARB Online Query** | Free | SA repo rate, bond yields, money supply, banking indicators | Yes | Monthly | High |
| 8 | **Nasdaq Data Link** | Free | AAII sentiment, Shiller CAPE, economic indicators | No | Weekly | High |
| 9 | **SEC EDGAR / EdgarTools** | Free | Insider transactions (Form 4), 13F holdings, financials | No | Daily | High |
| 10 | **Financial Modeling Prep** | Free | Financials, ESG, some intl exchanges | Partial | Daily | Medium |
| 11 | **Google Trends API** | Free | Search interest trends as leading indicator | Yes | Daily | Medium |
| 12 | **StatsSA** | Free | SA CPI, property index, retail sales, mining production | Yes | Monthly | High |
| 13 | **EskomSePush API** | Free | Load shedding status and schedules | Yes | Real-time | High |
| 14 | **USPTO / Lens.org** | Free | Patent filings, innovation indicators | No | Daily | High |
| 15 | **Alpha Vantage** | Free | Backup for prices, forex, economic indicators | No | Daily | Medium |

### Monthly Cost Estimate

| Item | Cost |
|------|------|
| EODHD (existing) | $60/mo |
| All other sources | $0 (free tier) |
| **Total** | **$60/mo** |

All gap-filling sources below are free. No additional spend required.

---

## 1. MACRO / CYCLE DATA

---

### 1.1 VIX (CBOE Volatility Index)

**Data Point:** Daily close of the CBOE Volatility Index (fear gauge)
**Source:** FRED (Federal Reserve Economic Data)
**URL/Endpoint:** `https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key=YOUR_KEY&file_type=json`
**Cost:** Free
**Format:** JSON / XML
**Update Frequency:** Daily (1-day lag)
**Auth:** API key (free registration at https://fred.stlouisfed.org/docs/api/api_key.html)
**Rate Limit:** 120 requests/minute
**Example Call:**
```bash
curl "https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key=YOUR_KEY&file_type=json&sort_order=desc&limit=10"
```
**SA Coverage:** No (US market only, but VIX is a global risk indicator)
**Reliability:** High (institutional-grade, Federal Reserve source)
**Notes:** Series ID `VIXCLS` provides daily closing values. For intraday VIX, use EODHD or yfinance with ticker `^VIX`. FRED data has a 1-business-day lag.

**Backup Source:** Yahoo Finance via yfinance -- `yf.Ticker("^VIX").history()` -- free, real-time, but unofficial/fragile.

---

### 1.2 Credit Spreads (BofA ICE US High Yield OAS)

**Data Point:** BofA ICE US High Yield Option-Adjusted Spread (BAMLH0A0HYM2)
**Source:** FRED
**URL/Endpoint:** `https://api.stlouisfed.org/fred/series/observations?series_id=BAMLH0A0HYM2&api_key=YOUR_KEY&file_type=json`
**Cost:** Free
**Format:** JSON / XML
**Update Frequency:** Daily
**Auth:** API key (same FRED key)
**Rate Limit:** 120 requests/minute
**Example Call:**
```bash
curl "https://api.stlouisfed.org/fred/series/observations?series_id=BAMLH0A0HYM2&api_key=YOUR_KEY&file_type=json&sort_order=desc&limit=30"
```
**SA Coverage:** No (US credit market)
**Reliability:** High
**Notes:** This is the gold-standard credit spread measure. Also available: `BAMLC0A0CM` (investment grade OAS), `BAMLH0A0HYM2EY` (effective yield).

---

### 1.3 Yield Curve (US 10Y minus 2Y)

**Data Point:** US Treasury 10-Year yield and 2-Year yield (calculate spread in code)
**Source:** FRED
**URL/Endpoint:**
- 10Y: `series_id=DGS10`
- 2Y: `series_id=DGS2`
- Pre-calculated spread: `series_id=T10Y2Y`

**Cost:** Free
**Format:** JSON / XML
**Update Frequency:** Daily
**Auth:** API key (same FRED key)
**Rate Limit:** 120 requests/minute
**Example Call:**
```bash
curl "https://api.stlouisfed.org/fred/series/observations?series_id=T10Y2Y&api_key=YOUR_KEY&file_type=json&sort_order=desc&limit=30"
```
**SA Coverage:** No (use SARB for SA 10Y bond yield -- see section 1.11)
**Reliability:** High
**Notes:** `T10Y2Y` gives the pre-calculated 10Y-2Y spread directly. For individual yields: `DGS10`, `DGS2`, `DGS30`, `DGS5`, `DGS1`.

---

### 1.4 Shiller CAPE Ratio

**Data Point:** Cyclically Adjusted Price-Earnings ratio for S&P 500
**Source:** Robert Shiller's Yale Dataset + Nasdaq Data Link
**URL/Endpoint:**
- **Primary:** `http://www.econ.yale.edu/~shiller/data/ie_data.xls` (Excel download, updated monthly)
- **API:** Nasdaq Data Link: `https://data.nasdaq.com/api/v3/datasets/MULTPL/SHILLER_PE_RATIO_MONTH.json?api_key=YOUR_KEY`

**Cost:** Free
**Format:** XLS (Shiller direct) / JSON or CSV (Nasdaq Data Link)
**Update Frequency:** Monthly
**Auth:** Free API key for Nasdaq Data Link (register at https://data.nasdaq.com/)
**Rate Limit:** 300 requests/10 seconds (Nasdaq Data Link free tier), 1 concurrent request
**Example Call:**
```bash
curl "https://data.nasdaq.com/api/v3/datasets/MULTPL/SHILLER_PE_RATIO_MONTH.json?api_key=YOUR_KEY&rows=12"
```
**SA Coverage:** No (S&P 500 only -- calculate SA CAPE from JSE earnings history via EODHD)
**Reliability:** High (Shiller is the definitive source)
**Notes:** The Yale XLS file contains earnings, dividends, CPI, and CAPE going back to 1871. Parse with openpyxl or pandas. Nasdaq Data Link (formerly Quandl) series `MULTPL/SHILLER_PE_RATIO_MONTH` mirrors this data.

---

### 1.5 AAII Sentiment Survey

**Data Point:** Weekly Bull/Bear/Neutral percentages from AAII Investor Sentiment Survey
**Source:** Nasdaq Data Link (formerly Quandl)
**URL/Endpoint:** `https://data.nasdaq.com/api/v3/datasets/AAII/AAII_SENTIMENT.json?api_key=YOUR_KEY`
**Cost:** Free
**Format:** JSON / CSV
**Update Frequency:** Weekly (published Thursdays)
**Auth:** Free API key (register at https://data.nasdaq.com/)
**Rate Limit:** 300 requests/10 seconds, 1 concurrent request
**Example Call:**
```bash
curl "https://data.nasdaq.com/api/v3/datasets/AAII/AAII_SENTIMENT.json?api_key=YOUR_KEY&rows=10"
```
**SA Coverage:** No (US investor sentiment)
**Reliability:** High
**Notes:** Returns columns: Bull, Neutral, Bear, Bull-Bear Spread. Also available as CSV download from https://www.aaii.com/sentimentsurvey/sent_results. Survey has run weekly since 1987.

---

### 1.6 Fed Funds Rate

**Data Point:** Federal Funds Effective Rate
**Source:** FRED
**URL/Endpoint:** `https://api.stlouisfed.org/fred/series/observations?series_id=DFF&api_key=YOUR_KEY&file_type=json`
**Cost:** Free
**Format:** JSON / XML
**Update Frequency:** Daily
**Auth:** API key (same FRED key)
**Rate Limit:** 120 requests/minute
**Example Call:**
```bash
curl "https://api.stlouisfed.org/fred/series/observations?series_id=DFF&api_key=YOUR_KEY&file_type=json&sort_order=desc&limit=5"
```
**SA Coverage:** No (for SA repo rate, see section 1.11)
**Reliability:** High
**Notes:** Series `DFF` = daily effective rate. `DFEDTARU` = upper target. `DFEDTARL` = lower target.

---

### 1.7 Consumer Confidence / Sentiment

**Data Point:** University of Michigan Consumer Sentiment Index
**Source:** FRED
**URL/Endpoint:** `https://api.stlouisfed.org/fred/series/observations?series_id=UMCSENT&api_key=YOUR_KEY&file_type=json`
**Cost:** Free
**Format:** JSON / XML
**Update Frequency:** Monthly (preliminary mid-month, final end-of-month)
**Auth:** API key (same FRED key)
**Rate Limit:** 120 requests/minute
**Example Call:**
```bash
curl "https://api.stlouisfed.org/fred/series/observations?series_id=UMCSENT&api_key=YOUR_KEY&file_type=json&sort_order=desc&limit=12"
```
**SA Coverage:** No
**Reliability:** High
**Notes:** `UMCSENT` = University of Michigan Consumer Sentiment. Conference Board Consumer Confidence is not freely available via FRED (proprietary). Michigan sentiment is the best free proxy. Also available: `UMCSENT1` (1-year inflation expectations).

---

### 1.8 PMI (Purchasing Managers Index)

**Data Point:** ISM Manufacturing PMI
**Source:** ISM data was **removed from FRED in June 2016**. Use alternatives:
- **Primary:** Nasdaq Data Link: `https://data.nasdaq.com/api/v3/datasets/ISM/MAN_PMI.json?api_key=YOUR_KEY`
- **Backup:** DBnomics: `https://db.nomics.world/ISM/pmi`
- **Proxy:** FRED series `MANEMP` (Manufacturing Employment) or `IPMAN` (Industrial Production: Manufacturing) as cycle proxies

**Cost:** Free
**Format:** JSON / CSV
**Update Frequency:** Monthly (first business day of month)
**Auth:** API key for Nasdaq Data Link
**Rate Limit:** 300 requests/10 seconds
**Example Call:**
```bash
curl "https://data.nasdaq.com/api/v3/datasets/ISM/MAN_PMI.json?api_key=YOUR_KEY&rows=12"
```
**SA Coverage:** No (use Absa/S&P Global SA PMI -- available in press releases, not via free API)
**Reliability:** Medium (ISM data availability on Nasdaq Data Link should be verified)
**Notes:** If Nasdaq Data Link does not carry ISM, use the FRED proxy `T10Y3M` (term spread) or `INDPRO` (industrial production) as a manufacturing cycle indicator. The Absa Purchasing Managers Index for SA is published monthly but not available via free API -- scrape from https://www.tradingeconomics.com/south-africa/manufacturing-pmi.

---

### 1.9 Credit Growth Rate

**Data Point:** Total credit to private non-financial sector (% of GDP and growth rate)
**Source:** BIS (Bank for International Settlements) + FRED
**URL/Endpoint:**
- **BIS API:** `https://stats.bis.org/api/v2/data/TOTAL_CREDIT/Q.SA.P.A.M.XDC.A?format=csv` (South Africa)
- **FRED:** `https://api.stlouisfed.org/fred/series/observations?series_id=QUSPAM770A&api_key=YOUR_KEY&file_type=json` (US)

**Cost:** Free
**Format:** CSV / SDMX / JSON (FRED)
**Update Frequency:** Quarterly
**Auth:** None for BIS; FRED API key for FRED
**Rate Limit:** BIS: not documented (be polite, <10 req/min). FRED: 120 req/min
**Example Call:**
```bash
# BIS bulk download (all countries)
curl "https://stats.bis.org/api/v2/data/TOTAL_CREDIT/Q..P.A.M.770.A?format=csv" -o credit_data.csv

# FRED (US only)
curl "https://api.stlouisfed.org/fred/series/observations?series_id=QUSPAM770A&api_key=YOUR_KEY&file_type=json"
```
**SA Coverage:** Yes (BIS covers South Africa explicitly)
**Reliability:** High (BIS is the global authority on credit statistics)
**Notes:** BIS data covers 44 economies including SA. The credit-to-GDP gap is a key early warning indicator for financial crises. BIS API docs: https://stats.bis.org/api-doc/v2/. Calculate growth rate from quarterly observations.

---

### 1.10 Money Supply (M2)

**Data Point:** M2 money stock and growth rate
**Source:** FRED
**URL/Endpoint:** `https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=YOUR_KEY&file_type=json`
**Cost:** Free
**Format:** JSON / XML
**Update Frequency:** Weekly (Tuesdays, 1-week lag)
**Auth:** API key (same FRED key)
**Rate Limit:** 120 requests/minute
**Example Call:**
```bash
curl "https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=YOUR_KEY&file_type=json&sort_order=desc&limit=52"
```
**SA Coverage:** No (for SA M2, use SARB Online Query -- see 1.11)
**Reliability:** High
**Notes:** `M2SL` = seasonally adjusted M2 (monthly). `WM2NS` = weekly, not seasonally adjusted. Calculate YoY growth rate in code: `(current - year_ago) / year_ago * 100`.

---

### 1.11 South African Macro Indicators

This is a composite data point requiring multiple sources:

#### SA Repo Rate + Bond Yields + Money Supply

**Source:** SARB Online Statistical Query
**URL/Endpoint:** `https://www.resbank.co.za/en/home/what-we-do/statistics/releases/economic-and-financial-data-for-south-africa`
**Cost:** Free
**Format:** XLSX / CSV (manual download or scrape)
**Update Frequency:** Monthly / After MPC meetings (repo rate)
**Auth:** None
**Rate Limit:** N/A (download-based)
**Notes:** No official API exists. Use the `sarbR` Python/R package (https://github.com/HanjoStudy/sarbR) for programmatic access, though it is unofficial. Key series: repo rate, prime rate, SA 10Y government bond yield, M2 money supply. Alternatively, scrape from https://www.global-rates.com/en/interest-rates/central-banks/6/south-african-sarb-repo-rate/.

#### ZAR/USD Exchange Rate

**Source:** EODHD (existing subscription) or FRED
**URL/Endpoint:**
- EODHD: `https://eodhd.com/api/real-time/USDZAR.FOREX?api_token=YOUR_TOKEN&fmt=json`
- FRED: `series_id=DEXSFUS` (SA Rand per USD, daily)

**Cost:** Free (FRED) / Included (EODHD)
**Format:** JSON
**Update Frequency:** Daily / Real-time (EODHD)
**Reliability:** High

#### SA CPI (Inflation)

**Source:** StatsSA + FRED
**URL/Endpoint:**
- StatsSA: https://www.statssa.gov.za/?page_id=1871 (CPI Historical Archive, XLSX download)
- FRED: `series_id=FPCPITOTLZGZAF` (SA CPI annual % change)

**Cost:** Free
**Format:** XLSX (StatsSA) / JSON (FRED)
**Update Frequency:** Monthly
**Example Call:**
```bash
curl "https://api.stlouisfed.org/fred/series/observations?series_id=FPCPITOTLZGZAF&api_key=YOUR_KEY&file_type=json&sort_order=desc&limit=24"
```
**Reliability:** High

#### JSE All Share Index

**Source:** EODHD (existing) or yfinance
**URL/Endpoint:**
- EODHD: `https://eodhd.com/api/eod/JALSH.JSE?api_token=YOUR_TOKEN&fmt=json&from=2025-01-01`
- yfinance: `yf.Ticker("^J203.JO").history(period="1y")`

**Cost:** Included (EODHD) / Free (yfinance)
**Format:** JSON
**Update Frequency:** Daily
**Reliability:** High (EODHD) / Medium (yfinance)

#### Eskom Load Shedding Status

**Source:** EskomSePush API
**URL/Endpoint:** `https://developer.sepush.co.za/business/2.0/status`
**Cost:** Free (50 requests/day for personal use)
**Format:** JSON
**Update Frequency:** Real-time
**Auth:** API token (free at https://eskomsepush.gumroad.com/l/api)
**Rate Limit:** 50 requests/day (free tier)
**Example Call:**
```bash
curl -H "token: YOUR_ESP_TOKEN" "https://developer.sepush.co.za/business/2.0/status"
```
**SA Coverage:** Yes (primary purpose)
**Reliability:** High
**Notes:** Returns current load shedding stage (0 = none, 1-8 = severity). As of March 2026, SA has had 300+ days without load shedding. Still worth monitoring as an economic risk indicator. Additional endpoints: `/areas_search`, `/area?id=X` (schedule per area).

---

## 2. STOCK-SPECIFIC FINANCIAL DATA

---

### 2.1 Full Income Statement, Balance Sheet, Cash Flow (Items 12-14)

**Data Point:** Complete financial statements -- annual and quarterly
**Source:** EODHD (existing subscription -- primary)
**URL/Endpoint:**
- `https://eodhd.com/api/fundamentals/AAPL.US?api_token=YOUR_TOKEN&filter=Financials::Income_Statement::yearly`
- `https://eodhd.com/api/fundamentals/AAPL.US?api_token=YOUR_TOKEN&filter=Financials::Balance_Sheet::yearly`
- `https://eodhd.com/api/fundamentals/AAPL.US?api_token=YOUR_TOKEN&filter=Financials::Cash_Flow::yearly`

**Cost:** Included in $60/mo EODHD subscription
**Format:** JSON
**Update Frequency:** Quarterly (after earnings)
**Auth:** API token
**Rate Limit:** 100,000 requests/day
**SA Coverage:** Yes (JSE exchange supported)
**Reliability:** High
**Notes:** EODHD covers all required line items: revenue, COGS, gross profit, SGA, R&D, D&A, EBIT, interest expense, tax, net income, current/non-current assets, PP&E, goodwill, current/long-term liabilities, equity, retained earnings, shares outstanding, operating cash flow, capex, FCF, dividends paid, buybacks. For JSE tickers, use format `TICKER.JSE`.

**Backup Sources:**
| Source | Cost | Coverage | Notes |
|--------|------|----------|-------|
| Financial Modeling Prep | Free (250 calls/day) | US + some intl | 5-year history on free tier |
| Finnhub | Free (60 calls/min) | US primary | Good for supplementary data |
| SimFin | Free (delayed 12mo) | US 5000+ stocks | Bulk CSV download, clean data |
| Alpha Vantage | Free (25 calls/day) | US primary | Very restrictive free tier |

---

### 2.2 Historical Prices (Item 15)

**Data Point:** Daily OHLCV for moving averages, RSI, drawdown calculations
**Source:** EODHD (primary) + yfinance (backup/supplement)
**URL/Endpoint:**
- EODHD: `https://eodhd.com/api/eod/AAPL.US?api_token=YOUR_TOKEN&fmt=json&from=2020-01-01`
- yfinance: `yf.Ticker("AAPL").history(period="5y")`

**Cost:** Included (EODHD) / Free (yfinance)
**Format:** JSON (EODHD) / DataFrame (yfinance)
**Update Frequency:** Daily (EOD) / Real-time (yfinance during market hours)
**SA Coverage:** Yes (both support JSE tickers)
**Reliability:** High (EODHD) / Medium (yfinance -- unofficial, may break)
**Notes:** yfinance JSE tickers use format `NPN.JO` (Naspers on JSE). For technical indicators, compute from raw OHLCV in code.

---

### 2.3 Dividend History (Item 16)

**Data Point:** Historical dividend payments for Gordon Growth DDM
**Source:** EODHD (primary) + yfinance (backup)
**URL/Endpoint:**
- EODHD: `https://eodhd.com/api/div/AAPL.US?api_token=YOUR_TOKEN&fmt=json&from=2015-01-01`
- yfinance: `yf.Ticker("AAPL").dividends`

**Cost:** Included (EODHD) / Free (yfinance)
**Format:** JSON / DataFrame
**Update Frequency:** After each dividend declaration
**SA Coverage:** Yes
**Reliability:** High (EODHD) / Medium (yfinance)
**Notes:** For DDM, you need at least 5 years of dividend history to calculate growth rate. EODHD provides ex-date, payment date, and amount. yfinance provides ex-date and amount.

---

### 2.4 Earnings History (Item 17)

**Data Point:** 5-10 years of EPS for persistence scoring and CAPE calculation
**Source:** EODHD (primary)
**URL/Endpoint:** `https://eodhd.com/api/fundamentals/AAPL.US?api_token=YOUR_TOKEN&filter=Earnings::History`
**Cost:** Included in EODHD subscription
**Format:** JSON
**Update Frequency:** Quarterly
**SA Coverage:** Yes (JSE)
**Reliability:** High
**Notes:** Returns quarterly EPS history. For 10-year CAPE calculation, aggregate annual earnings from income statement data. Supplement with Nasdaq Data Link `MULTPL/SP500_EARNINGS_MONTH` for S&P 500 aggregate earnings.

---

### 2.5 Insider Transactions (Item 18)

**Data Point:** Buy/sell transactions, amount, timing, officer role
**Source:** Finnhub (primary for US) + SEC EDGAR/EdgarTools (backup)
**URL/Endpoint:**
- Finnhub: `https://finnhub.io/api/v1/stock/insider-transactions?symbol=AAPL&token=YOUR_KEY`
- EODHD: `https://eodhd.com/api/insider-transactions?code=AAPL.US&api_token=YOUR_TOKEN` (US only -- SEC Form 4)
- EdgarTools (Python): `from edgar import Company; Company("AAPL").get_filings(form="4")`

**Cost:** Free (Finnhub) / Included (EODHD) / Free (EdgarTools)
**Format:** JSON
**Update Frequency:** Daily (as filings occur)
**Auth:** API key (Finnhub free registration at https://finnhub.io/)
**Rate Limit:** 60 calls/minute (Finnhub) / 100K/day (EODHD) / 10 req/sec (SEC EDGAR)
**Example Call:**
```bash
curl "https://finnhub.io/api/v1/stock/insider-transactions?symbol=AAPL&token=YOUR_KEY"
```
**SA Coverage:** No (SEC Form 4 is US only. JSE insider dealing is reported via SENS -- no free API)
**Reliability:** High
**Notes:** For SA insider dealings, monitor SENS announcements via Moneyweb scraping (see section 3.2). EdgarTools is fully free and open-source, with no API key needed for SEC EDGAR data.

---

### 2.6 Short Interest (Item 19)

**Data Point:** Shares short, % of float, days to cover
**Source:** Finnhub (primary) + FINRA (backup)
**URL/Endpoint:**
- Finnhub: `https://finnhub.io/api/v1/stock/short-interest?symbol=AAPL&token=YOUR_KEY`
- FINRA: `https://api.finra.org/data/group/otcMarket/name/EquityShortInterest`

**Cost:** Free (Finnhub free tier) / Free (FINRA -- registration required)
**Format:** JSON / CSV
**Update Frequency:** Bi-weekly (FINRA publishes twice monthly)
**Auth:** API key (Finnhub) / FINRA Gateway credentials
**Rate Limit:** 60 calls/min (Finnhub)
**Example Call:**
```bash
curl "https://finnhub.io/api/v1/stock/short-interest?symbol=AAPL&token=YOUR_KEY"
```
**SA Coverage:** No (US only -- JSE does not publish free short interest data)
**Reliability:** Medium (short interest data is inherently delayed)
**Notes:** FINRA short interest is the authoritative source but requires registration. Finnhub may have this as a premium endpoint -- verify on your free tier. As a fallback, EODHD `fundamentals` endpoint includes `SharesShort` and `ShortPercentFloat` in the general data section.

---

### 2.7 Institutional Holdings (Item 20)

**Data Point:** 13F filings, changes quarter over quarter
**Source:** SEC EDGAR / EdgarTools (primary) + Finnhub (backup)
**URL/Endpoint:**
- EdgarTools (Python): `from edgar import Company; Company("AAPL").get_filings(form="13F-HR")`
- Finnhub: `https://finnhub.io/api/v1/institutional/ownership?symbol=AAPL&token=YOUR_KEY`
- SEC EDGAR direct: `https://efts.sec.gov/LATEST/search-index?q=%2213F%22+%22AAPL%22&dateRange=custom&startdt=2025-01-01`

**Cost:** Free
**Format:** JSON / structured Python objects
**Update Frequency:** Quarterly (13F filings due 45 days after quarter end)
**Auth:** None (EdgarTools) / API key (Finnhub)
**Rate Limit:** 10 requests/sec (SEC EDGAR) / 60 calls/min (Finnhub)
**SA Coverage:** No (13F is US regulatory filing)
**Reliability:** High
**Notes:** EdgarTools is the recommended approach -- fully free, no API key, parses 13F-HR filings into structured holdings data. For SA institutional holdings, check JSE company annual reports or SENS disclosures.

---

### 2.8 ESG Scores (Item 21)

**Data Point:** Environmental, Social, Governance ratings
**Source:** Finnhub (primary) + Financial Modeling Prep (backup)
**URL/Endpoint:**
- Finnhub: `https://finnhub.io/api/v1/stock/esg?symbol=AAPL&token=YOUR_KEY`
- FMP: `https://financialmodelingprep.com/api/v4/esg-environmental-social-governance-data?symbol=AAPL&apikey=YOUR_KEY`

**Cost:** Free (verify ESG is on Finnhub free tier -- may be premium)
**Format:** JSON
**Update Frequency:** Quarterly / Annual
**Auth:** API key
**Rate Limit:** 60 calls/min (Finnhub) / 250 calls/day (FMP free)
**SA Coverage:** Limited (major JSE companies may have coverage via FMP)
**Reliability:** Medium (ESG methodologies vary significantly between providers)
**Notes:** ESG data is notoriously inconsistent across providers. Finnhub ESG may require a paid plan ($11.99+/mo). FMP provides ESG on the free tier for many companies. For SA companies, FTSE Russell ESG ratings cover JSE Top 40 but are not freely accessible via API.

---

## 3. SA-SPECIFIC DATA

---

### 3.1 JSE Listed Companies -- Full Financials (Item 22)

**Data Point:** Financial statements for JSE-listed stocks
**Source:** EODHD (primary -- existing subscription)
**URL/Endpoint:** `https://eodhd.com/api/fundamentals/NPN.JSE?api_token=YOUR_TOKEN`
**Cost:** Included in $60/mo EODHD subscription
**Format:** JSON
**Update Frequency:** Quarterly / Semi-annually (SA companies often report semi-annually)
**SA Coverage:** Yes
**Reliability:** High
**Notes:** EODHD covers JSE exchange with historical prices and fundamentals. Ticker format: `SYMBOL.JSE`. Coverage includes major JSE stocks (Top 40, mid-caps). Smaller JSE companies may have gaps. Supplement with yfinance: `yf.Ticker("NPN.JO")`.

**Backup:** yfinance with `.JO` suffix (e.g., `NPN.JO`, `SOL.JO`, `BHP.JO`). Free but may have incomplete fundamental data for some JSE stocks.

---

### 3.2 SENS Announcements (Item 23)

**Data Point:** JSE Stock Exchange News Service company announcements
**Source:** Moneyweb SENS Archive (scrape) + JSE Client Portal
**URL/Endpoint:**
- Moneyweb: `https://www.moneyweb.co.za/tools-and-data/moneyweb-sens/` (searchable, scrapeable)
- JSE: `https://clientportal.jse.co.za/communication/sens-announcements`
- Kaggle dataset: `https://www.kaggle.com/datasets/katendencies/jse-sens-announcements` (historical)

**Cost:** Free (scraping) / Free (Kaggle historical)
**Format:** HTML (scrape to JSON) / CSV (Kaggle)
**Update Frequency:** Real-time (as announcements are published)
**Auth:** None
**Rate Limit:** Be respectful -- 1 request per 2-3 seconds when scraping
**SA Coverage:** Yes (exclusive SA data)
**Reliability:** Medium (scraping-dependent, may break if site changes)
**Notes:** No free SENS API exists. Best approach: scrape Moneyweb SENS page daily, parse HTML, store in local DB. ShareData Online (sharedata.co.za) also has a SENS search. For historical analysis, the Kaggle dataset provides a starting point. Consider building a scraper with BeautifulSoup or Playwright.

---

### 3.3 SA Company Registrations (Item 24)

**Data Point:** CIPC company registration data
**Source:** CIPC eServices / BizPortal
**URL/Endpoint:**
- CIPC: `https://eservices.cipc.co.za/`
- BizPortal: `https://www.bizportal.gov.za/`

**Cost:** Free (basic searches)
**Format:** HTML (scrape)
**Update Frequency:** Real-time
**Auth:** Registration required
**SA Coverage:** Yes
**Reliability:** Medium
**Notes:** CIPC does not offer a public API. Basic company searches are possible through the eServices portal. For bulk data or programmatic access, this is a gap in the SA data ecosystem. The Open Data South Africa Toolkit (https://opendataza.gitbook.io/) lists additional company data resources.

---

### 3.4 SA Property Data (Item 25)

**Data Point:** Residential Property Price Index (RPPI)
**Source:** StatsSA + SARB
**URL/Endpoint:**
- StatsSA: `https://www.statssa.gov.za/publications/P0160/` (RPPI Statistical Release)
- SARB: search for "KBP7073" (house price index) in SARB online query
- FNB House Price Index: published monthly in press releases

**Cost:** Free
**Format:** PDF / XLSX
**Update Frequency:** Monthly (RPPI) / Quarterly (SARB)
**Auth:** None
**SA Coverage:** Yes (national, provincial, and metropolitan breakdown)
**Reliability:** High
**Notes:** The RPPI was developed by StatsSA in partnership with SARB and IMF. Download monthly releases as PDF/XLSX. For programmatic use, scrape the StatsSA publications page or use the SARB online query tool. Supplement with Lightstone Property data (paid) or FNB/Absa house price indices from press releases.

---

### 3.5 SA Sector Data (Item 26)

**Data Point:** Mining production, retail sales, banking indicators
**Source:** StatsSA + SARB + FRED
**URL/Endpoint:**
- StatsSA Mining Production: `https://www.statssa.gov.za/?page_id=1856` (P2041 release)
- StatsSA Retail Sales: `https://www.statssa.gov.za/?page_id=1866` (P6242.1 release)
- FRED SA indicators:
  - Mining production: `series_id=ZAPRMNTO01IXOBM`
  - Retail sales: `series_id=SLRTTO02ZAM659S`
- SARB banking indicators: SARB online statistical query (BA900 returns)

**Cost:** Free
**Format:** PDF / XLSX (StatsSA) / JSON (FRED)
**Update Frequency:** Monthly
**SA Coverage:** Yes
**Reliability:** High
**Notes:** FRED mirrors many SA indicators from OECD/World Bank sources. Use FRED for programmatic access and StatsSA for the most detailed breakdowns. For banking sector health, SARB publishes monthly BA900 returns.

---

## 4. ALTERNATIVE DATA

---

### 4.1 News Sentiment (Item 27)

**Data Point:** Financial news sentiment analysis
**Source:** EODHD (existing -- primary) + Finnhub (supplementary)
**URL/Endpoint:**
- EODHD: `https://eodhd.com/api/news?s=AAPL.US&api_token=YOUR_TOKEN&from=2026-01-01`
- Finnhub: `https://finnhub.io/api/v1/company-news?symbol=AAPL&from=2026-03-01&to=2026-03-30&token=YOUR_KEY`
- Finnhub Sentiment: `https://finnhub.io/api/v1/news-sentiment?symbol=AAPL&token=YOUR_KEY`

**Cost:** Included (EODHD) / Free (Finnhub)
**Format:** JSON
**Update Frequency:** Real-time / Daily
**Auth:** API tokens
**Rate Limit:** 100K/day (EODHD) / 60/min (Finnhub)
**SA Coverage:** Limited (mostly US/global news)
**Reliability:** High
**Notes:** You already have EODHD news + FinBERT for sentiment. Finnhub adds additional coverage and provides pre-calculated sentiment scores via their news-sentiment endpoint. For SA-specific news sentiment, consider scraping Moneyweb, BusinessDay, or Fin24 headlines and running through FinBERT locally.

---

### 4.2 Google Trends (Item 28)

**Data Point:** Search interest as a leading indicator
**Source:** Google Trends API (official, alpha) + pytrends (unofficial)
**URL/Endpoint:**
- Official API: `https://developers.google.com/search/apis/trends` (alpha, limited)
- pytrends (Python): `from pytrends.request import TrendReq; pytrends = TrendReq(); pytrends.build_payload(["bitcoin"], geo="ZA")`

**Cost:** Free
**Format:** JSON (API) / DataFrame (pytrends)
**Update Frequency:** Daily (interest over time) / Real-time (trending searches)
**Auth:** Google Cloud API key (official) / None (pytrends)
**Rate Limit:** ~1,400 requests before throttling (pytrends); official API has quotas
**Example Call (pytrends):**
```python
from pytrends.request import TrendReq
pytrends = TrendReq(hl='en-US', tz=120)  # tz=120 for SAST
pytrends.build_payload(["MTN Group", "Naspers"], geo="ZA", timeframe="today 3-m")
df = pytrends.interest_over_time()
```
**SA Coverage:** Yes (can filter by geo="ZA" for South Africa)
**Reliability:** Medium (pytrends can break; official API is alpha)
**Notes:** Google launched an official Trends API in 2025 (alpha). For production use, pytrends with rate limiting (sleep 60s between bursts) is more practical. Use as a leading indicator for retail sentiment, brand interest, or sector momentum. The `geo="ZA"` parameter gives SA-specific search interest.

---

### 4.3 Satellite / Foot Traffic (Item 29)

**Data Point:** Physical visitation data and satellite imagery analytics
**Source:** No free source available
**Cost:** All providers are paid ($500+/mo)
**SA Coverage:** Very limited
**Reliability:** N/A
**Notes:** Free satellite/foot traffic data does not exist for investment use. Providers like Placer.ai, RS Metrics, and Orbital Insight charge enterprise pricing. **Recommended alternative:** Use Google Trends and Google Maps Popular Times as free proxies for foot traffic. For SA specifically, Vodacom/MTN do not offer free mobility data.

**Free Proxy Alternatives:**
- Google Trends (see 4.2) for digital foot traffic
- OpenStreetMap + Overpass API for POI density analysis (free)
- NASA FIRMS for fire/environmental satellite data (free, https://firms.modaps.eosdis.nasa.gov/api/)

---

### 4.4 Patent Filings (Item 30)

**Data Point:** Innovation indicators from patent data
**Source:** USPTO PatentsView (US) + Lens.org (global)
**URL/Endpoint:**
- PatentsView: `https://search.patentsview.org/api/v1/patent/?q={"assignee_organization":"Apple Inc"}&f=["patent_id","patent_date","patent_title"]`
- Lens.org: `https://www.lens.org/lens/api/` (free for research)
- USPTO Open Data Portal: `https://data.uspto.gov/apis/getting-started`

**Cost:** Free
**Format:** JSON
**Update Frequency:** Weekly (new patents published Tuesdays)
**Auth:** API key for PatentsView (free); registration for Lens.org
**Rate Limit:** PatentsView: 45 requests/minute. Lens.org: 50 requests/minute (research tier)
**Example Call:**
```bash
curl "https://search.patentsview.org/api/v1/patent/?q={\"assignee_organization\":\"Apple Inc\"}&f=[\"patent_id\",\"patent_date\",\"patent_title\"]&s=[{\"patent_date\":\"desc\"}]&o={\"per_page\":10}"
```
**SA Coverage:** No (USPTO is US patents only; Lens.org covers global patents including CIPC/SA)
**Reliability:** High
**Notes:** PatentsView is maintained by USPTO and is the best free US patent API. Lens.org provides global patent coverage (140M+ records) including South African patents. Use patent filing trends as innovation indicators -- rising filings may signal future competitive advantage.

---

## 5. API KEY REGISTRATION CHECKLIST

| Service | Registration URL | Key Type | Time to Get Key |
|---------|-----------------|----------|-----------------|
| FRED | https://fred.stlouisfed.org/docs/api/api_key.html | API key | Instant |
| Finnhub | https://finnhub.io/register | API key | Instant |
| Nasdaq Data Link | https://data.nasdaq.com/sign-up | API key | Instant |
| Financial Modeling Prep | https://site.financialmodelingprep.com/developer/docs | API key | Instant |
| EskomSePush | https://eskomsepush.gumroad.com/l/api | Token | Instant |
| Alpha Vantage | https://www.alphavantage.co/support/#api-key | API key | Instant |
| Google Trends (official) | https://console.cloud.google.com/ | API key | 5 minutes |
| PatentsView | https://patentsview.org/apis/purpose | API key | Instant |
| Lens.org | https://www.lens.org/lens/user/subscriptions | Token | 1-2 days |
| World Bank | N/A (no auth required) | None | N/A |
| BIS | N/A (no auth required) | None | N/A |
| SEC EDGAR | N/A (EdgarTools, no auth) | None | N/A |

---

## 6. DATA POINT TO SOURCE MAPPING (Quick Reference)

| # | Data Point | Primary Source | Backup Source | Free? |
|---|-----------|---------------|---------------|-------|
| 1 | VIX | FRED (VIXCLS) | yfinance (^VIX) | Yes |
| 2 | Credit Spreads | FRED (BAMLH0A0HYM2) | -- | Yes |
| 3 | Yield Curve | FRED (T10Y2Y) | -- | Yes |
| 4 | Shiller CAPE | Nasdaq Data Link (MULTPL/SHILLER_PE_RATIO_MONTH) | Yale XLS | Yes |
| 5 | AAII Sentiment | Nasdaq Data Link (AAII/AAII_SENTIMENT) | AAII website CSV | Yes |
| 6 | Fed Funds Rate | FRED (DFF) | -- | Yes |
| 7 | Consumer Confidence | FRED (UMCSENT) | -- | Yes |
| 8 | PMI | Nasdaq Data Link (ISM/MAN_PMI) | FRED proxies | Yes |
| 9 | Credit Growth | BIS API (TOTAL_CREDIT) | FRED (QUSPAM770A) | Yes |
| 10 | Money Supply M2 | FRED (M2SL) | SARB (SA M2) | Yes |
| 11a | SA Repo Rate | SARB Online Query | global-rates.com | Yes |
| 11b | ZAR/USD | EODHD (USDZAR.FOREX) | FRED (DEXSFUS) | Yes |
| 11c | SA CPI | FRED (FPCPITOTLZGZAF) | StatsSA | Yes |
| 11d | JSE All Share | EODHD (JALSH.JSE) | yfinance (^J203.JO) | Yes |
| 11e | Eskom Status | EskomSePush API | -- | Yes |
| 12 | Income Statement | EODHD | FMP / Finnhub | Yes* |
| 13 | Balance Sheet | EODHD | FMP / Finnhub | Yes* |
| 14 | Cash Flow | EODHD | FMP / Finnhub | Yes* |
| 15 | Historical Prices | EODHD | yfinance | Yes* |
| 16 | Dividend History | EODHD | yfinance | Yes* |
| 17 | Earnings History | EODHD | FMP | Yes* |
| 18 | Insider Transactions | Finnhub | EODHD / EdgarTools | Yes |
| 19 | Short Interest | Finnhub | FINRA API | Yes |
| 20 | Institutional Holdings | EdgarTools (SEC) | Finnhub | Yes |
| 21 | ESG Scores | Finnhub / FMP | -- | Yes** |
| 22 | JSE Financials | EODHD | yfinance | Yes* |
| 23 | SENS Announcements | Moneyweb (scrape) | JSE portal | Yes |
| 24 | SA Company Reg | CIPC eServices | -- | Yes |
| 25 | SA Property Data | StatsSA (P0160) | SARB | Yes |
| 26 | SA Sector Data | StatsSA / FRED | SARB | Yes |
| 27 | News Sentiment | EODHD + FinBERT | Finnhub | Yes* |
| 28 | Google Trends | pytrends / official API | -- | Yes |
| 29 | Satellite/Foot Traffic | None (use proxies) | Google Trends | N/A |
| 30 | Patent Filings | PatentsView (US) / Lens.org | USPTO ODP | Yes |

\* Included in existing EODHD $60/mo subscription
\** May require Finnhub paid tier ($11.99/mo) for full ESG

---

## 7. IMPLEMENTATION PRIORITY

### Phase 1: Quick Wins (Week 1)
Register for free API keys and integrate:
1. **FRED API** -- covers 8+ macro data points with a single API key
2. **Nasdaq Data Link** -- AAII sentiment + Shiller CAPE + PMI
3. **Finnhub** -- insider transactions, institutional holdings, news sentiment
4. **EskomSePush** -- load shedding status

### Phase 2: SA Data (Week 2)
5. **BIS API** -- credit-to-GDP gap for SA and US
6. **SARB scraper** -- repo rate, bond yields, money supply
7. **StatsSA scraper** -- CPI, property index, mining/retail data
8. **Moneyweb SENS scraper** -- JSE announcements

### Phase 3: Alternative Data (Week 3)
9. **pytrends** -- Google Trends for sentiment/leading indicators
10. **PatentsView / Lens.org** -- innovation indicators
11. **EdgarTools** -- deeper SEC filing analysis (13F, Form 4)

### Phase 4: Enrichment (Week 4)
12. **FMP free tier** -- supplementary financials for non-EODHD gaps
13. **World Bank API** -- long-term SA economic indicators
14. **SimFin** -- bulk fundamental data for backtesting

---

## 8. ARCHITECTURE NOTES

### Recommended Data Pipeline

```
[Schedulers]
  |
  v
[API Fetchers] --> [Raw Data Store (SQLite/Postgres)]
  |                        |
  |                        v
  |                 [Data Normalization Layer]
  |                        |
  |                        v
  |                 [Calculator Engine (42 calculators)]
  |                        |
  |                        v
  |                 [Results Store]
  |                        |
  |                        v
  |                 [Dashboard / API]
```

### Caching Strategy
- **Real-time data** (VIX, prices): cache for 15 minutes
- **Daily data** (FRED, EODHD EOD): cache for 24 hours, refresh at 6:00 AM SAST
- **Weekly data** (AAII, short interest): cache for 7 days
- **Monthly data** (CPI, PMI, SARB): cache for 30 days
- **Quarterly data** (13F, BIS credit): cache for 90 days
- **Static data** (Shiller CAPE history, patent data): cache for 24 hours

### Error Handling
- All API calls should have retry logic (3 retries with exponential backoff)
- Fallback to backup sources if primary fails
- Log all API failures for monitoring
- Rate limit tracking to stay within free tier limits

---

## 9. KNOWN GAPS AND LIMITATIONS

| Gap | Impact | Workaround |
|-----|--------|-----------|
| No free SENS API | Cannot auto-ingest JSE announcements | Build Moneyweb scraper |
| SARB has no API | Cannot programmatically fetch SA repo rate | sarbR package or scrape |
| ISM PMI removed from FRED | Must use alternative source | Nasdaq Data Link or proxy indicators |
| ESG may need paid tier | Incomplete ESG coverage on free plans | Use FMP free tier, accept limited coverage |
| No free SA foot traffic data | Cannot track physical retail activity | Use Google Trends as proxy |
| JSE insider dealing not in free APIs | SA insider data gap | Monitor SENS for insider dealing notices |
| CIPC has no API | Cannot bulk-query company registrations | Manual or build scraper |
| Conference Board data is proprietary | Only Michigan sentiment available free | Use UMCSENT as proxy |
| SA PMI (Absa) not in free APIs | Cannot programmatically get SA PMI | Scrape TradingEconomics |

---

## 10. USEFUL FRED SERIES ID REFERENCE

| Series ID | Description | Frequency |
|-----------|-------------|-----------|
| VIXCLS | CBOE Volatility Index | Daily |
| BAMLH0A0HYM2 | BofA US High Yield OAS | Daily |
| T10Y2Y | 10Y-2Y Treasury Spread | Daily |
| DGS10 | 10-Year Treasury Rate | Daily |
| DGS2 | 2-Year Treasury Rate | Daily |
| DFF | Fed Funds Effective Rate | Daily |
| DFEDTARU | Fed Funds Upper Target | Daily |
| UMCSENT | Michigan Consumer Sentiment | Monthly |
| M2SL | M2 Money Stock | Monthly |
| WM2NS | M2 Money Stock (weekly) | Weekly |
| CPIAUCSL | CPI All Urban Consumers | Monthly |
| FPCPITOTLZGZAF | SA CPI Annual % Change | Annual |
| DEXSFUS | ZAR/USD Exchange Rate | Daily |
| QUSPAM770A | US Total Credit to Private Sector | Quarterly |
| UNRATE | US Unemployment Rate | Monthly |
| INDPRO | Industrial Production Index | Monthly |
| SLRTTO02ZAM659S | SA Retail Sales | Monthly |
| ZAPRMNTO01IXOBM | SA Mining Production | Monthly |
| SP500 | S&P 500 (if available) | Daily |

---

*Document generated for the Dhando Analyzer investment methodology platform.*
*All sources verified as of 2026-03-30.*
