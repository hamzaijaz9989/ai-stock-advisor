# Paper lifecycle and risk guardrails

This module is deliberately pure: it performs no broker calls, network requests, or database writes.

## Order lifecycle
- Allowed statuses: PREVIEWED, SUBMITTING, ACCEPTED, PARTIALLY_FILLED, FILLED, CANCELED, REJECTED, UNKNOWN.
- UNKNOWN is an unresolved broker outcome. Do not blindly retry submission; reconcile the original client request/idempotency key with broker order history first.
- Terminal FILLED/CANCELED/REJECTED states cannot be resurrected.
- Cumulative fills must be monotonic, non-negative, no greater than order quantity, and have a positive average fill price when filled quantity is positive.
- Cancellation is not considered complete until the broker confirms CANCELED.
- Reuse of an idempotency key is allowed only for an identical canonical request hash.

## Portfolio risk
The pure evaluator checks total gross marked exposure including open-order exposure, position concentration, configured daily loss/drawdown thresholds, and broker account restrictions. It fails closed if daily loss or drawdown inputs are missing. Do not treat a passing calculation as trade approval: quote freshness, liquidity, correlation/sector concentration, corporate actions, and independent strategy validation are separate gates.

## Not implemented intentionally
No order submission, modification, cancellation, D1 mutation, automatic strategy selection, or live execution is implemented by these guards. The current production system remains paper-only, disabled, and kill-switched.

## Validation required before any live-money discussion
1. Add durable, append-only order event persistence and transactional compare-and-set state updates.
2. Integrate broker order submission only in a separately reviewed paper-only service, with idempotency and UNKNOWN recovery.
3. Build audited daily equity snapshots and calculate daily loss/drawdown from a defined high-water mark and trading-day boundary.
4. Add sector/correlation limits, open-order reservations, market-hours/calendar checks, stale-data controls, and price collars.
5. Backtest with point-in-time/unbiased data, corporate actions, survivorship controls, realistic fees/slippage, out-of-sample and walk-forward evaluation, and multiple-testing controls.
6. Run sustained paper forward tests and reconcile every broker event. Engineering checks do not establish profitability.


## Migration and OIDC release gate — 2026-11-10

The persistent-ledger PRs have migration-history divergence: main's `0006_continuous_market_monitor.sql` is duplicated by PR #85's `0011_continuous_market_monitor.sql`, while PR #85 also introduces `0006_northstar_fill_position_ledger.sql`. Production has migrations 0001–0005 recorded despite monitor tables existing; Preview has 0001–0012. Do not apply migrations or merge the overlapping sets until migration order and idempotency are reviewed against a disposable database. PR #88's GitHub OIDC validator accepts both public and private repository visibility despite its stated private-only contract; repository visibility is unresolved and must be treated as public until owner Settings confirm otherwise. No paper execution, paper order, or live order is authorized by this runbook update.


## 2026-11-10 — OIDC read-only snapshot token validation hardening

The GitHub Actions OIDC verifier used by the scheduled read-only snapshot path now rejects non-numeric `iat`, `exp`, and optional `nbf` claims rather than coercing strings/null. It retains a bounded 30-second clock-skew allowance, maximum token age of 10 minutes and maximum token lifetime of 15 minutes. The previous failing test used an expiry only one second in the past, which is intentionally within the 30-second skew allowance; the corrected regression tests verify the boundary and reject expiry beyond it.

- Implementation `47e2a19b37e78b9a2ee8c5076fb02885bccf6eaf`; exact test head `b8fb8704e8cbbe0720808098c99bb8a703f9e46e`; PR #108.
- CI: Tests `42817051649`, Validate `42817052712`, full-history secret scan `42817051960` — all SUCCESS.
- No scheduled workflow was manually dispatched by this work item. No broker request, D1 write/migration, order action or execution-control change occurred. Paper execution remains disabled; kill switch remains engaged.

## 2026-11-10 — OIDC-authenticated read-only equity snapshot schedule

The scheduled equity snapshot workflow is being migrated from a GitHub Actions operator-secret call chain to the pinned GitHub OIDC route `POST /api/paper/snapshot`. The route authenticates the exact main-branch workflow identity and performs only pre/post reconciliation plus read-only Alpaca Paper sync and idempotent snapshot audit. This does not implement order submission, modify execution controls, or enable paper execution. The workflow is implemented in PR #108 and has corrected exact-head CI passing (Tests `42825720825`, Validate `42825720610`, secret scan `42825720633`). Preview deployment `141f931c-63e2-41b8-bd06-b052f1c5173b` remains queued/idle; Production has not been deployed or invoked. The seven-day equity baseline remains unavailable; all execution safety gates remain closed.


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

### Current Production lifecycle state — 2026-11-10

Production execution control remains `enabled=0`, `mode=paper`, `kill_switch=1`. D1 contains zero paper orders, positions, intents, broker fills, trade events and Research Council runs/traces. No order endpoint was invoked. This is a disabled research-only state, not paper-forward-test evidence. Preserve the kill switch and do not create a test order.
