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
## Production monitor and Pages environment audit — 2026-11-10 12:56 PKT



## 2026-11-10 12:56 PKT — Pages Preview D1 isolation repair

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE; no scanner work was reopened.
- Objective: correct a live Cloudflare Pages environment-binding drift that defeated the repository's existing Preview/Production D1 isolation test.
- Evidence before repair: Cloudflare Pages project `ai-stock-advisor` read-back showed BOTH `deployment_configs.preview.d1_databases.NORTHSTAR_DB` and `deployment_configs.production.d1_databases.NORTHSTAR_DB` pointing to Production database `northstar-paper-ledger` (`528f3a23-1d1f-4d16-8463-f643d85f5deb`). A separate `northstar-preview` database existed (`bdffc29f-a4f6-498e-ade7-22c85d9bd373`). This contradicted the prior PR #108 statement that the deployed project binding was isolated; the checked-in `web/wrangler.toml` test alone did not verify Cloudflare's live project setting.
- Remediation: Cloudflare Pages project PATCH updated ONLY the Preview `NORTHSTAR_DB` binding to `northstar-preview`. Immediate GET read-back confirmed Preview=`bdffc29f-a4f6-498e-ade7-22c85d9bd373`, Production=`528f3a23-1d1f-4d16-8463-f643d85f5deb`. Preview `NORTHSTAR_OPERATOR_TOKEN` binding remained configured; Production secret-name metadata remained `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `FMP_API_KEY`, `GEMINI_API_KEY`, `NORTHSTAR_OPERATOR_TOKEN`. Secret values were never read or changed. Both environments retain `fail_open=false`.
- D1 read-only evidence: Preview migration ledger is 0001–0012; 0 council runs/traces, 0 monitor runs/quotes/events, 0 equity snapshots, 0 orders/positions/intents/trade events; controls `enabled=0`, `mode=paper`, `kill_switch=1`. Production migration ledger is 0001–0006; 133 monitor runs, all `market_closed`, 0 symbols checked, 0 errors, 0 quote/event rows; 1 equity snapshot at `2026-11-08T18:34:38.720Z`; 0 council runs/traces and 0 paper lifecycle rows; controls remain `enabled=0`, `mode=paper`, `kill_switch=1`. Every D1 query reported 0 rows written and `changed_db=false`.
- Worker/cron: `northstar-market-monitor` deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version `2739d49a-4182-423f-8113-616252c5ddd6` at 100%; cron `*/5 * * * *`. Latest monitor run #133 completed `2026-11-10T08:05:53.203Z` with `market_closed`, 0 symbols and 0 errors. No Worker deployment change.
- Repository/PR: main `d1a966debfc69b59ac465f942d807720ae585c71`; PR #108 branch `northstar/stock-brain-clean-review-20261110`, pre-update head `c004179b64bba90054503e2add11584f19978142`, compare 5 ahead / 0 behind, OPEN/non-draft/mergeable, 0 formal reviews. Exact pre-update head CI: Tests `42776707128`, Validate `42776707045`, full-history secret scan `42776707322` — all SUCCESS. This documentation update is on PR #108; exact resulting commit is the new PR head.
- Pages: current Production deployment `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365` succeeded for main commit `839e135dad88849350a7f6f61c929ee8ce4bc046`. PR #108 Preview deployment `c4776915-0b34-4010-b97e-51b0cd13de3d` was still `idle` before this docs commit. Cloudflare docs state a redeploy is required for a changed D1 binding to take effect; wait for the new Preview deployment and verify it before any endpoint test.
- Database changes: none. Only Cloudflare Pages project configuration was changed; no D1 migration/query write, secret mutation, broker call, order action, execution-control change, or Production deployment occurred.
- Safety impact: prevents future Preview deployments from being bound to the Production paper ledger. Production binding was explicitly preserved. This is a configuration-level repair; it is NOT yet runtime-verified until a fresh Preview deployment completes.
- Remaining blockers: Preview lacks FMP/Alpaca/Gemini secret bindings (Production has the canonical `FMP_API_KEY`; no alternate key name is used). Production equity history is one stale snapshot and lacks a seven-day baseline. Strategy validation remains NOT APPROVED; paper lifecycle NOT READY. PR #108 still needs independent review; main branch protection is not verified; repository visibility remains unresolved because owner intent is private while GitHub API reports public. The old PR #103 is dirty/diverged and is not the review target.
- Next exact action: complete a new Preview deployment from this PR branch after the binding correction; verify deployment status, runtime route and Preview D1 isolation without invoking the collector or any broker endpoint. Then update the PR handover with the new deployment ID and exact-head CI. Keep execution disabled, kill switch engaged and BUY disabled.
