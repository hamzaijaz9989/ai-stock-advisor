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


## 2026-11-11 — Branch reconciliation and release status
- Feature branch `northstar/cloudflare-research-orchestration` now includes current main `def7967ec208a32a87a7d83498669b42dbffaef4` through merge commit `3de4a359181fe4e41b12fc54c84212c1925a0531`. Current main versions of the blocker log, handbook and top-stocks cache were retained; feature implementation files were preserved.
- PR #118 is still a draft and requires exact-head CI, Preview acceptance and review. Do not merge or deploy its research changes solely because the branch has been reconciled.
- User-approved limits supersede every older value in historical notes: **USD 1,000 total virtual allocation, USD 25 maximum planned risk per trade, USD 50 daily loss stop**.
- Cloudflare Pages currently reports a new main deployment and a feature Preview deployment queued at the last check. Their build stage is not successful yet; the last confirmed successful Production deployment is still the earlier `d6457bf` application commit.
- No production D1 migration/write, provider secret mutation, broker request or order submission was performed in this milestone. Keep paper execution disabled, kill switch engaged and BUY disabled.


## 2026-11-11 — Research Council dashboard implementation
- Added sanitized read-only `GET /api/research/status` endpoint and tests. Public response is limited to ticker, run status/time and nine agent role/status pairs; no reports, evidence, portfolio values or provider payloads are returned.
- Trading Lab now includes a nine-agent status panel and recent durable run list. It only reads status; it does not start research or execute orders.
- Acceptance pending exact-head CI and successful Preview deployment of the dashboard change. Preview currently has no durable Council runs, so the UI must honestly show an empty ledger until a controlled run is accepted.
- Lease renewal/heartbeat and concurrency/recovery testing remain outstanding. Execution remains disabled and kill switch engaged.


## 2026-11-11 — Preview research dashboard and lease schema verified
- The nine-agent Trading Lab panel and sanitized status endpoint are deployed successfully in Preview. A live page scrape confirmed the panel and approved $25/$50 limits; the status API reports nine roles and no runs yet.
- The new lease migration is correctly sequenced as `0013_research_council_run_leases.sql` after Preview's existing migration 0012. It has been applied and verified in the isolated Preview D1 database only.
- No Preview Council run has been recorded yet. Provider secret bindings required by the collector are absent from Pages Preview (FMP, Alpaca Paper key ID/secret, Gemini). Production secret values were not read or copied.
- Next step: add the four provider secrets directly in Cloudflare Pages > ai-stock-advisor > Settings > Variables and Secrets > Preview, then run a controlled research-only collection and verify durable trace + idempotent replay. Never paste secret values into ChatGPT.
- Production remains untouched; paper execution disabled, kill switch engaged and BUY disabled.

## 2026-11-11 — Lease recovery and concurrency tests
- Added 30-minute research-run leases with token-checked renewal at phase boundaries and safe abort if ownership is lost.
- Added tests for duplicate-run exclusion, expired-lease recovery, renewal ownership and owner-only release. Exact-head GitHub Tests and PR workflows passed on `c094059f...`.
- Preview Pages successfully deployed the collector lease changes. The additive lease migration remains applied to Preview D1 only.
- A real research run remains pending because provider secret bindings are not configured in Pages Preview. Do not claim agent completion until a durable run is recorded.
- No Production deployment, Production D1 mutation or broker action was performed. Execution remains disabled and kill switch engaged.
