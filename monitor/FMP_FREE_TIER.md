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

The monitor continues rotating two symbols from the exact FMP allowlist per five-minute run. In addition, it now checks up to ten valid symbols from the current research shortlist that are outside the FMP allowlist. These symbols skip FMP entirely and route to Finnhub when `FINNHUB_API_KEY` is configured; otherwise they use the existing Yahoo fallback. This keeps the FMP budget isolated while allowing Northstar's research shortlist to include stocks beyond the 87 FMP-supported symbols.

Finnhub requests are serialized by the monitor's existing single-concurrency queue and request gap. The provider's free-tier rate limit must still be respected; the implementation does not assume historical-candle access or a guaranteed daily allowance.

## Shared FMP request-budget policy

- FMP publishes a Free-plan allowance of 250 API calls per day. Northstar does not assume the connected account has access to every endpoint; verify the account tier and endpoint entitlements in FMP.
- Pages and the market-monitor Worker bind the same production D1 database, `northstar-paper-ledger`. Preview Pages binds a separate database and therefore has an isolated ledger.
- Northstar reserves at most **200 calls per rolling 24 hours** across all providers, leaving 50 below the published Free allowance for external use and reset-window uncertainty.
- Within that total, the monitor may reserve 160 calls and Pages may reserve 40 calls. The monitor cap covers its normal 156-call regular-session maximum. Pages usage includes FMP health checks, fundamentals, and historical data.
- Each FMP endpoint request costs one budget unit. The code checks persistent response cache first, then atomically reserves the exact cost of all cache misses before any fan-out. Historical collection can cost up to eight calls; fundamentals six; health three.
- Calls that fail, time out, or are denied by FMP are not refunded. There are no automatic retries. Cache hits cost no provider calls. Simultaneous identical misses use a persistent lease; if the original request remains in flight, the duplicate caller fails retryably without making another provider call.
- If D1 budget/cache storage is unavailable, Pages sends no FMP request. The monitor falls back to configured Finnhub/Yahoo providers; it never bypasses the shared guard.
- The ledger is rolling 24 hours; it does not rely on an unverified UTC reset boundary. Migration 0008 conservatively imports recent monitor usage from the old UTC aggregate, timestamped at migration time because the old table had no request timestamps.
- Production stays unprotected until the migration and matching Pages/Worker code are reviewed and applied together. Pre-cutover Pages traffic was not counted by the old monitor-only table, so verify account usage and use a controlled cutover.

## Universe rotation

The monitor rotates through the configured allowlist in two-symbol batches. This covers the full 87-symbol universe over approximately 220 minutes of scheduled market-open runs. Symbols absent from the current top-stocks cache can still be checked, but they have no provisional entry watch zone until the cache supplies one.

## Safety and limitations

- No batch-quote endpoint is assumed.
- No unsupported symbol is sent to FMP by the monitor.
- The monitor does not interpret a quote as a BUY signal.
- Provider errors and stale data remain fail-closed.
- This change does not enable paper-order execution or live trading.
- Monitor and Pages share the new rolling ledger. If their secrets belong to different FMP accounts, the shared cap is conservative but may underuse the separate quotas.
- The published plan allowance does not prove endpoint access; provider 401/403/429 responses remain authoritative.


## Runtime audit — 2026-11-12

The latest production audit is recorded in [Provider Health Audit](../docs/PROVIDER_HEALTH_AUDIT_2026-11-12.md).

Important environment separation: `FMP_API_KEY` in Cloudflare Pages Production does not automatically configure the separate `northstar-market-monitor` Worker. The user updated the key, and the current Worker settings confirm `FMP_API_KEY` is present as a Worker Secret binding. Post-update scheduled run #564 authenticated successfully with FMP, persisting fresh AAPL and TSLA quotes from `Financial Modeling Prep`; 8 symbols checked, zero errors, and zero FMP fallbacks. Keep the Pages Production and Worker secret stores configured separately; never paste keys into chat or commit them.

Finnhub is configured as a Worker Secret and is confirmed in recent production quote rows. It successfully served FMP fallback requests in the latest market-session runs, although a transient symbol-level provider failure was also observed. This is runtime evidence, not a guarantee of universal symbol coverage.
