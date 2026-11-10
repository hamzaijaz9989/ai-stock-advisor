# Market Scanner production acceptance audit

## Current follow-up — 2026-11-11 20:57 UTC

- GitHub main remains `85c51f847f4b4a966be629ff9f3702194d6ae262`. Draft PR #116 carries the isolated nine-agent integration plus scanner safeguards and the timezone fix; its exact-head Node tests, Python tests, and full-history secret scan passed. PRs #108 and #115 remain open and unmerged.
- Full JavaScript suite: 288/288 passed. The point-in-time regression now rejects FMP accepted timestamps without an explicit timezone instead of interpreting them using the machine's local timezone.
- Latest production D1 monitor run #287 (`2026-11-10T20:55:52.645Z`) failed with zero symbols checked and ten quote failures. `monitor_quotes`, `monitor_events`, `research_council_runs`, and `research_decision_traces` each contain zero rows. Read-only controls remain `mode=paper`, `enabled=0`, `kill_switch=1`; D1 reads wrote zero rows.
- Production Worker version `2739d49a-4182-423f-8113-616252c5ddd6` still sends FMP authentication in the custom header. The checked-in cache is generated at `2026-11-10T19:42:15.959Z`, outside the 30-minute validator window. No refresh was dispatched, production deployment performed, or PR merged.

**Current acceptance: incomplete.** The scanner code and nine-agent integration pass automated tests, but live production quote retrieval, D1 quote persistence and authenticated nine-agent execution remain unverified or failing.

## Verified state — 2026-11-10 20:10 UTC

- Current `main` at audit start: `85c51f847f4b4a966be629ff9f3702194d6ae262`.
- Refresh run `42887359931` completed successfully. It evaluated all 253 symbols: 201 ranked, 52 excluded, and all ten shortlist candidates enriched. The validator passed. The published cache was generated at `2026-11-10T19:42:15.959Z`.
- Cloudflare Pages production deployment `fec9c9e6-de57-41a4-8aaa-a83fdb3de56d` succeeded from that `main` commit. A live cache-bypass browser read returned the same cache and complete scan accounting.
- Local `validate-stock-cache.mjs` passed. `tests/stock-cache-validation.test.mjs` passed 9/9 after a restricted process-spawn permission prevented the first test-run attempt.
- Production `/api/monitor?limit=20` and direct Worker `/health` returned HTTP 200. Direct `/events?limit=20` returned HTTP 200 with an empty event list. The latest D1 run (`2026-11-10T20:05:53.098Z`) failed with zero quotes checked and ten quote failures. D1 has zero `monitor_quotes` and zero `monitor_events` rows. The Worker cron is `*/5 * * * *`.
- D1 history shows the Worker rejected the old cache as stale before the refresh completed. From 19:45Z through 20:05Z, it continued failing all ten quote lookups after the refreshed cache was live. The production Worker counts these failures but does not retain provider-specific causes, so the upstream failure class is not yet known.
- The production Trading Lab displays the same ten tickers and scores as the published cache, with its generated timestamp. This confirms it renders the actual cache data.
- Production `execution_control` was read-only verified as `mode=paper`, `enabled=0`, `kill_switch=1`. No secrets were read, and no broker or execution-control action was taken.

**Historical acceptance state: incomplete.** Full-universe scanning and cache publication passed at the recorded scan time. The production Worker has not received the FMP auth correction or safe provider-failure categories. Do not call the scanner production-complete until a fresh cache passes the 30-minute validator, fresh quotes persist to D1, and the remaining acceptance criteria pass.

# Parallel live-data acceptance: Market Scanner + Technical Analyst

The authenticated POST endpoint `/api/research/specialists` collects quote and FMP historical OHLCV evidence without invoking Alpaca, D1, portfolio sync, or execution. It requires the existing `NORTHSTAR_OPERATOR_TOKEN` bearer token and a ticker.

The endpoint verifies ticker identity, quote timestamp, quote age, OHLCV schema, chronology and minimum history coverage. It runs the Market Scanner and Technical Analyst against the same canonical evidence and returns provider/source timestamps and explicit limitations. It never places orders or returns a BUY decision.

Market Scanner calculates relative latest-session volume against the prior 19 sessions and reports the provider quote change. It is a single-ticker analysis, not a universe-wide ranking; provider-delayed quotes are explicitly flagged.

Technical Analyst calculates SMA(20), SMA(50), RSI(14), MACD(12,26,9) and the observed 20-session high/low range. Historical adjustment policy remains unverified, so the report carries that limitation and must not be treated as certified support/resistance.

Synthetic tests cover malformed and out-of-order bars and indicator output. A live Preview request with a valid operator token is still required for live acceptance. No Production deployment is part of this change.
