# Market Scanner production acceptance audit

## Verified state — 2026-11-10 20:10 UTC

- Current `main` at audit start: `85c51f847f4b4a966be629ff9f3702194d6ae262`.
- Refresh run `42887359931` completed successfully. It evaluated all 253 symbols: 201 ranked, 52 excluded, and all ten shortlist candidates enriched. The validator passed. The published cache was generated at `2026-11-10T19:42:15.959Z`.
- Cloudflare Pages production deployment `fec9c9e6-de57-41a4-8aaa-a83fdb3de56d` succeeded from that `main` commit. A live cache-bypass browser read returned the same cache and complete scan accounting.
- Local `validate-stock-cache.mjs` passed. `tests/stock-cache-validation.test.mjs` passed 9/9 after a restricted process-spawn permission prevented the first test-run attempt.
- Production `/api/monitor?limit=20` and direct Worker `/health` returned HTTP 200. Direct `/events?limit=20` returned HTTP 200 with an empty event list. The latest D1 run (`2026-11-10T20:05:53.098Z`) failed with zero quotes checked and ten quote failures. D1 has zero `monitor_quotes` and zero `monitor_events` rows. The Worker cron is `*/5 * * * *`.
- D1 history shows the Worker rejected the old cache as stale before the refresh completed. From 19:45Z through 20:05Z, it continued failing all ten quote lookups after the refreshed cache was live. The production Worker counts these failures but does not retain provider-specific causes.
- Confirmed deployed-code defect: Worker version `2739d49a-4182-423f-8113-616252c5ddd6` still sends `FMP_API_KEY` as a custom `apikey` header. Open PR #108 contains the isolated correction in commit `3040f164f5bd31ee60b59e55b9cbac68045a8d35`, moving it to FMP's documented query parameter; that correction is not in the deployed Worker. This explains why the primary FMP quote path is not using the documented authentication transport. The same ten runs also failed the Yahoo fallback, but the old Worker discarded those provider errors, so the exact fallback response is not verified yet.
- The production Trading Lab displays the same ten tickers and scores as the published cache, with its generated timestamp. This confirms it renders the actual cache data.
- Production `execution_control` was read-only verified as `mode=paper`, `enabled=0`, `kill_switch=1`. No secrets were read, and no broker or execution-control action was taken.

**Acceptance status: incomplete.** Full-universe scanning, cache validation and production cache publication are verified. Fresh production quote retrieval and D1 quote persistence are failing. The current branch applies the documented FMP auth transport and adds redacted provider/status failure classes to run details. Neither change is deployed; production verification is still required. Do not call the scanner complete until a subsequent production run stores fresh quote rows and all remaining acceptance criteria pass.

## Follow-up validation — 2026-11-11

- The cached scan from `2026-11-10T19:42:15.959Z` is now outside the validator's 30-minute freshness window. Running `validate-stock-cache.mjs` against that unchanged checkout correctly failed freshness validation; the scheduled refresh workflow supports manual dispatch, but a new current scan has not yet been run in this follow-up.
- Focused local checks for the FMP authentication transport and sanitized quote-failure classification passed 18/18 tests. Production has not received either Worker change, so quote persistence remains unverified.
- Fix branch commit `a501a269284dd78e8b39c88b4a3e5c7390289e8f` passed GitHub Actions checks on draft PR #115: Node tests, Python tests and full-history secret scan all completed successfully. The PR remains draft and unmerged; the run IDs are `42893834185`, `42893834109` and `42893834027` respectively.
- The scanner workflow run verified for the prior cache was `42887359931` on November 10. The Actions page was reachable signed out, but dispatch controls were unavailable, so no fresh workflow run was started.

# Parallel live-data acceptance: Market Scanner + Technical Analyst

The authenticated POST endpoint `/api/research/specialists` collects quote and FMP historical OHLCV evidence without invoking Alpaca, D1, portfolio sync, or execution. It requires the existing `NORTHSTAR_OPERATOR_TOKEN` bearer token and a ticker.

The endpoint verifies ticker identity, quote timestamp, quote age, OHLCV schema, chronology and minimum history coverage. It runs the Market Scanner and Technical Analyst against the same canonical evidence and returns provider/source timestamps and explicit limitations. It never places orders or returns a BUY decision.

Market Scanner calculates relative latest-session volume against the prior 19 sessions and reports the provider quote change. It is a single-ticker analysis, not a universe-wide ranking; provider-delayed quotes are explicitly flagged.

Technical Analyst calculates SMA(20), SMA(50), RSI(14), MACD(12,26,9) and the observed 20-session high/low range. Historical adjustment policy remains unverified, so the report carries that limitation and must not be treated as certified support/resistance.

Synthetic tests cover malformed and out-of-order bars and indicator output. A live Preview request with a valid operator token is still required for live acceptance. No Production deployment is part of this change.
