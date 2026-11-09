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
