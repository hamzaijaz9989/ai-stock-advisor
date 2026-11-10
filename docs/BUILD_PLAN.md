# Build Plan

## Current phase status — 2026-11-10

- Universe scanning: **COMPLETE and user-confirmed tested**. Do not rebuild it without a concrete regression.
- Nine-agent Research Council / Stock Brain: **implementation and dashboard integration in PR #103**, awaiting merge and production acceptance. The nine roles are implemented; durable trace persistence and dashboard result rendering are covered by CI.
- Strategy validation: **NOT APPROVED**. Validated BUY remains disabled until real point-in-time data, frozen rules, walk-forward and holdout evidence, realistic costs, and independent review exist.
- Paper lifecycle: **NOT COMPLETE**. Execution remains disabled and kill switch engaged. No paper or live order may be submitted.

Immediate next sequence: keep PR #103 open for independent review and governance confirmation; its branch is synchronized with latest main, exact-head CI passes, and its Preview deployment is successful. Do not merge until review/governance gates pass. Separately resolve provider credentials and the fresh/reconciled seven-day portfolio baseline; then run one controlled research-only council collection and verify idempotent replay. Strategy validation remains a later, separate phase.

## Product contract

- Market: US-listed equities (NYSE/Nasdaq).
- Purpose: long-term investing research and decision support.
- Execution: research and signals only; no order placement.
- Initial infrastructure budget: $0.
- No promised win rate or return.
- Missing or invalid data must lower confidence or block a score.

## Milestone 1 — Financial metric primitives

- [x] Establish Python package and test configuration.
- [x] Add deterministic functions for growth, margins, net debt, CAGR and weighted scores.
- [x] Test undefined inputs and insufficient score coverage.
- [ ] Run tests in a local Python environment / CI.

## Milestone 2 — Data contracts and SEC adapter

- Define a normalized observation schema with ticker, CIK, metric, value, units,
  period end, filing/publication date, source URL, accession number and retrieval time.
- Fetch company submissions and XBRL company facts from official SEC endpoints.
- Respect SEC fair-access guidance, use a descriptive User-Agent, cache responses,
  and avoid excessive request rates.
- Keep raw responses separate from normalized data.
- Never treat fiscal period-end as the date the public could first know the result.

## Milestone 3 — Historical price adapter

- Add a replaceable provider interface for daily adjusted prices.
- Store source, retrieval timestamp, adjustment basis and missing-data flags.
- Check split/dividend adjustments, duplicate sessions, impossible values and gaps.
- Document free-tier delays, quotas and usage terms. Do not imply free data is
  suitable for unrestricted redistribution.

## Milestone 4 — Fundamental analysis

- Revenue and earnings growth, margins, free cash flow, debt and dilution.
- Compare multi-year trends, not just one quarter.
- Distinguish unavailable data from zero.
- Use sector-appropriate comparisons and avoid a single metric for every industry.

## Milestone 5 — Valuation and research report

- Select valuation methods appropriate to business economics.
- Record bear/base/bull assumptions and sensitivity ranges.
- Cite filings and source dates for factual claims.
- Clearly label interpretation, uncertainty and missing evidence.
- A score is a ranking aid, not a probability of profit.

## Milestone 6 — Backtesting and portfolio analysis

- Define the investment rules before looking at holdout results.
- Use point-in-time fundamentals and historical constituents where available.
- Prevent look-ahead, survivorship and selection bias.
- Include dividends, corporate actions, turnover and realistic costs.
- Compare total return and risk metrics with a suitable benchmark.
- Use walk-forward and untouched holdout periods; log all experiments.

## Milestone 7 — News monitoring

- [x] Add best-effort Yahoo Finance RSS and Google News RSS headline discovery endpoint.
- [x] Display linked headlines and source labels in the dashboard.
- [ ] Verify material claims against SEC filings and investor-relations releases.
- [ ] Add deduplication, relevance/event classification, stale-news handling, and point-in-time news storage.
- [ ] Test whether news improves out-of-sample results after costs before it can influence a signal.

## Milestone 8 — Live quote and ranking\n\n- [x] Add best-effort Yahoo Finance quote endpoint with provider timestamp and delayed-data warning.\n- [x] Display selected ticker quote and manual refresh control.\n- [ ] Validate quote availability, stale-data detection and provider terms.\n- [ ] Add historical prices and transparent fundamental/valuation/risk score.\n- [ ] Populate a ranked top-five opportunity list only after data and validation gates pass.\n- [ ] Show valuation-based entry zones, thesis-invalidating exit conditions and scenario ranges, not guaranteed prices.\n\n## Milestone 9 — Dashboard and monitoring

- Searchable watchlist and research reports.
- Evidence links, data freshness and quality warnings.
- Portfolio exposure and concentration analysis.
- Recommendation history and thesis review reminders.

## Non-negotiable safety rules

1. No brokerage credentials or order-placement functionality in this project.
2. Do not fabricate financial figures, citations, probabilities or backtest results.
3. Fail closed when critical data is stale, invalid or unavailable.
4. Do not optimize for win rate alone; evaluate risk, drawdown and returns after costs.
5. Record material methodology changes and rerun tests.


## Status overlay — 2026-11-10

- **Milestone 1 / universe scanning:** complete and tested, confirmed by the user. Do not restart this milestone unless a concrete regression is demonstrated.
- **Current active milestone / nine-agent Research Council (Stock Brain):** nearly complete. The nine logical roles are Market Scanner, Technical Analyst, Fundamental Analyst, News Analyst, Sentiment Analyst, Bull Researcher, Bear Researcher, Portfolio Analyst and deterministic Risk Committee. Finish end-to-end wiring, durable traces, dashboard visibility, exact-head tests and preview verification.
- **Strategy validation:** not approved; validated BUY remains disabled. Software tests and agent scorecards do not prove predictive performance.
- **Paper lifecycle:** not ready; execution remains disabled and kill switch engaged. No paper or live test orders.
- For the full phase order, acceptance workflow and session handover rules, see [Northstar Project Handbook](NORTHSTAR_PROJECT_HANDBOOK.md).


## Current execution checkpoint — 2026-11-10

- Repository visibility is unresolved: GitHub API reports public while the user states private. Treat contents as publicly accessible until GitHub Settings confirms the actual setting; do not change visibility without explicit authorization.
- Universe scanning remains complete and tested; do not rebuild it without a demonstrated regression.
- Nine-agent Stock Brain code and dashboard integration are combined in open, non-open PR #103 at head `5b39a9b888a6ccb7ba9a2074668cc73cee2e149a`. Exact-head CI passed (Cloudflare Pages, Tests, Validate AI Stock Advisor and full-history secret scan). Cloudflare preview deployment `a1c5704f-7bea-4ca4-a252-c6b049b5857b` succeeded at https://a1c5704f.ai-stock-advisor.pages.dev; live preview endpoint/UI smoke test remains outstanding because both web browsing and Cloudflare execution environments block outbound requests to the Pages host with tool-level 403.
- PR #103 is not merged or production-deployed. Do not treat CI or preview deployment as production acceptance.
- Production D1 currently has zero Research Council runs and one stale equity snapshot. The collector's fresh-snapshot and seven-day-history requirements are not satisfied. Controls remain paper mode, execution disabled, kill switch engaged.
- **Next goal:** complete a real preview runtime smoke test and protected collector auth/failure checks; then finish review and decide on safe merge. Separately establish fresh scheduled read-only equity snapshots and a seven-day baseline before any controlled research-only run with durable replay verification. No orders.
- **After Stock Brain acceptance:** begin the point-in-time strategy-validation milestone. Validated BUY remains disabled until independent evidence gates pass.


## 2026-11-10 — Latest autonomous Stock Brain acceptance checkpoint

- Repository visibility is unresolved; treat contents as publicly accessible until GitHub Settings confirms the actual setting.
- PR #103 is open and non-draft at head `5b39a9b888a6ccb7ba9a2074668cc73cee2e149a`; exact-head CI is green and Cloudflare preview deployment succeeded at https://a1c5704f.ai-stock-advisor.pages.dev.
- Live HTTP/UI smoke testing remains outstanding due to the connected browsing layer's inability to reach the Pages host. Deployment success is not runtime acceptance.
- Next task: verify preview dashboard/status/auth paths in an authorized browser, then complete review and safe merge decision. No production deployment or DB mutation has been made.


## Provider configuration incident — 2026-11-10

- Confirmed the current preview deployment is missing provider secrets that exist in Production. Production declares Alpaca key ID/secret, FMP_API_KEY2 and GEMINI_API_KEY; Preview declares only NORTHSTAR_OPERATOR_TOKEN.
- This is why the preview Alpaca read-only sync fails and why FMP requests cannot authenticate. The research collector attempts Alpaca sync first and exits on failure before it reaches FMP.
- Do not infer provider credentials are broken in Production. The audit did not modify or expose Production secrets.
- Next: provision the existing provider secret values into Cloudflare Pages Preview, redeploy, then validate read-only Alpaca and FMP endpoints independently. Gemini must also be configured for the council model adapter if required.
- Secret values are write-only/redacted in the Cloudflare API and cannot be cloned automatically by this connection. Keep them out of GitHub, chat, logs and documentation.
- No trading or execution changes. Paper execution remains disabled and kill switch engaged.


## 2026-11-10 — Assistant-caused Preview secret regression

- Root cause correction: during operator login setup, the assistant patched Cloudflare Pages Preview `env_vars` with only `NORTHSTAR_OPERATOR_TOKEN`, replacing the existing Preview environment-variable map. This removed Preview Alpaca, FMP and Gemini bindings and explains the provider outage after the login configuration change.
- This was an assistant-introduced regression. Production bindings remain present; Preview secret values are write-only and cannot be recovered from current Cloudflare configuration.
- Recovery work: inspect pre-change deployment snapshots and existing CI/CD secret stores for secure copies; never overwrite Production or commit credentials. If no secure copy is recoverable, an authorized owner must re-enter the original values.
- Do not claim restoration until read-only Alpaca and FMP tests pass independently. No orders or execution changes.


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


## 2026-11-10 05:10 PKT — Active milestone status overlay

- Universe scanning remains user-confirmed COMPLETE; no scanner rebuild was performed.
- Nine-agent Research Council / Stock Brain: implementation, dashboard visibility, exact-head CI and exact-head Preview deployment are verified. Preview D1 isolation is now verified in deployment metadata. Phase 2 is not yet accepted as complete because no authenticated research-only acceptance run has been performed.
- Preview/Production database isolation: `web/wrangler.toml` uses `env.preview` and `env.production` overrides; the regression test is `tests/pages-d1-environment-isolation.test.mjs`. Code commit `40beb6ae05543ff62411f4173dabc282d7534753`, PR #103. Tests `42725930803`, Validate `42725930456`, secret scan `42725930551`; Preview deployment `dea395bb-27ae-4795-afda-9692960340f1` succeeded with the isolated Preview D1 ID.
- FMP credential name is `FMP_API_KEY` (not `FMP_API_KEY2`). Preview currently lacks FMP, Alpaca Paper and Gemini secrets; secret values are never stored in Git or documentation.
- Production remains unchanged: 37 monitor runs, no quotes/events, no council runs/traces, one stale equity snapshot, no intents/orders/positions/fills/trade events; execution disabled and kill switch engaged. Preview DB is empty and already migrated through 0012; Production is migrated through 0005. No migrations or D1 writes occurred.
- Next: securely configure required Preview secrets, establish a genuine fresh/reconciled seven-day equity baseline, perform a controlled authenticated research-only collection, then verify durable run/trace/scorecard/telemetry. Independent review and branch-governance confirmation remain merge gates. Strategy validation remains NOT APPROVED; paper execution stays disabled.


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


## 2026-11-10 05:42 PKT — Stock Brain audit refresh

- Universe scanning remains user-confirmed COMPLETE; no scanner rebuild.
- PR #103 application head `661fc8ca06ad505938adf97cf6c0670802ae5a3e` is 136 commits ahead / 0 behind main `d1c9b964204c89639bf1c13d511e75d9c398d51f`, open, non-draft and mergeable. Exact-head Tests `42729675713` and `42729666713`, Validate `42729675701`, and secret scan `42729675765` passed. Preview deployment `d2e6429a-844d-42fb-8e6a-73f9938fdabf` succeeded; live Trading Lab HTML smoke returned HTTP 200 and contains the Stock Brain workspace, scorecard panel and run control.
- Preview FMP health returns 503 missing binding; Preview Alpaca status returns 503 missing credentials. Production FMP health is rejected by provider with HTTP 401 invalid API key; fundamentals return zero of five datasets. Do not call FMP connected.
- Production D1 migrations 0001–0005; Preview 0001–0012. Production has 44 monitor runs, all recent runs market-closed, zero quotes/events, zero council runs/traces, one stale equity snapshot and zero paper orders/positions/intents/fills. Preview has no equity snapshot or council runs. No D1 writes/migrations occurred.
- Production controls remain disabled/paper/kill-switched. Strategy validation remains NOT APPROVED; BUY remains disabled. Paper execution remains disabled.
- Repository visibility is unresolved: GitHub API reports public while the user states private. Treat repository contents as publicly accessible until Settings confirms the actual setting. Do not change visibility without explicit authorization.
- Phase 2 is implemented, CI-passed and Preview-verified, but not accepted: provider credentials and a genuine fresh/reconciled seven-day equity history are missing; no authenticated research-only run has been performed; PR #103 has no independent review and branch protection cannot be verified (API 403).
- Exact next action: after valid server-side FMP/Alpaca/Gemini credentials and a genuine seven-day baseline are available, perform read-only broker reconciliation, then one authenticated research-only collection and verify all nine roles, scorecard, telemetry and durable trace. Do not merge or deploy Production before independent review/governance. No paper orders.


## 2026-11-10 06:32 PKT — PR synchronization and live-readiness audit

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE and tested; no scanner rebuild or reprioritization occurred.
- Objective: synchronize the Stock Brain PR with the latest main commit, re-run exact-head CI, verify the Preview deployment, and refresh live D1/configuration evidence before the next acceptance step.
- Repository/PR: latest main is `839e135dad88849350a7f6f61c929ee8ce4bc046` (scheduled cached-shortlist refresh; its only changed path is `web/data/top-stocks-cache.json`). PR #103 branch was 142 commits ahead / 1 behind. The PR did not modify that cache file, so the current main file was incorporated without conflict using merge commit `60ac08784e40eabf7e03575a2c35aff02f4f987f`. PR #103 is now 143 commits ahead / 0 behind, open, non-draft and mergeable. No formal reviews or review threads exist. Branch-protection read remains unavailable to this integration (HTTP 403); do not merge without independent review and authorized governance confirmation.
- Exact-head CI for `60ac08784e40eabf7e03575a2c35aff02f4f987f`: Tests run `42737081973` PASS; Validate run `42737081792` PASS; full-history secret scan run `42737081766` PASS. Test workflow completed Python tests, JavaScript API/evidence-score tests, scanner syntax check and lint. Validate completed Python tests/lint, frontend and Pages Function syntax, frontend logic tests, paper-readiness endpoint test, SEC ingestion tests and synthetic validation smoke. Secret scan checked all reachable refs/history and passed.
- Preview deployment: Cloudflare Pages deployment `1b08a44a-da02-4525-bb34-4003fd350332`, URL https://1b08a44a.ai-stock-advisor.pages.dev, exact commit `60ac08784e40eabf7e03575a2c35aff02f4f987f`, status SUCCESS, `uses_functions=true`. This is Preview verification only; no Production deployment was made from PR #103. Current Production Pages deployment is `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365`, serving main commit `839e135dad88849350a7f6f61c929ee8ce4bc046`.
- Cloudflare Pages secrets (names/types only; no values read): Preview has only `NORTHSTAR_OPERATOR_TOKEN`. Production has `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `FMP_API_KEY`, `GEMINI_API_KEY`, and `NORTHSTAR_OPERATOR_TOKEN`. Preview still lacks FMP, Alpaca Paper and Gemini bindings. Production FMP secret exists by name, but the last live probe at 05:42 PKT returned upstream HTTP 401 `Invalid API KEY`; this run did not re-probe the provider endpoint, so it is not described as connected.
- D1 read-only audit: Production database `northstar-paper-ledger` migrations `0001`–`0005`; 54 monitor runs, 0 monitor quotes, 0 monitor events, 0 research council runs, 0 decision traces, 1 equity snapshot, 0 paper orders, 0 paper positions, 0 intents, 0 broker fills, 0 paper trade events, and 2 audit rows. The sole snapshot remains `2026-11-08T18:34:38.720Z` (USD 100,000 broker account equity; not the $1,000 virtual allocation). Production control remains `enabled=0`, `mode=paper`, `kill_switch=1`, allocation $1,000, default risk 0.5%, maximum risk 1%, maximum position 25%.
- Preview database `northstar-preview` migrations `0001`–`0012`; zero monitor runs/quotes/events, zero council runs/traces, zero equity snapshots, zero paper orders/positions/intents/fills/events, and zero audit rows. Preview remains isolated from Production. Every D1 query was SELECT-only; all returned `changed_db=false` and `rows_written=0`.
- Monitor: Worker `northstar-market-monitor` cron remains `*/5 * * * *`; deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` remains at 100%. Latest Production run #54 at `2026-11-10T01:30:52Z` was `market_closed`, 0 symbols checked, 0 errors. No market-open quote cycle is verified; monitor work is not being restarted.
- Strategy/paper status: `docs/STRATEGY_VALIDATION_STATUS.md` remains NOT APPROVED; validated BUY remains disabled. Paper lifecycle remains incomplete; execution is disabled and kill switch engaged. No broker call, paper order, live order, execution-control change, Production migration, Production D1 write, secret read/change or Production deployment occurred.
- Repository visibility: GitHub API still reports `visibility=public`, while the user states the repository should be private. This remains unresolved; treat repository contents as publicly accessible until GitHub Settings confirms the actual setting. No visibility change was attempted. README now states this discrepancy accurately.
- Complete: PR branch is synchronized with main; exact-head Tests/Validate/secret scan passed; exact-commit Preview deployment succeeded with Pages Functions; Production and Preview D1 isolation, migration ledgers, controls and row counts were rechecked. This is implementation + CI + Preview verification, not an authenticated Research Council acceptance run, strategy validation or approval.
- Blockers: independent PR review and authorized branch-governance confirmation; valid FMP credential accepted by provider; separate Preview FMP/Alpaca Paper/Gemini credentials; fresh reconciled Production equity snapshots and genuine seven-day baseline; controlled authenticated research-only collection with durable replay verification. The last FMP provider probe rejected the configured Production key; no secret values were read.
- Exact next action: keep PR #103 open and unmerged. After the external credential and seven-day baseline gates are genuinely satisfied, verify read-only Alpaca reconciliation, then run one stable-request-ID research-only collection and read back all nine role outputs, deterministic vetoes, scorecard, actual telemetry and durable trace. Keep paper execution disabled, kill switch engaged and BUY disabled.
