# Prediction Markets API + Game Theory Prediction Model Research

Research date: 2026-03-30

---

## Part 1: Polymarket API -- Complete Specification

### Architecture Overview

Polymarket exposes four API services:

| Service | Base URL | Auth Required | Purpose |
|---------|----------|---------------|---------|
| Gamma API | `https://gamma-api.polymarket.com` | No | Market discovery, metadata, events |
| CLOB API | `https://clob.polymarket.com` | No (reads) / Yes (writes) | Prices, orderbooks, trading |
| Data API | `https://data-api.polymarket.com` | No (public) / Yes (personal) | Positions, trades, activity |
| WebSocket | `wss://ws-subscriptions-clob.polymarket.com/ws/` | No (market) / Yes (user) | Real-time price/book updates |

### Data Hierarchy

```
Series (collection of related events)
  -> Event (container for related markets, e.g. "Fed Rate Cuts 2026")
    -> Market (single binary outcome, e.g. "Will 2 rate cuts happen?")
      -> Outcomes: ["Yes", "No"]
      -> OutcomePrices: [0.195, 0.805]  (= probabilities)
      -> clobTokenIds: [YES_TOKEN_ID, NO_TOKEN_ID]
```

Key identifiers:
- `conditionId` -- on-chain identifier for conditional tokens (hex string)
- `clobTokenIds` -- array of two large integers (YES token, NO token) used for CLOB price queries
- `slug` -- human-readable URL identifier
- `questionID` -- hash of market question used for resolution

### Gamma API Endpoints (Market Discovery)

#### GET /events -- List/Search Events

```bash
# All active events, sorted by volume
curl "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&offset=0"

# Specific event by slug
curl "https://gamma-api.polymarket.com/events?slug=how-many-fed-rate-cuts-in-2026"

# By tag/category
curl "https://gamma-api.polymarket.com/events?tag_id=100381&active=true&closed=false&limit=10"

# Sort options: volume, liquidity, start_date, end_date, competitive, closed_time
curl "https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume&ascending=false&limit=100"
```

Query parameters:
- `slug` (string) -- retrieve by URL slug
- `tag_id` (int) -- filter by category
- `exclude_tag_id` (int) -- exclude category
- `related_tags` (bool) -- include related
- `active` (bool) -- live tradeable status
- `closed` (bool) -- historical
- `order` (string) -- sort field: volume, liquidity, start_date, end_date, competitive, closed_time
- `ascending` (bool) -- sort direction (default: false)
- `limit` (int) -- results per page
- `offset` (int) -- pagination offset

#### GET /markets -- List/Search Markets

```bash
# All open markets
curl "https://gamma-api.polymarket.com/markets?closed=false&limit=20"

# Specific market by slug
curl "https://gamma-api.polymarket.com/markets?slug=fed-decision-in-october"

# By condition IDs
curl "https://gamma-api.polymarket.com/markets?condition_ids=0xabc123..."
```

#### GET /tags -- Categories

```bash
curl "https://gamma-api.polymarket.com/tags"
```

#### GET /search -- Keyword Search

```bash
curl "https://gamma-api.polymarket.com/search?q=recession"
```

### Event Object -- Full JSON Structure (from live API)

```json
{
  "id": "30829",
  "ticker": "how-many-fed-rate-cuts-in-2026",
  "slug": "how-many-fed-rate-cuts-in-2026",
  "title": "How many Fed rate cuts in 2026?",
  "description": "...",
  "resolutionSource": "",
  "startDate": "2025-07-11T18:41:17.827Z",
  "creationDate": "2025-07-11T18:41:17.827Z",
  "endDate": "2026-12-31T00:00:00Z",
  "image": "https://polymarket-upload.s3...",
  "active": true,
  "closed": false,
  "archived": false,
  "new": false,
  "featured": true,
  "restricted": true,
  "liquidity": 37285719.08,
  "volume": 15295831.0,
  "openInterest": 16932488.92,
  "sortBy": "price",
  "competitive": 0.94,
  "volume24hr": 8492904.25,
  "volume1wk": 47053473.24,
  "volume1mo": 222366785.67,
  "volume1yr": 959437089.80,
  "enableOrderBook": true,
  "liquidityClob": 37285719.08,
  "negRisk": true,
  "negRiskMarketID": "0x2c3d7e...",
  "commentCount": 630,
  "markets": [ ... ]  // Array of Market objects
}
```

### Market Object -- Full JSON Structure (from live API)

```json
{
  "id": "559657",
  "question": "Will no Fed rate cuts happen in 2026?",
  "conditionId": "0xd4e77ba6f29fc093509d24f5086...",
  "slug": "will-no-fed-rate-cuts-happen-in-2026",
  "resolutionSource": "",
  "endDate": "2026-12-31T00:00:00Z",
  "liquidity": "461420.31",
  "startDate": "2025-07-11T18:36:02.893Z",
  "image": "https://polymarket-upload.s3...",
  "description": "...",
  "outcomes": "[\"Yes\", \"No\"]",
  "outcomePrices": "[\"0.315\", \"0.685\"]",
  "volume": "14202372.64",
  "active": true,
  "closed": false,
  "groupItemTitle": "0 cuts",
  "groupItemThreshold": "5",
  "enableOrderBook": true,
  "orderPriceMinTickSize": 0.001,
  "orderMinSize": 5,
  "volumeNum": 14202372.64,
  "liquidityNum": 461420.31,
  "volume24hr": 188655.30,
  "volume1wk": 901018.93,
  "volume1mo": 4018557.94,
  "clobTokenIds": "[\"60590045489...\", \"76005700027...\"]",
  "bestBid": 0.31,
  "bestAsk": 0.32,
  "lastTradePrice": 0.315,
  "oneDayPriceChange": 0.002,
  "oneWeekPriceChange": 0.002,
  "oneMonthPriceChange": 0.006,
  "spread": 0.001,
  "negRisk": true,
  "negRiskMarketID": "0x2c3d7e...",
  "acceptingOrders": true,
  "approved": true,
  "feesEnabled": false,
  "makerBaseFee": 0,
  "takerBaseFee": 100,
  "competitive": 0.81,
  "createdAt": "2025-07-03T20:37:02.834Z",
  "updatedAt": "2026-04-01T18:03:14.187Z"
}
```

**Key fields for investment analysis:**
- `outcomePrices` -- this IS the probability (e.g., "0.315" = 31.5% chance). Prices for Yes+No sum to ~1.0.
- `volume` / `volume24hr` -- trading volume in USD. Higher = more liquid = more reliable signal.
- `liquidityNum` -- order book depth. Higher = tighter spreads.
- `bestBid` / `bestAsk` / `spread` -- market microstructure data.
- `lastTradePrice` -- most recent execution price.
- `oneDayPriceChange` / `oneWeekPriceChange` / `oneMonthPriceChange` -- trend data.

### CLOB API Endpoints (Prices & Order Books)

All read endpoints below require NO authentication.

#### GET /price -- Current Best Price

```bash
# Get best ask (buy price) for a YES token
curl "https://clob.polymarket.com/price?token_id=60590045489347122735554346200880179420435533609307820342798544098823516727807&side=BUY"

# Response:
# {"price": "0.3200"}
```

Parameters: `token_id` (required), `side` (BUY or SELL)

#### GET /midpoint -- Midpoint Price

```bash
curl "https://clob.polymarket.com/midpoint?token_id=TOKEN_ID"

# Response:
# {"mid": "0.3150"}
```

#### GET /book -- Full Order Book

```bash
curl "https://clob.polymarket.com/book?token_id=TOKEN_ID"

# Response:
{
  "bids": [
    {"price": "0.31", "size": "1000"},
    {"price": "0.30", "size": "500"}
  ],
  "asks": [
    {"price": "0.32", "size": "1200"},
    {"price": "0.33", "size": "800"}
  ],
  "market": {
    "min_order_size": "5",
    "tick_size": "0.001",
    "neg_risk": false
  }
}
```

#### GET /prices-history -- Historical Price Data

```bash
curl "https://clob.polymarket.com/prices-history?token_id=TOKEN_ID&interval=1d"
# Intervals: 1h, 6h, 1d, 1w
# Can also use startTs/endTs for custom ranges

# Response:
{
  "history": [
    {"t": 1630454400, "p": 0.52},
    {"t": 1630540800, "p": 0.54}
  ]
}
```

#### GET /spread

```bash
curl "https://clob.polymarket.com/spread?token_id=TOKEN_ID"
# Response: {"bid": "0.31", "ask": "0.32"}
```

#### GET /last-trade-price

```bash
curl "https://clob.polymarket.com/last-trade-price?token_id=TOKEN_ID"
```

#### Batch Endpoints (POST)

```bash
# Multiple order books
curl -X POST "https://clob.polymarket.com/books" \
  -H "Content-Type: application/json" \
  -d '[{"token_id": "TOKEN_1"}, {"token_id": "TOKEN_2"}]'

# Multiple prices
curl -X POST "https://clob.polymarket.com/prices" \
  -H "Content-Type: application/json" \
  -d '[{"token_id": "TOKEN_1", "side": "BUY"}, {"token_id": "TOKEN_2", "side": "BUY"}]'
```

### Rate Limits

| Service | Endpoint | Limit |
|---------|----------|-------|
| **Gamma API** | General | 4,000 req/10s |
| | /events | 500 req/10s |
| | /markets | 300 req/10s |
| | /markets + /events combined | 900 req/10s |
| | /public-search | 350 req/10s |
| | /tags | 200 req/10s |
| **CLOB API** | /book, /price, /midpoint | 1,500 req/10s each |
| | /books, /prices, /midpoints | 500 req/10s each |
| | /prices-history | 1,000 req/10s |
| | POST /order | 3,500 req/10s burst; 36,000/10min sustained |
| **Data API** | General | 1,000 req/10s |
| | /trades | 200 req/10s |
| | /positions | 150 req/10s |

When limits are exceeded, requests are **throttled (delayed/queued)** rather than immediately rejected. Limits reset on sliding time windows.

### Authentication

- **Gamma API**: Fully public, no authentication needed for any endpoint
- **CLOB API reads** (/price, /book, /midpoint, /prices-history, /spread): Public, no auth
- **CLOB API writes** (POST /order, DELETE /order): Requires API key + EIP-712 signature
  - Headers: `PM-API-KEY`, `PM-API-PASSPHRASE`, `PM-API-TIMESTAMP`, `PM-API-SIGN`
- **Data API**: Public for /trades, /holders; requires auth for personal /positions

### Investment-Relevant Active Markets (as of 2026-03-30)

These are real, currently active markets with live data from the API:

#### 1. Fed Rate Decisions

**Event: "How many Fed rate cuts in 2026?"**
- Slug: `how-many-fed-rate-cuts-in-2026`
- Total Volume: $15.3M
- Markets:
  - 0 cuts: **31.5%** (conditionId: `0xd4e77ba6f29fc093509d24f50863...`)
  - 1 cut: **27.5%** (conditionId: `0x5e082f0b57f47a29044aa35b4c56...`)
  - 2 cuts: **19.5%** (conditionId: `0xe0d9f508a249e0070db06eb7d1e1...`)

**Event: "Fed decision in April?"**
- Slug: `fed-decision-in-april`
- Total Volume: $43.9M
- Markets:
  - Decrease 50+ bps: **0.45%**
  - Decrease 25 bps: **0.75%**
  - (Implied: ~98.8% chance of no change)

**Event: "What will Fed Rate hit before 2027?"**
- Slug: `what-will-fed-rate-hit-before-2027`
- Total Volume: $1.27M
- Markets:
  - Upper bound >= 5.0%: **3.6%**
  - Upper bound >= 5.25%: **4.55%**

**Event: "Fed emergency rate cut before 2027?"**
- Slug: `fed-emergency-rate-cut-before-2027`
- Total Volume: $73.7K
- Probability: **16.5%**

#### 2. Recession & GDP

**Event: "US recession by end of 2026?"**
- Slug: `us-recession-by-end-of-2026`
- Total Volume: $1.0M
- Probability: **29.5%** (conditionId: `0xfdc73f10edf0266756686f35b571...`)

**Event: "Negative GDP growth in 2026?"**
- Slug: `negative-gdp-growth-in-2026`
- Probability: **15.1%**

**Event: "GDP growth in 2026"**
- Slug: `gdp-growth-in-2026`
- Growth < 0.5%: **9.95%**
- Growth 1.0-1.5%: **6.5%**

**Event: "Canada recession before 2027?"**
- Slug: `canada-recession-before-2027`
- Probability: **40.5%**

#### 3. Inflation & Treasury Yields

**Event: "How high will inflation get in 2026?"**
- Slug: `how-high-will-inflation-get-in-2026`
- Total Volume: $365.7K
- Inflation > 4%: **48.5%**
- Inflation > 10%: **6.7%**

**Event: "How high will 10-year Treasury yield go before 2027?"**
- Slug: `how-high-will-10-year-treasury-yield-go-before-2027`
- Total Volume: $166K

**Event: "How low will 10-year Treasury yield get before 2027?"**
- Slug: `how-low-will-10-year-treasury-yield-get-before-2027`
- Below 3.0%: **14.5%**

#### 4. Geopolitical Events

**Event: "Will China invade Taiwan by end of 2026?"**
- Slug: `will-china-invade-taiwan-before-2027`
- Total Volume: $14.7M
- Probability: **9.85%**

**Event: "Russia x Ukraine ceasefire by end of 2026?"**
- Slug: `russia-x-ukraine-ceasefire-before-2027`
- Total Volume: $12.4M
- Probability: **29.5%**

**Event: "Ukraine recognizes Russian sovereignty by end of 2026?"**
- Slug: `ukraine-recognizes-russian-sovereignty-over-ukrainian-territory-in-2025`
- Total Volume: $2.3M
- By end of 2026: **12.5%**

#### 5. Debt & Fiscal

**Event: "US defaults on debt by 2027?"**
- Slug: `us-defaults-on-debt-by-2027`
- Probability: **5.0%**

**Event: "Another US debt downgrade before 2027?"**
- Slug: `another-us-debt-downgrade-before-2027`
- Probability: **29.5%**

**Event: "Peak US National Debt before 2027?"**
- Slug: `peak-us-national-debt-before-2027`
- Hits $40T: **93.55%**

#### 6. Elections (Long-dated)

**Event: "Presidential Election Winner 2028"**
- Slug: `presidential-election-winner-2028`
- Total Volume: $481.8M (highest-volume active event)

**Event: "Democratic Presidential Nominee 2028"**
- Slug: `democratic-presidential-nominee-2028`
- Total Volume: $959.4M

### Quick Integration Recipe

```javascript
// Fetch all investment-relevant probabilities in one call
const INVESTMENT_SLUGS = [
  'how-many-fed-rate-cuts-in-2026',
  'us-recession-by-end-of-2026',
  'how-high-will-inflation-get-in-2026',
  'will-china-invade-taiwan-before-2027',
  'russia-x-ukraine-ceasefire-before-2027',
  'us-defaults-on-debt-by-2027',
  'another-us-debt-downgrade-before-2027',
  'fed-emergency-rate-cut-before-2027',
  'negative-gdp-growth-in-2026',
];

async function fetchPolymarketProbabilities() {
  const results = {};
  for (const slug of INVESTMENT_SLUGS) {
    const res = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${slug}`
    );
    const events = await res.json();
    if (events.length > 0) {
      const event = events[0];
      results[slug] = {
        title: event.title,
        volume: event.volume,
        markets: event.markets.map(m => ({
          question: m.question,
          probability: JSON.parse(m.outcomePrices)[0],  // Yes probability
          volume: m.volumeNum,
          conditionId: m.conditionId,
        })),
      };
    }
  }
  return results;
}
```

### Python Client Libraries

- **Official**: `pip install py-clob-client` (Polymarket/py-clob-client on GitHub)
- **Community**: `pip install polymarket-apis` (unified Pydantic wrapper for all APIs)

---

## Part 1B: Alternative Prediction Market APIs

### Kalshi API

| Property | Value |
|----------|-------|
| Base URL (prod) | `https://api.elections.kalshi.com/trade-api/v2` |
| Base URL (demo) | `https://demo-api.kalshi.co/trade-api/v2` |
| WebSocket | `wss://api.kalshi.com/trade-api/ws/v2` |
| Auth | RSA-PSS signing (mandatory for all endpoints) |
| Rate Limits | ~10 req/s public, ~5 req/s authenticated |
| Currency | Real USD (CFTC-regulated) |
| SDKs | Python, TypeScript |

Key endpoints: `/markets`, `/events`, `/orders`, `/portfolio`

**Strengths**: Only CFTC-regulated prediction market. Real money. Investment-relevant markets (Fed, GDP, inflation, elections).
**Weaknesses**: Authentication required for ALL requests (even reads). RSA-PSS signing is complex. Tokens expire every 30 minutes. US residents only. Lower rate limits.

```bash
# Kalshi requires auth even for market reads
curl -H "KALSHI-ACCESS-KEY: KEY_ID" \
     -H "KALSHI-ACCESS-TIMESTAMP: $(date +%s)" \
     -H "KALSHI-ACCESS-SIGNATURE: SIGNATURE" \
     "https://api.elections.kalshi.com/trade-api/v2/markets"
```

### Manifold Markets API

| Property | Value |
|----------|-------|
| Base URL | `https://api.manifold.markets/v0` |
| Auth | Optional (`Authorization: Key {key}`) |
| Rate Limits | 500 req/min per IP |
| Currency | Play money (Mana). Real-money sunset March 2025. |

Key endpoints:

```bash
# Search markets (no auth)
curl "https://api.manifold.markets/v0/search-markets?term=recession&sort=most-popular&filter=open&limit=10"

# Get market probability
curl "https://api.manifold.markets/v0/market/MARKET_ID/prob"
# Response: {"prob": 0.62}

# Batch probabilities (up to 100)
curl "https://api.manifold.markets/v0/market-probs?ids=ID1&ids=ID2"

# Get market by slug
curl "https://api.manifold.markets/v0/slug/will-there-be-a-us-recession-in-2026"
```

**Strengths**: Completely free. No auth for reads. Simple REST. 500 req/min. Good for prototyping. Open-source platform.
**Weaknesses**: Play money only (signals may be less reliable). Lower liquidity. Some markets have few participants.

### Metaculus API

| Property | Value |
|----------|-------|
| Base URL | `https://www.metaculus.com/api2` |
| API Docs | `https://www.metaculus.com/api2/schema/redoc/` |
| Auth | Optional for reads |
| Rate Limits | Not publicly documented |
| Currency | Reputation-based (no money) |

Key endpoints:

```bash
# List questions
curl "https://www.metaculus.com/api2/questions/?limit=20&status=open&order_by=-activity"

# Get specific question
curl "https://www.metaculus.com/api2/questions/7836/"
```

**Strengths**: Academic rigor. Community probability distributions (not just point estimates). Long track record. Good for calibration research.
**Weaknesses**: Not real money. Lower liquidity signal. Fewer active questions than Polymarket.

### Recommendation for Integration

| Use Case | Best API |
|----------|----------|
| Primary probability feed | **Polymarket** (free reads, highest liquidity, real money) |
| Backup / cross-reference | **Manifold** (free, easy, good variety) |
| Regulated / compliance | **Kalshi** (CFTC-regulated, but auth complexity) |
| Calibration research | **Metaculus** (academic quality forecasts) |

**Integration priority**: Polymarket first (free, no auth, highest volume), then Manifold as backup signal.

---

## Part 2: Mesquita's Game Theory Prediction Model

### Overview

Bruce Bueno de Mesquita developed an Expected Utility Model (EUM) for predicting political and policy outcomes. The model, commercialized through his consulting firms (Decision Insights, now Sentia Group / Selectors LLC), claims 90% accuracy validated by the CIA.

The core idea: political outcomes are determined by rational actors who weigh the costs and benefits of challenging or conceding to other actors. The equilibrium (predicted outcome) is found through iterative rounds of strategic bargaining.

### Core Variables

For N stakeholders on a single issue:

| Variable | Symbol | Range | Definition |
|----------|--------|-------|------------|
| Position | x_i | [0, 100] or [0, 200] | Actor i's ideal policy outcome on a continuous scale |
| Capability | c_i | [0, 100] | Actor i's power/resources to influence the outcome |
| Salience | s_i | [0, 100] or [0, 1] | How much actor i cares about this issue (willingness to spend political capital) |

### Step 1: Weighted Median Voter Position

The model starts each round by computing the **weighted median** of all actor positions, weighted by `w_i = c_i * s_i` (capability times salience).

To compute the weighted median:
1. Sort actors by position: x_(1) <= x_(2) <= ... <= x_(N)
2. Compute cumulative weight: W = sum(c_i * s_i) for all i
3. Find the actor k where the cumulative weight from the low end first reaches or exceeds W/2
4. The weighted median M = x_(k)

This weighted median represents the **expected outcome under majority-rule bargaining** (from Duncan Black's median voter theorem adapted to weighted votes).

### Step 2: Expected Utility Calculations

Each actor i evaluates whether to **challenge** each other actor j, or **not challenge** (concede/status quo).

#### Probability of Success

The probability that actor i prevails over actor j in a challenge:

```
P_i = SUM_k(c_k * s_k * |x_j - x_k|) / [SUM_k(c_k * s_k * |x_i - x_k|) + SUM_k(c_k * s_k * |x_j - x_k|)]
```

Where the sums run over all actors k (not equal to i, j). This measures the relative "weighted support" each side can muster. Actors whose positions are far from j contribute more to i's support.

Intuitively: P_i is the fraction of total weighted political distance that favors i's position over j's.

#### Utility Functions

The utility to actor i of any outcome position x is based on distance from i's preferred position, with risk adjustment:

```
U_i(x) = 2 - 4 * (|x_i - x| / R)^r_i
```

Where:
- R = range of the issue scale (e.g., 200 if scale is 0-200)
- r_i = risk parameter for actor i (see below)

Or in a simpler formulation used in some implementations:

```
U_i^success = |x_j - x_i|   (gain from moving j to i's position)
U_i^failure = |x_i - x_j|   (loss from being moved to j's position)
U_i^status_quo = |x_i - M|  (utility of current median position)
```

#### Risk Attitude

Each actor's risk parameter r_i is derived from their "security level" -- the comparison between their expected utility from the status quo and from challenging:

```
If r_i < 1: risk-acceptant (willing to gamble)
If r_i = 1: risk-neutral
If r_i > 1: risk-averse (prefers certainty)
```

Typical range: r_i in [0.5, 2.0]

The risk factor adjusts utilities exponentially, making risk-averse actors require higher probabilities of success before challenging.

#### Expected Utility of Challenging

```
EU_i->j^challenge = P_i * U_i^success + (1 - P_i) * U_i^failure
```

With third-party effects (full model):

```
EU_i->j^challenge = P_i * U_i^success + (1 - P_i) * U_i^failure
                    + SUM_{k != i,j} (P_ik - P_jk - 1) * (U_ki - U_kj)
```

#### Expected Utility of Not Challenging (Status Quo / Conceding)

```
EU_i->j^not_challenge = Q_q * U_i^status_quo
                       + Q_b * [P_i * U_i^success + (1 - P_i) * U_i^failure]
                       + (1 - Q_q - Q_b) * U_i^current
```

Where:
- Q_q = probability the status quo prevails (no one challenges)
- Q_b = probability that someone else initiates a challenge
- (1 - Q_q - Q_b) = probability of compromise without confrontation

#### Net Expected Utility (Challenge Decision)

```
EU_i->j = EU_i->j^challenge - EU_i->j^not_challenge
```

- If EU_i->j > 0: Actor i has incentive to challenge actor j
- If EU_i->j < 0: Actor i prefers not to challenge

### Step 3: Decision Rules (Per Round)

Based on the expected utility comparisons between pairs (i, j):

| i's EU(challenge j) | j's EU(challenge i) | Outcome |
|----------------------|----------------------|---------|
| Positive | Negative | j **concedes** to i (j moves toward i) |
| Negative | Positive | i **concedes** to j (i moves toward j) |
| Both positive | -- | **Confrontation** (both challenge, winner based on P) |
| Both negative | -- | **Stalemate** (no change, both stay) |

When actors compromise, their new position is a weighted average:

```
x_i_new = (x_i * c_i * s_i + x_j * c_j * s_j) / (c_i * s_i + c_j * s_j)
```

### Step 4: Position Updates and Iteration

After each round:
1. Actors who conceded or compromised update their positions
2. Capabilities and salience may also update (actors who lose may become less powerful)
3. A new weighted median is computed
4. Expected utilities are recalculated
5. Process repeats

**Convergence**: The model iterates until positions stabilize (all actors converge toward a single position or the median stops moving). Typically converges in 5-15 rounds.

### Step 5: Converting to Probability for Kelly Criterion

The model output is a predicted position on the issue scale. To convert to a probability:

**Method 1: Direct from weighted median convergence**
```
P(outcome X) = 1 if the converged position is closest to X
```
This gives a binary prediction, not a probability.

**Method 2: Vote-share approach (better)**
```
P(outcome X) = SUM(c_i * s_i for all actors i whose final position favors X)
             / SUM(c_i * s_i for all actors)
```

**Method 3: Distance-based probability**
```
P(outcome X) = 1 / (1 + exp(alpha * |M_final - X|))
```
Where alpha is calibrated from historical accuracy data. This gives a logistic curve centered on the predicted position.

**Method 4: Multi-round stability (recommended for Kelly)**
Run the model with perturbed inputs (Monte Carlo):
```
1. For t = 1 to T (e.g., T=1000):
   a. Perturb each x_i, c_i, s_i by small random noise
   b. Run model to convergence
   c. Record final predicted position
2. P(outcome X) = fraction of runs where predicted position is closest to X
```
This gives a well-calibrated probability that accounts for input uncertainty.

### Open-Source Implementations

#### Python (Primary)

1. **dmasad/BDM_DecisionModel_Replication** (Python)
   - GitHub: https://github.com/dmasad/BDM_DecisionModel_Replication
   - Attempts to replicate Scholz et al. (2011)
   - Files: `GroupDecisionModel.py`, `ExampleActors.csv`, Jupyter notebooks
   - Note: "current code DOES NOT fully reproduce the results in Scholz et al."

2. **jmckib/bdm-scholz-expected-utility-model** (Python)
   - GitHub: https://github.com/jmckib/bdm-scholz-expected-utility-model
   - Based on Scholz, Calbert & Smith (2011)
   - Files: `bdm_scholz_model.py`, CSV input files
   - 11 stars, 6 forks

#### C# Implementation

3. **decisionmechanics/eum** (C#)
   - GitHub: https://github.com/decisionmechanics/eum
   - "Designed to map closely to the mathematical formulations used in the literature"
   - Based on Scholz et al's interpretation
   - Note: "it has not been possible to get close to replicating the results presented in that paper"

#### Enhanced Model (Preana)

4. **Preana** (academic, described in Abdollahian et al., 2013)
   - Uses Q-learning (reinforcement learning) to replace ad-hoc position update rules
   - Learning matrix updates: `r[i][j] = r[i][j] + alpha * s[i] * learn[i][j]`
   - Paper: "Preana: Game Theory Based Prediction with Reinforcement Learning" (SCIRP)
   - URL: https://www.scirp.org/html/3-8302400_49058.htm

### Key Academic References

1. **Scholz, J.B., Calbert, G.J. and Smith, G.A. (2011)**
   "Unravelling Bueno De Mesquita's group decision model."
   *Journal of Theoretical Politics*, 23(4), 510-531.
   - The most important reference: first published attempt to fully specify the model
   - DOI: 10.1177/0951629811418142
   - URL: https://journals.sagepub.com/doi/abs/10.1177/0951629811418142

2. **Bueno de Mesquita, B. (2011)**
   "A New Model for Predicting Policy Choices."
   *Journal of Conflict Management and Peace Science*, 28(1).
   - Bueno de Mesquita's own published specification (still incomplete)
   - URL: https://journals.sagepub.com/doi/10.1177/0738894210388127

3. **Bueno de Mesquita, B. (2009)**
   *The Predictioneer's Game: Using the Logic of Brazen Self-Interest to See and Shape the Future*
   - Popular book describing the model conceptually
   - ISBN: 978-0812979770

4. **Abdollahian, M., Yang, Z., and Coan, T. (2013)**
   "Preana: Game Theory Based Prediction with Reinforcement Learning"
   - Open implementation with Q-learning enhancement
   - URL: https://www.scirp.org/html/3-8302400_49058.htm

5. **Butler, C.K.**
   "Group Interactions" (working paper)
   - Alternative formalization of multi-actor bargaining
   - URL: http://www.unm.edu/~ckbutler/workingpapers/GroupInteractions.pdf

### CIA Validation: The 90% Accuracy Claim

Stanley Feder, a former high-level CIA analyst, conducted a formal evaluation:

> "We tested Bueno de Mesquita's model on scores of issues that were conducted in real time -- that is, the forecasts were made before the events actually happened."

The declassified CIA assessment rated the model as **90% accurate** across diverse geopolitical predictions. However:

- The exact methodology of the CIA evaluation has not been published
- "90% accurate" may mean the predicted outcome matched reality 90% of the time, but this does not measure calibration (whether a 70% prediction is right 70% of the time)
- The model was compared against CIA's in-house analysts, who were reportedly less accurate

### Limitations and When the Model Fails

1. **Lack of transparency / reproducibility**
   - "No clear elucidation of the model exists in the open literature or can be found in a single place" (Scholz et al., 2011)
   - The proprietary version used by Bueno de Mesquita has never been released
   - Open-source replications struggle to match published results

2. **Input sensitivity**
   - Model is highly sensitive to initial estimates of position, capability, and salience
   - "Garbage in, garbage out" -- expert elicitation of inputs is critical and subjective
   - Small changes in capability estimates can flip predictions

3. **Single-dimensional limitation**
   - Model operates on a single issue dimension
   - Real policy issues are multi-dimensional (must decompose into separate analyses)

4. **Rational actor assumption**
   - Assumes all actors are rational utility maximizers
   - Fails when actors are irrational, emotional, or operating under severe misperceptions
   - Poor for predicting actions of non-state actors, terrorist groups, or actors under extreme stress

5. **Missing structural factors**
   - Does not model institutional constraints, veto points, or legal frameworks
   - Ignores information asymmetries and deception
   - No mechanism for "black swan" events or exogenous shocks

6. **Convergence issues**
   - Some configurations do not converge; model can cycle between states
   - Ad-hoc stopping rules have been used historically

7. **Academic criticism**
   - Stephen Walt (Harvard) described rational choice models as a "cult of irrelevance"
   - Cross-pollination between the academic model and actual policy remains limited
   - The model's track record is self-reported and not independently audited at scale

### Practical Implementation for Investment Analysis

For the dhando-analyzer, here is a recommended implementation approach:

```python
import numpy as np
from dataclasses import dataclass

@dataclass
class Actor:
    name: str
    position: float      # 0-100 scale
    capability: float    # 0-100 (power/influence)
    salience: float      # 0-1 (how much they care)

def weighted_median(actors: list[Actor]) -> float:
    """Compute power-salience weighted median position."""
    sorted_actors = sorted(actors, key=lambda a: a.position)
    weights = [a.capability * a.salience for a in sorted_actors]
    total = sum(weights)
    cumulative = 0
    for i, a in enumerate(sorted_actors):
        cumulative += weights[i]
        if cumulative >= total / 2:
            return a.position
    return sorted_actors[-1].position

def probability_of_success(i: Actor, j: Actor, actors: list[Actor]) -> float:
    """P(i wins against j) based on weighted support distances."""
    others = [a for a in actors if a.name != i.name and a.name != j.name]
    support_i = sum(a.capability * a.salience * abs(j.position - a.position) for a in others)
    support_j = sum(a.capability * a.salience * abs(i.position - a.position) for a in others)
    if support_i + support_j == 0:
        return 0.5
    return support_i / (support_i + support_j)

def expected_utility_challenge(i: Actor, j: Actor, actors: list[Actor]) -> float:
    """EU for actor i challenging actor j."""
    p = probability_of_success(i, j, actors)
    gain = abs(j.position - i.position) * j.salience
    loss = abs(i.position - j.position) * i.salience
    return p * gain - (1 - p) * loss

def run_model(actors: list[Actor], max_rounds: int = 20, tolerance: float = 0.01) -> float:
    """Run the BDM model to convergence. Returns predicted outcome position."""
    actors = [Actor(a.name, a.position, a.capability, a.salience) for a in actors]

    for round_num in range(max_rounds):
        median = weighted_median(actors)
        position_changes = []

        for i in actors:
            # Find the strongest challenge/offer for each actor
            best_offer = None
            best_eu = float('-inf')
            for j in actors:
                if i.name == j.name:
                    continue
                eu_ij = expected_utility_challenge(i, j, actors)
                eu_ji = expected_utility_challenge(j, i, actors)
                # If j would challenge i and i would concede
                if eu_ji > 0 and eu_ij < 0:
                    if eu_ji > best_eu:
                        best_eu = eu_ji
                        best_offer = j

            if best_offer is not None:
                # i concedes: move toward best_offer's position
                shift = (best_offer.position - i.position) * 0.5 * best_offer.salience
                position_changes.append((i, shift))

        # Apply position changes
        max_change = 0
        for actor, shift in position_changes:
            actor.position += shift
            max_change = max(max_change, abs(shift))

        # Check convergence
        if max_change < tolerance:
            break

    return weighted_median(actors)

def model_to_probability(actors: list[Actor], threshold: float, n_simulations: int = 1000) -> float:
    """
    Convert model output to a probability via Monte Carlo perturbation.

    threshold: the position value that separates 'Yes' from 'No'
    Returns: probability that the outcome exceeds the threshold
    """
    count_above = 0
    for _ in range(n_simulations):
        perturbed = []
        for a in actors:
            perturbed.append(Actor(
                name=a.name,
                position=a.position + np.random.normal(0, 5),
                capability=max(0, a.capability + np.random.normal(0, 5)),
                salience=np.clip(a.salience + np.random.normal(0, 0.05), 0, 1),
            ))
        result = run_model(perturbed)
        if result >= threshold:
            count_above += 1
    return count_above / n_simulations
```

### Example: SA Trade Policy (AGOA Renewal)

```python
actors = [
    Actor("US Trade Rep", position=30, capability=90, salience=0.3),
    Actor("SA Government", position=80, capability=40, salience=0.9),
    Actor("US Congress (pro-AGOA)", position=70, capability=60, salience=0.4),
    Actor("US Congress (anti-AGOA)", position=20, capability=50, salience=0.6),
    Actor("SA Business (exporters)", position=85, capability=20, salience=0.95),
    Actor("US Domestic Industry", position=10, capability=30, salience=0.7),
    Actor("EU (competing exporters)", position=40, capability=25, salience=0.3),
]

# Position scale: 0 = full AGOA termination, 100 = full renewal + expansion
predicted = run_model(actors)
prob_renewal = model_to_probability(actors, threshold=50, n_simulations=1000)
print(f"Predicted position: {predicted:.1f}")
print(f"P(AGOA renewal): {prob_renewal:.2%}")
```

---

## Sources

### Polymarket
- [Polymarket Documentation](https://docs.polymarket.com/)
- [Polymarket API Endpoints](https://docs.polymarket.com/quickstart/reference/endpoints)
- [Polymarket Gamma API Overview](https://docs.polymarket.com/developers/gamma-markets-api/overview)
- [Polymarket Gamma Structure](https://docs.polymarket.com/developers/gamma-markets-api/gamma-structure)
- [Polymarket Get Markets](https://docs.polymarket.com/developers/gamma-markets-api/get-markets)
- [Polymarket Get Events](https://docs.polymarket.com/developers/gamma-markets-api/get-events)
- [Polymarket Fetching Markets Guide](https://docs.polymarket.com/market-data/fetching-markets)
- [Polymarket Rate Limits](https://docs.polymarket.com/api-reference/rate-limits)
- [Polymarket CLOB Introduction](https://docs.polymarket.com/developers/CLOB/introduction)
- [Polymarket API Architecture (Medium)](https://medium.com/@gwrx2005/the-polymarket-api-architecture-endpoints-and-use-cases-f1d88fa6c1bf)
- [Polymarket Python Client (GitHub)](https://github.com/Polymarket/py-clob-client)
- [polymarket-apis PyPI](https://pypi.org/project/polymarket-apis/)
- [Polymarket Data API Docs (GitHub Gist)](https://gist.github.com/shaunlebron/0dd3338f7dea06b8e9f8724981bb13bf)

### Alternative Prediction Markets
- [Kalshi API Quick Start](https://docs.kalshi.com/getting_started/quick_start_authenticated_requests)
- [Kalshi API Guide (Zuplo)](https://zuplo.com/learning-center/kalshi-api)
- [Manifold Markets API Documentation](https://docs.manifold.markets/api)
- [Metaculus API](https://www.metaculus.com/api/)
- [Top 10 Prediction Market APIs 2026 (Apidog)](https://apidog.com/blog/top-10-prediction-market-apis-2026/)
- [Best Prediction Market APIs (NYC Servers)](https://newyorkcityservers.com/blog/best-prediction-market-apis)

### Bueno de Mesquita Model
- [Scholz, Calbert & Smith (2011) - Unravelling BDM's Group Decision Model](https://journals.sagepub.com/doi/abs/10.1177/0951629811418142)
- [Scholz et al. Conference Paper (PDF)](https://www.scitepress.org/papers/2011/31215/31215.pdf)
- [Preana: Game Theory + Reinforcement Learning](https://www.scirp.org/html/3-8302400_49058.htm)
- [BDM Decision Model Replication (Python, GitHub)](https://github.com/dmasad/BDM_DecisionModel_Replication)
- [BDM Scholz Expected Utility Model (Python, GitHub)](https://github.com/jmckib/bdm-scholz-expected-utility-model)
- [EUM Implementation (C#, GitHub)](https://github.com/decisionmechanics/eum)
- [Bruce Bueno de Mesquita - Wikipedia](https://en.wikipedia.org/wiki/Bruce_Bueno_de_Mesquita)
- [BDM New Model for Predicting Policy Choices (2011)](https://journals.sagepub.com/doi/10.1177/0738894210388127)
- [Hoover Institution - It All Adds Up](https://www.hoover.org/research/it-all-adds)
- [NPR - Professor Claims to Predict the Future](https://www.npr.org/templates/story/story.php?storyId=15217417)
- [Butler - Group Interactions (Working Paper)](http://www.unm.edu/~ckbutler/workingpapers/GroupInteractions.pdf)
