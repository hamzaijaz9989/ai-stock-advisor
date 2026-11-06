# Autonomous Equity Intelligence — implementation notes

## Scope
This module ports the useful architecture patterns from the Grok Bot Terminal into Northstar's US-equity research workflow. It is not a crypto-token bot. It does not connect to a broker, submit orders, or enable automatic trading.

## Six logical agents
1. **Market Scanner** — flags relative-volume expansion, 20-session breakouts, trend alignment, momentum extremes and large downside moves.
2. **Integrity Guardian** — rejects malformed/out-of-order OHLCV, stale bars/quotes, implausible prices, extreme gaps and insufficient dollar liquidity. This is the equity-market analogue of a token rug-check; it is not a guarantee against fraud or manipulation.
3. **Opportunity Analyst** — calculates a transparent 0–100 heuristic setup score from trend, breakout, relative volume, momentum and liquidity.
4. **Position Sizer** — illustrates shares from portfolio equity, a 0.5% idea-risk budget, 2× ATR stop distance and a 10% exposure cap. It is not a broker instruction and does not model portfolio correlation.
5. **Catalyst Reviewer** — accepts only caller-supplied catalysts explicitly tagged SEC, COMPANY_IR or LICENSED_NEWS and verified=true. It does not infer that a headline is true.
6. **Trade Auditor** — returns a structured six-agent audit record for each analysis snapshot.

## Data contract
- Daily bars are chronological and contain timestamp, open, high, low, close, volume.
- A minimum of 55 bars is required for the SMA50 and 20-session volume baseline.
- A supplied quote must include price and timestamp. Quote freshness defaults to 15 minutes.
- Average daily dollar volume floor defaults to $10m.
- Stale/future data and critical quality failures fail closed.

## Important production gap
The current Northstar repository has a three-hour 60-stock cache workflow and best-effort quote/history routes. That is not a continuously streaming, consolidated, all-venue real-time feed. Alpaca's documented free/basic equity feed is IEX with a 30-symbol WebSocket limit; SIP coverage is a separate subscription tier. A real-time dashboard must display the feed name, timestamp and delay/coverage state rather than label IEX as full-market consolidated data. See https://docs.alpaca.markets/us/docs/about-market-data-api and https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data.

SEC company submissions and XBRL APIs remain the primary filing/fundamental source; SEC data updates through the day but does not replace a live quote/trade feed. See https://www.sec.gov/search-filings/edgar-application-programming-interfaces.

## Validation before any stronger signal
This is a foundation module, not an approved strategy. Connect it to licensed provider data, add point-in-time event/corporate-action inputs, then run walk-forward and untouched holdout tests including survivorship, slippage, spreads, gaps, commissions/fees and benchmark comparison. Do not interpret the heuristic score as probability of profit. The existing Northstar BUY gate remains closed.
