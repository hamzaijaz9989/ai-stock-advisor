# Continuous market monitor

The Northstar market monitor is a separate Cloudflare Worker from the three-hour full-universe scanner.

- Cron cadence: every five minutes; the worker exits without quote requests outside the US regular session (09:30–16:00 America/New_York, weekdays).
- Scope: at most the top ten candidates from the last validated 253-stock cache. It does not re-rank all 253 names.
- Quote source: Yahoo Finance chart endpoint, 1-minute interval. Provider access and timestamps are not guaranteed real-time; each observation stores provider quote time and retrieval time.
- Events: entry into or exit from an existing provisional watch zone and absolute daily move of at least 3%. Events are deduplicated per symbol, event type and New York calendar date.
- Safety: stale/incomplete shortlist cache fails closed; provider errors are recorded; no AI BUY decision, broker order, or trade is ever triggered.
- Storage: D1 tables in migration 0006 hold latest quote snapshots, event history and monitor run health.
- Read-only status: Pages endpoint /api/monitor exposes the latest run and event feed.

This is frequent polling, not a guaranteed streaming feed. It is intended to surface meaningful research events while keeping quote requests bounded (maximum ten names, three concurrent requests, five-minute cadence).


## Migration-history release note — 2026-11-10

Main contains `0006_continuous_market_monitor.sql`. The open PR #85 branch also contains `0011_continuous_market_monitor.sql`, which is byte-for-byte identical, plus a separate `0006_northstar_fill_position_ledger.sql`. Production's D1 ledger records only 0001–0005 even though monitor tables exist; Preview records 0001–0012. Do not apply/replay these migrations blindly. Before merging the overlapping branch, reconcile the complete ordered migration set against both D1 ledgers and a disposable database. The monitor remains read-only, with cron `*/5 * * * *`; its latest audit had 91 `market_closed` runs and zero quote/event rows.



## 2026-11-10 — FMP quote adapter and deployment status

- Current source prefers the Financial Modeling Prep stable quote endpoint when the single canonical `FMP_API_KEY` binding is present. It sends the key in the request header, validates provider timestamp freshness, and falls back to a fresh Yahoo Finance chart quote when FMP fails. If neither provider returns a timestamped fresh quote, the monitor fails closed.
- Regression tests use injected fetch/clock dependencies and cover FMP authentication-header handling, missing/stale timestamps, Yahoo fallback, no-key Yahoo-only behavior, and failure when both providers fail. Exact main/PR merge commit `9b74526c9aad712942d3beb7191f45e565351380` passed Tests `42774546912`, Validate `42774546820`, secret scan `42774546827`, and push Tests `42774539310`.
- Deployment distinction: the repository source is updated, but the separate Worker is still deployed as `7326f3e7-f323-4856-badf-aa8b979dffb4` (version `2739d49a-4182-423f-8113-616252c5ddd6`). Do not claim the new FMP adapter is runtime-deployed until a separately reviewed Worker deployment succeeds and its health/quote behavior is verified.
- Latest Production monitor evidence: 123 runs, all `market_closed`, zero symbols, errors, quote rows or event rows; cron remains `*/5 * * * *`. No market-open provider cycle has been verified.
- No D1 writes/migrations, broker requests, orders, execution-control changes or Production deployment occurred in this work item.
