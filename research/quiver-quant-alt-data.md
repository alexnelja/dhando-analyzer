# Quiver Quantitative (quiverquant.com) — alt-data source evaluation

**Date surfaced:** 2026-04-15 (during polyalexous Phase 1 strategy research)
**Source:** https://www.quiverquant.com
**Routed to Dhando because:** Polymarket applicability is weak (congressional-trade disclosures have a 45-day STOCK Act lag, making them lagging not leading for political event markets). Alt-data aggregators of this type are a natural fit for equity rules-engine decisions.

## What Quiver Quantitative provides

Alt-data aggregator covering:
- **Congressional trades** (House + Senate STOCK Act filings)
- **Lobbying spend** (quarterly federal filings)
- **Government contracts** (USAspending.gov data)
- **Insider trading** (SEC Form 4)
- **Patent momentum** (USPTO filings)
- **WallStreetBets mentions** (Reddit aggregate sentiment)
- **Wikipedia page views** (attention proxy)
- **Corporate flights** (FAA / ADS-B jet tracking)
- **Political contributions** (FEC filings)

Tiers: free (limited), Premium, and API (paid) — pricing per their website.

## Why it fits Dhando specifically

Dhando is a Dalio-style rules engine for value investing (per README + ROADMAP). Each of the Quiver Quantitative feeds maps to an equity-decision input:

| Quiver feed | Dhando rule it feeds |
|-------------|----------------------|
| Congressional trades | Insider / smart-money signal — augments "who else is buying at this price?" |
| Lobbying spend | Regulatory moat proxy — a high lobbying spender is defending economic rent |
| Government contracts | Revenue visibility / stickiness signal |
| Insider trading (Form 4) | Classic insider-buy ruleset |
| Patent momentum | Innovation / R&D productivity signal |
| Corporate flights | M&A / unusual activity early indicator |
| Political contributions | Regulatory-risk signal for heavily-regulated sectors |

These slot directly into Graham/Munger/Pabrai-style rulesets (per Dhando's existing rules/ directory).

## Why Polymarket doesn't benefit

- **45-day STOCK Act lag** on congressional trades makes the data lagging for most Polymarket political-event markets (elections, legislation) whose resolution windows are shorter.
- **Quarterly lobbying filings** are too slow for event-driven trading.
- **FEC filings** are structured but not timely enough.
- Polymarket political markets are already densely populated by X-based insiders (beat reporters, lobbyists on X) who are faster than quarterly-disclosed alt-data.

The only narrow Polymarket use case would be long-dated regulatory-outcome markets (12+ month horizons) where 45-day lag is inside the window. Not a priority for Alex's <$1k Polymarket bankroll.

## Suggested Dhando integration path

1. **Evaluate free tier first** — confirm data coverage matches what Dhando's rulesets need before paying.
2. **Start with congressional trades + insider Form 4** — these are the two most directly actionable feeds. Both feed into a "smart-money concurrence" ruleset.
3. **Add lobbying + patent momentum second** — moat and innovation signals augment Pabrai-style bet-sizing.
4. **API tier if free tier is thin** — cost scales; evaluate against rules-engine improvement.

## Related existing Dhando docs

- `docs/paid-data-sources-analysis.md` — add Quiver to this evaluation
- `docs/MISSING-METHODOLOGIES-RESEARCH.md` — smart-money-concurrence is a methodology gap this can fill

## Alternatives / competitors to assess alongside

- OpenInsider (free, Form 4 only)
- Whale Wisdom (13F filings, lagging)
- Capitol Trades (congressional trades, free)
- Unusual Whales (options flow + politicians)

Before paying Quiver, compare coverage + freshness to Capitol Trades + OpenInsider (both free) for the two most actionable feeds.
