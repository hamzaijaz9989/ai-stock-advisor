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

- Main branch head at this checkpoint: `d1c9b964204c89639bf1c13d511e75d9c398d51f` (recheck before future work).
- Active combined Stock Brain PR #103: https://github.com/hamzaijaz9989/ai-stock-advisor/pull/103 — open and no longer draft, based on current main, mergeable, all exact-head CI checks green. Latest combined branch head `5b39a9b888a6ccb7ba9a2074668cc73cee2e149a`; Cloudflare Pages preview deployment `a1c5704f-7bea-4ca4-a252-c6b049b5857b` succeeded at https://a1c5704f.ai-stock-advisor.pages.dev. Live HTTP/UI smoke test remains unverified because the available browsing layer cannot access the Pages host. Do not merge or production-deploy until the preview route and protected operator workflow are independently smoke-tested.
- Earlier PR #85 and #88 are documented as draft and not formally reviewed; inspect their current status before any merge decision.
- Earlier audit recorded `main.protected=false` and required checks disabled. Recheck with an authorized GitHub administrator path.
- Production D1 was documented with migrations 0001–0005 and one equity snapshot; verify the live state before any migration or workflow change.
- The production snapshot described in the blocker log is broker account equity, not the separate $1,000 Northstar virtual strategy allocation.
- Production paper controls were documented as execution disabled, paper mode, kill switch engaged, with $1,000 virtual allocation, 0.5% default risk, 1% maximum per-trade risk and 25% maximum position notional.
- The latest blocker evidence says strategy approval is false and paper execution is not enabled.
- Repository visibility is **PUBLIC**, as explicitly confirmed by the user and corroborated by GitHub metadata on 2026-11-10. Do not describe it as private. Keep all secrets, tokens and sensitive data out of the public repository.

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
- Main: `d1c9b964204c89639bf1c13d511e75d9c398d51f` (handbook/continuity docs merged).
- Production Pages deployment remains `921087a4-6194-4a67-ac61-2f8557edb0bc`, successful, serving application commit `57aa9f0743917401dd0e3e90521fc39c22bd9f55`. The docs-only merge did not trigger a deployment under the configured path filter.
- The handbook/documentation branch preview was skipped by the Pages path filter because its changes were documentation-only; no production deployment was attempted.
- Combined PR #103 (`northstar/research-council-status-dashboard`) contains the Stock Brain Trading Lab workspace, stable nine-role result matrix, durable trace confirmation and safe API-response handling. A separate public readiness endpoint/card was removed before merge.
- PR #102 (this handbook and continuity update) was merged after successful Tests, Validate AI Stock Advisor, and full-history secret-scan workflows. Squash merge commit: `d1c9b964204c89639bf1c13d511e75d9c398d51f`.
- The main branch API response reports `protected=false` and no required status checks. Do not treat green CI as branch governance.
- Repository visibility: public, owner-confirmed. Never commit credentials or secrets.

### Scanner and market-monitor status
- Scanner phase: user-confirmed COMPLETE and tested. Do not restart scanner implementation absent a concrete regression.
- Worker `northstar-market-monitor` has a production cron trigger `*/5 * * * *` and latest deployed Worker deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` (version `2739d49a-4182-423f-8113-616252c5ddd6`, 100%).
- Production D1 `monitor_runs`: 17 rows; all 17 have status `market_closed`, zero symbols checked, zero errors. Latest run began `2026-11-09T22:25:52.931Z` and completed `2026-11-09T22:25:53.110Z`.
- Production `monitor_quotes`: 0 rows. Production `monitor_events`: 0 rows. This is consistent with all observed runs being outside the US regular session; it is not evidence of a successful market-open quote cycle.
- Next monitor acceptance check: during the next US regular session, verify at least one completed run with symbols checked, timestamped quote rows, event deduplication, and dashboard rendering. Do not weaken freshness gates to make this pass.

### Nine-agent Research Council / Stock Brain
- User-confirmed phase: nearly complete. The nine logical roles are already implemented in source; preserve this phase as active rather than reopening the scanner.
- Main contains the server-side collector `POST /api/research/collect`, the specialist council endpoint, fact/evidence adapters, and append-only `research_council_runs` storage.
- Trading Lab contains the Stock Brain workspace in PR `#103`: it calls the protected server-side `/api/research/collect` endpoint with a ticker and unique request ID, renders all nine role statuses/reports/vetoes, and shows durable-trace confirmation. The operator token is requested at run time and is not written to browser storage. The separate public readiness endpoint/card was removed to avoid unnecessary configuration disclosure and inconsistent preview function routing. The workspace is implemented in the PR branch, not yet production-deployed; production end-to-end acceptance remains unproven.
- Production D1 `research_council_runs`: 0 rows. `research_decision_traces`: 0 rows. This confirms no production council run/decision trace has yet been recorded.
- The collector is operator-authenticated and requires model credentials, Alpaca Paper read-only credentials, the disabled/kill-switched control row, reconciled empty positions/open orders, a fresh equity snapshot, and a seven-day equity baseline. Do not put `NORTHSTAR_OPERATOR_TOKEN` in browser JavaScript.
- Current production paper equity history has one snapshot only: `2026-11-08T18:34:38.720Z`. It is neither a fresh 15-minute snapshot nor a seven-day series. The server-side collector therefore cannot currently pass its portfolio gate.
- Next phase-2 work: merge PR #103 after exact-head CI and static Pages preview checks; verify the production collector route and dashboard after deployment; review the interim browser prompt/token flow and replace it with Cloudflare Access or an equivalent authenticated operator session when available; restore fresh read-only equity snapshots and a seven-day baseline; then run one controlled research-only production collection and verify idempotent replay. Keep trade submission disabled.

### Paper-only safety state
- Production execution control: `enabled=0`, `mode=paper`, `kill_switch=1`, max planning allocation USD 1,000, default risk 0.5%, hard risk cap 1%, max position 25%.
- Production D1 migrations: `0001`–`0005` only. Migration `0006_continuous_market_monitor.sql` is not recorded in this paper-ledger database; monitor tables are present in the same schema, but verify the migration ledger before making any schema assumptions.
- Counts: 0 paper orders, 0 paper positions, 0 trade intents, 0 broker fill activities, 0 paper trade events, 1 equity snapshot, 2 audit rows.
- No paper or live order was submitted; no production D1 write or migration was performed during this audit.


## 2026-11-10 — Autonomous Stock Brain milestone checkpoint

- Updated the enabled Northstar hourly automation with the user's autonomy instruction: investigate and resolve blockers independently, maintain public-repository accuracy, and request user involvement only for unavoidable permissions, credentials or approvals.

- Repository visibility is PUBLIC by explicit user confirmation and GitHub metadata. Never commit secrets, credentials, tokens or sensitive customer data.
- Current main head observed: `d1c9b964204c89639bf1c13d511e75d9c398d51f`.
- Active combined Stock Brain work is PR #103: https://github.com/hamzaijaz9989/ai-stock-advisor/pull/103, branch `northstar/research-council-status-dashboard`, exact head `f318d329a4043ca6920e12ec970549737cc8e8fd`. It is open, non-draft, clean/mergeable, with Tests, Validate AI Stock Advisor and full-history secret scan all successful.
- PR #103 includes the nine-agent Stock Brain dashboard, authenticated server-side collection path, stable role matrix, read-only readiness endpoint/card, tests and updated operating documentation. It supersedes the older divergent PR #104 implementation branch; do not merge PR #104 separately.
- Application-code head `5b39a9b888a6ccb7ba9a2074668cc73cee2e149a` passed Cloudflare Pages, full-history secret scan, Python tests and both JavaScript test jobs. The latest documentation-updated head `4799ec7c05f65995f71cc816c4437069f0caf589` also passed all four checks: secret scan run `42714090108`, Tests `42714090490` and `42714086904`, Python tests within Validate run `42714090459`. CI is not proof of production readiness.
- Cloudflare Pages preview `a1c5704f-7bea-4ca4-a252-c6b049b5857b` succeeded at https://a1c5704f.ai-stock-advisor.pages.dev for combined branch head `5b39a9b888a6ccb7ba9a2074668cc73cee2e149a`. The deployment metadata reports successful deploy stage. Direct HTTP/UI smoke testing remains outstanding. Both the browsing layer and the Cloudflare execution environment explicitly block outbound requests to the Pages host with a tool-level 403 (`requests to ...pages.dev are not allowed`). This is an environment egress restriction, not an application response; no runtime health conclusion can be drawn.
- Read-only production D1 query confirms migrations `0002_research_decision_traces.sql` and `0003_research_council_runs.sql` are present; `research_council_runs` has 0 rows; equity history has only one snapshot at `2026-11-08T18:34:38.720Z`; controls remain `enabled=0`, `mode=paper`, `kill_switch=1`, allocation USD 1,000. The query reported zero rows written and no DB changes.
- The existing collector requires a fresh equity snapshot (within 15 minutes), a seven-day baseline, verified empty/reconciled broker positions and open orders, model-provider credentials and operator authentication. Production D1 still has one snapshot at `2026-11-08T18:34:38.720Z`, so the fresh-snapshot and seven-day baseline gates fail. No production research run has been attempted.
- The Stock Brain integration is therefore **implemented in a CI-green, preview-deployed draft PR, but not yet accepted or production-deployed**. The next work is: complete code review and exact-head preview smoke tests; replace the interim prompt-entered operator token with a stronger authenticated session if available; establish safe periodic read-only equity snapshots and the seven-day baseline; verify provider/auth configuration without exposing secrets; perform one explicitly authorized research-only run and idempotent replay; then update this handbook with the evidence.
- No production deployment, D1 write/migration, broker call, order, execution-control change or secret change was performed in this checkpoint. Paper execution remains disabled and kill switch engaged. Validated BUY remains disabled.


## 2026-11-10 — Latest autonomous Stock Brain acceptance checkpoint

- User reconfirmed that the GitHub repository is intentionally PUBLIC. The README and project handbook now treat it as public; all credentials and sensitive data must remain outside Git history.
- Main remains at `d1c9b964204c89639bf1c13d511e75d9c398d51f`. Active PR #103 is open, non-draft and clean/mergeable: https://github.com/hamzaijaz9989/ai-stock-advisor/pull/103. Branch: `northstar/research-council-status-dashboard`; exact head: `f318d329a4043ca6920e12ec970549737cc8e8fd`.
- Exact-head CI is green: Cloudflare Pages check, full-history secret scan, Python tests, and both JavaScript test jobs. Workflow run IDs: `42713848132` (Validate AI Stock Advisor), `42713848158` (full-history secret scan), `42713848025` and `42713844411` (Tests).
- Cloudflare Pages preview deployment `a1c5704f-7bea-4ca4-a252-c6b049b5857b` completed its deploy stage successfully for that exact branch head: https://a1c5704f.ai-stock-advisor.pages.dev.
- Attempted direct homepage and status API smoke probes through the available web layer; both were inaccessible at the browsing layer. Do not interpret this as an application HTTP failure or claim a successful endpoint/UI smoke test. The Cloudflare deployment metadata confirms the preview deploy, but not runtime behavior.
- PR #103 is not merged. Production remains on main. No production deploy, D1 write/migration, broker call, paper/live order or execution-control change was made.
- Production research council history remains empty; the collector's freshness and seven-day equity-history gates remain unsatisfied. No research run was launched. Paper execution remains disabled; kill switch remains engaged; validated BUY remains disabled.
- **Next exact task:** obtain a real preview runtime smoke test for the Trading Lab Stock Brain panel, read-only status endpoint, and protected collector failure/success behavior without submitting orders or mutating production. If the available browsing environment continues to block Pages access, use an authorized local/preview browser path or ask the user only for a browser-side confirmation that cannot be obtained by the connected tools. Then complete PR review; merge/deploy only after the release boundary is explicitly satisfied.


## 2026-11-10 — Provider outage root-cause audit (preview vs production)

- User reported that Alpaca and Financial Modeling Prep (FMP) worked previously but fail in the current Stock Brain preview.
- Read-only Cloudflare Pages project configuration was inspected through the authenticated Cloudflare connection. Secret values were not requested, read, printed, changed, or exposed.
- **Verified configuration difference:** production environment declares encrypted secrets ALPACA_API_KEY_ID, ALPACA_API_SECRET_KEY, FMP_API_KEY2, GEMINI_API_KEY, and NORTHSTAR_OPERATOR_TOKEN. The preview environment declares only NORTHSTAR_OPERATOR_TOKEN. The Pages deployment metadata confirms the preview uses the preview environment and the same D1 binding, not production secrets.
- This explains the observed failures without evidence that the underlying Alpaca/FMP credentials were revoked: preview Alpaca sync cannot find its two required Alpaca bindings; preview FMP fundamentals/history cannot find FMP_API_KEY2. The collector calls and requires read-only Alpaca sync before it requests FMP, so an Alpaca preview configuration failure prevents the FMP requests from being reached at all.
- Production credentials remain configured by name in the production environment. Cloudflare returns encrypted secret values as empty/redacted fields; they cannot be copied or recovered through this integration. No production setting or secret was modified.
- The code paths inspected remain server-side: web/functions/api/paper/sync.js requires ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY; web/functions/api/fmp-fundamentals.js and fmp-history.js require FMP_API_KEY2 (with FMP_API_KEY fallback). The Stock Brain collector calls Alpaca sync first, then quote, FMP fundamentals/history, news, earnings and SEC.
- **Resolution requirement:** add the existing Alpaca and FMP encrypted secret values to Cloudflare Pages Preview environment using the same secret values already configured for Production. Do not paste secret values into chat, GitHub, issues, or logs. This cannot be automated by the connected Cloudflare API because secret values are write-only/redacted. Keep production unchanged.
- The preview deployment's operator token is configured separately; it does not substitute for provider credentials.
- Preview also lacks GEMINI_API_KEY; research-council model adapters may consequently be unable to call Gemini even after Alpaca/FMP are restored. Confirm the model-provider adapter's required env bindings before a full council smoke test.
- No broker order, paper order, live order, production D1 write/migration, production secret mutation, or execution-control change was made during this audit. Paper execution remains disabled, kill switch engaged, and validated BUY disabled.
- Active PR #103 branch northstar/research-council-status-dashboard; provider root-cause audit performed against branch head da1550fc09db32935b2060f93f52fe58620fd43f. The code preview deployment 436a3f12-0cac-40d7-aaa8-ce5ac83fbed9 succeeded, but provider-dependent runtime operation is not possible until preview secrets are configured.


## 2026-11-10 — Assistant-caused Preview provider regression and recovery

- During the login setup, the assistant sent a Cloudflare Pages project PATCH that set Preview `env_vars` to only `NORTHSTAR_OPERATOR_TOKEN`. The project API's resulting configuration shows Preview now contains only that binding, whereas Production still contains the Alpaca, FMP and Gemini secret bindings. This explains why previously working provider calls stopped in Preview.
- The assistant owns this regression. The previous diagnosis that Preview credentials were simply never configured was wrong; the operator-token update replaced the Preview environment-variable map.
- The API masks secret values. Current configuration cannot restore prior values, and the connected Cloudflare integration cannot read them back. No further config overwrite should occur. Recovery investigation is to inspect deployment snapshots, CI/CD secrets, and other existing secure sources. Do not modify Production credentials or place secrets in source control.
- If no secure copy exists, restoration requires an authorized secret owner to re-enter the original values. The assistant must be transparent about this limitation and not claim the API credentials have been restored.
- No trading execution, paper/live orders, production D1 writes/migrations or production secret changes were made.


## 2026-11-10 — Operator login reverted

- User confirmed the login is unnecessary and prioritized restoring Alpaca/FMP connectivity.
- Reverted `web/trading-lab.html` and `web/trading-lab.js` to their pre-login baseline at commit `5b39a9b888a6ccb7ba9a2074668cc73cee2e149a`; removed `web/functions/api/auth/check.js`.
- This removes the assistant-added login screen and restores the previous Trading Lab client flow. It does **not** restore the missing Preview provider secrets. The baseline client uses the original token-prompt flow for protected operator actions.
- Commits: `e8c41c88aaf24025258f335c50688d8021b2abce`, `64621115bdf8c7c485760aca9ee35c8909fbac80`, `79388ef24fc27f94f3fd6a54cd1dc404e295b6bf`.
- No Production deployment, Production secret change, database write/migration, broker order, or execution-control change.
- Remaining blocker: restore original Preview `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `FMP_API_KEY2` (and `GEMINI_API_KEY` for Gemini-backed agents) from an authorized secure source. Current Cloudflare API integration cannot read prior secret values. Do not claim APIs are restored until independent read-only tests pass.
