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
