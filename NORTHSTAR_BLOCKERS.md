# Northstar Completion Sprint — Blockers and Evidence

Last updated: 2026-11-09T02:47:47Z  
Repository: `hamzaijaz9989/ai-stock-advisor`  
Production branch: `main`  
Work branch: `northstar/paper-execution-risk-controls`

## Completed and verified

- PR #84 merged into `main` as merge commit `74fb9a293c66bd4cac38d36e29ec294cc58cc80c` on 2026-11-09 01:29:29 UTC.
- Cloudflare Pages production deployment `2c92c7b3-5447-440e-b3f2-066270f54b8a` completed successfully on 2026-11-09 01:29:47 UTC. Its deployed commit is `74fb9a293c66bd4cac38d36e29ec294cc58cc80c`.
- Live production homepage is reachable. The production `/api/paper/readiness` endpoint returned HTTP 200 with `configured=true`, `policyVerified=true`, `mode=paper`, `executionEnabled=false`, and `killSwitchEngaged=true`.
- Live production `/api/paper/performance` returned HTTP 200, `execution=false`, one durable equity snapshot, no positions and no imported fills. The account equity shown is broker account equity, not the $1,000 strategy allocation.
- Production D1 migration ledger confirms migrations `0001` through `0005` applied, including `0005_paper_trade_intents.sql` at 2026-11-09 01:27:57.
- Production D1 schema includes the expected execution-control, intent, order, position, equity-snapshot, fill-activity, trade-event, audit, and research tables and indexes.
- Latest production controls read: `enabled=0`, `mode='paper'`, `kill_switch=1`, `max_portfolio_usd=1000`, `default_risk_fraction=0.005`, `max_risk_fraction=0.01`, `max_position_fraction=0.25`.
- Production D1 counts at this run: 0 research council runs, 0 decision traces, 0 intents, 0 paper orders, 0 paper positions, 0 broker fill activities, 0 trade events, 1 equity snapshot and 2 audit rows.
- The only production equity snapshot is `2026-11-08T18:34:38.720Z`: equity $100,000, cash $100,000, source `alpaca_paper_read_only_sync`. This is not Northstar's $1,000 virtual allocation.
- PR #85 remains open and draft, based on `main`. The latest application source/test-code head at this evidence checkpoint is `24642a2a89d9178481f144db4b6061f3fba21f2d`; the following blocker-log-only commit is documentation, not application code.
- GitHub Actions run `42548153031` on application/test-code head `24642a2a89d9178481f144db4b6061f3fba21f2d` completed successfully on 2026-11-09 01:56:30 UTC: Python tests passed, JavaScript tests passed (199/199, 0 failures), and lint passed. A subsequent blocker-log-only commit `2d8b85e087fd4210edca70f61e9bfe030c38be5c` also passed run `42548264156` (199/199 JavaScript tests, Python tests and lint).
- Five changes on this run corrected inaccurate “execution remains disabled” claims in read-only sync, fill-import and reconciliation responses. The sync/fill tests that had weak mocks were replaced with explicit enabled-paper-mode tests proving those maintenance endpoints remain read-only and do not modify execution controls. This does not enable execution.
- Earlier PR #85 test run `42547342359` failed because a performance test still expected read-only performance to reject an enabled paper control state. The test was updated; current-head run `42547447493` passed, and the latest run above also passed.
- Cloudflare preview deployments for the three latest application source changes succeeded: `dc79e6a1` (sync warning semantics), `3ba913a6` (fill-import warning semantics), and `e852c56c` (reconciliation warning semantics). The later test/documentation-only commits were skipped by the Pages path filter. The latest PR preview readiness endpoint still reports paper mode, execution disabled, kill switch engaged, and the configured risk limits. Production remains deployed from PR #84, not PR #85.

## Unresolved blockers

### 1. Historical strategy validation is not approved

Evidence: `docs/STRATEGY_VALIDATION_STATUS.md` states `NOT APPROVED`; `historicalValidationPass` remains deliberately false. The repository does not contain a complete real point-in-time dataset, frozen-rule end-to-end historical signal set, demonstrated sample of at least 100 completed trades, four-fold chronological walk-forward report, untouched holdout and independent review.

Impact: No validated BUY eligibility. Passing software tests or paper execution controls cannot substitute for strategy validation.

Next action: Build and independently review the point-in-time dataset and frozen-strategy validation report. Do not change approval flags to satisfy tests.

### 2. Seven-day equity history is not available

Evidence: Production D1 contains only one snapshot: `2026-11-08T18:34:38.720Z`. Research/preflight/submit require fresh equity data and a qualifying seven-day baseline.

Impact: Research collection and preflight must reject until seven days of real snapshots exist.

Next action: After the read-only snapshot workflow is safely merged and its repository secret is verified, collect snapshots. Earliest possible baseline from the existing record is not before 2026-11-15 18:34:38 UTC. Verify actual data; do not assume the schedule ran.

### 3. Paper order lifecycle is not production-safe yet

Evidence:
- There is no broker-order cancellation/replacement endpoint or tested cancellation/recovery policy.
- The current executor submits an OTO entry with a stop-loss child. Alpaca's official order documentation states that bracket child orders are not active until the entry is completely filled; OTO is a bracket variant. A partial entry can therefore leave partial exposure without an active stop until the parent completes. See https://docs.alpaca.markets/us/docs/orders-at-alpaca.
- The current code detects an unverified/missing nested stop leg and fails closed, but it does not yet safely cancel the remaining entry and protect or flatten any partial fill. Engaging the kill switch does not itself protect an already-filled partial position.
- Run 2 hardens verifyOtoStopLeg: a broker HELD child is accepted only when the parent has zero filled shares (no exposure); if any shares are filled, a HELD child is explicitly rejected as PARTIAL_FILL_WITH_HELD_STOP_CHILD. The submit route now reports protectiveStopVerified=false for a zero-fill held child and marks an exposed partial-fill/held-child result UNKNOWN with the kill switch engaged. This is detection/fail-closed behavior, not recovery; it does not cancel the remaining entry or establish a stop for the filled shares. CI is pending for this change.
- Fill sync imports broker activities idempotently and advances matching order states, but it does not yet create an independent fill-derived position ledger or complete realized-P&L accounting. `paper_positions` is a latest broker snapshot mirror, not an independent historical position ledger.
- The scheduled snapshot workflow has been updated on PR #85 to run `/api/paper/sync` → `/api/paper/fills-sync` → `/api/paper/reconcile`, requiring execution=false and a clean read-only reconciliation at every stage. This updated workflow is not yet merged or production-verified; it still depends on the repository secret NORTHSTAR_OPERATOR_TOKEN.
- Read-only maintenance endpoints have now been tested to work in paper mode while execution is enabled, without changing execution controls. The complete enabled-mode lifecycle has not been exercised against Alpaca Paper.

Impact: An accepted parent order cannot yet be treated as a fully managed, continuously protected and reconciled position lifecycle. Do not enable paper execution.

Next action: Design a safe partial-fill policy for OTO activation timing; implement cancellation/recovery and verified protection/flattening for any partial exposure; add failure-injection tests; create a fill-derived position ledger or rigorously specified broker-snapshot reconciliation model; and schedule/verify the complete read-only maintenance chain. Do not submit a test order.

### 4. Separate paper approval secret is absent from production Pages configuration

Evidence: The current Cloudflare Pages production configuration lists `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `FMP_API_KEY2`, `GEMINI_API_KEY` and `NORTHSTAR_OPERATOR_TOKEN`. It does not list `NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN`. Secret values are redacted by the platform.

Impact: The submit route must reject authorization. No paper order can be submitted.

Next action: Configure this secret only after strategy approval and complete lifecycle validation. Never put its value in Git, D1, logs or chat.

### 5. Scheduled snapshot and authenticated production workflows are not verified end-to-end

Evidence: PR #85's `.github/workflows/northstar-paper-snapshot.yml` remains on the draft branch and checks only `/api/paper/sync`. It does not invoke fill import and reconciliation. The production authenticated chain (sync, fill import, reconciliation, research collection and operator proposal flow) has not been verified end-to-end. The GitHub integration does not expose repository secret values or a reliable secret-presence check for `NORTHSTAR_OPERATOR_TOKEN`; do not infer that repository secret is configured from the Cloudflare Pages variable.

Impact: A successful Pages deployment or green unit tests do not prove scheduled authenticated workflows work in production.

Next action: After the workflow is completed and safely merged, verify repository secret presence through a workflow that checks only whether the secret is non-empty, then verify authenticated read-only endpoints and scheduled run results. Never print secret values.

### 6. PR #85 is not ready to merge or deploy

Evidence: PR #85 is open, draft, and currently `mergeable=false`; no review submissions are recorded. Current head `24642a2a89d9178481f144db4b6061f3fba21f2d` has a passing Tests workflow (199 JavaScript tests, Python tests, lint). The PR is still draft and the safety blockers above remain. The GitHub branch-protection endpoint returned 403 `Resource not accessible by integration`; ruleset access is also unavailable, so branch-protection requirements could not be independently inspected.

Impact: PR #85 routes and workflows are not in production. Do not convert it to ready, merge, or deploy while the critical lifecycle and strategy blockers remain.

Next action: Continue resolving blockers, inspect all latest changes, re-check exact head and all required checks, and verify repository branch rules with an appropriately authorized GitHub session before merge. Never bypass required checks or protections.

## Production safety state

- Paper mode only. No live broker URL or live credentials are used by this workflow.
- Production execution remains disabled and kill switch engaged.
- Virtual allocation: $1,000.
- Default risk: $5; maximum per-trade risk: $10.
- Maximum position: $250.
- Daily loss cap: $20.
- Maximum drawdown: $80.
- No real-money order and no paper order has been submitted. No order was created as a test.

## Completion estimate

Project-wide estimate: **58%**. This is an evidence-based project estimate, not a percentage of code written. PR #84's successful merge/deployment and this run's tested read-only maintenance improvements are included. Strategy approval, seven-day equity history, complete partial-fill/cancellation/protection lifecycle, production authenticated workflow verification and PR #85 release remain outstanding.


## Run 2 — 2026-11-09T02:47:47Z

### Changes submitted to PR #85 (CI pending)
- web/lib/paper-execution-policy.js: stop-child validation now distinguishes a held OTO child with zero parent fills from a held child while shares are exposed. It also validates the parent quantity and filled quantity, and recognizes Alpaca's group_role stop_loss field.
- web/functions/api/paper/submit.js: initial submission and idempotent recovery now use the verified protected flag. A held child with no fills is no longer reported as a verified active stop. A held child with any partial exposure is marked UNKNOWN with the existing fail-closed kill-switch path.
- tests/paper-execution-policy.test.mjs: replaced the prior unsafe assertion that a held stop is protective; added explicit zero-fill, partial-fill-held, partial-fill-active, malformed quantity and mismatched-stop cases.
- .github/workflows/northstar-paper-snapshot.yml: scheduled maintenance now calls read-only account sync, idempotent fill import, and read-only reconciliation sequentially, and requires clean execution=false responses.

### Remaining critical limitations
- Partial-fill recovery is still not implemented: the executor does not cancel the unfilled remainder or establish a standalone protective stop/flatten the already-filled quantity. The kill switch prevents new orders only; it does not protect existing exposure.
- No independent fill-derived position ledger or complete realized-P&L accounting is implemented.
- The scheduled chain has not run against production because PR #85 remains unmerged. Repository-secret presence cannot be independently verified through the current GitHub integration.
- Strategy validation remains NOT APPROVED; production has only one historical equity snapshot, so the seven-day baseline is not yet satisfied.
- Branch protection/ruleset access remains unavailable to the connected GitHub integration; PR #85 is still draft and mergeability must be rechecked after these commits.

No paper order, real-money order, or broker mutation was performed during this run. Production execution remains disabled with the kill switch engaged.


## Production configuration hardening — 2026-11-09
- Cloudflare Pages production and preview fail_open settings were both changed to false using a minimal deployment-config PATCH. Read-back confirmed both false and the production deployment remained commit 74fb9a293c66bd4cac38d36e29ec294cc58cc80c. Environment variable names were read back; no secret values were read or changed. This is fail-closed configuration hardening, not an application deployment.
- Production currently has ALPACA_API_KEY_ID, ALPACA_API_SECRET_KEY, FMP_API_KEY2, GEMINI_API_KEY and NORTHSTAR_OPERATOR_TOKEN configured by name. NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN is absent. Do not enable paper execution until its purpose and secure provisioning are resolved.
- Read-only D1 recheck: execution enabled=0, mode=paper, kill_switch=1, allocation=$1,000, risk fraction=0.5%, max risk fraction=1%, max position fraction=25%; one equity snapshot (2026-11-08T18:34:38.720Z), zero paper orders, zero positions, zero imported fills, zero intents, zero council runs, zero decision traces; five migrations 0001–0005 applied.


## Run 3 — 2026-11-09T03:24:22.405Z

### Changes submitted to PR #85
- `web/functions/api/paper/fills-sync.js`: known filled exposure is no longer silently skipped when broker fill state, cumulative quantity, lifecycle transition, stop price, or nested OTO stop child is inconsistent. The row is marked `UNKNOWN`, a `UNPROTECTED_EXPOSURE_REQUIRES_MANUAL_RECOVERY` event and audit entry are written, and execution is disabled with the kill switch engaged. The endpoint does not cancel, amend, submit, or flatten broker orders; manual recovery is still required to protect an already-filled position.
- `tests/paper-fills-sync.test.mjs`: corrected the prior test fixture that incorrectly expected a HELD OTO stop child to be accepted for a partially filled parent. The positive lifecycle test now requires a fully filled parent and active stop child. Added/updated cases asserting that backwards cumulative fills, a missing stop child, and an inconsistent FILLED status block lifecycle advancement and engage the kill switch.
- `.github/workflows/northstar-paper-snapshot.yml`: after a completed fill import, the workflow now runs read-only reconciliation even if fill sync reports a manual-recovery condition; the workflow then fails unless fill sync is safe and reconciliation is clean.

### CI and preview evidence
- Commit `6eb43bf33e067db46c359fb130b4f9d5c6d0cfc6` passed both GitHub Actions workflows: JavaScript tests 202/202, Python tests 94/94, and lint passed. The earlier CI failure at commit `92480d0c2ff8d9ea8290d9be349adcac78335c5b` was a stale warning-string assertion in the enabled-paper-mode read-only test; the wording and assertion were corrected.
- Cloudflare Pages preview for application-code commit `cebf9d912f9b50f1034c2c2effd7e64e7b2064b4` completed successfully (deployment check `128962037727`). The final `6eb43bf` commit only changed tests and did not trigger a new Pages preview build.
- PR #85 remains open and draft. Latest checked head: `6eb43bf33e067db46c359fb130b4f9d5c6d0cfc6`; GitHub currently reports `mergeable=true`, but draft status remains true and no formal review submissions are recorded. Branch protection/ruleset requirements still cannot be independently read by the connected GitHub integration.

### Production recheck
- PR #84 remains merged as `74fb9a293c66bd4cac38d36e29ec294cc58cc80c`; `main` points to that commit. Latest production Pages deployment remains `2c92c7b3-5447-440e-b3f2-066270f54b8a`, successfully deployed from the same commit. No PR #85 code is in production.
- Production D1 remains paper mode, execution disabled (`enabled=0`), kill switch engaged (`kill_switch=1`), $1,000 allocation, 0.5% default risk, 1% maximum risk, and 25% maximum position fraction. Counts remain 0 intents, 0 orders, 0 positions, 0 fills, 0 paper trade events, 2 audit rows, and 1 equity snapshot. Migrations 0001–0005 are applied.
- The only snapshot remains `2026-11-08T18:34:38.720Z`; no seven-day baseline exists. Production Pages environment-variable names still do not include `NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN`; no secret values were read.

### Remaining critical blockers
1. Partial-fill recovery is not complete. Fill sync now detects known unprotected exposure, marks it UNKNOWN and engages the kill switch, but it still does not cancel the unfilled remainder or establish a standalone stop/flatten the already-filled shares. The kill switch is not protection for an existing position.
2. No independent fill-derived position ledger or complete realized-P&L accounting exists; `paper_positions` remains a broker snapshot mirror.
3. Strategy validation remains NOT APPROVED; no point-in-time dataset, >=100 completed-trade sample, chronological walk-forward folds, untouched holdout, and independent review are evidenced.
4. Seven-day equity baseline is absent. Earliest possible baseline from the sole existing snapshot is no earlier than 2026-11-15T18:34:38.720Z, and only if valid snapshots are collected and retained meanwhile.
5. The authenticated scheduled production workflow has not been run; presence of the GitHub repository secret `NORTHSTAR_OPERATOR_TOKEN` is not verifiable through this integration. The separate paper-approval secret is absent from production Pages configuration.
6. PR #85 remains draft. Formal review is absent and branch protection/ruleset configuration is inaccessible to this GitHub integration; do not merge or deploy until release gates are independently verified.

No paper order, live order, or broker mutation was performed. Production execution remains disabled and the kill switch remains engaged. Project-wide completion estimate remains **58%**; this run improved fail-closed detection and tests but did not complete the partial-fill recovery or strategy-validation gates.


### Run 3 addendum — 2026-11-09T03:28:06.976Z
- `web/functions/api/paper/performance.js`: the fill query now fetches 5,001 rows to detect whether the 5,000-activity FIFO cap was exceeded. If truncated, realized P&L/win-rate/profit-factor and partial lot outputs are withheld, `historyComplete=false` is returned, and a `FILL_HISTORY_LIMIT_REACHED` data-quality issue is exposed. This prevents a truncated fill ledger from being presented as complete performance.
- `tests/paper-performance.test.mjs`: added a 5,001-fill regression test that verifies statistics remain withheld.
- Latest PR #85 head `f73ac432df3ef123ada289fffdbc6362fe11f67c`: GitHub Actions passed — 203 JavaScript tests, 94 Python tests, and Ruff lint all passed. Cloudflare Pages preview for application-code commit `3d30ad610988a74a03bd66f33e0315686cd6515f` completed successfully (deployment check `128963163847`). The final head commit `f73ac43` is test-only and has no new preview build.
- PR #85 remains open and draft, based on merged main commit `74fb9a293c66bd4cac38d36e29ec294cc58cc80c`. No PR #85 code has been merged or deployed to production. The strategy, seven-day history, partial-fill recovery, position-ledger, paper approval secret, authenticated workflow and branch-protection/review blockers remain unchanged.
- Production execution remains disabled and kill switch engaged; no broker orders or mutations were performed. Completion estimate remains **58%**.


### Run 3 safety addendum — 2026-11-09T03:30:54.915Z
- `web/functions/api/paper/reconcile.js`: every nonterminal broker order must now have a ledger protective-stop price and a matching nested OTO stop child. A rejected order is treated as exposure-free only when its cumulative filled quantity is exactly zero; a rejected state with nonzero fills still requires stop verification. This closes a gap where a missing ledger stop price could previously be skipped by reconciliation.
- `tests/paper-reconcile.test.mjs`: updated positive fixtures to prove an active stop child is present; added regression cases for missing ledger stop price and rejected orders with nonzero fills.
- Latest checked PR #85 head: `6a2003be6b74e647e07e7564aaa9dfa7a97ea5bf`. GitHub Actions passed: 205 JavaScript tests, 94 Python tests, and Ruff lint. The prior run on application commit `1bc6ec3` exposed two stale positive test fixtures that lacked the now-required stop; the fixtures were corrected and the latest head is green.
- Cloudflare Pages preview for reconciliation code commit `1bc6ec3b52a5fcda96778291693fdd768496de66` succeeded (deployment check `128963947510`). Latest test-only head has no additional Pages preview.
- PR #85 remains open and draft, mergeable according to GitHub, with no formal reviews. The critical strategy, seven-day history, partial-fill recovery/cancellation, independent position ledger, approval-secret, scheduled production workflow, and branch-protection access blockers remain unresolved. Production remains at PR #84's commit; execution is disabled and kill switch engaged. No broker orders or mutations were performed. Completion estimate remains **58%**.


### Latest CI confirmation — 2026-11-09T03:31:49.012Z
- Final PR #85 branch head for this run is `f00292e76accf00071ee464c2c6550864f1b1c0f` (documentation-only update after application code commit `1bc6ec3`). GitHub reports the JavaScript test workflow and AI Stock Advisor validation workflow both completed successfully; test output: 205/205 JavaScript tests, 94/94 Python tests, Ruff passed.
- PR #85 is still open, draft, unmerged, and mergeable=true. The only production deployment remains the PR #84 merge commit. No paper/live orders were created.

### Run 4 — 2026-11-09T03:52:00Z
- Re-checked PR #84 and PR #85. PR #84 remains merged as `74fb9a293c66bd4cac38d36e29ec294cc58cc80c`. PR #85 remains open, draft, based on the merged main commit, and GitHub currently reports `mergeable=true`; no formal review submissions are recorded. The branch-protection read still returns 403 to the connected integration.
- `web/functions/api/paper/fills-sync.js`: changed lifecycle handling so any unverified tracked order state now fails closed, not only states with already-filled shares. A tracked order missing from the broker order-history response, an unrecognized/inconsistent broker state, or an OTO order with a missing/mismatched stop child is marked `UNKNOWN`, audited, and causes the paper kill switch to engage. The response now distinguishes actual filled exposure (`unsafeExposureCount`) from all unsafe/unverified order states (`unsafeOrderCount`), and records `exposurePresent` per order. The endpoint remains read-only with respect to broker orders: it does not cancel, amend, submit, or flatten anything.
- `tests/paper-fills-sync.test.mjs`: added regressions for a live zero-fill OTO entry with no stop child and for a tracked ledger order missing from broker history. Both assert manual recovery, UNKNOWN ledger state and kill-switch engagement.
- `.github/workflows/northstar-paper-snapshot.yml`: scheduled workflow output now includes `unsafeOrderCount` so zero-fill-but-unverified open orders are visible in the job log.
- Commits created this run: `3833f720c1fe93ea41e3510b3597839c2ab9bc8b` (fill-sync safety logic), `66fbc3b6d387d42728153fe5f0ba2c01e0d29901` (regression tests), and `d5cf840fc1a7ba5523b58ab75d85044b8cdeece4` (workflow diagnostics). At the time of this record, GitHub checks for the latest head were still running: Tests, AI Stock Advisor validation, Python tests and Cloudflare Pages preview. Do not treat this run as green until all four complete successfully.
- Production D1 was re-read: `execution_control.enabled=0`, `mode=paper`, `kill_switch=1`, $1,000 allocation, 0.5% default risk, 1% maximum risk, 25% maximum position fraction. There is still one equity snapshot (`2026-11-08T18:34:38.720Z`), zero intents, zero orders, zero positions and zero imported fills. Migrations 0001–0005 are applied. Latest production Pages deployment remains `2c92c7b3-5447-440e-b3f2-066270f54b8a`, deployed from PR #84 merge commit `74fb9a293c66bd4cac38d36e29ec294cc58cc80c`; no PR #85 code is in production. Production deployment metadata still lacks `NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN`; secret values were not read.
- Critical blockers remain: partial-fill cancellation/recovery and verified protection/flattening; an independent fill-derived position ledger and realized-P&L accounting; strategy validation remains NOT APPROVED; seven-day equity history; authenticated scheduled production workflow verification and repository secret-presence verification; separate paper approval secret; formal PR review and branch-protection visibility. Earliest possible seven-day baseline remains no earlier than `2026-11-15T18:34:38.720Z`, subject to valid snapshots being collected.
- No paper or live order was created; no broker mutation was performed. Production execution remains disabled and kill switch engaged. Completion estimate remains **58%** pending CI and the unresolved release-critical lifecycle/strategy gates.

### Run 4 CI resolution — 2026-11-09T03:51:20Z
- The first CI attempt exposed two test-only mismatches after the fail-closed response contract changed: the enabled-mode test still expected the old warning text, and the zero-fill test expected the wrong helper reason for an empty `legs: []` array. Both expectations were corrected in `tests/paper-fills-sync.test.mjs`; application code was not relaxed.
- Latest verified code/test head before this documentation update: `1eb973372a017b5ee2f069457d045bcdfc3921d8`. GitHub Actions on that head completed successfully: JavaScript API/evidence tests **207/207**, Python tests **94/94**, Ruff lint passed; the separate AI Stock Advisor validation workflow also passed its Python tests, lint, JavaScript checks, SEC ingestion checks and synthetic CLI guard checks. The earlier failed run on `d5cf840` is superseded by this green head.
- Cloudflare Pages preview deployment `fc426ece-b5f4-4830-9fec-8b4ee3d6c955` successfully built the application-code head `d5cf840fc1a7ba5523b58ab75d85044b8cdeece4`, which includes the fill-sync code and scheduled-workflow diagnostics. Later commits were test/documentation-only and were skipped by the Pages path filter. The preview is not production.
- PR #85 is still open and draft. GitHub mergeability has fluctuated between true and false during successive commits; no formal review is recorded, and branch-protection rules remain unreadable (403) to this integration. No merge/deploy attempted.
- Production remains at PR #84 commit `74fb9a293c66bd4cac38d36e29ec294cc58cc80c`. Production D1 still has one equity snapshot, no intents/orders/positions/fills, `enabled=0`, `mode=paper`, `kill_switch=1`. The separate paper approval secret remains absent from Pages config. No broker mutation or paper/live order was performed.
- The zero-fill/missing-stop and missing-broker-order conditions now force UNKNOWN + kill switch, but no recovery endpoint cancels the entry remainder or protects/flattens filled shares. Independent fill-derived position accounting and validated strategy evidence are still absent. Seven-day history, authenticated scheduled workflow, secret verification, formal review and branch-protection visibility remain blockers. Completion remains **58%**.

### Run 4 performance attribution hardening — 2026-11-09T03:53:40Z
- `web/functions/api/paper/performance.js`: Northstar FIFO P&L now includes only Alpaca Paper fill activities whose broker order ID matches a Northstar `paper_orders` parent ID or a nested child ID recorded in that order's broker response. Unrelated manual/external Alpaca Paper activity is excluded from Northstar strategy statistics. The response separately reports tracked Northstar fill count and untracked broker activity count. Missing child IDs remain excluded rather than being guessed.
- `tests/paper-performance.test.mjs`: added a regression proving a Northstar parent entry fill and recorded OTO stop-child fill are included while an unrelated manual order's fill is excluded. Existing FIFO, data-quality and 5,001-activity truncation tests remain.
- Application-code commit: `c38f1a4061a88d9f951382cbcf8acb912d3307e8`. Test commit: `ff909ada3cfa66167b77cfa051d761caf410588c`. GitHub Actions on the latest code/test head passed: JavaScript tests **208/208**, Python tests **94/94**, Ruff lint passed; the separate validation workflow also passed its test, lint, syntax, SEC-ingestion and synthetic CLI guard steps.
- Cloudflare Pages preview `918beaca-3cbd-483a-aeb3-78f2b0e10d0e` successfully built application commit `c38f1a4061a88d9f951382cbcf8acb912d3307e8`. Latest test-only commit was skipped by the Pages path filter. No production deployment occurred.
- PR #85 remains open and draft; GitHub reports mergeable=true at this checkpoint, but no formal review exists and branch-protection requirements remain inaccessible (403). Production remains PR #84's deployment `2c92c7b3-5447-440e-b3f2-066270f54b8a` / commit `74fb9a293c66bd4cac38d36e29ec294cc58cc80c`.
- Production D1 remains unchanged: paper mode, execution disabled, kill switch engaged, one equity snapshot, zero intents/orders/positions/fills, migrations 0001–0005. The separate paper approval secret is still absent. No broker mutation or order was performed.
- Remaining blockers: safe partial-fill cancel/protect/flatten recovery; independent fill-derived position ledger and realized-P&L reconciliation; strategy validation NOT APPROVED; seven-day equity history; authenticated scheduled production workflow and repository-secret verification; paper approval secret; formal review and branch-protection visibility. Completion estimate remains **58%**.

### Production probe limitation — 2026-11-09T03:54:30Z
- Cloudflare API read-back confirms the production Pages project has `fail_open=false`, production branch `main`, and D1 binding `NORTHSTAR_DB`. Latest production deployment remains successful at commit `74fb9a293c66bd4cac38d36e29ec294cc58cc80c`.
- The current runtime could not independently fetch the public production `/api/paper/readiness` or `/api/paper/performance` URLs (the HTTP browsing layer returned an internal access error). Do not count this run as a fresh HTTP endpoint probe. The prior successful HTTP 200 probes remain documented above; D1 controls, migration ledger and row counts were independently re-read in this run.


### Run 5 — 2026-11-09T05:01:52.872Z
- Added `web/lib/paper-position-ledger.js`, a pure deterministic long-only FIFO derivation engine for Northstar-tracked fills. It validates activity identity, side, symbol, quantity, price and timestamp; preserves open lots; matches sells FIFO; computes gross realized P&L; rejects oversells/short positions; and fails closed when same-symbol fills at an identical timestamp have ambiguous side/price ordering.
- Added migration `web/migrations/0006_northstar_fill_position_ledger.sql` with append-only `northstar_fill_ledger`, open `paper_position_lots`, and `paper_realized_trades` tables. The migration is additive; it has **not** been applied to production.
- `web/functions/api/paper/fills-sync.js` now maps tracked parent-entry and recorded OTO stop-loss child fills to Northstar ledger orders, persists tracked fills idempotently, rebuilds FIFO lots/realized matches in the same bounded D1 batch, and fails closed/engages the paper kill switch on activity conflicts, side/symbol mismatch, or sell quantity beyond tracked long shares. Terminal order states now permit idempotent same-state verification. The endpoint remains read-only against Alpaca: it never submits, amends, cancels or flattens orders.
- `web/functions/api/paper/reconcile.js` now compares broker positions against both the `paper_positions` snapshot mirror and the independent FIFO-derived positions. It reports fill-derived mismatches separately.
- Added FIFO, partial/child stop-fill, oversell, idempotency, ambiguous timestamp and three-way reconciliation tests. Added `docs/PAPER_FILL_DERIVED_LEDGER.md` describing the data model, gross-P&L limits and remaining recovery gap.
- Latest PR #85 head: `a80307fd6e86b83a968f251f90729709198d46d8`. GitHub Actions passed: JavaScript tests **220/220**, Python tests **94/94**, Ruff passed; the separate AI Stock Advisor validation workflow passed its Python/lint, JavaScript syntax, SEC ingestion and synthetic CLI checks. The earlier intermediate failure on the first helper-integration commit was a test-loader import omission; the loader was corrected and the latest head is green.
- Cloudflare Pages preview deployment `5df32822-b5a2-4460-bd09-cef4e7ac5980` successfully built application commit `cd1bc3a2c5b363ba39e154d0306747bc9a929ecd` (`https://5df32822.ai-stock-advisor.pages.dev`). Latest head `a80307f` is test-only and was skipped by the Pages path filter. This is preview only, not production.
- **New preview-isolation finding:** the Pages project preview configuration has no environment variables but its `NORTHSTAR_DB` binding points to the same D1 database ID as production. Do not invoke authenticated or mutating preview routes against this binding; create/configure a separate preview D1 database before end-to-end preview integration tests. No preview endpoint was invoked in this run.
- Production D1 re-read confirms only migrations 0001–0005 are applied; tables from migration 0006 do not exist yet. `execution_control` remains `enabled=0`, `mode=paper`, `kill_switch=1`, `max_portfolio_usd=1000`, `default_risk_fraction=0.005`, `max_risk_fraction=0.01`, `max_position_fraction=0.25`. There is still one equity snapshot (`2026-11-08T18:34:38.720Z`), zero intents, zero orders, zero positions and zero imported fills. Production Pages remains deployed from PR #84 merge commit `74fb9a293c66bd4cac38d36e29ec294cc58cc80c`; PR #85 code is not in production.
- Production Pages secret-name inventory includes the Alpaca Paper keys, FMP/Gemini keys and `NORTHSTAR_OPERATOR_TOKEN`; `NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN` is still absent. Secret values were not read. The separate approval token is a blocker for any paper submission, not a reason to enable execution.
- PR #85 remains open and draft, currently `mergeable=true`, with no formal review submissions. Branch-protection/ruleset read still returns 403 to this integration. No merge or production deploy was attempted.
- Remaining critical blockers: dedicated partial-fill cancellation/recovery and standalone protective-stop/flatten verification; strategy validation remains `NOT APPROVED`; seven-day equity baseline; production application of migration 0006 after release gates; isolated preview D1; paper approval secret; authenticated scheduled workflow/repository-secret verification; formal review and branch-protection visibility. Earliest possible seven-day baseline remains no earlier than `2026-11-15T18:34:38.720Z`, provided valid periodic snapshots continue.
- No broker mutation, paper order, or live order was performed. Production execution remains disabled and kill switch engaged. Project-wide completion estimate is now **60%**: the independent fill-derived ledger and three-way reconciliation are implemented and tested in PR code, but not yet applied/deployed to production and do not replace partial-fill recovery or strategy validation.
