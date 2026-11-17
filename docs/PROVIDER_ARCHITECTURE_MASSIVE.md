# Northstar Provider Architecture — Massive + SEC + live quote fallback

## Primary research providers

- **Massive Stocks Basic** is the primary source for daily historical OHLCV, grouped US daily market summaries, ticker reference data, corporate actions, technical indicator endpoints and ticker news.
- Massive Basic is end-of-day only, exposes a rolling two-year daily-bar window, allows five REST API calls per minute and provides ticker news updated hourly. The previous trading day's daily bars become available only after midnight US Eastern Time, not immediately after the closing bell. The API key must remain a Cloudflare Pages secret named `MASSIVE_API_KEY`.
- **SEC EDGAR** is the primary source for reported financial statements and filings. Northstar uses company tickers/CIK mapping, submissions and XBRL companyfacts, with explicit filing-date limitations. It does not use FMP to overwrite SEC-reported facts.
- Massive financial statements/ratios are not included in Stocks Basic. Northstar must not call those endpoints on the free plan; SEC data is used instead.

## Current-price quotes

Massive Basic does not provide live/15-minute-delayed trade snapshots, last trades or NBBO quotes. Those are distinct plan entitlements. Do not represent end-of-day bars as a current quote.

The continuous monitor uses this fallback chain for timestamped intraday quotes:

1. Finnhub quote endpoint, when the Worker secret `FINNHUB_API_KEY` is present and the quote passes timestamp/price validation.
2. Alpaca IEX latest-trade endpoint, using the Worker secrets `ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY`.
3. FMP quote endpoint as a last-resort fallback, only for the legacy 87-symbol allowlist and within the existing 200-attempt daily safety cap.
4. Yahoo Finance chart endpoint as the final public fallback.

Every quote must have a positive price and timestamp within the 15-minute freshness window. Missing, stale, future-dated or malformed prices are rejected. FMP errors never replace verified quote data.

## Efficient daily 200-stock screening

Use `GET /api/massive-market-summary?date=YYYY-MM-DD` after 12:00 AM US Eastern Time on the next calendar day. Stocks Basic does not expose the current trading day's bars before midnight ET; a same-day request after the 4:00 PM close can still return HTTP 403. Massive's grouped daily endpoint returns all US stock daily bars in one request. Filter and rank the requested 200-stock universe in Northstar locally; do not make 200 individual Massive requests.

Use ticker-specific Massive news only for selected candidates. The Basic plan's hourly news feed is not a real-time alert stream. Queue requests to remain within five calls per minute, cache results and preserve published timestamps.

The current grouped endpoint is a data adapter; it does not itself schedule or claim a fully operational 200-stock scanner. Any scanner must record the market date, universe, exclusions, source, coverage and completion state.

## Licensing

Massive's individual/free plan is for personal, non-business use. It must not be used to serve data to external Northstar users or to commercialize the application. Contact Massive for the appropriate business license before any external distribution or business use.

## Separate Cloudflare secret stores

Cloudflare Pages Production and the `northstar-market-monitor` Worker have separate secrets. Configure `MASSIVE_API_KEY` in Pages for the new research/history/news endpoints. Configure and verify Worker secrets independently; Pages secrets do not propagate to the Worker.

## Safety

- Research and monitoring are read-only with respect to the brokerage account.
- No orders, broker positions or paper-trading execution controls are changed by these provider adapters.
- FMP remains an optional tertiary quote/history fallback; it is no longer the primary fundamentals or historical market-data source.
