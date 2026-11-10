# Northstar AI — Project Handbook and Operating Workflow

**Last reviewed:** 2026-11-10 05:42 PKT
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
- Active combined Stock Brain PR #103: https://github.com/hamzaijaz9989/ai-stock-advisor/pull/103 — open, non-draft and mergeable; main is `d1c9b964204c89639bf1c13d511e75d9c398d51f`; application/documentation head before the 05:42 refresh was `661fc8ca06ad505938adf97cf6c0670802ae5a3e` (136 ahead / 0 behind). Exact-head Tests `42729675713`/`42729666713`, Validate `42729675701`, and secret scan `42729675765` passed. Preview deployment `d2e6429a-844d-42fb-8e6a-73f9938fdabf` succeeded at https://d2e6429a.ai-stock-advisor.pages.dev; live smoke confirmed `/trading-lab.html` HTTP 200 and Stock Brain workspace/scorecard/run-control markup. No formal review is recorded; do not merge until independent review and governance are verified.
- Earlier PR #85 and #88 are documented as draft and not formally reviewed; inspect their current status before any merge decision.
- Earlier audit recorded `main.protected=false` and required checks disabled. Recheck with an authorized GitHub administrator path.
- Production D1 was documented with migrations 0001–0005 and one equity snapshot; verify the live state before any migration or workflow change.
- The production snapshot described in the blocker log is broker account equity, not the separate $1,000 Northstar virtual strategy allocation.
- Production paper controls were documented as execution disabled, paper mode, kill switch engaged, with $1,000 virtual allocation, 0.5% default risk, 1% maximum per-trade risk and 25% maximum position notional.
- The latest blocker evidence says strategy approval is false and paper execution is not enabled.
- Repository visibility is **UNRESOLVED**: the connected GitHub API reports `visibility=public`, while the user states the repository should be private. Treat all contents as publicly accessible until GitHub Settings confirms the actual setting. Do not change visibility without explicit authorization; never commit secrets, tokens or sensitive data.

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
- Repository visibility is unresolved: GitHub API reports public while the user states private. Treat contents as publicly accessible pending confirmation in GitHub Settings; do not change visibility without explicit authorization.

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

- Repository visibility remains unresolved: GitHub API reports public while the user states private. Treat contents as publicly accessible until GitHub Settings confirms the actual setting; never commit secrets, credentials, tokens or sensitive customer data.
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


## 2026-11-10 — Operator login restored; FMP verification still blocked

- Restored the Northstar Trading Lab login screen and `/api/auth/check` server-side verification flow, matching the prior implementation. The displayed username remains `Hamza Rana`; password verification uses the existing `NORTHSTAR_OPERATOR_TOKEN` Cloudflare secret and does not embed a password in the public repository.
- The login page stores the verified token only in session storage for protected operator actions. No plaintext password or API key is committed.
- FMP backend diagnostic endpoints remain `/api/fmp-health` and `/api/fmp-fundamentals?ticker=...`. The current production Pages URL returned HTTP 403 to the external diagnostic runner (likely access gating), so this is not evidence of an FMP provider failure or success. Preview provider credentials remain un-restored; FMP runtime validation is pending secure credential recovery.
- No Production settings or secrets changed. No live or paper orders were placed; execution remains disabled.

## 2026-11-10 04:36 PKT — Stock Brain dashboard response hardening and live-state audit

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE; no scanner rebuild was started.
- Objective: close a concrete dashboard regression found in the exact PR #103 source: the Stock Brain client parsed the collector response with `response.json()`, allowing proxy/HTML responses to surface raw JSON parser details, and the agent-role label formatter used an over-escaped word-boundary regex.
- Changed files: `web/trading-lab.js` (safe text-first JSON parser, generic non-JSON/invalid-body errors with HTTP status only, role-label capitalization); `tests/stock-brain-dashboard.test.mjs` (valid JSON, HTML/403 non-disclosure, invalid JSON shape and human-readable role-label regression cases).
- Code commit: `8fbb7b30a954bf449265e8398fbb32ccb6d262b6`; test-fixture commits: `b0545bc0a459fac6e8176bd9765eb12e57857747`, `78f4fd28e299140d4e41310f690da57716ad2643`, `8b36aa1f1b04f44cc6d7564f4f72f88fdcfe276b`. Current branch head: `8b36aa1f1b04f44cc6d7564f4f72f88fdcfe276b`.
- PR: #103, `northstar/research-council-status-dashboard`, open and non-draft; main base `d1c9b964204c89639bf1c13d511e75d9c398d51f`; branch comparison was 77 commits ahead / 0 behind before this hardening commit. No formal reviews or inline review comments are recorded. PR #103 is not merged.
- CI: the original Stock Brain head `e52e77a3cc3483a588eeb4cb85a37f5e0d1dca72` passed Tests run `42719601276`, Validate run `42719601283`, full-history secret scan `42719601375`, and companion push Tests run `42719596489`. New regression tests exposed test-fixture extraction mistakes on intermediate commits (Tests runs `42721553471` and `42721587023` failed); the fixture was rewritten to use a multiline function match and line splitting. Exact-head Tests run `42721678710` is queued at this update; no exact-head Validate/secret-scan result is yet claimed.
- Cloudflare Pages: latest successful Preview deployment observed is `7067e601-e35e-4ddf-97a7-5678c061ecde` for older commit `f720636ebe5f78b197916662696f3061cbc91b4e`. Preview deployment `0582180b-7116-49f6-ac10-c1881702137d` for prior PR head `e52e77a3cc3483a588eeb4cb85a37f5e0d1dca72` is `idle`; current head `8b36aa1...` has no successful exact-head Preview deployment yet. Production deployment `921087a4-6194-4a67-ac61-2f8557edb0bc` is the latest successful one and serves older main commit `57aa9f0743917401dd0e3e90521fc39c22bd9f55`; newer production deployment `6c3c67bd-94e2-4606-a2ac-e62c6e19a0d3` for main `d1c9b964...` is `idle`. Direct HTTP smoke from the connected runtime is blocked by its URL-access policy (HTTP 403 from the runner), so no endpoint health is inferred from that probe.
- Cloudflare configuration: Production Pages bindings include Alpaca key ID/secret, `FMP_API_KEY2`, Gemini and operator token. Preview has only `NORTHSTAR_OPERATOR_TOKEN`; provider secret values are write-only and were not read or changed. Preview still cannot run FMP/Alpaca/Gemini-backed collection until the authorized values are restored.
- D1 read-only audit: Production `northstar-paper-ledger` migrations are `0001`–`0005`; Preview `northstar-preview` migrations are `0001`–`0012`. Production counts: 30 monitor runs, all observed latest 12 are `market_closed` with 0 symbols checked/errors; 0 monitor quotes/events; 0 research council runs/traces; 1 stale equity snapshot at `2026-11-08T18:34:38.720Z`; 0 orders, positions, intents, trade events or fill activities. Preview research runs/traces and paper/monitor records are all 0. No D1 writes or migrations occurred.
- Safety: production execution remains `enabled=0`, `mode=paper`, `kill_switch=1`, $1,000 virtual allocation; strategy approval is not approved. No broker request, order, secret change, execution-control change, production migration, D1 write or deployment was performed.
- Governance: GitHub repository metadata reports `visibility=public`, conflicting with the README's privacy statement and user's report. Treat repository content as public; do not change visibility without explicit authorization. Branch-protection read endpoint returns 403 to this integration; branch protection/required-check enforcement is not independently verified.
- Complete: Stock Brain response parsing now avoids leaking HTML/proxy parser details; role labels are capitalized; regression tests are added. Implemented only; CI and deployment verification remain pending.
- Blockers: exact-head CI; successful Preview build and authenticated route smoke; formal independent PR review and branch-governance evidence; missing Preview provider secrets; fresh reconciled snapshot and genuine seven-day equity baseline; complete point-in-time strategy validation and independent approval.
- Exact next action: confirm run `42721678710` and all other workflows on exact head `8b36aa1...`; fix any failing test; verify an exact-head Preview Pages Functions deployment and route behavior; obtain formal review/governance before considering PR merge. Keep production controls unchanged and do not run the collector while portfolio freshness/history gates fail.

## 2026-11-10 04:50 PKT — Research Council scorecard, telemetry and Preview acceptance

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE and was not rebuilt.
- Objective: complete the previously missing deterministic resource-coverage inventory, role-specific resource packs, measured per-agent telemetry, persisted evaluation scorecard, and Trading Lab scorecard visibility; harden the collector against pre-existing broker/ledger mismatches.
- Code files: `web/lib/research-council.js` (v1.0.4; exports canonical `COUNCIL_ROLE_ORDER`, retains all nine status rows even when downstream stages are blocked, passes role-specific resource packs, rejects empty COMPLETE model-specialist reports while allowing the deterministic risk committee's decision-only contract); `web/lib/research-council-facts.js` (per-role resource coverage and explicit gaps); `web/lib/research-council-adapters.js` (measured provider/model/latency, provider-reported token usage, failed-call markers, deterministic risk-committee latency); new `web/lib/research-council-evaluation.js` (deterministic report-contract/reference-integrity scorecard; missing telemetry remains null, never fabricated zero; cost remains null); `web/functions/api/research/collect.js` (read-only broker/ledger reconciliation before broker snapshot sync, then scorecard calculation and persistence inside durable `research_council_runs.result_json`); `web/trading-lab.html` and `web/trading-lab.js` (scorecard panel, per-role resource coverage and telemetry, safe text-only rendering, no raw parser-error leakage).
- Test files: `tests/research-council.test.mjs`, `tests/research-council-adapter-telemetry.test.mjs`, `tests/research-council-evaluation.test.mjs`, `tests/research-council-resource-coverage.test.mjs`, `tests/research-collector.test.mjs`, `tests/stock-brain-dashboard.test.mjs`.
- Code verification commit: `2da608f742cd54936d8dc3b4b2d60c06d6f59f8f`. Key integration commits include `8dd2c688acff68e92565fc5a6d10ee2d9ae6821e` (orchestration), `27030fde2a5be6e7dc17607af8e0a8483fd68bfd` (resource coverage), `e8077a79d824ae13d2de0560261acf09654a3cfc` (adapter telemetry), `3e9c0666cda0d11944e6164f05c20ad371cd155b` (collector reconciliation and persistence), `b724ba0fb15c30ce4018df29dd947ab617cbbb3a` (scorecard evaluator), `6189b40e75301ade9bb97090474d5190e3147548` / `eaf7014f839f408596587a7f2414887aad7727c4` (dashboard panel/renderer), and `2c9e248b7c4936e89e5c13110f14cef571bfa8df` (preserve stable nine-role matrix).
- PR: #103, branch `northstar/research-council-status-dashboard`, open, non-draft, mergeable, 111 commits ahead of main and 0 behind at the code-verification point. Main remains `d1c9b964204c89639bf1c13d511e75d9c398d51f`. No formal reviews or inline review comments are recorded. Do not merge until independent review and branch-governance requirements are evidenced.
- Exact-code-head CI: Tests `42722839878` and `42722830794` passed; Validate AI Stock Advisor `42722840195` passed; full-history secret scan `42722839852` passed. Intermediate failures during integration exposed and corrected the missing stable nine-role matrix, scorecard role-status propagation, and absent-telemetry handling. Final code-verification head is green across all three workflow families.
- Preview deployment: Cloudflare Pages deployment `571103bc-5810-4a0d-96f6-c3671e2e6837`, URL `https://571103bc.ai-stock-advisor.pages.dev`, environment `preview`, commit `2da608f742cd54936d8dc3b4b2d60c06d6f59f8f`, stage `success`, `uses_functions=true`. Read-only Firecrawl smoke returned HTTP 200 for `/trading-lab.html`; the returned HTML contains the Stock Brain workspace, run button and `stock-brain-scorecard` panel. A credential-free POST to `/api/research/collect` returned HTTP 401 JSON `{"ok":false,"execution":false,"error":"Unauthorized."}`, confirming the deployed Pages Function route and auth gate without starting collection. No authenticated research run was attempted.
- Production Pages: latest successful deployment remains `921087a4-6194-4a67-ac61-2f8557edb0bc` for older commit `57aa9f0743917401dd0e3e90521fc39c22bd9f55`; newer deployment `6c3c67bd-94e2-4606-a2ac-e62c6e19a0d3` for main `d1c9b964...` is `idle`. No Production deployment or configuration change was made.
- Preview credentials: Pages project configuration still shows only `NORTHSTAR_OPERATOR_TOKEN` in Preview. Production retains the Alpaca key ID/secret, `FMP_API_KEY2`, Gemini and operator bindings. Secret values remain write-only and were not read, copied, changed or committed. The authenticated collector acceptance run is blocked until Preview provider credentials are restored through the authorized secret-entry path.
- D1 schema and records: Production migration ledger remains `0001`–`0005`; Preview remains `0001`–`0012`. No migrations, D1 writes or schema changes occurred. Production counts remain 0 monitor quotes/events, 0 research council runs, 0 decision traces, 1 equity snapshot, and 0 paper orders/positions/intents/trade events/fill activities. Preview counts for those tables remain 0. The sole Production equity snapshot is stale (`2026-11-08T18:34:38.720Z`, $100,000 broker equity); no genuine seven-day baseline exists.
- Monitor: Worker `northstar-market-monitor` schedule remains `*/5 * * * *`; deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` remains at 100%. Production monitor run IDs 21–32 were all `market_closed`, 0 symbols checked, 0 errors; no quote/event rows were produced.
- Strategy and paper lifecycle: strategy-validation status remains NOT APPROVED; four-fold walk-forward and untouched holdout evidence on genuine data are absent. Production execution control remains `enabled=0`, `mode=paper`, `kill_switch=1`, $1,000 cap, unchanged risk fractions. No paper/live orders, positions, intents, fills or trade events exist. No execution controls were changed.
- Governance: GitHub repository metadata still reports `visibility=public`, conflicting with the README/user report; treat repository contents as public and do not change visibility without explicit authorization. Branch-protection read endpoint remains 403 to this integration, so enforcement cannot be independently confirmed.
- Safety: no broker/provider API call, authenticated collection, D1 mutation, production migration, production deployment, secret change, paper order or live order occurred. The only runtime API probe was an unauthenticated POST rejected at the auth boundary.
- Complete: all nine role statuses remain visible; resource coverage and gaps are passed to each role; specialist and deterministic risk telemetry are captured when available; scorecard is stored with the durable council result; dashboard renders the scorecard and role coverage; final code CI passed; exact-head Preview build and unauthenticated route/auth smoke passed. These are implementation, CI and Preview verification—not strategy validation or approval.
- Blockers: restore Preview FMP/Alpaca/Gemini secrets; establish a fresh reconciled seven-day equity history without bypassing safety gates; perform an authenticated research-only acceptance run and verify the persisted run/scorecard; obtain independent PR review and confirm branch governance; resolve repository-visibility discrepancy in GitHub Settings; complete separate point-in-time strategy validation and independent approval.
- Exact next action: after the unavoidable Preview credentials and seven-day baseline are available, run one controlled authenticated research-only collection with execution still disabled, then read back `research_council_runs.result_json` and verify all nine roles, resource coverage, scorecard and telemetry. Do not merge PR #103 or deploy Production until formal review/governance gates pass.

## 2026-11-10 04:56 PKT — Final scorecard coverage and durable-trace correction

- Phase: Phase 2 — Research Council / Stock Brain integration; universe scanning remains COMPLETE.
- Objective: make scorecard coverage honest for all nine roles, retain failed specialists that produce no report, distinguish deterministic risk-committee timing from model-token usage, and align nested durable-trace state with the confirmed D1 write.
- Final code/test files: `web/lib/research-council-evaluation.js` now emits all nine canonical role rows (including NOT_REPORTED/BLOCKED/UNAVAILABLE roles), reports, resource coverage, citation/reference-integrity metrics, measured/failed invocation telemetry, model-specialist token totals only when complete, and null for unavailable totals; `web/functions/api/research/collect.js` sets nested `traceDurable:true` in new stored results and overlays the confirmed flag on replay/read-back only after the durable row is found; `tests/research-council-evaluation.test.mjs` covers all-nine-role coverage and failed calls without reports; `tests/research-collector.test.mjs` asserts scorecard/telemetry persistence and nested trace confirmation; `tests/stock-brain-dashboard.test.mjs` asserts the UI requires both server-confirmed trace flags.
- Key code commits: evaluator/all-role coverage `22c68f881eab36eddd30730682d98803e3fe24c0`; durable-trace correction `df0bdde15b788da5c8c912491eb1058a5f588ccc`. Final exact-head test commit/current branch head: `b5b3644b8e0e9de7e29cabfa172a8a4f088b38b2`.
- PR #103 remains open, non-draft and mergeable; current branch is 123 commits ahead of main and 0 behind. Main remains `d1c9b964204c89639bf1c13d511e75d9c398d51f`. No formal PR reviews or inline review comments exist. No merge was performed.
- Exact-head CI at `b5b3644b8e0e9de7e29cabfa172a8a4f088b38b2`: Tests `42724188645` and `42724181448` passed; Validate AI Stock Advisor `42724188878` passed; full-history secret scan `42724188994` passed. Earlier failing tests exposed stale assertions and were corrected; final exact-head suite is green.
- Preview deployment for the final application code: `f495b175-9fa1-4d8d-8253-7c85e3c8782f`, `https://f495b175.ai-stock-advisor.pages.dev`, commit `df0bdde15b788da5c8c912491eb1058a5f588ccc`, stage `success`. Read-only Preview page smoke returned HTTP 200 and confirmed `stock-brain-scorecard`, `stock-brain` and `run-stock-brain` elements. Credential-free POST to `/api/research/collect` returned HTTP 401 JSON with `execution:false`; this verifies Pages Function routing/auth only, not a successful collection.
- Durable trace semantics: the pure orchestrator's in-memory result remains non-durable; the server collector marks the stored result durable only in the persistence path and replays only after confirming a matching D1 row. The dashboard checks both top-level and nested server flags. No authenticated collector run was made.
- Open PR inventory: #103 is the active Stock Brain integration. #83's fail-closed portfolio-context gate is already present in the active `/api/research/council` endpoint and endpoint tests. The safe Research Council resource-coverage/telemetry/evaluation components from #85 were ported selectively; #85 remains a large draft containing separate paper-execution work and was not merged. #88's scoped OIDC read-only snapshot workflow remains a separate draft and was not deployed. #101 is a draft documentation refresh; #82/#39 are older agent/spec drafts; #30/#24/#23 are legacy UI/status drafts. No other open PR was merged or closed.
- Governance: GitHub API still reports repository visibility `public`, conflicting with README/user privacy claims; treat contents as public and do not change visibility without authorization. Branch-protection API remains 403 to this integration. PR #103 still lacks independent review, so merge is blocked despite green CI and mergeable state.
- Production/D1/worker safety: no Production deployment, D1 write/migration, secret change, broker request, order, position mutation or execution-control change. Production migration ledger remains `0001`–`0005`; Preview remains `0001`–`0012`. Production has 0 research council runs/traces, 0 monitor quotes/events, 1 stale equity snapshot and 0 paper orders/positions/intents/fills/trade events. Preview research/paper tables remain empty. Monitor cron remains `*/5 * * * *`; Worker deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` remains 100%; latest monitor runs are market-closed with zero symbols checked/errors.
- Strategy/paper state: NOT APPROVED; no genuine four-fold walk-forward plus untouched holdout evidence. Production execution remains `enabled=0`, `mode=paper`, `kill_switch=1`, $1,000 cap. No orders were submitted.
- Remaining blockers: Preview lacks `FMP_API_KEY2`, Alpaca key ID/secret and Gemini binding; Production has those bindings but values are write-only and were not copied. The only Production equity snapshot is stale at `2026-11-08T18:34:38.720Z`; no seven-day baseline exists. The controlled authenticated research-only acceptance run remains blocked. Independent PR review and branch-governance confirmation remain missing.
- Exact next action: restore Preview provider credentials via authorized secret entry, establish a genuine fresh/reconciled seven-day paper-equity baseline, then perform one authenticated research-only collection with execution disabled and read back the persisted nine-role result/scorecard/telemetry. Obtain independent review and confirm branch governance before any merge; keep Production unchanged.


## 2026-11-10 05:10 PKT — Preview D1 isolation and Stock Brain acceptance checkpoint

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Phase 1 universe scanning remains user-confirmed COMPLETE; it was not rebuilt.
- Objective: eliminate the Preview-to-Production D1 cross-environment binding and re-verify the nine-agent dashboard on the exact PR head.
- Root cause: Pages project Preview settings were first changed to the existing `northstar-preview` database, but `web/wrangler.toml` still declared the production D1 binding globally. An initial attempt using `[[previews.d1_databases]]` was rejected by the Pages build's Wrangler 3.114.17 as an unexpected top-level `previews` field, so Preview continued to inherit the production database. The Pages-specific Wrangler documentation supports environment overrides using `[env.preview]` and `[env.production]`.
- Resolution: `web/wrangler.toml` now declares explicit `[[env.preview.d1_databases]]` and `[[env.production.d1_databases]]` bindings. Preview points to `northstar-preview` (D1 ID `bdffc29f-a4f6-498e-ade7-22c85d9bd373`); Production remains on `northstar-paper-ledger` (D1 ID `528f3a23-1d1f-4d16-8463-f643d85f5deb`). The Cloudflare Pages project Preview setting was also read back with the preview D1 ID.
- Files changed in the code/config item: `web/wrangler.toml`; new `tests/pages-d1-environment-isolation.test.mjs`. The regression test asserts that Preview and Production use the expected binding names and distinct D1 IDs. A superseded intermediate commit `f533280e213d31c79a8e302546618d85d5b03953` used unsupported `previews` syntax; the final correction is `40beb6ae05543ff62411f4173dabc282d7534753`.
- PR: #103, `northstar/research-council-status-dashboard`, open, non-draft, mergeable; final code head `40beb6ae05543ff62411f4173dabc282d7534753`; base/main `d1c9b964204c89639bf1c13d511e75d9c398d51f`; 130 commits ahead, 0 behind. No formal reviews are recorded. Main is not protected (`protected=false`); do not merge until independent review and governance are established.
- Exact-head CI: Tests run `42725930803` passed; Validate AI Stock Advisor run `42725930456` passed; full-history secret scan run `42725930551` passed; push Tests run `42725921611` passed. The exact-head GitHub check suite also reports the Cloudflare Pages check successful.
- Preview deployment: Cloudflare Pages deployment `dea395bb-27ae-4795-afda-9692960340f1`, commit `40beb6ae05543ff62411f4173dabc282d7534753`, environment Preview, all stages successful, `uses_functions=true`. Its deployment metadata now reports `NORTHSTAR_DB` = `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. Build logs contain no Wrangler configuration warning. Firecrawl live scrape of `/trading-lab.html` returned HTTP 200 and confirmed the Stock Brain root, run button, agent matrix and scorecard elements. No authenticated collector request was made.
- Production deployment: unchanged. Main's latest Pages deployment for docs-only commit `d1c9b964...` was skipped by `path_config`; latest successful production deployment remains the older `921087a4-6194-4a67-ac61-2f8557edb0bc` on commit `57aa9f0743917401dd0e3e90521fc39c22bd9f55`. No Production deploy was triggered by this work.
- Database evidence (read-only): Preview migration ledger has `0001`–`0012`; Preview council runs, decision traces, equity snapshots and monitor runs are all 0. Production migration ledger has `0001`–`0005`; current counts are 37 monitor runs, 0 monitor quotes, 0 monitor events, 0 research council runs, 0 decision traces, 1 equity snapshot, and 0 intents, orders, positions, fills or trade events. No D1 migration, schema change or row write was performed.
- Production safety read-back: `execution_control.enabled=0`, `mode=paper`, `kill_switch=1`, `max_portfolio_usd=1000`, default risk 0.5%, maximum per-trade risk 1%, maximum position 25%. The only equity snapshot remains `2026-11-08T18:34:38.720Z` ($100,000 broker-paper equity, not the $1,000 Northstar virtual allocation); it is stale and no seven-day baseline exists. No broker call, paper order or live order was made.
- Monitor: Worker `northstar-market-monitor` schedule remains `*/5 * * * *`; deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` remains at 100%. Latest run #37 (`2026-11-10T00:05:52Z`) was `market_closed`, 0 symbols checked, 0 errors.
- Credential-name correction: the correct FMP binding name is `FMP_API_KEY`, not `FMP_API_KEY2`. Cloudflare read-back currently shows Preview has only `NORTHSTAR_OPERATOR_TOKEN`; Preview does not yet have `FMP_API_KEY`, `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` or `GEMINI_API_KEY`. Production has those secret names, but secret values remain write-only and were not read, copied or logged.
- Safety impact: Preview and Production D1 are now isolated in the deployed Preview runtime; Production D1, bindings, controls and deployment were not changed. The test guards against accidentally reusing the Production database in Preview. Paper execution remains disabled and the kill switch remains engaged.
- Completed: nine-agent dashboard/config code is implemented; exact-head CI is green; exact-head Preview deployment and static Stock Brain workspace are verified; Preview D1 isolation is verified in deployment metadata.
- Still blocked: no authenticated research-only acceptance run because Preview provider credentials are absent and Preview has no portfolio snapshot; Production collector remains blocked by stale equity and missing seven-day baseline. Strategy validation remains NOT APPROVED and BUY remains disabled. Paper lifecycle remains NOT READY. PR #103 still needs independent review and branch-governance confirmation. GitHub API still reports repository visibility public, conflicting with README/user statements that it is private; no visibility change was made.
- Exact next action: after Preview secrets are securely configured, verify only their presence (never values), and wait for/establish a genuine fresh, reconciled seven-day equity baseline through the approved read-only workflow. Then perform one authenticated research-only collection and verify its durable nine-role result, scorecard and telemetry. Obtain independent PR review and verify branch governance before considering merge. Keep Production unchanged and do not submit paper or live orders.


## 2026-11-10 05:35 PKT — Autonomous Stock Brain security, FMP binding and acceptance audit

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE; no scanner rebuild was performed.
- Objective: correct FMP secret-name precedence and diagnostics, remove the accidental client-side login facade that stored the operator token in sessionStorage, and verify the current Preview build and safety state.
- Code commits on PR #103: `42b4545006fcf62d89eabacfb0d8e1a34d52d768` (canonical FMP_API_KEY precedence, diagnostics and tests); `5b3e6e7dccdfe75c4ab7906e851d0d3dd7806710` (removed hard-coded username/login overlay/sessionStorage token and unused /api/auth/check route); `ca194c341fc1a047b6f41fb3b647e4c34fd615df` (fixed regression-test regex assertions). Files: `web/functions/api/fmp-fundamentals.js`, `web/functions/api/fmp-history.js`, `web/functions/api/fmp-health.js`, `web/trading-lab.html`, deleted `web/functions/api/auth/check.js`, `tests/fmp_endpoint.test.mjs`, `tests/fmp_history.test.mjs`, new `tests/fmp_health.test.mjs`, and `tests/stock-brain-dashboard.test.mjs`.
- FMP naming: `FMP_API_KEY` is the canonical binding and now takes precedence over the legacy `FMP_API_KEY2` fallback. User-facing diagnostics instruct only `FMP_API_KEY`. Existing fallback remains solely for backward compatibility. README already documents `FMP_API_KEY`.
- Operator-token handling: removed the non-authoritative login facade that hard-coded a username and stored the token in sessionStorage. The protected research/sync actions continue to prompt at invocation and send the token only in the Authorization header; no browser storage is used. The server-side operator-token check remains on each protected endpoint.
- PR: #103, branch `northstar/research-council-status-dashboard`, open/non-draft/mergeable at exact head `ca194c341fc1a047b6f41fb3b647e4c34fd615df`, 135 commits ahead / 0 behind main `d1c9b964204c89639bf1c13d511e75d9c398d51f`. No formal reviews or review requests exist. GitHub reports `main.protected=false`; branch-protection/ruleset requirements are not confirmed. Do not merge without independent review and governance confirmation.
- Exact-head CI at `ca194c341fc1a047b6f41fb3b647e4c34fd615df`: Tests `42729352620` PASS; companion push Tests `42729345828` PASS; Validate AI Stock Advisor `42729352608` PASS; full-history secret scan `42729352614` PASS. An intermediate test-only commit `5b3e6e7` initially failed because its regex assertions were over-escaped; the failure was inspected from run `42729244232`, corrected in `ca194c3`, and the exact-head suite is green.
- Preview deployment for application code commit `5b3e6e7dccdfe75c4ab7906e851d0d3dd7806710`: Pages deployment `765edcdc-7343-4135-9832-b7b3141293ec`, URL `https://765edcdc.ai-stock-advisor.pages.dev`, deploy stage SUCCESS, `uses_functions=true`, isolated Preview D1 binding `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. Later test-only head `ca194c3` was correctly skipped by the Pages path filter.
- Preview runtime smoke (read-only): `/trading-lab.html` returned HTTP 200; Stock Brain workspace remains visible and the client-side login overlay/hard-coded username is absent. `/api/paper/readiness` returned HTTP 200 with `configured=true`, `policyVerified=true`, `mode=paper`, `executionEnabled=false`, `killSwitchEngaged=true`, virtual capital $1,000, default risk $5, max risk $10 and max position $250. `/api/fmp-health` returned HTTP 503 `MISSING_BINDING`; `/api/fmp-fundamentals?ticker=NVDA` returned HTTP 503 `configured=false` with the corrected `FMP_API_KEY` instruction. This is evidence that Preview lacks the binding, not evidence of an FMP provider outage. No authenticated collector request was made.
- Cloudflare Pages variable-name read-back: Production has `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `FMP_API_KEY`, `GEMINI_API_KEY`, `NORTHSTAR_OPERATOR_TOKEN`; Preview currently has only `NORTHSTAR_OPERATOR_TOKEN`. Secret values are write-only/redacted and were not read, copied, changed or committed. Preview still lacks FMP, Alpaca and Gemini provider bindings.
- Deployment state: latest successful Production Pages deployment remains `921087a4-6194-4a67-ac61-2f8557edb0bc` on older main commit `57aa9f0743917401dd0e3e90521fc39c22bd9f55`. The newer Production deployment for main `d1c9b964...` was skipped by `path_config`; no Production deployment was made by this work. Preview/Production D1 bindings remain isolated.
- D1 schema/read-only state: Production `northstar-paper-ledger` (ID `528f3a23-1d1f-4d16-8463-f643d85f5deb`) migration ledger `0001`–`0005`; Preview `northstar-preview` (ID `bdffc29f-a4f6-498e-ade7-22c85d9bd373`) migrations `0001`–`0012`. Production counts: 41 monitor runs, 0 monitor quotes, 0 monitor events, 0 research council runs, 0 decision traces, 1 equity snapshot, 0 paper orders, 0 positions, 0 intents, 0 broker fill activities, 0 trade events, 2 audit rows. Preview research runs and equity snapshots remain 0. No D1 writes, schema changes or migrations occurred.
- Production controls: `enabled=0`, `mode=paper`, `kill_switch=1`, `max_portfolio_usd=1000`, default risk 0.5%, max risk 1%, max position 25%. Sole equity snapshot is `2026-11-08T18:34:38.720Z`, $100,000 broker-paper equity (not the $1,000 virtual allocation); it is stale and no seven-day baseline exists.
- Monitor/Worker: cron remains `*/5 * * * *`; Worker deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` remains at 100%. Latest monitor run #41 at `2026-11-10T00:25:53Z` was `market_closed`, 0 symbols checked, 0 errors. No quote/event rows exist.
- Collector gates: research collection reconciles broker/D1 state before a read-only sync, then requires a fresh snapshot (15-minute limit), a genuine seven-day baseline, no open broker orders, reconciled positions, timestamped quote, at least 60 daily bars, usable fundamentals and model-provider credentials. Missing Preview Alpaca credentials stop the collector before FMP; Preview also lacks FMP and Gemini. Do not bypass these checks.
- Strategy/paper status: strategy validation remains NOT APPROVED; point-in-time universe/fundamental availability, four-fold chronological walk-forward, untouched holdout, >=100 completed trades and independent review are not complete. Validated BUY remains disabled. Paper lifecycle remains NOT READY because partial-fill cancellation/recovery, independently verified protective-stop/flatten handling and full fill-derived accounting are incomplete. No paper or live order was submitted.
- Safety impact/database changes: only PR code/tests/docs and Preview deployment changed. No Production secret/config changes, Production deployment, D1 write/migration, broker request, order, position mutation or execution-control change occurred. Production remains paper-only, execution disabled and kill switch engaged.
- Complete: canonical FMP binding behavior is tested; unsafe client-side login/token persistence is removed; exact-head CI passes; Preview Pages Functions and the read-only readiness endpoint are verified; Preview D1 isolation remains verified.
- Remaining blockers: securely configure Preview `FMP_API_KEY`, `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` and `GEMINI_API_KEY`; establish and verify a fresh reconciled seven-day equity history via an approved read-only schedule; run one authenticated research-only acceptance and verify the durable nine-role trace/scorecard/telemetry; obtain independent PR review and confirm branch governance; resolve repository visibility discrepancy (GitHub API reports public while user/README context says private). Do not change repository visibility without explicit authorization.
- Exact next action: after Preview secrets are securely present, verify the FMP health endpoint and read-only Alpaca reconciliation/sync without changing execution controls; establish a genuine seven-day baseline and verify the scheduled workflow actually ran; only then perform one authenticated research-only Stock Brain collection and read back its durable nine-role result, scorecard and telemetry. Keep PR #103 unmerged until independent review/governance pass. No paper orders.


## 2026-11-10 05:42 PKT — Stock Brain exact-head, provider and governance audit

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE; no scanner work was restarted.
- Objective: revalidate the latest PR/Preview/Production state, verify the FMP failure mode with live read-only probes, and correct unsupported repository-visibility assertions in current documentation.
- Repository/PR: main is `d1c9b964204c89639bf1c13d511e75d9c398d51f`. PR #103 (`northstar/research-council-status-dashboard`) was at application/documentation head `661fc8ca06ad505938adf97cf6c0670802ae5a3e` before this documentation refresh; comparison is 136 commits ahead / 0 behind, open, non-draft and mergeable. No formal reviews or review threads exist. The main-branch protection endpoint returned HTTP 403 to this integration, so required-review/status-check enforcement is not independently verified. Do not merge on green CI alone.
- Exact-head CI at `661fc8ca06ad505938adf97cf6c0670802ae5a3e`: Tests run `42729675713` PASS (companion Tests run `42729666713` PASS); Validate run `42729675701` PASS; full-history secret scan `42729675765` PASS. Jobs reported completed/success.
- Preview deployment: Pages deployment `d2e6429a-844d-42fb-8e6a-73f9938fdabf`, URL https://d2e6429a.ai-stock-advisor.pages.dev, exact commit `661fc8ca06ad505938adf97cf6c0670802ae5a3e`, deploy SUCCESS with Pages Functions. Live Firecrawl smoke: `/trading-lab.html` HTTP 200; HTML contains the Stock Brain workspace root, scorecard panel and run control; the operator token is prompted at invocation; no localStorage/sessionStorage usage was found in the served HTML. This verifies the static workspace and deployment, not an authenticated research run.
- Preview provider routes: `/api/fmp-health` HTTP 503 `MISSING_BINDING`; `/api/fmp-fundamentals?ticker=NVDA` HTTP 503 `configured=false`; `/api/alpaca/status` HTTP 503 for missing Alpaca credentials. Cloudflare's saved Preview secret inventory contains only `NORTHSTAR_OPERATOR_TOKEN`; `FMP_API_KEY`, Alpaca Paper credentials and `GEMINI_API_KEY` are absent. No secret values were read.
- Production FMP: Cloudflare reports the canonical `FMP_API_KEY` binding exists as a secret, but live `/api/fmp-health` returns HTTP 502 `FMP_REJECTED` with upstream HTTP 401 `Invalid API KEY`. `/api/fmp-fundamentals?ticker=NVDA` returns HTTP 200 but `available=false`, zero of five requested datasets, and HTTP 401 for income, balance sheet, cash flow, metrics and ratios. The key is configured but currently rejected by FMP; do not describe the provider as connected. The value was not read, copied, changed or logged. Any key visible in screenshots must be rotated before reuse.
- Production safety endpoint: `/api/paper/readiness` HTTP 200, configured/policy verified, mode=paper, execution disabled, kill switch engaged, virtual allocation $1,000, planned risk $5, max risk $10, max position $250.
- Pages release/config: latest successful Production Pages deployment remains `921087a4-6194-4a67-ac61-2f8557edb0bc` serving older main commit `57aa9f0743917401dd0e3e90521fc39c22bd9f55`. Newer main deployment `6c3c67bd-94e2-4606-a2ac-e62c6e19a0d3` is still idle; no Production deployment was made. Production secret names include Alpaca ID/secret, FMP, Gemini and operator token; Preview contains only operator token.
- D1 read-only evidence: Production migrations `0001`–`0005`; Preview migrations `0001`–`0012`. Production has 44 monitor runs (latest 8 all `market_closed`, 0 symbols checked, 0 errors), 0 monitor quotes/events, 0 council runs/traces, one stale equity snapshot (`2026-11-08T18:34:38.720Z`), and 0 intents/orders/positions/fills/trade events. Preview has no equity snapshots, monitor rows or council runs/traces. Every D1 query reported zero rows written and `changed_db=false`; no migrations or schema changes occurred.
- Monitor: `northstar-market-monitor` cron remains `*/5 * * * *`; Worker deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` remains at 100%. Latest observed run #44 at `2026-11-10T00:40:53Z` was `market_closed`, 0 symbols checked, 0 errors. No market-open quote cycle is verified.
- Strategy/paper state: strategy validation remains NOT APPROVED and validated BUY remains disabled. Production controls remain `enabled=0`, `mode=paper`, `kill_switch=1`. No broker request, order, position mutation or execution-control change occurred. Paper lifecycle recovery gaps remain open.
- Repository visibility correction: GitHub API reports `visibility=public`, while the user states the repository should be private. This remains unresolved. Treat all repository contents as publicly accessible until GitHub Settings confirms the actual setting. Do not change visibility without explicit authorization. Earlier documentation statements that the user explicitly confirmed public visibility are unsupported and are superseded by this correction.
- Safety/database impact: all Cloudflare/D1 work in this audit was read-only; no D1 writes/migrations, Production deployments/config changes, secret reads/changes, broker requests, paper/live orders or execution-control changes occurred.
- Complete: exact-head CI, exact-head Preview deployment, Stock Brain workspace/scorecard/run-control markup, and Preview/Production provider failure modes are independently evidenced. This is implementation + CI + Preview verification only; no authenticated collection, strategy validation or approval is claimed.
- Blockers: rotate and securely configure a valid `FMP_API_KEY` in Production and Preview; securely configure Preview Alpaca Paper and Gemini secrets; establish fresh reconciled seven-day equity history (Production has one stale snapshot; Preview has none); run one controlled authenticated research-only collection only after all gates pass; obtain independent PR review and authorized branch-governance confirmation; resolve visibility in GitHub Settings.
- Exact next action: do not merge PR #103 or attempt authenticated collection yet. After valid server-side credentials and a genuine seven-day portfolio baseline exist, verify read-only broker reconciliation, then run one stable-request-ID research-only collection and read back all nine roles, scorecard, telemetry and durable trace. Keep paper execution disabled and kill switch engaged.
