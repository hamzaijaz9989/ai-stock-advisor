# Northstar AI — Master Project Tracker

**Last updated:** 2026-11-11 (UTC)  
**Repository:** `hamzaijaz9989/ai-stock-advisor`  
**Active work branch:** `northstar/cloudflare-research-orchestration`  
**Active pull request:** [#118 — Design Cloudflare-native autonomous research orchestration](https://github.com/hamzaijaz9989/ai-stock-advisor/pull/118)  
**Current implementation head:** `e87e067d67a7fd29ea95cc57e33a8c4fc7660790`  
**Base branch/head recorded for PR:** `main` / `85c51f847f4b4a966be629ff9f3702194d6ae262`

> This is the canonical progress and decision record for Northstar. Update it in the same work session as every meaningful code, migration, architecture, configuration, test, security, or deployment change. Do not rely on chat history as the project record.

## 1. Product direction and fixed decisions

| Area | Current decision |
|---|---|
| Architecture | Cloudflare-native: existing Pages Functions, Workers, and D1 |
| Agent autonomy | Research-only baseline; paper-trading pilot proposed but not yet enabled |
| Infrastructure budget | Minimal; reuse existing resources before adding paid services |
| Research roles | Preserve the existing nine-agent council; do not create a parallel agent framework |
| Financial safety | No live or paper orders, no order modification/cancellation, no automatic BUY, no kill-switch or execution-control changes |
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
