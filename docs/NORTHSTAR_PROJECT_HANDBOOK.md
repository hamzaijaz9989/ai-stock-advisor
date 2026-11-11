# Northstar AI — Project Handbook and Operating Workflow

**Last reviewed:** 2026-11-10  
**Repository:** `hamzaijaz9989/ai-stock-advisor`  
**Production dashboard:** https://ai-stock-advisor.pages.dev  
**Default branch:** `main`  
**Operating mode:** Research-first; paper-only infrastructure remains disabled; live trading prohibited.

> This is the continuity document for every future Northstar work session. Read it before proposing work, changing code, or updating the roadmap. Update it whenever project status changes.

## 1. Product goal

Northstar is a US-equity research and decision-support platform. It should turn timestamped, source-linked market and company evidence into transparent research, explain uncertainty and risk, and help the user make informed decisions.

The system must prefer **NO TRADE / WAIT / INSUFFICIENT EVIDENCE** over unsupported confidence. Research scores and agent consensus are not proof of predictive accuracy. Do not promise returns or tune the system to a desired short-term profit target.

### Non-negotiable safety boundaries

- No live brokerage connection, live order submission, leverage, options, or short selling.
- Paper execution remains disabled until the complete lifecycle and every approval gate are independently verified and the user explicitly authorizes it.
- Preserve the kill switch and fail-closed behavior.
- Never expose, request, commit, or log API keys, bearer tokens, or secret values.
- Do not apply production database migrations, change production controls, submit orders, or deploy risky changes without the required review and verification.
- Passing unit tests is not the same as strategy validation or production readiness.

## 2. Project phase and continuity

### Phase 1 — Universe scanning and candidate discovery

**Status: COMPLETE — user-confirmed on 2026-11-10.**

The user has confirmed that the scanning work is completed and tested. Treat scanner development as complete; do not restart or rebuild it as the next task. Only reopen scanner work if a concrete regression, missing requirement, or failing test is found.

The documented Trading Lab design describes a curated 253-symbol US-equity universe and a staged scan: broad inexpensive screening, ranking, then deeper quote/earnings/news enrichment for a smaller candidate set. The scanner is a research-priority mechanism, not a validated BUY signal.

### Phase 2 — Nine-agent research council / Stock Brain

**Status: NEARLY COMPLETE — implementation exists; final integration and acceptance evidence must be checked against the latest branch and production state.**

The source currently defines nine logical roles:

| # | Role | Responsibility |
|---:|---|---|
| 1 | Market Scanner | Evidence completeness, freshness, consistency, liquidity and coverage |
| 2 | Technical Analyst | Supplied price, volume, trend and volatility evidence |
| 3 | Fundamental Analyst | Reported financial facts, periods, units and filing evidence |
| 4 | News Analyst | News, filings, event chronology and source quality |
| 5 | Sentiment Analyst | Explicitly sourced sentiment; reports unavailable when absent |
| 6 | Bull Researcher | Strongest evidence-supported positive thesis |
| 7 | Bear Researcher | Strongest evidence-supported downside thesis |
| 8 | Portfolio Analyst | Synthesis of specialist findings and portfolio context |
| 9 | Risk Committee | Deterministic veto/accept-for-human-review gate |

The first eight are model-driven specialist roles; the Risk Committee is a deterministic hard gate. No agent can override deterministic risk, data-quality, validation, or human-review requirements.

Existing implementation includes:
- A staged research-council orchestrator with stable fact/evidence IDs and claim citation validation.
- Parallel independent analysts, Bull/Bear debate, portfolio synthesis and final Risk Committee veto.
- Explicit missing-resource reporting; absence of sentiment data must remain visible rather than inferred.
- Research-council resource inventory and per-role evidence packs.
- Evaluation scorecards for evidence-ID integrity, claim citation coverage, invalid references, resource status and available runtime telemetry.
- Runtime latency and provider/model telemetry; token usage is recorded only when the provider reports it. Cost remains null until pricing is verified.
- Research collection integration that persists the scorecard with the durable research run.

**Important limitations:** these scorecards measure contract and evidence-reference quality, not factual truth, semantic support, reasoning quality, predictive accuracy or investment performance. The council's accepted output is only eligible for separate deterministic validation and human review. It is never an order.

### Phase 3 — Strategy validation

**Status: NOT APPROVED. Validated BUY remains disabled.**

The repository's strategy-validation status document says the evidence package is incomplete. It identifies missing complete real point-in-time data, frozen-rule historical signals, delisted/universe membership coverage, verified feature-availability timestamps, at least 100 completed strategy trades, four chronological walk-forward folds, an untouched holdout, realistic costs/corporate actions, and independent review.

Do not mark this phase complete because tests pass or because the scanner/council work is complete. Keep WAIT / AVOID / INSUFFICIENT EVIDENCE behavior and the BUY gate closed until the versioned evidence and independent review pass.

### Phase 4 — Paper lifecycle and operational readiness

**Status: NOT READY; execution disabled and kill switch engaged.**

Current repository evidence records only one production equity snapshot, no production intents/orders/positions/fill activities, and an incomplete end-to-end production maintenance/reconciliation workflow. The production database was reported at migrations 0001–0005, while preview work includes later migrations. Confirm current state before acting.

Known lifecycle gaps include safe partial-fill handling, cancellation/recovery, fill-derived accounting or a fully specified reconciliation model, seven-day equity history, authenticated scheduled sync/fill-import/reconciliation, and verified deployment/schema parity.

The Alpaca integration described in README is read-only. Do not describe it as a working order executor. Do not submit even a paper test order.

### Phase 5 — Release and ongoing operations

Only after the above phases pass their respective gates:
- Complete independent review and branch governance.
- Verify production deployment and health using authorized evidence.
- Confirm data-provider licensing for the intended commercial use.
- Publish a user-facing explanation of evidence quality, limitations and audit history.
- Maintain rollback, incident response, recovery and monitoring procedures.

## 3. Current known repository evidence (checkpoint: 2026-11-10)

These are the latest facts visible in the documentation/API audit for this handover. Recheck them before relying on them; do not assume they remain current.

- Main branch head observed: `57aa9f0743917401dd0e3e90521fc39c22bd9f55` ("Harden research point-in-time evidence safeguards").
- Open documentation PR #101: https://github.com/hamzaijaz9989/ai-stock-advisor/pull/101 — draft, blocker-evidence refresh; CI passed for that documentation PR.
- Earlier PR #85 and #88 are documented as draft and not formally reviewed; inspect their current status before any merge decision.
- Earlier audit recorded `main.protected=false` and required checks disabled. Recheck with an authorized GitHub administrator path.
- Production D1 was documented with migrations 0001–0005 and one equity snapshot; verify the live state before any migration or workflow change.
- The production snapshot described in the blocker log is broker account equity, not the separate $1,000 Northstar virtual strategy allocation.
- Production paper controls were documented as execution disabled, paper mode, kill switch engaged, with $1,000 virtual allocation, 0.5% default risk, 1% maximum per-trade risk and 25% maximum position notional.
- The latest blocker evidence says strategy approval is false and paper execution is not enabled.
- **Repository visibility: PUBLIC — user-confirmed on 2026-11-10.** The user explicitly stated that they changed `hamzaijaz9989/ai-stock-advisor` from private to public. Treat public visibility as intentional current project context unless the user later changes it. Do not ask the user to reconfirm this. Ensure documentation and sharing guidance do not incorrectly describe the repository as private.

## 4. What to build next — ordered work queue

Work from the first incomplete item. Do not skip ahead to trading automation.

### NEXT 1 — Finish the nine-agent Stock Brain milestone

1. Inspect the latest main and open PR heads; identify which agent/council changes are already merged versus only proposed.
2. Confirm all nine roles are wired to the real research-collection path and that every unavailable role correctly blocks council completion.
3. Verify that evidence IDs, as-of timestamps, source coverage, role resource packs, scorecards and runtime telemetry survive the full request path.
4. Confirm the dashboard displays the council result, each role's status, missing resources, citations, risk veto reasons and evaluation limitations clearly.
5. Confirm durable research traces are written and can be retrieved without mutating historical records.
6. Run all relevant Python tests, JavaScript tests, lint, syntax checks and CI on the exact final commit.
7. Verify the preview deployment and endpoints for that exact commit. Do not call it production-ready based on CI alone.
8. Update this handbook and `NORTHSTAR_BLOCKERS.md` with commit IDs, PRs, test run IDs, deployment IDs and remaining defects.

### NEXT 2 — Close data and research evidence gaps

1. Verify quote freshness and market-session behavior during a real US market-open period.
2. Confirm news items are timestamped, deduplicated, source-linked and treated as discovery rather than verified facts until corroborated.
3. Verify SEC filing availability semantics; filing acceptance time is not automatically proof of public availability.
4. Verify FMP and other provider coverage, terms, fiscal-period alignment and source lineage.
5. Make every role's missing data and provider limitations visible to the user.
6. Do not claim predictive quality from agent scorecards.

### NEXT 3 — Complete strategy validation

Follow `docs/STRATEGY_VALIDATION_RUNBOOK.md` and `docs/STRATEGY_VALIDATION_STATUS.md`. Build a permitted real point-in-time dataset, freeze the strategy before holdout evaluation, run the chronological folds and untouched holdout, include realistic costs and benchmark comparisons, and obtain independent review. BUY stays disabled until this is genuinely approved.

### NEXT 4 — Complete paper lifecycle safety (still paper-only)

Follow `docs/PAPER_EXECUTION_READINESS.md`, `docs/PAPER_LIFECYCLE_AND_RISK.md`, and `docs/PAPER_LEDGER_MILESTONE.md`. Finish partial-fill protection/recovery, cancellation policy, idempotency, reconciliation, durable position/fill accounting, seven-day equity history, scheduled read-only operations and failure-injection tests. Keep execution disabled and the kill switch engaged. No test orders.

### NEXT 5 — Controlled production release

Only after review, strategy approval, paper-lifecycle validation, migration review, branch protection and exact-commit preview verification. Apply migrations in a controlled order with rollback/recovery evidence. Deploy only the reviewed commit and verify production parity.

## 5. Required work-session workflow (must follow every time)

1. **Read first:** this handbook, `NORTHSTAR_BLOCKERS.md`, `README.md`, and the specific phase documents relevant to the task.
2. **Refresh reality:** inspect repository visibility, main SHA, open PRs, branch divergence, CI runs, deployments, production D1 migration ledger and safe read-only endpoint state where authorized.
3. **Identify the active phase:** use Section 2. Never restart a user-confirmed completed phase without evidence of a regression.
4. **Choose one next deliverable:** state the exact objective, acceptance criteria, affected files, tests and safety impact before implementation.
5. **Implement narrowly:** use a feature/work branch; avoid unrelated refactors and avoid changing production controls.
6. **Test the exact head:** run relevant focused tests, full required suites, lint and CI. Record exact run IDs and results.
7. **Review deployment separately:** CI success is not deployment success. Verify preview/production metadata and endpoint behavior for the exact commit.
8. **Update documentation in the same work item:** update this handbook, `NORTHSTAR_BLOCKERS.md`, and the relevant technical spec/runbook. Record:
   - date/time (UTC),
   - phase and task,
   - commit SHA and PR,
   - files changed,
   - tests and CI run IDs,
   - deployment and endpoint verification,
   - production DB changes (or explicitly "none"),
   - security/safety impact,
   - completed items,
   - remaining blockers,
   - exact next task.
9. **Do not silently promote status:** mark work "implemented", "CI passed", "preview verified", "production verified", "strategy validated" and "approved" as separate states.
10. **End each session with a handover:** write a short "Current state / Completed today / Still blocked / Next exact action" entry so a new session can resume without asking the user to repeat history.
11. **Check before asking:** consult this handbook, blocker log, relevant specs, recent GitHub commits/PRs and prior user confirmations before asking the user to repeat any detail. If a fact changes, update the project record in the same work item.

## 6. Documentation ownership and update rules

- This handbook is the top-level project map and next-work queue.
- `NORTHSTAR_BLOCKERS.md` is the chronological engineering evidence log; append a dated entry for each substantial change.
- `docs/BUILD_PLAN.md` tracks product milestones.
- Phase-specific specs/runbooks own detailed requirements and acceptance criteria.
- README is the entry point and must link to this handbook.
- Never delete older evidence just to make the project look cleaner. Correct stale statements with a dated clarification and a link to the newer evidence.
- Never write secrets or sensitive personal/broker data into documentation.
- If the user confirms a milestone is complete, record it as user-confirmed, then link the test/deployment evidence where available. Do not downgrade it without new contradictory evidence.

## 7. Session handover template

```markdown
## YYYY-MM-DD — Northstar work session
- Active phase:
- Objective:
- Completed:
- Commit / PR:
- Tests / CI:
- Preview / production verification:
- Database / execution changes:
- Safety impact:
- Remaining blockers:
- Next exact action:
```

## 8. Primary documents

- [Build Plan](BUILD_PLAN.md)
- [Stock Brain specification](STOCK_BRAIN_SPEC.md)
- [Trading Lab specification](TRADING_LAB_SPEC.md)
- [Strategy validation status](STRATEGY_VALIDATION_STATUS.md)
- [Strategy validation runbook](STRATEGY_VALIDATION_RUNBOOK.md)
- [Paper execution readiness](PAPER_EXECUTION_READINESS.md)
- [Paper lifecycle and risk](PAPER_LIFECYCLE_AND_RISK.md)
- [Continuous market monitor](CONTINUOUS_MARKET_MONITOR.md)
- [News and signal policy](NEWS_AND_SIGNAL_POLICY.md)
- [Market data and recommendations policy](MARKET_DATA_AND_RECOMMENDATIONS.md)


## 4. Live production audit — 2026-11-10 03:26 PKT

This section supersedes older runtime counts above where they conflict. Evidence was read directly from the connected Cloudflare account and production D1 database; all D1 statements were SELECT-only and reported zero rows written.

### GitHub and Pages release state
- Main: `57aa9f0743917401dd0e3e90521fc39c22bd9f55` (research point-in-time safeguards).
- Production Pages deployment: `921087a4-6194-4a67-ac61-2f8557edb0bc`, successful, serving main commit `57aa9f0743917401dd0e3e90521fc39c22bd9f55`.
- The handbook/documentation branch preview was skipped by the Pages path filter because its changes are documentation-only; no production deployment was attempted.
- PR #102 (this handbook and continuity update) has successful Tests, Validate AI Stock Advisor, and full-history secret-scan workflows at head `18d68c9b85e0f3fe44b82fdf9d122cc1d1e08dbd`. It remains draft pending final documentation review.
- The main branch API response reports `protected=false` and no required status checks. Do not treat green CI as branch governance.
- Repository visibility discrepancy remains unresolved: the GitHub REST metadata returned `private=false / visibility=public`, while the user states the repository is private. No visibility setting was changed. Confirm in GitHub Settings; do not infer privacy from README text.

### Scanner and market-monitor status
- Scanner phase: user-confirmed COMPLETE and tested. Do not restart scanner implementation absent a concrete regression.
- Worker `northstar-market-monitor` has a production cron trigger `*/5 * * * *` and latest deployed Worker deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` (version `2739d49a-4182-423f-8113-616252c5ddd6`, 100%).
- Production D1 `monitor_runs`: 17 rows; all 17 have status `market_closed`, zero symbols checked, zero errors. Latest run began `2026-11-09T22:25:52.931Z` and completed `2026-11-09T22:25:53.110Z`.
- Production `monitor_quotes`: 0 rows. Production `monitor_events`: 0 rows. This is consistent with all observed runs being outside the US regular session; it is not evidence of a successful market-open quote cycle.
- Next monitor acceptance check: during the next US regular session, verify at least one completed run with symbols checked, timestamped quote rows, event deduplication, and dashboard rendering. Do not weaken freshness gates to make this pass.

### Nine-agent Research Council / Stock Brain
- User-confirmed phase: nearly complete. The nine logical roles are already implemented in source; preserve this phase as active rather than reopening the scanner.
- Main contains the server-side collector `POST /api/research/collect`, the specialist council endpoint, fact/evidence adapters, and append-only `research_council_runs` storage.
- The public research page currently calls the older supplemental `/api/ai-research` path; no call to `/api/research/collect` or `/api/research/council` was found in the dashboard scripts. The nine-agent council is therefore not yet proven end-to-end from the user dashboard.
- Production D1 `research_council_runs`: 0 rows. `research_decision_traces`: 0 rows. This confirms no production council run/decision trace has yet been recorded.
- The collector is operator-authenticated and requires model credentials, Alpaca Paper read-only credentials, the disabled/kill-switched control row, reconciled empty positions/open orders, a fresh equity snapshot, and a seven-day equity baseline. Do not put `NORTHSTAR_OPERATOR_TOKEN` in browser JavaScript.
- Current production paper equity history has one snapshot only: `2026-11-08T18:34:38.720Z`. It is neither a fresh 15-minute snapshot nor a seven-day series. The server-side collector therefore cannot currently pass its portfolio gate.
- Next phase-2 work: safely expose council run status and evidence in the dashboard without exposing secrets or account values; design an authenticated operator launch path; resolve the seven-day portfolio-history gate; run one controlled research-only production collection and verify durable replay. Keep trade submission disabled.

### Paper-only safety state
- Production execution control: `enabled=0`, `mode=paper`, `kill_switch=1`, max planning allocation USD 1,000, default risk 0.5%, hard risk cap 1%, max position 25%.
- Production D1 migrations: `0001`–`0005` only. Migration `0006_continuous_market_monitor.sql` is not recorded in this paper-ledger database; monitor tables are present in the same schema, but verify the migration ledger before making any schema assumptions.
- Counts: 0 paper orders, 0 paper positions, 0 trade intents, 0 broker fill activities, 0 paper trade events, 1 equity snapshot, 2 audit rows.
- No paper or live order was submitted; no production D1 write or migration was performed during this audit.


## 2026-11-10 — Repository visibility and continuity correction
- User explicitly confirmed that the GitHub repository `hamzaijaz9989/ai-stock-advisor` was changed from private to **public**. This is intentional and current; do not ask the user to reconfirm it.
- The previous handbook checkpoint incorrectly described the user as saying the repository was private and repeatedly requested confirmation. That stale statement is superseded by this user-confirmed update.
- Operating rule reinforced: before asking the user for any detail, read this handbook, `NORTHSTAR_BLOCKERS.md`, relevant project specs and recent GitHub history. Update this handbook and blocker log after every meaningful code, configuration, deployment or project-status change.
- No application code, secrets, deployments, database state or trading controls changed in this documentation correction.
- Next exact action: resume the active Northstar milestone from the current repository state; do not ask again about repository visibility or the already-configured `FMP_API_KEY`.


## 2026-11-10 — Continuation audit after user instruction to move forward
- Repository visibility is PUBLIC, intentionally changed by the user. This supersedes older private/unresolved wording elsewhere in historical entries. Do not ask again.
- Canonical FMP secret name is `FMP_API_KEY` only. User has confirmed it is already configured; do not ask them to add/re-add it.
- Read-only Cloudflare API inventory confirms Worker `northstar-market-monitor` has a secret binding named `FMP_API_KEY` and D1 binding `NORTHSTAR_DB`. This confirms the binding name only, not the secret value or a successful provider request. Worker version 6 (`1690bbc4-a330-42ce-834e-e999b583c648`) is a preview version; production traffic was not promoted.
- Separate Pages project `ai-stock-advisor` metadata currently lists Production names `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `FMP_API_KEY`, `GEMINI_API_KEY`, `NORTHSTAR_OPERATOR_TOKEN`; Preview metadata currently lists only `NORTHSTAR_OPERATOR_TOKEN`. This is a distinct Pages Functions environment from the Worker. Secret values were never read. Do not infer that the user's Worker Preview key automatically binds to Pages Preview.
- Attempted read-only public preview probes for `/api/fmp-health` and `/trading-lab.html` were blocked by the connected web runtime as inaccessible; no application HTTP response was received. Therefore no endpoint health or FMP success is claimed.
- PR #103 current head after synchronizing documentation: `d7d0e2efc4415c069220ab2b196409c29ed85251`; compare reports 180 ahead / 0 behind `main` (base commit `08886f7f7cb1fbdcdee647d41cc244f9c4323159)); OPEN, non-draft, mergeable. Zero formal reviews and zero inline review threads. Current-head workflow/status APIs returned no run/status entries, so exact-head CI is **not verified** in this audit.
- Pages Preview deployment for exact current head `d7d0e2e...` is listed as `idle` (deployment `ba6d7cf8-f2d0-473d-8185-db993e31a870`); the latest listed successful preview deployment is for docs-only commit `fb24b74...`, not the current PR code head. Do not call the current head preview-accepted.
- PR #103 changes include nine-agent dashboard, server-side research collector/council endpoints, evidence/fact adapters, telemetry/evaluation and tests. Static review confirmed collector requires explicit successful read-only Alpaca sync and reconciles broker/ledger before refreshing; research remains read-only and no order submission path is invoked by the collector. Full runtime acceptance remains blocked by stale equity history and missing seven-day baseline.
- Production D1/strategy/ execution gates remain as documented in the preceding latest audit; no D1 query/write, migration, broker call, order, secret mutation, execution-control change or Production deployment was performed in this continuation.
- Next exact action: get a successful Preview deployment for the latest application-code head, verify its endpoints using a permitted runtime path, and resolve the Pages Preview binding discrepancy without requesting the user's key or exposing any secret. Then complete exact-head CI and independent review before any merge. Keep paper execution disabled, kill switch engaged and BUY disabled.


## 2026-11-11 — Latest live audit and Preview isolation correction

- Current main commit: `d6457bf16757d49c92dd178454299a106bed6af5`; latest Production Pages deployment succeeded for this exact commit.
- Corrected the Pages Preview `NORTHSTAR_DB` binding to the dedicated `northstar-preview` database. Production remains bound to `northstar-paper-ledger`. The Preview environment currently has only the operator-token secret binding name; no provider secret values were read or copied.
- Production execution-control row remains disabled, paper-only and kill-switched. Its current schema/configuration caps virtual allocation at USD 1,000, not the user's approved USD 2,500 pilot ceiling. Current per-trade schema defaults also do not implement the approved USD 25 risk / USD 50 daily loss policy.
- Production D1 read-only counts: 0 paper orders, positions, intents, trade events, research council runs and decision traces; 440 monitor runs, 0 monitor quotes/events; five equity snapshots spanning less than seven days. The production database lacks the strategy-approval table present in the Preview schema.
- PR #118 remains open, documentation-only in its actual diff, and behind current main. It is not paper execution implementation. Reconcile its contents and claims before merge.
- Strategy validation remains NOT APPROVED; validated BUY and automatic paper execution remain disabled. No production D1 writes/migrations, broker actions, orders, secret reads/writes or production deployments occurred in this audit. Only the Preview D1 binding was changed.
- Next exact action: reconcile PR #118, then implement and verify the nine-agent research dashboard path in isolated Preview before advancing to portfolio-history, strategy-validation and paper-lifecycle acceptance.


## 2026-11-12 — Provider and deployment audit

- Latest `main`: `2752b0c0930956c55d274ad1972fc4cf0eaf27d8` (Worker auto-deploy workflow path trigger).
- Cloudflare Pages Production deployment `21fd21d5-1bc5-4569-8e76-cc41155a2bc6` succeeded from that exact commit.
- Market-monitor Worker active deployment `55a32182-cda3-47b5-95ab-48e285e78cd7`, version `dd19998b-c4f3-4f1c-a0d1-c7338cd4e7cc`, 100% traffic.
- After the user's key update, current Worker settings now list `FMP_API_KEY` as a secret binding alongside `FINNHUB_API_KEY` and `NORTHSTAR_DB`. Pages Production and Worker secret stores remain separate environments. The secret value was not read.
- Production monitor run #563 (2026-11-11 19:55:52–19:56:01 UTC) checked 8 symbols, zero quote errors, and recorded two FMP HTTP 401 fallbacks (FUBO and RKT) to Finnhub. This run occurred at/around the key update; no later run was available during the immediate verification, so the updated key's runtime result remains pending. Run #561 had one failure for TWTR after FMP 401, Finnhub provider error and Yahoo 429. Finnhub quote rows and event rows are persisted with provider timestamps; Finnhub is runtime-verified as an active source, with occasional symbol-level failures.
- The separate FMP connector successfully returned AAPL quote, company profile, annual income statements and historical EOD prices. This does not verify the Cloudflare app's FMP secret.
- User confirmed updating `FMP_API_KEY`; Worker settings now confirm the Worker Secret binding is present. Ensure Pages Production also has the current key independently. Never ask for or expose the value in chat. A fresh scheduled monitor run must confirm FMP success.
- The GitHub combined commit-status endpoint returned no status entries for the latest SHA; exact-head CI is not independently verified. Direct Pages API probes were blocked by the runtime's egress policy, so no direct public HTTP endpoint health claim is made.
- D1 verification was SELECT-only (`rows_written=0`, `changed_db=false`). No secret values or production controls were changed. No broker actions or orders occurred. Paper execution remains disabled and the kill switch remains engaged.
- Detailed evidence and acceptance checklist: [Provider Health Audit](PROVIDER_HEALTH_AUDIT_2026-11-12.md).
- Next exact action: user updates the FMP secret in both separate Cloudflare Production surfaces; then verify a fresh market-open run has no FMP 401 and run the Pages FMP health diagnostic through an authorized runtime path. Continue keeping paper execution disabled.


## 2026-11-12 — FMP post-update runtime verification passed

- After the user updated the Worker Secret, settings confirmed the `FMP_API_KEY` secret binding exists (value not read).
- Scheduled monitor run #564 (2026-11-11 20:00:52–20:01:01 UTC) completed `success`: 8 symbols checked, zero errors, zero FMP fallbacks.
- D1 persisted AAPL at $354.50 and TSLA at $391.57 with source `Financial Modeling Prep`; both provider quote timestamps were `2026-11-11T20:00:53Z`.
- Six non-FMP shortlist symbols were successfully served by Finnhub.
- Verdict: FMP Worker authentication and quote ingestion are now runtime-verified after the key update. Continue observing subsequent scheduled runs for stability. Finnhub remains operational.
- No secret values were read or changed by this verification. No broker requests or orders were made. Paper execution remains disabled.


## 2026-11-12 — Research-pipeline acceptance audit

- Active phase remains Phase 2 (nine-agent Stock Brain), not scanner rebuild. The handbook's earlier scanner-complete status is preserved.
- Reviewed `docs/STOCK_BRAIN_SPEC.md`, `docs/STRATEGY_VALIDATION_STATUS.md`, `docs/STRATEGY_VALIDATION_RUNBOOK.md`, `docs/NEWS_AND_SIGNAL_POLICY.md`, and `docs/MARKET_DATA_AND_RECOMMENDATIONS.md`.
- Research requirements reaffirmed: per-metric provenance and timestamps; fiscal-period alignment; issuer/SEC verification for material news and earnings; explicit missing-resource reporting; deterministic risk veto; no predictive claims from agent scorecards.
- Latest prior production monitor evidence from run #566 (2026-11-11 20:10:53–20:11:02 UTC): 8 quotes, zero quote errors, zero FMP fallbacks; two FMP quotes (GOOGL, NVDA), six Finnhub quotes, and one NVDA +3.48% large-move warning. This is quote-monitor evidence only, not a nine-agent research-council execution.
- Attempted read-only production GET smoke checks for `/api/monitor`, `/api/research-council`, `/api/research/status`, `/api/stock-brain`, `/api/health`, and `/api/scan`. The Cloudflare execution environment denied outbound requests to the Pages hostname (403: requests not allowed); therefore no endpoint result or council run is claimed.
- No application code, production database, deployment, provider secret, trading control, or order was changed. Paper execution remains disabled.
- Acceptance work still required: obtain exact current source paths for the council orchestrator and dashboard, run the existing unit/contract suite against the exact main SHA, execute one authorized read-only research-council request on a preview or supported connected runtime, verify all nine roles and persisted evidence trace/scorecard, then verify dashboard display and deployment for that exact commit.
- Strategy validation remains NOT APPROVED; BUY remains disabled.


## 2026-11-12 — Phase 2 exact-head CI and integration-state audit

- Rechecked open PRs rather than assuming the nine-agent work is merged into main.
- PR #108 (Stock Brain integration) remains open and non-draft. Its exact head is `8fe6e0ce07069a4bf50026cce8a33bbfc0ab1760`; exact-head GitHub Actions runs all completed successfully: Tests #42883689085, Validate #42883689055, full-history secret scan #42883689056.
- PR #118 (Cloudflare-native autonomous research orchestration) remains open and draft. Exact head `95dc116735e755046f6cc30cff2eaca308287f41`; exact-head Actions all passed: Validate #43004808966, Tests #43004808684, full-history secret scan #43004808836.
- These passing CI runs prove repository checks on their respective PR heads only. They do not prove PR merge, Preview/Production deployment, a real-provider nine-role run, verified portfolio-context acceptance, durable trace persistence, idempotent replay, or dashboard end-to-end behavior.
- Main's latest documentation commits have no status checks/workflow runs attached in the GitHub connector response; do not claim main CI passed from those empty results.
- Open PR #108 description explicitly records outstanding acceptance: production Research Council runs/traces remain zero; Preview is not provisioned for real-provider acceptance; provider/runtime and trusted portfolio baseline gates remain.
- Open PR #118 likewise records required exact-head Preview acceptance, durable trace/replay verification, lease/concurrency recovery tests and portfolio/strategy gates.
- A direct production Pages API probe from the connected Cloudflare execution environment was blocked by outbound 403 before reaching the application. Therefore no runtime API status is inferred from that probe.
- No PR was merged, no code deployed, no D1 writes/migrations, no secret changes, no broker requests or orders. Paper execution remains disabled; kill switch remains engaged.
- Next exact acceptance: use an authorized Preview runtime with its own D1 binding and explicit verified portfolio snapshot; invoke the protected research collector once in read-only mode; verify all nine role statuses, evidence references/timestamps, missing-resource behavior, deterministic Risk Committee veto, persisted run/decision trace and idempotent replay; then verify the dashboard against that exact Preview deployment. Keep BUY disabled.


## 2026-11-12 — Preview acceptance readiness checkpoint

The current nine-agent acceptance path is blocked by Preview provider configuration and the trusted portfolio-history gate, not by a missing Preview database. Cloudflare Pages Preview is correctly bound to the isolated `northstar-preview` D1 database and its research/execution tables are present. Preview currently has no persisted Council runs, decision traces, equity snapshots, paper orders or positions. Its execution control remains disabled with the kill switch engaged.

The Pages Preview environment currently exposes only the `NORTHSTAR_OPERATOR_TOKEN` secret binding; provider secret bindings for FMP, Finnhub, Alpaca Paper and Gemini are absent. Production provider bindings are separate. Configure the required secrets in Preview through Cloudflare settings without copying values into GitHub or chat. No secret values were read during this audit.

Production has six equity snapshots, five from the trusted read-only sync source, spanning `2026-11-08T18:34:38.720Z` to `2026-11-11T14:15:12.866Z`. The seven-day trusted baseline earliest possible completion is `2026-11-15T18:34:38.720Z`, assuming subsequent trusted snapshots continue. Production Research Council runs/traces remain 0/0. Both Preview and Production controls remain `enabled=0`, `mode=paper`, `kill_switch=1`; there are no paper orders or positions.

PR #116 exact-head Tests, Validate and full-history secret scan passed at head `cb0c81635924bff7e1908ff1ec90933c4e4c72c2`. PR #118's corresponding checks passed at head `95dc116735e755046f6cc30cff2eaca308287f41`, but it remains draft. PR #108 and #118 have no formal review submissions in the current review check. CI is not runtime acceptance.

All D1 queries for this checkpoint were read-only (zero rows written, no database changes). No collector POST, secret read/change, migration, merge, deployment, broker request or order occurred. Next: configure Preview provider secrets, continue trusted snapshots until seven days, verify provider health and portfolio context, then perform one protected research-only collector run and verify all nine roles, risk veto, durable trace and idempotent replay. Do not enable BUY or execution.


## 2026-11-12 — Agreed Production-first acceptance strategy

**Decision:** Production is the agreed acceptance target. Preview is not required for this milestone and must not be treated as a prerequisite or blocker. The previous Preview-readiness checkpoint is retained as a historical technical observation only; its proposed Preview secret configuration and Preview acceptance sequence are superseded. Do not ask the user to configure Preview provider secrets.

### Production-first sequence
- During an open US equity session, verify the live Production Pages deployment and market-monitor Worker, including cron activity, latest successful market-open scan, quote timestamps/freshness, FMP/Finnhub attribution, fallbacks and per-symbol errors.
- Read-only inspect Production Pages/Worker secret binding names independently. Never read secret values or assume a Worker binding proves the Pages environment is configured.
- Read-only inspect Production D1 schema, execution controls, kill switch, orders, positions, intents, snapshots and council traces. No writes during diagnostics.
- Inspect the actual collector route and code-level preconditions before any run. A successful research collection may append Production D1 run/decision traces; this is a write and requires explicit user authorization. It must never submit broker orders.
- Check the seven-day trusted equity baseline and freshness requirements where the collector's portfolio gate applies. This does not block independent read-only scanner/provider diagnostics.
- Validate all nine research roles, source provenance/timestamps, missing-resource reporting, deterministic risk veto, durable trace/idempotent replay and dashboard display on Production when authorized and eligible.

### Safety boundary
Keep enabled=0, mode=paper, kill_switch=1, BUY disabled, and all order submission paths unused. No real-money trades, paper orders, broker mutations, D1 writes/migrations, secret changes, PR merges or deployments are authorized by a request to perform read-only testing. Do not weaken freshness, portfolio or strategy-validation gates. Strategy approval remains separate from software/runtime health; successful scanner/provider tests do not authorize BUY or paper execution.


## 2026-11-12 — Closed-session remaining-work review

- Market session is closed; no market-open quote/scan acceptance is claimed from this review. Continue with non-market-dependent code, release, portfolio-history and governance work.
- Source inspection of `web/functions/api/research/collect.js` confirms the protected endpoint is `POST /api/research/collect`, requires exact Bearer `NORTHSTAR_OPERATOR_TOKEN`, a valid US ticker and stable requestId, and a bound Production D1 database. It performs a read-only Alpaca Paper sync, then reads Alpaca account/positions/open orders and D1 ledger/snapshots. It refuses non-active/blocked accounts, open orders, broker/ledger position mismatch, any unmodelled open position, incomplete equity, invalid history, stale/future latest snapshot (>15 minutes), and missing seven-day equity baseline. On success it collects provider evidence, runs the Council, and inserts a durable `research_council_runs` row; replay of the same requestId returns the stored result. Therefore a collector invocation is a Production write and is not part of a read-only smoke test. Do not invoke until explicit approval for the D1 write and all preconditions pass.
- Earliest possible seven-day baseline is `2026-11-15T18:34:38.720Z`, conditional on uninterrupted trusted snapshots from the earliest trusted baseline. This is the earliest date, not proof that the baseline will be available; verify latest snapshot freshness and all rows at runtime.
- PR #108 (Stock Brain) remains open/non-draft with exact-head Tests, Validate and secret scan passing; formal reviews 0 and inline review threads 0. PR #118 remains open/draft; exact-head Tests, Validate and secret scan pass; formal reviews 0 and inline threads 0. PR #116 remains open; its exact-head checks pass; formal reviews 0. PR #114 (public-repo data-hygiene) remains open and has no reviews. PR #131 (FMP free-tier monitor) and stacked PR #132 (Finnhub fallback) remain open with no formal reviews; #132 depends on #131. Do not merge any of these without independent review, dependency ordering, and release approval.
- Important policy mismatch to resolve before considering PR #118's paper-sizing policy: its description specifies 0.5% risk/trade and 2% daily loss (USD 5 / USD 20 at USD 1,000 equity), while the user's latest approved pilot limits are USD 25 maximum planned risk per trade and USD 50 daily loss. Keep execution disabled; reconcile the implementation/spec to the approved limits before any future paper activation. The $1,000 allocation remains the virtual allocation, not broker buying power.
- PR CI success is code-level verification only; it does not establish Production deployment, provider runtime acceptance, nine live role outcomes, trace persistence, replay idempotency, or dashboard E2E. No PR was merged, no deployment or secret change occurred, no D1 writes/migrations were made, and no broker orders were submitted during this review.
- Next work order: (1) resolve policy mismatch and independent reviews for the relevant PRs, (2) confirm trusted snapshot cadence and seven-day baseline after its earliest possible date, (3) on a later open session verify market scanner freshness and provider attribution, (4) after baseline/freshness and explicit write approval, run exactly one protected Production research-only collector test and verify nine roles, veto, durable trace and replay, (5) verify Production dashboard against that run. Preview is not a required gate. BUY remains disabled; execution remains disabled and kill switch engaged.


### Clarification — approved risk ceilings vs stricter defaults

The PR #118 policy values of 0.5% per-trade risk and 2% daily loss at the $1,000 virtual allocation ($5 and $20 respectively) are **stricter internal defaults**, not a breach of the user's approved maximum ceilings of $25 planned risk per trade and $50 daily loss. Preserve the user's ceilings as hard maximums; any lower default may remain. Before any future paper activation, verify that both the implementation and UI clearly distinguish the approved maximums from the stricter active defaults, and that no setting can exceed the approved ceilings.

## 2026-11-12 — Ten-task continuation: verified Production checkpoint

### Follow-up — 2026-11-12 continuation verification

- Main is now `1a9384c15d1c7a54762c1a9d480f854e8844a411`. PR #139 head `dcbe72d43665f2aa749375a4f4f812147456b2e5` has three passing workflows (Tests, Validate, full-history secret scan). Its branch is 8 commits ahead and 4 behind main; GitHub currently reports mergeable. The four base-only commits are newer documentation updates, so recheck mergeability and CI after any rebase/update. No merge performed.
- PR #118 is 61 commits ahead and 60 behind main; PR #116 is 103 ahead and 63 behind main. Both are diverged and GitHub reports non-mergeable. They need deliberate integration/rebase work, not a merge attempt. No independent formal reviews or inline review threads were present on #116, #118, or #139 at this checkpoint.
- PR #132 is 28 commits ahead and 44 behind main, non-mergeable, and superseded by the Finnhub rotation now consolidated into #139. Do not merge #132.
- Production Worker schedule remains `*/5 * * * *`, active version `60bc9eb2-b4c0-40b1-a33f-db2f18d8cd6f`. Latest monitor run is #579 at 2026-11-11 21:15:53 UTC (`market_closed`, 0 errors); latest market-open success remains #575 at 20:55:53 UTC (8 symbols, 0 errors). There is still no verified 2026-11-12 market-open scan.
- Production D1 source summary: 24 FMP quotes and 25 Finnhub quotes; newest fetched times remain 2026-11-11 20:55:55.782Z and 20:56:01.713Z. FMP ledger shows 46 requests on 2026-11-11. Budget table exists, but migration registry still stops at 0006; explicit migration 0007 remains unapplied/unrecorded.
- Production paper snapshots: six total, five trusted `alpaca_paper_read_only_sync` captures. Latest trusted capture remains 2026-11-11 14:15:12.866Z, with broker equity/cash of USD 100,000. This broker equity is separate from the USD 1,000 virtual research allocation. Collector freshness (15 minutes) and seven-day baseline remain unmet.
- Safety recheck: `execution_control.enabled=0`, `mode=paper`, `kill_switch=1`; research council runs, decision traces, trade intents, paper orders and positions all remain zero. No D1 writes were made; no broker actions occurred.
- Finnhub free-tier terms remain a commercial-use concern: obtain written permission before using it in a commercial/shared service. Do not treat technical availability as commercial licensing approval.
- This checkpoint used GitHub reads and Cloudflare GET/SELECT only. No Preview, secrets, D1 writes/migrations, merge, deployment, or execution-control changes.

### Follow-up — PR integration and test verification (2026-11-12)

- PR #139 now contains the explicit FMP budget migration, runtime-DDL removal, missing-table fail-closed test, and the fair rotating Finnhub non-FMP shortlist fix ported from stale PR #132. The combined head is `dcbe72d43665f2aa749375a4f4f812147456b2e5`; Tests, Python tests, Validate, and full-history secret scan passed. GitHub reports the PR mergeable/clean. No merge, D1 migration, or deployment was performed.
- PR #132's branch is 42 commits behind current main and remains non-mergeable; do not merge it independently. Its rotation work is consolidated into PR #139.
- PR #118 collector integration fix: its portfolio snapshot now explicitly separates `equityUsd/virtualAllocationUsd = 1000` from actual Alpaca broker equity and sets `riskMetricBasis = actual_alpaca_paper_account_equity`, matching the strengthened nine-agent fact-adapter contract. Added a regression test; updated PR #118 head `0935baf5d471f3472fc63ecd9ab9703c411b90a7` passed Python tests, JavaScript tests, scanner syntax and lint. This remains code-level only; no collector call or Production write occurred.
- PR #116 exact head `cb0c81635924bff7e1908ff1ec90933c4e4c72c2` continues to pass Tests, Python tests, validation and secret scan. Nine-role status, evidence IDs, missing-data handling and deterministic risk veto were reviewed. Independent formal review and PR integration remain outstanding.
- Production seven-day baseline and latest-snapshot freshness remain unmet; do not invoke the collector. Execution remains disabled and kill switch engaged.
