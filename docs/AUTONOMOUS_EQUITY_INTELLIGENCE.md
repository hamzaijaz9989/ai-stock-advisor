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

## Cloudflare Pages setup for the beta terminal
1. Create a free Alpaca account and generate Market Data API credentials. Do not put keys in browser code, GitHub files, screenshots, or chat.
2. In the Cloudflare Pages project settings, add these as encrypted **Secrets** for the production environment (and preview environment only if needed):
   - `ALPACA_API_KEY_ID`
   - `ALPACA_API_SECRET_KEY`
3. Redeploy the Pages project after adding the secrets.
4. Open the Autonomous Equity Intelligence panel, enter a ticker, and choose Analyze now. Optional 30-second refresh repeatedly requests a new authenticated snapshot. Stop it when not needed.

The beta endpoint `/api/alpaca-equity` retrieves up to 65 recent daily IEX bars and the latest IEX snapshot on each request. The dashboard's 30-second refresh is **REST polling**, not a persistent WebSocket stream. Do not describe it as a tick-by-tick feed. The displayed quote timestamp, provider and IEX coverage warning must remain visible. When the market is closed or the latest trade is stale, the integrity guard may block scoring; this is expected fail-closed behavior.

The endpoint is deliberately single-symbol and does not expose credentials to the browser. The beta UI defaults to NVDA and provides AAPL, MSFT, GOOGL and AMZN presets. It is not yet a broad 60-stock live scanner. Keep the existing three-hour 60-stock cache distinct from this single-symbol live-check workflow.

## Deployment status
The code is committed to `feature/autonomous-equity-intelligence` and proposed in draft PR #39. It is not merged or deployed. Add the Cloudflare secrets and merge/deploy only after CI and manual preview checks pass.
