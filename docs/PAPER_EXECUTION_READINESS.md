# Northstar AI paper-execution readiness

## Current state

Paper execution is **not enabled**. The Trading Lab's Alpaca integration is read-only, and the browser journal stores plans locally. This document and the D1 migration establish the persistent-ledger design only. They do not submit, simulate, or authorize broker orders.

## Fixed operating limits

- Virtual planning capital: USD 1,000.
- Default planned risk: 0.5% of virtual capital (USD 5).
- Hard maximum planned risk: 1.0% (USD 10).
- Maximum position notional: 25% of virtual capital (USD 250).
- Broker environment: Alpaca Paper Trading only.
- Live trading: prohibited.
- No-trade is the required outcome whenever any data, strategy, account, risk, or operational gate is unknown or fails.

These are planning limits, not guarantees of maximum realized loss. Stops can gap and fills can slip.

## Durable ledger

Migration `web/migrations/0001_paper_trading.sql` creates:
- A single execution-control row, initially disabled with the kill switch engaged.
- An idempotent order ledger with unique client request keys and broker order IDs.
- Broker-reconciled positions.
- Append-only order lifecycle events.
- Equity snapshots for drawdown and performance reporting.
- An audit log for execution-control and operational events.

## Mandatory gates before any paper order route exists

1. Bind a Cloudflare D1 database to the Pages project and apply the migration.
2. Keep broker credentials and the execution token in server-side Cloudflare secrets only.
3. Require authenticated, non-browser-public operator/scheduler access; never embed a bearer secret in HTML or JavaScript.
4. Enforce server-side fixed capital, per-trade risk, notional, symbol, order-type, buying-power, open-order and portfolio exposure limits. Ignore client-supplied risk limits.
5. Persist an idempotency key and a request hash before broker submission; reject reused keys with changed payloads.
6. Reconcile broker orders, fills, positions and account state after every submission and on every scheduled cycle. Treat timeouts as UNKNOWN and reconcile before retrying.
7. Add a server-side kill switch that blocks new submissions and supports cancel-all only after an explicit, separately tested policy.
8. Add unit, integration and failure-injection tests for duplicate requests, partial fills, network timeouts, rejected orders, stale quotes, market closures, gaps, and concurrent scheduler invocations.
9. Verify every broker URL is the Alpaca paper host; reject any configurable live-trading host.
10. Run in disabled / preview-only mode first. Enable paper submissions only after the above checks and an explicit user confirmation.

## Operational safeguards

- Never convert a research ranking into a trade automatically. Each candidate needs fresh quote data, market-regime permission, earnings/news checks, a defined entry/stop, a positive reward/risk profile, and a strategy eligibility result.
- The current strategy validation status is not eligible: no verified point-in-time historical dataset or demonstrated edge has been established. Therefore the execution gate must remain closed even after the ledger is deployed.
- Store no API keys, secrets, or access tokens in this repository, database, browser storage, logs, or chat.
- A scheduled workflow must use a single-flight lock and a durable run record so overlapping scans cannot place duplicate orders.
- Report proposed, accepted, filled, rejected and unknown states separately. Never call an accepted order a fill.

## Cloudflare binding (later step)

The Pages project will need a D1 binding named `NORTHSTAR_DB` pointing to a newly created database. Its database ID is account-specific and must not be guessed. Add the binding only after the database exists; then apply the migration with Wrangler. No database ID or credentials are required in this repository change.

## 2026-11-10 — scheduled equity snapshots via GitHub OIDC

The three-hour read-only snapshot workflow now requests a short-lived GitHub Actions OIDC token with audience `northstar-paper-snapshot` and calls only the protected `POST /api/paper/snapshot` route. The workflow grants `contents: read` plus `id-token: write`, uses a single-flight concurrency group, and no longer requires a GitHub Actions copy of `NORTHSTAR_OPERATOR_TOKEN`. The Pages Function still uses the server-side Pages operator secret and Alpaca Paper credentials; it verifies the exact repository/owner IDs, main ref, workflow path/name, hosted runner, event, audience, signature and token time bounds. It checks fail-closed controls, performs pre-sync reconciliation, read-only sync, snapshot persistence verification and post-sync reconciliation, and records an idempotent audit row. It has no order submission path.

Implementation/workflow commit `48fe694bd76d183db66b8fc4706c52ccd048a8b8`; test correction `2d509d4e5eb2a2e6a4dcc5b1173409b498c5f2f3`; PR #108. Corrected Tests `42825720825`, Validate `42825720610`, secret scan `42825720633` all SUCCESS. Preview deployment `141f931c-63e2-41b8-bd06-b052f1c5173b` is still queued/idle and not verified. No Production deployment, D1 write/migration, secret mutation, broker call or order action occurred. Production snapshots and seven-day baseline remain pending; execution disabled, kill switch engaged, BUY not approved.


## 2026-11-10 20:31 PKT / 15:31 UTC — latest live Phase 2 audit

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Phase 1 universe scanning remains user-confirmed COMPLETE; no scanner rebuild was started.
- Objective: refresh repository, CI, Preview/Production Pages, Worker/cron, D1, data freshness, Council, strategy and paper-lifecycle evidence; preserve fail-closed gates.
- Source commit: `7fa64406351d5e5dfa36bdec4d8b6ae8ab2f4292` on PR #108 branch `northstar/stock-brain-clean-review-20261110`; main is `3f765d8dd0f9099e05df57d09c9f48c9b247ba9c`. PR #108 is OPEN, non-draft, mergeable, 71 ahead / 0 behind before this docs refresh; formal reviews 0; inline threads 0. Main branch-protection GET returned 403 Resource not accessible by integration; required-check enforcement is unverified. PR #103 is stale/non-mergeable; PR #109 is a separate draft and its news-quality helper is not wired into Council scoring.
- Exact source-head CI: Tests `42842079359`, Validate `42842079254`, full-history secret scan `42842079583` — all SUCCESS on `7fa64406351d5e5dfa36bdec4d8b6ae8ab2f4292`. This docs-only follow-up needs its own exact-head CI; do not inherit these results as proof for the new head.
- Preview: Pages deployment `a20a98b6-a3b4-4b6a-a560-e2deb277fe12` succeeded for `7fa64406351d5e5dfa36bdec4d8b6ae8ab2f4292`, Functions enabled, isolated Preview D1 `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. Live Trading Lab UI returned HTTP 200. Read-only readiness/performance/monitor returned HTTP 200; readiness confirms paper mode, execution disabled and kill switch engaged; Preview snapshots/runs/quotes/events are empty. FMP health returned HTTP 503 `MISSING_BINDING`, expected because Preview has no FMP/Alpaca/Gemini bindings.
- Production: Pages deployment `3782f3e9-0d2e-4d04-b95a-4dcd931a6133` serves main `3f765d8dd0f9099e05df57d09c9f48c9b247ba9c`. Read-only readiness, performance, monitor and FMP-health returned HTTP 200. Production FMP health reports quote 1 row, history 32 rows (latest 2026-11-10), fundamentals 1 row (latest 2026-01-25); this diagnostic is not proof of complete provider coverage or Council acceptance.
- Production D1: migrations `0001`–`0006`; 2 equity snapshots. Only `2026-11-08T18:34:38.720Z` (`alpaca_paper_read_only_sync`) is eligible trusted provenance. `2026-11-10T11:42:59.813Z` is `alpaca_paper_plugin_read_only_capture` and excluded from risk history. No trusted point is yet seven days old; earliest existing trusted baseline reaches seven days at `2026-11-15T18:34:38.720Z`. Council runs/traces 0/0; paper orders/positions/intents/fills/trade events 0; monitor quotes/events 0/0; audit rows 2. Controls: `enabled=0`, `mode=paper`, `kill_switch=1`. Preview D1 migrations `0001`–`0012`, empty, strategy approval `approved=0`.
- Snapshot workflow blocker: scheduled main workflow run `42837941172` failed at job `129905057412`, step 3, because GitHub Actions secret `NORTHSTAR_OPERATOR_TOKEN` was empty/missing. Production readiness precheck passed; sync/reconciliation steps were skipped, so no snapshot was written. PR #108 contains the replacement pinned-OIDC workflow and `POST /api/paper/snapshot` handler, but it is not merged or Production-verified.
- Monitor blocker: Production D1 has 222 monitor runs: 209 `market_closed`, 13 `failed`, aggregate errors 70; zero runs checked symbols and zero quote/event rows. Latest run #222 at `2026-11-10T15:30:53.341Z` failed with `Shortlist cache is stale or incomplete; monitoring fail-closed.` Cache `generatedAt=2026-11-10T11:04:27.273Z`, status success, 253 universe / 201 ranked / 52 excluded; at audit time it was about 4h27 old, beyond the Worker's 4h limit. Latest scheduled refresh observed: run `42803828945` (11:00:13Z–11:04:34Z); no later scheduled cache run was present as of 15:31Z. Worker `northstar-market-monitor` remains deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version `2739d49a-4182-423f-8113-616252c5ddd6` at 100%, cron `*/5 * * * *`. Deployed code still sends FMP auth in a custom header; PR #108 commit `3040f164f5bd31ee60b59e55b9cbac68045a8d35` changes to `apikey` query auth but is not deployed. Current latest failures are stale-cache failures; earlier runs #214–#216 had 10/10 quote failures.
- Council: all nine role integrations, dashboard rendering, durable trace/scorecard and telemetry are implemented on PR #108 and exact source-head CI passed. Synthetic integration is not live acceptance: without eligible timestamped news and a permitted sentiment feed it correctly returns `NO_TRADE` (market scanner, technical and fundamental complete; news/sentiment unavailable; bull/bear/portfolio/risk blocked). Sentiment remains unavailable until a permitted timestamped source is authorized; do not scrape or use unofficial wrappers. Preview provider bindings are absent.
- Strategy validation NOT APPROVED; paper lifecycle NOT READY; validated BUY disabled. No authenticated `POST /api/research/collect` was invoked.
- Database changes: NONE. D1 access was SELECT-only (`rows_written=0`, `changed_db=false`). No migrations, secrets read/changed, broker calls, order actions, execution-control changes or Production deployment.
- Repository visibility unresolved: GitHub API reports `private=false` / public while the owner states private; GitHub Settings has not been verified. Do not change visibility; treat contents as publicly accessible until Settings confirms otherwise.
- Exact next action: obtain independent review and authorized governance for PR #108; after approval/merge, verify the pinned-OIDC scheduled read-only snapshot workflow and separate Worker release. Keep the collector blocked until fresh trusted snapshot, genuine seven-day baseline, broker/ledger reconciliation, provider/auth, eligible news and permitted sentiment gates all pass. Then run one controlled research-only collection and verify all nine outcomes, trace/scorecard, telemetry and idempotent replay. Never enable execution or submit an order.

### Scheduled snapshot incident and OIDC replacement — 2026-11-10

Main's scheduled workflow failed at run `42837941172` because GitHub Actions secret `NORTHSTAR_OPERATOR_TOKEN` was empty. The readiness check passed; the secret-presence check failed before any broker request, D1 snapshot or reconciliation. The replacement OIDC route/workflow in PR #108 removes that separate GitHub secret dependency while retaining the server-side Pages operator secret, pinned repository/owner identity, short token lifetime, pre/post reconciliation, read-only sync, persistence verification and idempotent audit. It is implemented and tested but not merged or Production-verified. No paper order is permitted.
undefined

---

## 2026-11-10 22:38 PKT / 17:38 UTC — snapshot workflow auth failure classification

- Main scheduled workflow run 42837941172, job 129997639074. The readiness preflight succeeded. The GitHub Actions operator-secret presence check also succeeded; logs show a redacted non-empty value. The subsequent POST https://ai-stock-advisor.pages.dev/api/paper/sync returned HTTP 401. The read-only reconciliation step was skipped.
- The prior documentation statement that NORTHSTAR_OPERATOR_TOKEN was missing/empty is incorrect and is withdrawn. The available evidence only establishes that the supplied bearer token was rejected at the Pages sync endpoint; it does not prove whether the GitHub secret differs from the Cloudflare secret or whether another auth policy rejected it. Do not read, expose or compare secret values.
- PR #108 adds a narrowly scoped GitHub Actions OIDC endpoint. It verifies the signed GitHub token, issuer, audience, immutable repository/owner identity, main ref, exact workflow identity, hosted runner and bounded token lifetime. The route then uses the Cloudflare Pages operator token internally for pre/post read-only reconciliation and account sync. This is implemented and exact-head CI/Preview tested, not merged or Production-verified.
- Production execution remains disabled, paper mode, kill switch engaged. The two existing audit rows remain from 2026-11-08; no successful new snapshot or reconciliation is present. No order or execution-control change.
- Exact next action: independent review/governance for PR #108; after approved merge and Production Pages deployment, verify one scheduled OIDC snapshot and its read-only reconciliation/audit record. Do not run paper orders or enable execution.

---

## 2026-11-10 22:44 PKT / 17:44 UTC — OIDC snapshot success-path regression coverage

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE and was not rebuilt.
- Objective: close a test-coverage gap in the pinned GitHub OIDC read-only snapshot endpoint by exercising its successful path, sequential idempotent replay, read-only broker request methods, and pre-sync reconciliation failure.
- Test file changed: tests/paper-snapshot-oidc.test.mjs. It now uses a synthetic signed GitHub OIDC fixture, mocked JWKS/Alpaca GET responses, and an in-memory D1 adapter; no real credential, broker, Cloudflare or production D1 access occurs.
- New regression test 1: valid OIDC -> pre-sync reconciliation PASS -> one read-only account sync -> persisted trusted equity snapshot and completion audit -> post-sync reconciliation PASS. Repeating the same run_id/run_attempt returns replayed=true without another broker call, D1 batch, snapshot or audit row. All mocked external requests are GET-only; execution=false and automatedOrderSubmission=false.
- New regression test 2: an untracked broker order causes pre-sync reconciliation to return 409 and blocks the snapshot write, sync audit and OIDC completion audit.
- Source test commit: 36b4a355e9ead45e01b02784bd57c61dbe6680e2. PR #108 branch northstar/stock-brain-clean-review-20261110 is 79 commits ahead / 0 behind main 3f765d8dd0f9099e05df57d09c9f48c9b247ba9c; PR remains OPEN, non-draft, mergeable=true, with 0 independent reviews. This documentation follow-up is based on that exact test commit.
- Exact-head CI for 36b4a355e9ead45e01b02784bd57c61dbe6680e2: Tests 42867972228 PASS (Python tests, JavaScript API/evidence-score tests, scanner syntax and lint); Validate AI Stock Advisor 42867972275 PASS; full-history secret scan 42867972266 PASS.
- Deployment separation: Cloudflare Preview deployment cf353b27-1f68-4513-805f-896f16f8cdab for the test-only commit was skipped by path_config. No application deployment was expected. The latest successful application Preview remains 020c9c4d-bb0d-41c6-bd17-2ba4b1a70738 on code head c2a3a061d1423db0641223c1d8466d750b58041e. Production Pages remains 3782f3e9-0d2e-4d04-b95a-4dcd931a6133 on main 3f765d8dd0f9099e05df57d09c9f48c9b247ba9c.
- Current Production monitor D1 evidence: run #248 at 2026-11-10T17:40:52.911Z failed closed on stale/incomplete shortlist, 0 symbols and 0 errors. Ledger totals 248 runs (39 failed, 209 market_closed), 70 aggregate errors, 0 symbols checked, 0 quotes/events. Research Council runs/traces remain 0. Production controls remain enabled=0, mode=paper, kill_switch=1.
- Database changes: NONE. The new tests use synthetic in-memory D1 and mock all network requests; live D1 audits remain SELECT-only with changed_db=false and rows_written=0.
- Safety impact: tests only. No secret values read or changed, no live broker request, no real paper order, no D1 write/migration, no execution-control mutation, no Worker deployment or Production Pages deployment.
- Complete: OIDC verifier unit tests plus endpoint-level success/replay and pre-reconciliation fail-closed tests now pass on the exact test commit. This is CI verification only; the OIDC endpoint remains unmerged and not Production-verified.
- Blockers: independent PR review and verified branch governance; unresolved repository visibility; production fresh trusted snapshot and seven-day baseline; snapshot workflow OIDC route not merged; stale shortlist refresh schedule; unverified news and unlicensed/timezone-ambiguous sentiment; controlled live research-only acceptance; separate strategy validation and approval.
- Exact next action: obtain independent formal review/governance for PR #108. After approved merge, separately verify Production Pages/OIDC route and a scheduled read-only snapshot; investigate cache refresh schedule delivery without changing the completed scanner; accumulate a genuine seven-day trusted equity baseline. Only then run one controlled research-only Council acceptance and verify nine roles, vetoes, scorecard, telemetry, durable trace and idempotent replay. Keep execution disabled, kill switch engaged and BUY disabled; never submit any paper or live order.

The synthetic endpoint tests prove successful OIDC orchestration and sequential replay without real broker access; they do not prove the Production Pages secret is valid or that the deployed route works. Run 42837941172 previously reached POST /api/paper/sync and received HTTP 401 after readiness and GitHub secret-presence checks passed. The OIDC replacement remains unmerged/unverified in Production.
