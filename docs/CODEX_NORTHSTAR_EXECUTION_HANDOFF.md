# Northstar AI — Codex execution handoff (2026-11-13)

## Mission
Finish the Agent Command Center and make the nine-role research pipeline truthful, observable, and safe. Work in this repository: `hamzaijaz9989/ai-stock-advisor`. Current working branch: `fix/research-readiness-codex-handoff`. Do not rebuild the app or create a parallel research pipeline.

## Verified current state
- Production: https://ai-stock-advisor.pages.dev
- Trading Lab: https://ai-stock-advisor.pages.dev/trading-lab.html#research-council-panel
- Recent UI PR #150 is merged; command-center layout is deployed.
- Nine roles are displayed, but latest durable run reports **0/9 COMPLETE; all 9 NOT_RUN** because collection stopped before orchestration.
- `web/functions/api/research/collect.js` currently hard-fails unless history contains >=60 daily bars and FMP fundamentals are available.
- `web/functions/api/fmp-history.js` has been changed on this branch to use validated Yahoo Finance daily OHLCV only when FMP returns <60 bars. The fallback requires >=60 valid unique chronological bars and returns explicit provider/warning metadata. JS syntax was checked successfully. It is not yet merged/deployed or production-verified.
- `web/lib/research-council.js` is the authoritative orchestration. `web/lib/research-council-adapters.js` provides adapters. `web/lib/research-specialist-agents.js` contains five deterministic evidence-based specialist functions.
- Current independent roles: market scanner, technical analyst, fundamental analyst, news analyst, sentiment analyst. Bull/Bear, Portfolio Analyst and Risk Committee need validated adapters/workers and full integration.
- The current collection path defers SEC companyfacts and earnings enrichment; do not describe them as collected if not queried.
- Production execution control was read and confirmed: `enabled=0`, `mode=paper`, `kill_switch=1`, `max_portfolio_usd=1000`.
- User-approved intended paper pilot limits: allocation ceiling $2,500, max risk/trade $25, daily loss $50. Existing production database currently has a CHECK constraint enforcing $1,000; a direct update to $2,500 was rejected. Locate and migrate the schema plus every dependent hard-coded $1,000 calculation together. Never disable the kill switch or enable order execution during this work.
- Existing Alpaca NVDA 6-share position must not be modified. No live orders. No paper orders without a separate explicit user approval.

## Non-negotiable safety / evidence rules
1. Research-only. Keep `execution=false`, automated order submission false, `execution_control.enabled=0`, `kill_switch=1`.
2. Do not fabricate/pad OHLCV bars, financial facts, sentiment samples, earnings dates, timestamps, or agent outputs.
3. Every factual agent claim must cite valid supplied fact/evidence IDs. Validate all outputs against the actual council schema.
4. Risk Committee has veto authority. No majority vote. Missing/unavailable required role => NO_TRADE.
5. Clearly distinguish provider-reported, derived, stale, delayed, estimated, missing and unverified data. Yahoo fallback is a public endpoint, not a licensed feed guarantee; surface its source and caveat.
6. Do not label Yahoo bars as verified corporate-action-adjusted unless the data proves that. Do not silently mix adjusted and unadjusted series.
7. FMP free-plan symbol/endpoint entitlements are not assumed. Handle provider 401/403/429, empty, malformed and partial responses explicitly.
8. Do not change or close any Alpaca position/order. Do not activate the 3-hour schedule or 200-stock scanning until bounded tests and rate/cost controls pass.

## Execute in this order

### P0 — Finish and test the data collector
- Review the new Yahoo fallback in `web/functions/api/fmp-history.js`.
- Confirm date bounds, timezone handling, duplicate dates, null bars, split/dividend metadata, adjusted-close handling, chronological order and >=60-bar count.
- Add unit tests for FMP >=60, FMP <60 + Yahoo success, Yahoo throttle/403/empty/malformed, <60 combined valid bars, bad dates and invalid OHLCV.
- Update `collect.js` to accept only a validated history contract; propagate `priceProvider`, `priceWarning`, coverage, fetchedAt, and errors into the durable collection metadata and UI.
- Do not let optional SEC/earnings enrichment block the five deterministic roles, but label those sources NOT QUERIED / UNAVAILABLE.
- Test the real collector path with mocked provider fixtures. A successful HTTP response alone is not proof of valid history.

### P1 — Make all nine role statuses real
- Wire all five deterministic specialists through `createResearchCouncilWorkers` and verify actual input/output contract.
- Implement Bull and Bear as evidence-constrained analysis adapters (or mark UNAVAILABLE if no configured model is available). Do not substitute canned text. Model/provider/model ID and fallback must be recorded.
- Implement Portfolio Analyst and Risk Committee as deterministic, testable policy functions. Risk Committee must independently check quote freshness, price/history quality, fundamental coverage, concentration, exposure, daily loss, per-trade risk, open orders, portfolio reconciliation and missing role outputs.
- Fix orchestration so every role receives appropriate prerequisites and produces exactly one honest status: COMPLETE, UNAVAILABLE, or NOT_RUN with a specific reason.
- Never show 9/9 merely because nine cards exist. Completion is derived from persisted role results.
- Add tests for each role success/failure, invalid fact IDs, stale/future timestamps, one unavailable specialist, bull/bear disagreement, risk veto, and full nine-role completion.

### P2 — Reconcile risk configuration safely
- Find the actual D1 migration/schema that defines `execution_control` and its CHECK constraint; do not guess filenames.
- Build a forward-only migration to raise the allocation ceiling to $2,500 and retain exact approved limits: max risk/trade $25, daily loss $50.
- Audit all server guards, portfolio snapshots, risk fractions, readiness endpoints, UI labels and tests for hard-coded $1,000. Make one canonical configuration source.
- Preserve `enabled=0`, `mode='paper'`, `kill_switch=1` through migration. Add migration verification and rollback/recovery notes.
- Confirm the existing Alpaca position and D1 ledger reconcile read-only before and after. Do not write to broker positions.

### P3 — Improve Agent Command Center UX
- Mobile-first responsive layout; no clipped cards or tiny labels.
- Separate readiness/health from last-run results.
- Show: provider coverage, history bars/date range/source, quote timestamp/freshness, last run ID/time/ticker, each role's status/reason/duration/model/provider, risk vetoes, and source warnings.
- Add explicit controls/status for single-symbol run; watchlist, 200-stock universe and every-3-hours remain DISABLED until implemented and tested.
- Show last successful run separately from latest failed run. Never present an old NVDA run as the current run.
- Add loading, timeout, retry/cooldown, empty and error states; refresh must not erase the last durable result.
- All actions remain research-only; no order controls added.

### P4 — Verify, document, hand off
- Run complete test suite, lint/build, security checks and migration tests. Fix regressions.
- Provide a concise test report with commands and pass/fail evidence.
- Open PR with small reviewable commits. Do not merge if tests fail.
- After merge, verify Cloudflare Pages deployment SHA and production read-only endpoints. Trigger one research run only if safe; verify D1 persisted all nine truthful role statuses. If providers still block, preserve NO_TRADE and document exact provider error.
- Keep watchlist batching, 200-stock universe, 20–30 shortlist and 3-hour scheduling disabled until their separate implementation, quotas, locks, concurrency and failure-recovery tests are complete.

## Acceptance criteria
- Valid >=60-bar history is sourced from FMP or the labelled Yahoo fallback; source and caveats are visible and durable.
- All nine roles are actually invoked or explicitly marked unavailable/not-run with a reason; no false completion.
- Risk Committee veto is authoritative; all missing/stale/unsafe inputs yield NO_TRADE.
- Approved risk configuration is represented consistently as $2,500 allocation / $25 max risk per trade / $50 daily loss, while kill switch remains ON and execution disabled.
- Existing broker position is unchanged.
- No automated or manual orders are placed.
- Production UI accurately reflects the persisted latest run and provider state.

## Suggested five Codex sessions (use remaining allowance carefully)
1. **Collector + tests:** finish P0, add fixtures/tests, do not touch execution config.
2. **Nine-role integration:** finish P1, deterministic risk gate, tests for every role.
3. **Risk schema/config:** finish P2 with forward migration and exhaustive hard-coded-value audit; keep execution disabled.
4. **Command Center UI:** finish P3, responsive and truthful durable status.
5. **Release verification:** P4, fix all failures, PR, deploy, verify D1 and production, update this handoff with exact commit/deployment/test evidence.

## Final response expected from Codex
Report files changed, migration ID, test commands/results, provider test matrix, actual role completion statuses, production deployment SHA/URL, and unresolved blockers. Explicitly state that no orders were submitted and the kill switch remains on. Do not report percentage completion without evidence.
