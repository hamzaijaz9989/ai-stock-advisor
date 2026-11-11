# FMP Free-tier-aware market monitor

## Scope

The market monitor uses the following exact, ordered 87-symbol FMP Free-plan allowlist supplied by the account owner. This list is the single source of truth for FMP quote eligibility in this monitor. It is an account-specific working configuration, not a guarantee that every ticker will return a quote on every endpoint. Provider responses remain authoritative; denied, missing, stale, or malformed quotes are not treated as valid market data.

```text
AAPL, TSLA, AMZN, MSFT, NVDA, GOOGL, META, NFLX, JPM, V, BAC, PYPL, DIS, T, PFE, COST, INTC, KO, TGT, NKE, SPY, BA, BABA, XOM, WMT, GE, CSCO, VZ, JNJ, CVX, PLTR, SQ, SHOP, SBUX, SOFI, HOOD, RBLX, SNAP, AMD, UBER, FDX, ABBV, ETSY, MRNA, LMT, GM, F, LCID, CCL, DAL, UAL, AAL, TSM, SONY, ET, MRO, COIN, RIVN, RIOT, CPRX, VWO, SPYG, NOK, ROKU, VIAC, ATVI, BIDU, DOCU, ZM, PINS, TLRY, WBA, MGM, NIO, C, GS, WFC, ADBE, PEP, UNH, CARR, HCA, TWTR, BILI, SIRI, FUBO, RKT
```

The implementation and automated tests must match this list exactly, including membership and order. Do not silently add, remove, rename, or substitute symbols.

## Secondary quote provider: Finnhub

Finnhub is an optional secondary quote provider configured with the Cloudflare Worker secret `FINNHUB_API_KEY`.

Provider routing is deliberately subscription-aware:
- If a ticker is in the exact FMP Free-plan allowlist, Northstar tries FMP first and reserves an FMP request from the daily monitor budget.
- If the ticker is outside that allowlist, Northstar skips FMP entirely and does not spend an FMP request.
- If FMP fails, Northstar tries Finnhub when `FINNHUB_API_KEY` is configured.
- Yahoo Finance remains the final fallback only; every provider quote must pass the same timestamp and positive-price checks.
- Finnhub's free quote endpoint is not a historical OHLC/candles replacement. Use another validated source for backtesting and historical bars.
- Finnhub free access is subject to its personal-use terms. Do not use this key for a commercial or shared service without written permission from Finnhub.
- A missing Finnhub key leaves the existing FMP-to-Yahoo behavior intact.

The Finnhub token is sent in the `X-Finnhub-Token` request header, never exposed in browser code or logged. The quote's provider timestamp is required; missing, stale, future-dated, zero, or malformed quotes fail closed.

## Expanded shortlist coverage through Finnhub

The monitor continues rotating two symbols from the exact FMP allowlist per five-minute run. In addition, it checks a rotating batch of up to ten valid symbols from the current research shortlist that are outside the FMP allowlist. The batch cursor advances every five-minute scan, so larger shortlists are covered over successive runs instead of repeatedly selecting only the first ten. These symbols skip FMP entirely and route to Finnhub when `FINNHUB_API_KEY` is configured; otherwise they use the existing Yahoo fallback. This keeps the FMP budget isolated while allowing Northstar's research shortlist to include stocks beyond the 87 FMP-supported symbols.

Finnhub requests are serialized by the monitor's existing single-concurrency queue and request gap. The provider's free-tier rate limit must still be respected; the implementation does not assume historical-candle access or a guaranteed daily allowance.

## Request-budget policy

- FMP Free-plan stated allowance: 250 API calls per day.
- Monitor hard ceiling: 200 FMP quote attempts per UTC day.
- Reserved headroom: 50 calls for other Northstar FMP features and unexpected usage.
- Monitor batch size: 2 symbols per scheduled run.
- Schedule: every 5 minutes during US regular market hours only.
- A normal 6.5-hour session has at most 78 scheduled runs, or 156 monitor FMP attempts.
- Failed FMP attempts still consume budget and are counted.
- The D1 budget ledger uses an atomic conditional upsert, so the monitor cannot reserve request 201 for the same UTC day.
- The ledger schema is defined in `web/migrations/0007_fmp_request_budget.sql`; apply it through the reviewed D1 migration process before enabling FMP calls in the scheduled Worker. The Worker never creates or alters schema at runtime and fails closed if the migration is missing.
- Once the monitor budget is exhausted, it stops calling FMP and may use the existing Yahoo fallback. Yahoo data still must pass timestamp and price validation.

## Universe rotation

The monitor rotates through the configured allowlist in two-symbol batches. This covers the full 87-symbol universe over approximately 220 minutes of scheduled market-open runs. Symbols absent from the current top-stocks cache can still be checked, but they have no provisional entry watch zone until the cache supplies one.

## Safety and limitations

- No batch-quote endpoint is assumed.
- No unsupported symbol is sent to FMP by the monitor.
- The monitor does not interpret a quote as a BUY signal.
- Provider errors and stale data remain fail-closed.
- This change does not enable paper-order execution or live trading.
- The request ledger counts monitor FMP attempts only. Other Northstar components using the same FMP account/key must preserve the 50-call headroom; they are not automatically charged against this monitor ledger.
- The FMP daily reset timezone is not assumed. The ledger uses UTC dates; verify the provider's reset boundary before relying on exact end-of-day alignment.
