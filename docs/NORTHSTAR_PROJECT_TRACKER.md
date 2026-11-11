# Northstar AI — Master Project Tracker

**Last updated:** 2026-11-11 (UTC)  
**Repository:** `hamzaijaz9989/ai-stock-advisor`  
**Active work branch:** `northstar/cloudflare-research-orchestration`  
**Active pull request:** [#118 — Design Cloudflare-native autonomous research orchestration](https://github.com/hamzaijaz9989/ai-stock-advisor/pull/118)  
**Current implementation head:** `410e7ec12511d8f515d64c825609364c16e949be`  
**Base branch/head recorded for PR:** `main` / `85c51f847f4b4a966be629ff9f3702194d6ae262`

> This is the canonical progress and decision record for Northstar. Update it in the same work session as every meaningful code, migration, architecture, configuration, test, security, or deployment change. Do not rely on chat history as the project record.

## 1. Product direction and fixed decisions

| Area | Current decision |
|---|---|
| Architecture | Cloudflare-native: existing Pages Functions, Workers, and D1 |
| Agent autonomy | Research council remains advisory; capped automatic paper-only pilot approved in principle, but execution stays disabled until all engineering, strategy, and runtime gates pass |
| Infrastructure budget | Minimal; reuse existing resources before adding paid services |
| Research roles | Preserve the existing nine-agent council; do not create a parallel agent framework |
| Financial safety | Real-money trading prohibited. Paper automation may be enabled only after paper-host isolation, server-side risk enforcement, tests, strategy acceptance, and explicit final activation approval; no live host or credentials |
| Production changes | No production migration, secret change, or deployment without separate explicit approval |
| Data integrity | Preserve provenance, timestamps, freshness, source entitlement, missing-data reasons, and deterministic risk vetoes |

## 2. Current project status

**Overall milestone:** Cloudflare-native orchestration design plus the first duplicate-run protection increment are committed to the feature branch. This is not production-ready and is not yet deployed.

| Workstream | Status | Evidence / notes |
|---|---|---|
| Architecture decision | Complete | User confirmed Cloudflare-native, research-only, minimal-cost |
| Architecture documentation | Complete (design baseline) | [Cloudflare agent architecture](NORTHSTAR_CLOUDFLARE_AGENT_ARCHITECTURE.md) |
| Upstream open-source review | Complete (scoped review) | [Open-source reuse audit](NORTHSTAR_OPEN_SOURCE_REUSE_AUDIT.md); TradingAgents and FinRobot concepts reviewed, no upstream source files copied |
| Existing nine-agent council | Existing code found; acceptance not re-established | Existing Northstar JS modules were inspected; full production acceptance remains unproven |
| Duplicate research request protection | Implemented on feature branch; CI green | D1 lease migration and collector integration described below |
| Durable stage-by-stage checkpoints | Not implemented | Current lease prevents duplicate same-request work; it does not resume an interrupted agent workflow |
| Lease renewal / long-running job safety | Open engineering review | Current lease has a 10-minute expiry and no heartbeat; validate execution duration and add safe renewal or redesign before relying on it for long jobs |
| Lease unit/integration tests | Not yet specifically added | General repository CI passes; targeted concurrency/expiry/token tests remain required |
| Scheduled orchestration | Not started | Scheduler remains disabled/not implemented |
| Dashboard run history/status | Not started | Read-only visibility remains planned |
| Preview end-to-end acceptance | Not performed | Requires controlled Preview environment and verified data/provider prerequisites |
| Production migration/deployment | Not performed; approval required | No production resources were changed by this branch work |
| Trading execution | Prohibited | Research-only operating mode |

## 3. Latest implementation changes

### 3.1 Architecture and audit documentation

- Added `docs/NORTHSTAR_CLOUDFLARE_AGENT_ARCHITECTURE.md`.
- Added `docs/NORTHSTAR_OPEN_SOURCE_REUSE_AUDIT.md`.
- Linked these documents from the project handbook.
- Architecture keeps the existing Cloudflare stack and Northstar's existing agent/council implementation.
- The upstream review inspected TradingAgents and FinRobot as design references. No source code was copied from those repositories. OpenBB runtime adoption was deferred pending license, compatibility, provider, and cost review.

### 3.2 Duplicate-run lease protection

- Added migration: `web/migrations/0004_research_council_run_leases.sql`.
- Added D1-backed lease acquisition/release in `web/functions/api/research/collect.js`.
- The lease is keyed by request ID and records the symbol, owner token, and expiry.
- A second active request with the same request ID is returned as in-progress rather than repeating provider/LLM work.
- Reusing the same request ID for a different symbol is rejected.
- Expired leases can be reclaimed atomically.
- The lease is released after durable result persistence and on handled errors.
- This is single-flight/idempotency protection only. It is not a durable workflow engine and does not yet resume individual agent stages after a crash.

### 3.3 Relevant commits on the active branch

| Commit | Change |
|---|---|
| `6729ac626c204c87191705cbbcba5d40b80fd87e` | Add Cloudflare-native orchestration architecture baseline |
| `b264538828903cc2487f1b8951cabfcff49f7959` | Add scoped upstream reuse/licensing audit (verify exact commit if referencing externally) |
| `e27fdc3fdcbcf4b3c98ad5170bdf86afd249e0ac` | Add D1 research-run lease migration |
| `bfb4db15a2ca489da7d947ac8aaced6f9a1fe75a` | Fix lease-token scope and replay lease release |

The current branch contains additional commits; use GitHub's branch/PR commit list for the authoritative full sequence.

## 4. Verification record

Latest CI results checked for head `bfb4db15a2ca489da7d947ac8aaced6f9a1fe75a`:

| Workflow | Run | Result |
|---|---:|---|
| Tests | [42914952165](https://github.com/hamzaijaz9989/ai-stock-advisor/actions/runs/42914952165) | Success |
| Validate AI Stock Advisor | [42914952200](https://github.com/hamzaijaz9989/ai-stock-advisor/actions/runs/42914952200) | Success |
| Northstar full-history secret scan | [42914952169](https://github.com/hamzaijaz9989/ai-stock-advisor/actions/runs/42914952169) | Success |

These are GitHub Actions results for the feature-branch commit. They do not prove D1 migration application, Cloudflare Preview behavior, production health, market-data correctness, agent quality, or investment performance.

## 5. Next execution plan

Work in this order. Update the tracker after each completed or blocked item.

### P0 — Make the current lease safe and testable
1. Inspect the current lease implementation and Cloudflare request/runtime limits.
2. Resolve the 10-minute expiry/no-heartbeat risk. Add owner-token-protected renewal at safe stage boundaries or choose a safer bounded execution design.
3. Extract lease logic into a testable module if that improves isolation.
4. Add tests for first claim, duplicate active claim, expired reclaim, wrong-symbol conflict, token-protected release, replay cleanup, and concurrent claims.
5. Run the full test/validation/secret-scan workflows and record exact commit plus run URLs.

**Acceptance:** concurrency and recovery tests pass; a lease cannot be stolen while its owner is legitimately working; expired work can recover safely; no production database is touched.

### P1 — Durable research progress and recovery
1. Define stage names and terminal states for collection, evidence validation, each specialist, Bull/Bear challenge, portfolio synthesis, risk veto, and persistence.
2. Add additive D1 event/checkpoint storage only after reviewing existing schemas and migration ordering.
3. Persist enough validated inputs/outputs to resume safely without rerunning completed expensive work.
4. Distinguish `completed`, `partial`, `blocked`, and `failed`; partial work must never display as a completed council result.
5. Add fault-injection tests for interruption at every durable boundary.

**Acceptance:** an interrupted run can be diagnosed and safely resumed or explicitly marked non-resumable; no silent overwrites or false completion.

### P2 — Scheduler foundation
1. Verify current Worker/Cron setup and existing scheduled jobs.
2. Implement bounded, disabled-by-default scheduling using existing Cloudflare resources.
3. Enforce symbol/request budgets, market calendar, provider freshness/health, idempotency, bounded retries, and circuit breakers.
4. Ensure scheduler cannot call broker execution routes.

**Acceptance:** duplicate schedule delivery cannot duplicate a run; failure recovery is bounded; scheduler remains off until reviewed configuration and approval.

### P3 — Read-only dashboard visibility
1. Add run history and latest-run status.
2. Show provider health/freshness, nine-agent status, unavailable reasons, evidence coverage, and deterministic risk veto.
3. Keep secrets, credentials, sensitive account identifiers, and privileged controls out of browser responses.

**Acceptance:** dashboard can read authorized summaries only; no browser path can invoke privileged collection without authentication.

### P4 — Preview and operational acceptance
1. Verify D1 schema/migrations in a non-production Preview database.
2. Run a controlled end-to-end research task with an exact commit SHA.
3. Verify evidence provenance, all nine role outcomes, final risk veto, persistence, cost, and failure behavior.
4. Complete security, source entitlement, and rollback reviews.

**Acceptance:** written Preview evidence and all acceptance tests pass.

### P5 — Production promotion
Requires a separate explicit user approval after P4. Production migration, deployment, secrets, broker settings, and any financial execution remain out of scope until approved. Financial execution remains prohibited under the current research-only decision.

## 6. Active blockers and risks

- **Lease lifetime:** current 10-minute expiry has no heartbeat. Resolve before treating long-running work as robust.
- **Targeted tests:** add specific tests for lease contention, expiry, and recovery.
- **D1 migration:** migration is committed to the branch but has not been applied to production. Do not apply it without approval.
- **End-to-end runtime:** no controlled Preview run has yet verified the complete nine-agent path.
- **Portfolio preconditions:** preserve existing read-only portfolio sync and fresh snapshot/baseline requirements; if unavailable, block the run rather than bypassing the gate.
- **Provider quality/rights:** verify source freshness, completeness, entitlements, rate limits, and attribution.
- **Strategy validation:** no predictive accuracy or profitability claim is approved. BUY remains disabled.

## 7. Mandatory documentation and change-control rules

For every meaningful project change, update this tracker in the same work session and commit the documentation alongside the code whenever possible.

Each entry must record:
1. Date/time (UTC), branch, and exact commit SHA.
2. What changed and why.
3. Files, migrations, endpoints, agents, providers, or infrastructure affected.
4. Tests/checks run, exact results, and links to CI runs.
5. Security, cost, data, and financial-safety implications.
6. What was not changed (especially production resources, secrets, broker controls, and deployments).
7. New blockers, risks, decisions needed, and rollback/recovery notes.
8. Next step, its acceptance criteria, and its current status.

Additional rules:
- Update the relevant detailed design/specification document when the architecture or contract changes; the tracker is the index and current status, not a replacement for technical detail.
- Keep a dated change log; do not silently rewrite history. Correct old entries with a dated correction.
- Never mark work complete based only on code being written. Require tests and runtime evidence appropriate to the claim.
- Record failures and partial work as well as successes.
- Every PR should link this tracker and state its latest update.
- No merge, production migration, deployment, secret change, or broker/execution change without the required explicit approval.
- If documentation cannot be updated in the same commit, create a clearly identified follow-up documentation commit before moving to another milestone.

## 8. Dated change log

### 2026-11-11 — Documentation operating rule established
- User explicitly requested that every Northstar change be documented in GitHub so the team can track where the project is, where it is going, and the full history.
- This master tracker is the canonical progress record.
- From this point forward, every meaningful change must update this file and relevant technical docs in the same work session.

### 2026-11-11 — Current baseline verified
- Current feature-branch head: `bfb4db15a2ca489da7d947ac8aaced6f9a1fe75a`.
- Tests, validation, and full-history secret scan all report success for that SHA.
- PR #118 remains the active draft integration PR.
- No production migration or deployment has been performed by this work.


### 2026-11-11 — Paper-trading request and read-only preflight
- User requested that Northstar begin paper trading to evaluate whether its strategy can generate positive returns.
- This is a proposed change from the previously confirmed research-only autonomy. No trading permission has been enabled in Northstar code and no order has been submitted.
- Read-only Alpaca account inspection returned account status `ACTIVE`, paper-account cash/equity/portfolio value of USD 100,000, and trading not blocked. The account data reports a balance-as-of date of 2026-11-09; treat this as a snapshot, not a live guarantee.
- Read-only positions query returned no open positions; read-only orders query returned no orders.
- Market clock response reported the market closed and a next session open of 2026-11-11 09:30 America/New_York. The clock response timestamp was 2026-11-10, so recheck the clock immediately before any order.
- No funds are real; Alpaca paper trading is simulated. Account buying power is not a recommended risk budget. Do not use the account's full buying power.
- Before the pilot can begin, obtain explicit agreement on a capped test allocation, max loss per trade/day, max concurrent positions, eligible instruments, and whether orders are manual-confirmed or automated.
- Proposed conservative pilot defaults for user review only: US-listed stocks/ETFs, long-only, no options/crypto/shorting/margin, $5,000 maximum total deployed notional, risk no more than 0.5% of pilot capital per trade, daily stop at 1% of pilot capital, and maximum 3 open positions. These are proposed controls, not yet active.
- Next: user confirms or edits the pilot risk limits; then document the decision, implement a paper-only execution gate isolated from production, test order sizing/stops/idempotency/kill switch, and only then submit any explicitly approved paper orders.


### 2026-11-11 — Paper-trading pilot limits approved; implementation authorized (not activated)
- User explicitly approved a paper-only pilot with **USD 2,500 maximum allocation**, **USD 25 maximum planned risk per trade**, and **USD 50 daily loss stop**.
- User selected **automatic paper orders only after safeguards and tests pass**. This authorizes implementation and safety testing; it does not authorize real-money trading, live credentials, production deployment, or immediate automatic order activation.
- Real-money order placement, live API hosts, live credentials, and changes to real holdings remain prohibited.
- Existing Trading Lab documentation described a USD 1,000 simulation profile. That stale default must be superseded by this dated approval; the approved ceiling is USD 2,500. Do not treat broker buying power as the pilot allocation.
- Engineering must fail closed unless the account is confirmed as Alpaca Paper, the broker host is hard-coded to the paper endpoint, the pilot allocation and loss limits are enforced server-side, data and strategy prerequisites are satisfied, duplicate requests are idempotent, order/fill state is reconciled, and a persistent kill switch is engaged by default.
- The existing nine-agent council remains advisory. Council consensus cannot authorize or bypass deterministic risk gates. Current research council output is not a validated trading strategy and is not, by itself, eligible to place orders.
- Before any automatic order path is activated, require: isolated paper-only executor; authenticated operator/automation identity; instrument and order-type allowlists; sizing from stop distance; per-trade and aggregate exposure checks; daily loss stop; stale-data/event/liquidity vetoes; idempotency and unknown-order reconciliation; audit trail; emergency disable; tests for every rejection and failure path; and a controlled Preview acceptance run.
- No paper orders have been submitted by this implementation work. No production database, secrets, deployment, broker control, or live account was changed.
- Next: inspect existing order guards, execution-control schema, and test conventions; implement pure policy/sizing gates and unit tests first. Add any broker submission route only after proving all preconditions and confirming that it has no live-host fallback. Keep execution disabled pending final acceptance.


### 2026-11-11 — Paper-pilot policy and safety-test foundation
- Updated `docs/TRADING_LAB_SPEC.md` to supersede its old USD 1,000 default with the approved maximum allocation of USD 2,500, max planned risk USD 25 per trade, and USD 50 daily loss stop. Conservative provisional controls include one concurrent position, long-only US ticker format, limit-order preview only, 60-second quote freshness, and a USD 1,000 sector exposure ceiling.
- Added `web/lib/paper-pilot-policy.mjs`, a pure fail-closed policy module. It requires verified paper environment, exact Alpaca Paper host, active account, operator authorization, strategy approval, explicit session arming, and kill switch off before it will calculate a preview. It rejects live mode/host, short orders, market orders, malformed symbols, stale/future quotes, invalid stops, excess allocation, daily-stop breach, excess concurrent positions, sector cap breach, and risk-budget violations.
- Added `web/lib/paper-pilot-policy.test.mjs` with nine Node built-in tests. Local isolated run: **9 passed, 0 failed** using `node --test web/lib/paper-pilot-policy.test.mjs` (the same source/test contents were executed in an isolated Node test directory).
- The policy returns an order preview only and explicitly sets `execution: false`; it makes no broker call. This is not an order executor and does not activate automatic trading.
- No order-submission endpoint was added. No broker orders, cancellations, modifications, or positions were created. No live endpoint or credential is used.
- Important remaining blockers before automatic paper orders: strategy is not historically validated; a persistent pilot allocation/ledger and daily P&L baseline must be implemented and reconciled; execution-control schema and kill-switch transitions need direct inspection; idempotent broker order submission and unknown-order reconciliation are not implemented; end-to-end Cloudflare Preview tests and full CI are pending; no final activation has been performed.
- Safety note: the paper account's reported USD 100,000 equity/buying power is not the pilot budget. The module caps the pilot policy at USD 2,500 and must be wired to a separately persisted virtual ledger before execution can exist.
- Latest feature-branch commit at this tracker update: `410e7ec12511d8f515d64c825609364c16e949be`. The tracker commit itself will advance the branch head.
- Next: wire the policy only into a disabled-by-default, authenticated paper-only preview path; inspect and test persistent execution controls and D1 ledger; then implement broker submission only after the strategy and runtime acceptance gates are met.


## 8. 2026-11-11 — Continuation audit and Preview database isolation

- Main was refreshed to commit `def7967ec208a32a87a7d83498669b42dbffaef4`; documentation changes passed Tests, Validate, and full-history secret scan. The latest Production Pages deployment still serves the prior application commit `d6457bf16757d49c92dd178454299a106bed6af5` successfully; docs-only commits do not change app code.
- Read-only Cloudflare inspection found Preview and Production had both been configured with the production `northstar-paper-ledger` D1 binding. Corrected Preview only to the existing `northstar-preview` D1 database and verified Production remained unchanged. Preview currently has only the operator-token secret binding name; provider credentials were not read or copied.
- Production controls remain disabled, paper mode, kill switch engaged; the production allocation constraint is still USD 1,000. User-approved pilot caps are USD 2,500 allocation, USD 25 max planned risk per trade, and USD 50 daily loss stop. The current production collector and execution-control schema still enforce the old USD 1,000 configuration; the approved policy module on this branch is not yet integrated into a complete submission lifecycle.
- Production read-only counts: 0 orders, positions, intents, trade events, research council runs and decision traces; 440 monitor runs but 0 quotes/events. Five equity snapshots span less than seven days. Production does not have the `northstar_strategy_approval` table. The separate Preview database already has strategy-approval and expanded lifecycle tables but currently contains no research runs, traces, orders, or snapshots.
- Current branch contains a pure fail-closed pilot policy, tests, and research-run lease migration/collector integration. These are previews and safeguards only; they do not submit orders. Lease renewal/heartbeat and targeted concurrency/recovery tests remain open. The collector still assumes the old $1,000 portfolio configuration and seven-day equity baseline.
- Strategy validation remains NOT APPROVED. No point-in-time historical dataset, 100-trade sample, four walk-forward folds, untouched holdout, or independent review is evidenced. BUY remains disabled; automatic paper execution remains disabled.
- Branch/PR hygiene: PR #118 is 16 commits ahead and 3 behind the latest main at this audit. Reconcile with main and verify CI against the exact resulting head before review/merge. Do not merge based on older successful CI alone.
- No production D1 writes/migrations, broker requests, orders, secret reads/writes, execution-control changes, or production deployments occurred. Only the Preview D1 binding was changed. Read-only SQL queries reported zero rows written.

### Next exact work items
1. Reconcile the feature branch with current main and refresh the tracker/blocker evidence.
2. Finish lease renewal/expiry/concurrency tests and inspect idempotent recovery under interruption.
3. Integrate the approved $2,500/$25/$50 pilot policy with the virtual ledger and risk controls without changing production controls; add tests for sector exposure, daily baseline, allocation reservations, concurrency and order lifecycle.
4. Complete the read-only nine-agent dashboard status/history integration and verify a controlled Preview research run after the required Preview provider secrets are configured securely.
5. Establish the seven-day read-only equity baseline, complete real point-in-time strategy validation, and independent review.
6. Only after all gates pass, conduct a separate final paper-only activation review. Never enable live trading.


## 2026-11-11 — User-approved paper allocation corrected to USD 1,000
- User explicitly superseded the earlier USD 2,500 allocation and confirmed the Northstar paper pilot will use **USD 1,000**. The unchanged risk limits remain USD 25 maximum planned risk per trade and USD 50 daily loss stop.
- Updated `web/lib/paper-pilot-policy.mjs` allocation cap from USD 2,500 to USD 1,000. Updated `web/lib/paper-pilot-policy.test.mjs` fixtures/assertions and added a pending-order allocation-overflow check.
- Commits: policy `5d346cad47f58f68827afb2bf4f1699e44c303df`; tests `d2c6d03b58a4ae11a2c87fe4020bfbae6869ab1b`.
- This is a feature-branch policy/test change only. It does not change production D1, broker settings, deployment, or order behavior. Execution remains disabled, strategy remains unapproved, and the kill switch remains engaged. Exact-head CI and Preview acceptance are still required.
- Important: the existing collector already has a production $1,000 configuration assumption, but the policy module remains a preview-only sizing gate and is not integrated into a complete broker order lifecycle. Do not interpret this cap correction as paper-trading activation.


## 2026-11-11 — Reconciliation checkpoint
- Merged current main `def7967ec208a32a87a7d83498669b42dbffaef4` into the feature branch with merge commit `3de4a359181fe4e41b12fc54c84212c1925a0531`. Preserved current main versions of `NORTHSTAR_BLOCKERS.md`, this handbook and `web/data/top-stocks-cache.json`; retained the research architecture/reuse docs, collector update, lease migration and fail-closed pilot policy/tests.
- **Current approved limits (supersede all earlier references): USD 1,000 total virtual allocation; USD 25 maximum planned risk per trade; USD 50 daily loss stop.**
- PR #118 remains draft. Exact-head CI is not yet reported by GitHub for the merge commit. Cloudflare Preview and newest Production deployment records are queued, not successful. No new deployment acceptance is claimed.
- Next: verify CI and deployment stages; review the nine-agent collector, dashboard routes and lease migration; complete Preview end-to-end research-only acceptance and durable trace checks. Do not run a Production collector or change Production D1 until its seven-day portfolio baseline and schema are verified.
- Safety: paper execution disabled, kill switch engaged, BUY disabled, no orders submitted. No live-money capability is authorized.


## 2026-11-11 — Nine-agent status dashboard added (acceptance pending)
- Implemented `GET /api/research/status`, a read-only/sanitized API that returns the latest five durable runs and exactly nine role/status pairs. It intentionally omits full reports, evidence, portfolio/account values, request IDs and provider payloads.
- Added the nine-agent Research Council panel and run history to Trading Lab; added `tests/research-status-endpoint.test.mjs`. Existing UI reads only this status endpoint and cannot trigger collection.
- Acceptance criteria: exact-head GitHub Tests workflow passes; Preview deployment for the dashboard commit succeeds; browser/API check confirms empty state, all nine roles and no sensitive payload; a separately authorized research-only run later creates a durable trace in Preview.
- Current Preview D1 has no council run records; therefore current agent activity is **not yet verified**. This is dashboard plumbing, not proof of agents running.
- Lease heartbeat/renewal and concurrency/recovery tests remain open. Production collection, paper orders and live trading remain disabled.


## 2026-11-11 — Preview release acceptance checkpoint
- GitHub Tests passed for app commit `83950077cf11e0dba4b288b151e91d8c5de66aa8` (run `43003431352`). The status endpoint's explicit `NOT_RUN` case was fixed and separately passed on `1c7dafb...` (run `43003396384`).
- Cloudflare Preview deployment `2b533ef6-6ae6-4746-a3ef-e6e30089845f` succeeded. Live scrape confirms Trading Lab shows the nine-agent panel, the approved $25 per-trade risk cap and $50 daily stop. The public status endpoint returns `agentCount=9`, `latestRun=null`, and `runs=[]`; no agent execution is claimed.
- Preview migration history ends at 0012, so the lease migration is now `0013_research_council_run_leases.sql`. Applied only to Preview D1; migration ledger, table and index verified. Production D1 remains unchanged.
- Preview currently lacks `FMP_API_KEY`, `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` and `GEMINI_API_KEY`. Only `NORTHSTAR_OPERATOR_TOKEN` is configured there. Configure the four provider secrets in the Cloudflare Pages Preview environment before attempting the first real research-only collection. Never paste values into chat.
- Remaining gates: controlled Preview collector run, durable trace and idempotent replay; lease concurrency/recovery tests; seven-day portfolio baseline; point-in-time strategy validation; complete virtual ledger and paper-order lifecycle.
- Safety unchanged: USD 1,000 virtual allocation, USD 25 max planned risk per trade, USD 50 daily loss stop. Execution disabled, kill switch engaged, BUY disabled, no real money.

## 2026-11-11 — Lease renewal and concurrency checkpoint
- Research collector leases now have a 30-minute expiry and token-checked renewals at phase boundaries. Lost lease ownership aborts collection. Added targeted tests for concurrent duplicate prevention, expiry/reclaim, renewal and release ownership.
- Exact-head CI passed on `c094059f2c6e898fc0a048bed62a5797350d0e9b`: push run `43003828936`, PR test runs `43003833401` and `43003833403`, history scan `43003833664`.
- Preview deployment for the collector renewal code (`fe0f18a...`) succeeded. Migration `0013_research_council_run_leases.sql` is applied only to Preview D1.
- Actual Research Council collection has not run. Preview provider secrets (FMP, Alpaca Paper key ID/secret, Gemini) must be added directly in Cloudflare Pages Preview. No secret values were read or copied.
- Production remains untouched. Safety limits: USD 1,000 allocation, USD 25 max planned risk per trade, USD 50 daily loss stop; execution disabled, kill switch engaged, BUY disabled.
