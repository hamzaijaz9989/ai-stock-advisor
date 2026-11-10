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


## Governance confirmation — 2026-11-10 06:32 PKT
- GitHub GET `/branches/main` reports `protected=false`, `protection.enabled=false`, and required-status-check enforcement `off`. The separate branch-protection endpoint returns HTTP 403 `Resource not accessible by integration`; the connected integration cannot configure or independently inspect full protection rules.
- PR #103 has no formal review submissions and no inline review threads. PR is open, non-draft and mergeable, but that is not a substitute for review or required checks.
- No branch protection, repository setting, code, CI workflow, deployment, D1 record, secret, broker state or execution control was changed by this governance read. Do not merge PR #103 until an authorized owner enables the required governance and an independent reviewer submits a review.


## 2026-11-10 06:43 PKT — fail-closed research sync confirmation

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains COMPLETE; no scanner work was restarted.
- Objective: harden the collector's read-only Alpaca sync boundary so HTTP success alone cannot be mistaken for a successful snapshot sync.
- Code change: commit `836af49b50a4ebb795a58d5c6c16af84104191c5` in PR #103 adds `requireReadOnlySyncSuccess` in `web/functions/api/research/collect.js`. Before portfolio evidence is used, the collector now requires an HTTP-success response whose JSON explicitly has `ok=true`, `synced=true`, and `execution=false`; malformed JSON, missing/false flags, `execution=true`, or a non-2xx response fail closed. `tests/research-collector.test.mjs` adds regression coverage for all of those cases.
- Exact-head CI on `836af49b50a4ebb795a58d5c6c16af84104191c5`: Tests run `42737755311` PASS; Validate run `42737755067` PASS; full-history secret scan run `42737755081` PASS.
- Preview deployment: `4b74fa23-a7fd-4e17-86fd-d1fcbd4c0552`, URL https://4b74fa23.ai-stock-advisor.pages.dev, exact code commit `836af49b50a4ebb795a58d5c6c16af84104191c5`, deploy SUCCESS, Pages Functions enabled. This is Preview verification; no Production deployment occurred.
- PR #103 remains open, non-draft and mergeable; code head was 146 commits ahead / 0 behind main `839e135dad88849350a7f6f61c929ee8ce4bc046` before this documentation-only follow-up. No formal reviews or review threads exist. GitHub main branch reports `protected=false`, `protection.enabled=false`, and required-status-check enforcement `off`; branch-protection endpoint returns 403 to the connected integration. Do not merge until an authorized owner enables governance and an independent reviewer submits a review.
- Cloudflare configuration remains: Preview only has `NORTHSTAR_OPERATOR_TOKEN`; Production declares Alpaca ID/secret, `FMP_API_KEY`, Gemini and operator token. No secret values were read or changed. Last observed Production FMP probe at 05:42 PKT was upstream HTTP 401 `Invalid API KEY`; no provider endpoint was re-probed during this code change.
- D1 evidence remains the 06:32 PKT read-only audit: Production migrations `0001`–`0005`, one stale equity snapshot, 0 council runs/traces, 0 paper orders/positions/intents/fills; Preview migrations `0001`–`0012` and empty research/portfolio tables. Production controls remain disabled/paper/kill-switched. No D1 writes/migrations, broker requests, secret changes, Production configuration changes, or orders occurred in this work item.
- Strategy validation remains NOT APPROVED; validated BUY remains disabled. Paper lifecycle remains incomplete. No authenticated research collection or order was attempted.
- Complete: the collector now verifies explicit read-only sync success semantics; regression tests, exact-head CI and Preview deployment pass. This is not a full Research Council acceptance run or Production verification.
- Blockers: valid provider credentials (Preview FMP/Alpaca Paper/Gemini; Production FMP key was previously rejected), fresh reconciled seven-day equity baseline, independent PR review, and authorized branch governance. Repository visibility remains unresolved (GitHub API public vs owner intent private); treat source as public until GitHub Settings confirms otherwise.
- Exact next action: keep PR #103 unmerged. Once credentials and a genuine seven-day baseline are verified, perform read-only reconciliation followed by one controlled research-only collection; verify all nine roles, deterministic veto, scorecard, actual telemetry and durable replay. Keep execution disabled, kill switch engaged and BUY disabled.


## 2026-11-10 06:47 PKT — seven-day snapshot workflow dependency audit

- Phase: Phase 2 — Stock Brain acceptance prerequisites. Universe scanning remains COMPLETE; no scanner rebuild.
- Objective: inspect the open read-only snapshot automation PRs that could establish the missing seven-day equity baseline.
- PR #88 `northstar/github-oidc-readonly-sync` is OPEN and DRAFT, head `59b354f4feb1b4a8871980489f4dc190cef54fae`, currently 26 commits ahead / 13 behind main `839e135dad88849350a7f6f61c929ee8ce4bc046`, with no formal reviews. Its description explicitly depends on PR #85's `safeToContinue` / `requiresManualRecovery` fill-import contract and says the branch must be reconciled after #85. Exact-head Tests `42690358362` and Validate `42690358816` passed on that older head; this does not validate the current main combination.
- PR #85 `northstar/paper-execution-risk-controls` is OPEN and DRAFT, head `d540184d622bb910ca29e6f55ff3e6f4530a4d78`, currently 490 commits ahead / 6 behind main, and GitHub reports mergeable=false. It has no formal reviews. Its exact-head Tests `42704079093`, Validate `42704078787`, and full-history secret scan `42704078818` passed, but it is not current-main-synchronized or release-approved.
- PR #85 and #88 overlap `.github/workflows/northstar-equity-snapshot.yml` and `web/wrangler.toml`; #85 also owns the newer fill-sync/manual-recovery response contract required by #88. Do not merge either PR or weaken #88's manual-recovery guard. Reconcile #88 only after #85 has been safely updated/reviewed and the combined contract is tested.
- Main branch currently reports `protected=false`, `protection.enabled=false`, and required status-check enforcement `off`; independent reviews are absent. These are explicit governance blockers, not routine CI failures.
- Production D1 remains at migrations `0001`–`0005`, with one stale equity snapshot from `2026-11-08T18:34:38.720Z` and no genuine seven-day baseline. No schedule run was assumed; no Production D1 writes, migrations, broker requests, order actions or execution-control changes were performed in this audit.
- Complete: both snapshot PRs were inspected for current head, divergence, CI, files and review state. Neither is safe to merge or use as an operational schedule yet.
- Blockers: reconcile PR #85 with current main; independent review/governance; then update PR #88 onto the reviewed fill-sync contract and rerun exact-head CI/Preview verification. Only after release gates pass may a read-only scheduled sync establish the seven-day baseline.
- Exact next action: keep PRs #85 and #88 DRAFT and unmerged; continue Phase 2 Stock Brain work. Do not invoke the scheduled snapshot workflow or claim seven-day history until the reviewed combined workflow is deployed and actual snapshots are observed.


## Live status overlay — 2026-11-10 07:32 PKT / 02:32 UTC

- Phase 1 universe scanning remains **user-confirmed COMPLETE**; no scanner rebuild is planned.
- Phase 2 Stock Brain is **implemented**, **exact-head CI-passed**, and **Preview-deployed** on PR #103 head `e8bcba21ecfb56634345b1df219320fd026ec9a7`. Preview deployment `dd8ad047-343d-43d8-bf37-d520e1a0ca51` succeeded with Pages Functions and isolated Preview D1. Direct endpoint behavior was not verified because the connected web runtime could not access the Pages URLs.
- PR #103 remains open/non-draft/mergeable, 148 ahead / 0 behind main, but has zero formal reviews; main is unprotected and required checks are off. Do not merge until governance and independent review are satisfied.
- Production D1 has zero Research Council runs/traces and only one stale equity snapshot; Preview D1 is empty. The controlled authenticated research-only acceptance run has **not** occurred.
- Preview currently exposes only the operator-token secret name; FMP, Alpaca Paper and Gemini bindings are missing. Production FMP's last recorded provider probe was HTTP 401; no fresh probe was possible in this audit.
- Production execution remains disabled and kill-switched; strategy validation remains NOT APPROVED; validated BUY remains disabled. No paper or live order is permitted.
- Evidence commit under review: `e8bcba21ecfb56634345b1df219320fd026ec9a7`; PR #103. Exact-head CI: Tests `42738143198`, Validate `42738143199`, secret scan `42738143194` — all SUCCESS. Preview deployment: `dd8ad047-343d-43d8-bf37-d520e1a0ca51`. Production deployment: `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365` on main `839e135dad88849350a7f6f61c929ee8ce4bc046`.
- Database changes: **none**; all audit queries were read-only and reported zero rows written.
- Next: resolve independent review/governance and Preview credential gates, establish a genuine fresh seven-day read-only equity baseline through the reviewed #85/#88 workflow chain, then run and verify one authenticated research-only Stock Brain collection. Keep all execution controls unchanged.


## Final-head verification — 2026-11-10 07:32 PKT / 02:32 UTC

- Evidence/documentation head under verification: `2d608ad67523740f9597aa2b2f89173eda268af0` on PR #103; application code is unchanged from the previously reviewed Stock Brain implementation. PR branch compares 149 ahead / 0 behind main `839e135dad88849350a7f6f61c929ee8ce4bc046`.
- Exact-head CI completed SUCCESS: Tests `42743751591`; Validate AI Stock Advisor `42743751590`; full-history secret scan `42743751690`.
- Exact-head Preview deployment `a1cc2fe2-d8f7-46e7-8b07-8d34657a7188` completed SUCCESS for commit `2d608ad67523740f9597aa2b2f89173eda268af0`, Pages Functions enabled, Preview D1 `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. This was a documentation-only refresh; no Production deployment was attempted.
- Production remains on successful Pages deployment `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365` for main `839e135dad88849350a7f6f61c929ee8ce4bc046`.
- Database changes: none. The preceding Production/Preview D1 audit was read-only; all query metadata reported zero rows written and no database changes.
- Safety impact: none; no secret values read, no broker requests, no orders, no execution-control changes, no migrations, and no Production deployment.
- Remaining gates are unchanged: no formal independent PR #103 review or branch protection; Preview provider secrets absent; Production FMP last known probe HTTP 401 and not freshly re-tested; no fresh 15-minute or genuine seven-day equity baseline; no Research Council acceptance run; strategy approval false; execution disabled and kill switch engaged.
- Next exact action: resolve external review/governance and Preview credential gates, establish genuine scheduled read-only equity history through a reviewed #85/#88 dependency chain, then run one controlled authenticated research-only collection and verify all nine roles, scorecard, telemetry and durable `research_council_runs` replay.


## Citable context evidence hardening — 2026-11-10 08:38 PKT / 03:38 UTC

- **Phase/objective:** Phase 2, Stock Brain nine-agent council. Add first-class, immutable, citable portfolio-risk and deterministic resource-coverage facts so specialists can cite the supplied portfolio context and explicit missing-feed limitations rather than attaching them to unrelated market data.
- **Files changed:** `web/lib/research-council-facts.js`; `tests/research-council-resource-coverage.test.mjs`; `tests/research-council-facts.test.mjs`; this document set: `docs/NORTHSTAR_PROJECT_HANDBOOK.md`, `NORTHSTAR_BLOCKERS.md`, `docs/BUILD_PLAN.md`, `docs/STOCK_BRAIN_SPEC.md`, `web/docs/NORTHSTAR_RESEARCH_COUNCIL.md`.
- **Implementation commit:** `fd3cd83ce293855be8c1f7e0bfdc36aa95a4d896`; **PR:** #103, `northstar/research-council-status-dashboard`. Latest main remains `839e135dad88849350a7f6f61c929ee8ce4bc046`; branch is 151 ahead / 0 behind. PR is open, non-draft and mergeable, with zero formal review submissions. Main remains unprotected and required checks are off.
- **Tests/CI on exact implementation commit:** Tests `42750582722` SUCCESS; Validate `42750582827` SUCCESS; full-history secret scan `42750582747` SUCCESS. Test job ran Python tests, JavaScript API/evidence-score tests, scanner syntax and lint; validation job ran Python, lint, frontend/Pages syntax and logic tests.
- **Preview evidence:** Pages Preview deployment `8c6db09c-9d2b-44ec-a1f3-1980a38f4e6e` for the exact implementation commit completed every stage (queued, initialize, clone, build, deploy) with SUCCESS; URL `https://8c6db09c.ai-stock-advisor.pages.dev`. This verifies deployment only. External scraping of the public Pages HTML/API endpoints was blocked, so no endpoint HTTP response or controlled API acceptance is claimed. Production remains on deployment `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365` for main `839e135dad88849350a7f6f61c929ee8ce4bc046`.
- **Database evidence / changes:** Production and Preview D1 were inspected with SELECT-only queries. Production migration ledger is 0001–0005; the `northstar_strategy_approval` table is absent even though Preview has migrations 0001–0012 and the table. Production also has monitor tables but no recorded monitor migration, confirming schema-history drift; do not replay migrations blindly. Production: 1 equity snapshot at `2026-11-08T18:34:38.720Z`; 0 council runs, decision traces, intents, orders, positions, broker fills, trade events, quotes or monitor events; 78 monitor runs, all `market_closed`, zero symbols/errors, latest `2026-11-10T03:30:53.437Z`. Preview research, monitor and paper activity tables are empty; the execution-control row exists and remains disabled/kill-switched, and the strategy-approval row exists with `approved=0`. **Database writes/migrations: none.**
- **Credentials and endpoint evidence:** Production Pages secret-name inventory includes `FMP_API_KEY`, Alpaca Paper key names, `GEMINI_API_KEY`, and `NORTHSTAR_OPERATOR_TOKEN`; Preview lists only `NORTHSTAR_OPERATOR_TOKEN`. Secret values were not read. Production FMP's last known provider result remains HTTP 401 from the earlier probe; no fresh provider response was obtained in this run. Do not treat configured secret names as proof of valid credentials.
- **Safety impact:** none. No secret values, broker calls, orders, D1 writes/migrations, execution-control changes or Production deployment. Production controls remain `enabled=0`, `mode=paper`, `kill_switch=1`; Preview strategy approval remains false. No paper or live order was submitted; BUY remains disabled.
- **State separation:** portfolio and coverage facts are implemented, exact-head CI-passed and Preview-deployed. They are not endpoint-verified or acceptance-run-verified. The nine-agent authenticated collection remains pending; strategy validation is NOT APPROVED; paper lifecycle remains NOT READY.
- **Other open PRs:** #85 is draft, 490 ahead / 6 behind and not mergeable; #88 is draft, 26 ahead / 13 behind and mergeable but depends on #85's manual-recovery contract; #101 is draft, 1 ahead / 2 behind and not mergeable. No merge was attempted.
- **Exact next action:** resolve authorized independent review/branch governance and Preview credential setup; validate a rotated FMP key with a fresh provider response; investigate Production schema-history drift without applying migrations; establish genuine scheduled read-only equity history; then perform one controlled authenticated research-only council run and verify all nine roles, cited coverage/portfolio facts, scorecard, telemetry and durable `research_council_runs` replay. Keep execution disabled, kill switch engaged and BUY disabled.


## Phase 2 — point-in-time evidence chronology hardening (2026-11-10 09:40 PKT)

- [x] Capture the Research Council as-of timestamp after quote/fundamental/history/news/earnings provider snapshots return.
- [x] Exclude same-day date-only SEC filings unless exact verified public availability is at or before as-of.
- [x] Require FMP snapshot retrieval no later than as-of and accepted-time/prior-day filing-date evidence for statement rows; explicitly label provider timestamps as unverified public availability.
- [x] Add regression coverage for SEC/FMP chronology, same-day filings, provider retrieval cutoffs and collector sequencing.
- [x] Exact-head CI passed on `8cd95d81c613e9b987a41359e55fc740e13010bc`: Tests `42757286985`, Validate `42757287170`, secret scan `42757286961`, push Tests `42757282017`.
- [x] Preview application code deployed successfully as `ad694418-abfb-41d1-ba16-b7806ccd51ce` for `dea731e59a56632f1162b41c48cbf1562b12d260`; test-only follow-up deployment skipped by Pages `path_config`.
- [ ] Complete authenticated research-only council acceptance; still blocked by Pages Preview credentials, FMP provider authentication, fresh reconciled seven-day equity history, live endpoint verification and independent review.
- [ ] Keep execution disabled, kill switch engaged, BUY disabled; no paper/live orders or Production migrations/deployments.


## Release-gate audit — 2026-11-10 09:43 PKT

- [x] Exact-head CI on `694f4924281cd760862fbf860f900103d55eb636`: Tests `42757514146`, Validate `42757514270`, full-history secret scan `42757514460`, push Tests `42757508778` all passed.
- [x] Preview deployment `6a536097-6ec0-4e96-84a6-a76acce6aa2b` succeeded; Production unchanged.
- [ ] Reconcile migration-history divergence: main `0006_continuous_market_monitor.sql` duplicates PR #85 `0011_continuous_market_monitor.sql`; PR #85 also adds its own `0006_northstar_fill_position_ledger.sql`. Production ledger is 0001–0005 despite monitor tables existing; Preview ledger is 0001–0012. Do not replay/apply migrations until reviewed.
- [ ] Reconcile PR #88 OIDC validator's public-or-private visibility acceptance with its stated private-only trust contract and unresolved GitHub `visibility=public` evidence.
- [ ] Correct Pages-vs-Worker FMP secret placement; Pages Preview still lacks FMP/Alpaca/Gemini secrets.
- [ ] Obtain independent PR review and governance, then establish genuine fresh seven-day equity history and run authenticated research-only Stock Brain acceptance.


## Quote-freshness admission hardening — 2026-11-10 10:26 PKT / 05:26 UTC

- Phase: 2 — nine-agent Research Council / Stock Brain. Objective: prevent stale or future-dated quote snapshots from entering the authenticated council collection path.
- Root cause: canonical resource coverage previously treated any timestamped quote at or before `asOf` as fresh, while the collector only required a non-empty quote timestamp. A stale provider observation could therefore be presented as current research evidence.
- Implementation commit: `24b42afd41d0b0455b055cce8719c8a10e01ddec` on `northstar/research-council-status-dashboard`, PR #103. Main remains `839e135dad88849350a7f6f61c929ee8ce4bc046`; branch is 158 commits ahead / 0 behind.
- Files changed: `web/lib/research-council-facts.js`, `web/functions/api/research/collect.js`, `tests/research-council-facts.test.mjs`, `tests/research-collector.test.mjs`.
- Rule: quote timestamps must parse and be no later than `asOf`; explicit market-closed quotes may be up to five calendar days old to cover weekends/holiday closures; all other/unknown/pre/post states are limited to 15 minutes. Missing, future and stale quotes are explicitly classified. The collector rejects every classification except `FRESH` before model workers run.
- Regression coverage: active-session fresh/stale boundary, explicit closed-session window, future/missing timestamps, stale quote with 60 daily bars, and collector fail-closed enforcement before council invocation.
- Exact-head CI for code commit: Tests `42762768731` PASS; Validate `42762768617` PASS; full-history secret scan `42762768610` PASS; push Tests `42762763147` PASS.
- Preview deployment: `700ebefd-605c-4aee-bfa1-5b63214b9844`, all Pages stages SUCCESS, Functions enabled, URL `https://700ebefd.ai-stock-advisor.pages.dev`. This is Preview only; Production was not deployed. Public API endpoint probes remain inaccessible through the connected web runtime, so no endpoint acceptance is claimed.
- Database changes: none. Production and Preview D1 audits were SELECT/PRAGMA only; no migrations, writes, or control changes.
- Live audit: Production D1 ledger 0001–0005; one equity snapshot at `2026-11-08T18:34:38.720Z`; 0 research council runs/traces, intents, orders, positions, broker fills or trade events. Monitor tables exist despite migration 0006 missing from the Production ledger. Preview ledger 0001–0012; no equity snapshots or council/paper records; strategy approval row remains `approved=0`.
- Production execution control remains `enabled=0`, `mode=paper`, `kill_switch=1`, `max_portfolio_usd=1000`, default risk 0.5%, max risk 1%, max position 25%. No paper or live orders were submitted. BUY remains NOT APPROVED.
- Operational audit: market-monitor cron `*/5 * * * *`; Worker deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version `2739d49a-4182-423f-8113-616252c5ddd6` at 100%. Production has 101 monitor runs, all `market_closed`, 0 symbols, 0 errors, 0 quote rows and 0 event rows; latest run completed `2026-11-10T05:25:53.063Z`.
- Credential gate: Pages Production secret names include FMP, Alpaca Paper, Gemini and operator token; Pages Preview contains only `NORTHSTAR_OPERATOR_TOKEN`. Secret values were not read. Last known Production FMP provider response was HTTP 401; no fresh provider test was available. Worker FMP binding is separate from Pages and does not configure Preview.
- Governance: PR #103 is open, non-draft and mergeable with zero formal reviews. Main branch-protection read returned 403 `Resource not accessible by integration`; governance cannot be independently verified through this connection. Repository API reports public while owner intent says private; visibility remains unresolved and unchanged. PR #85/#88 shared workflow and migration changes remain unreconciled; #101/#83/#82 and older UI/legacy PRs remain open drafts or non-mergeable.
- Complete: deterministic quote freshness helper, resource-coverage disclosure, collector hard gate, regression tests, exact-head CI, Preview deployment. Not complete: direct API endpoint acceptance, valid FMP authentication, Preview provider credentials, fresh reconciled snapshot plus seven-day baseline, independent review/governance, controlled authenticated nine-agent acceptance, Production acceptance, strategy validation.
- Exact next action: resolve the Pages Preview credentials and FMP authentication; reconcile migration history and PR #85/#88 workflow overlap; establish genuine scheduled read-only equity history; obtain independent review and authorized governance; then perform one authenticated research-only collection and verify all nine roles, vetoes, scorecard, telemetry, durable `research_council_runs` replay. Keep execution disabled, kill switch engaged, and do not submit orders.
\n\n
## 2026-11-10 11:31 PKT / 06:31 UTC — Stock Brain provenance and canonical FMP binding hardening

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE; no scanner work was restarted.
- Objective: ensure the collector cannot build its seven-day/drawdown risk history from equity rows with unknown provenance, and enforce the owner's explicit instruction to use only the single `FMP_API_KEY` binding.
- Code files: `web/functions/api/research/collect.js`, `web/functions/api/fmp-fundamentals.js`, `web/functions/api/fmp-history.js`, `web/functions/api/fmp-health.js`.
- Test files: `tests/research-collector.test.mjs`, `tests/fmp_health.test.mjs`, `tests/fmp_endpoint.test.mjs`, `tests/fmp_history.test.mjs`.
- Provenance change: the collector now selects `source` from every `paper_equity_snapshots` row and requires every row to carry the exact read-only sync label `alpaca_paper_read_only_sync` before daily-loss, weekly-loss or drawdown calculations. Missing/empty history and any other source label fail closed. This validates the application-level source label; it is not a cryptographic attestation against an administrator who can write D1 directly.
- FMP binding change: all three FMP endpoints now read only `env.FMP_API_KEY`. The health endpoint reports binding presence only for `FMP_API_KEY`. A key supplied only as `FMP_API_KEY2` is ignored and cannot trigger provider requests. Negative regression tests cover this for health, fundamentals and history. Historical log entries mentioning the old alias are retained as history, but the runtime fallback is removed.
- Commits: equity provenance code `3a53624de3907f0446a4196de2808043e4a7f232`; provenance tests `e7055a12280372b49fa3b8f31557d489656e45af`; canonical FMP endpoint commits `c6f958cc003d49b3b0774638f9a868e45cec7c32`, `4a5d47d1d42b0183afeb069039894426a29804fb`, `0d29f8f2c52424a0abf0b05fbd25dfa6322a01e0`; canonical-only regression-test commits `8ac4e5554c6393153b3ae978ef47355a49e2a262`, `4eb12ae26e79e790a05d122a70ad7e7eeecefb3e`, and current code/test head `987635387ec4ddf3a1b03c2708426ec4860ad84a`.
- CI: provenance exact-head Tests `42769328315`, Validate `42769328092`, full-history secret scan `42769328052` all SUCCESS on `e7055a12280372b49fa3b8f31557d489656e45af`. Canonical-FMP current-head Tests `42769769535` and Validate `42769769766` were IN_PROGRESS at this documentation timestamp; full-history secret scan `42769769527` SUCCESS on `987635387ec4ddf3a1b03c2708426ec4860ad84a`. Push Tests `42769763344` was also in progress. Do not describe the current head as CI-passed until those exact-head jobs complete.
- Preview: code deployment `908972e1-717d-40f4-9fe9-308158518903` succeeded with Pages Functions for the provenance change. Canonical FMP code deployments `4bd20937-239b-4775-b0d2-279c8a6cc1e5`, `42297f71-e1cc-4d42-bde8-7aae73d08b60`, and `713f2fd9-0ca0-42e4-980b-011c881cd591` succeeded with Pages Functions. Test-only deployments were skipped by Pages `path_config`. These are Preview deployments only. Production remains on deployment `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365`, main commit `839e135dad88849350a7f6f61c929ee8ce4bc046`; no Production deployment occurred.
- PR: #103 remains OPEN, non-draft and mergeable; at this entry its head was `987635387ec4ddf3a1b03c2708426ec4860ad84a`, 167 commits ahead / 0 behind main `839e135dad88849350a7f6f61c929ee8ce4bc046`, with zero formal reviews. Independent review and authorized branch governance remain required; do not merge.
- Current Cloudflare Pages secret-name metadata: Production deployment declares `FMP_API_KEY`, Alpaca ID/secret, Gemini and operator token. Preview declares only `NORTHSTAR_OPERATOR_TOKEN`; Preview FMP/Alpaca/Gemini bindings remain absent. Secret values were never read. The last recorded Production FMP provider probe remains HTTP 401 from the earlier audit; a fresh endpoint probe from this runtime returned policy HTTP 403 before reaching Pages, so provider validity is UNKNOWN, not verified.
- Production D1 read-only evidence: database `northstar-paper-ledger`; migration ledger `0001`–`0005`; `monitor_runs` 114 rows, all `market_closed`, 0 symbols checked, 0 errors, latest completed `2026-11-10T06:30:53.099Z`; `monitor_quotes` 0; `monitor_events` 0; one equity snapshot at `2026-11-08T18:34:38.720Z`, USD 100,000, source `alpaca_paper_read_only_sync`; council runs 0; decision traces 0; paper intents/orders/positions/fills/trade events 0; audit rows 2. Execution control remains `enabled=0`, `mode=paper`, `kill_switch=1`, $1,000 virtual allocation. Production does not contain `northstar_strategy_approval`.
- Preview D1 read-only evidence: database `northstar-preview`; migrations `0001`–`0012`; equity snapshots, council runs, decision traces, monitor rows and paper lifecycle rows all 0; strategy approval table exists; execution control remains disabled/paper/kill-switched.
- Migration drift: Production has monitor tables but the ledger omits migration 0006; Preview records 0011. Main `0006_continuous_market_monitor.sql` and PR #85 `0011_continuous_market_monitor.sql` are byte-for-byte identical. PR #85 uses migration 0006 for the fill/position ledger, so its migration numbering cannot be merged/replayed without explicit reconciliation. Production migration 0006–0012 were not applied. PR #85 is DRAFT, 490 ahead / 6 behind main, unmergeable; PR #88 is DRAFT, 26 ahead / 13 behind; both have zero formal reviews. PR #101 is DRAFT, 1 ahead / 2 behind, zero reviews.
- Monitor infrastructure: Worker `northstar-market-monitor` deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version `2739d49a-4182-423f-8113-616252c5ddd6`, cron `*/5 * * * *`. All observed Production monitor runs were market-closed; no market-open quote cycle is verified.
- Database changes: NONE. All D1 operations were SELECT-only; `changed_db=false`, `rows_written=0`. No Production migrations, secrets, broker requests, orders, execution controls or Production deployment were changed.
- Safety impact: research-only code and regression tests. No paper or live orders. Execution remains disabled, kill switch engaged, and validated BUY remains disabled.
- Complete: source-label admission is enforced before portfolio risk calculation; FMP runtime binding is canonical-only; negative alias tests added; code commits deployed to Preview with Pages Functions.
- Blockers: exact-head CI for `987635387ec4ddf3a1b03c2708426ec4860ad84a` still pending at documentation time; Preview provider credentials absent; Production FMP provider validity unverified (last known 401); only one stale Production equity snapshot, no genuine seven-day baseline; migration-history drift; no independent PR #103 review/authorized governance; repository visibility still reports public while owner intent is private.
- Exact next action: confirm exact-head Tests/Validate/secret-scan results; then continue safe read-only provider/config diagnostics and schema-drift analysis. Do not apply Production migrations, mutate controls, run the collector, enable paper execution or submit orders until credential, fresh seven-day baseline, reconciliation, review and release gates are satisfied.


## Current execution checkpoint — 2026-11-10 12:14 PKT

## 2026-11-10 12:14 PKT — Current Stock Brain integration and release checkpoint

- PR #103 head is `9b74526c9aad712942d3beb7191f45e565351380`, synchronized to current main `e4f57e89401b63023e81463f2ac6b68049abb0c2` (173 ahead / 0 behind; OPEN, non-draft, mergeable). Exact-head Tests `42774546912`, Validate `42774546820`, full-history secret scan `42774546827`, and push Tests `42774539310` passed.
- The nine-role backend, evidence/role packs, scorecard/telemetry persistence, authenticated collector and Trading Lab dashboard remain implemented on the PR branch. The successful earlier Preview deployment is `554187df-9924-4b76-b99e-ec3f5faf9de8` for code head `74dfc346...`; its Pages Functions and isolated Preview D1 were confirmed by deployment metadata. The new merge commit deployment `15af9442-00b8-4eb9-a6d5-e0a0c6fec227` was skipped by `path_config`, so it is not a runtime deployment.
- Preview D1 isolation was repaired at the Cloudflare Pages project level: Preview now binds to `northstar-preview` (`bdffc29f-a4f6-498e-ade7-22c85d9bd373`); Production remains bound to `northstar-paper-ledger` (`528f3a23-1d1f-4d16-8463-f643d85f5deb`). Read-back confirmed the Preview operator-token binding and both environments' `fail_open=false` were preserved. A new Preview deployment must still verify this binding at deployment level.
- Production D1 now records migrations 0001–0006, with monitor migration 0006 applied at `2026-11-10T07:07:53Z`; this supersedes older 0001–0005-only notes. Production still lacks `northstar_strategy_approval`, has one stale equity snapshot at `2026-11-08T18:34:38.720Z`, no genuine seven-day baseline, and zero council runs/traces or paper lifecycle records. Controls remain execution-disabled, paper mode, kill switch engaged.
- Preview D1 remains on migrations 0001–0012 with strategy approval false and no research or paper activity. Production Pages has the canonical `FMP_API_KEY` binding; Preview lacks FMP, Alpaca Paper and Gemini secrets. No secret values were read.
- No authenticated nine-agent acceptance run has been performed. The collector remains blocked by missing Preview provider credentials and, in Production, stale/insufficient portfolio history. Strategy validation remains NOT APPROVED; BUY stays disabled.
- No Production database writes/migrations, broker calls, orders, control changes or Production deployment occurred. No paper or live order was submitted.
- Next: verify a fresh Preview deployment uses the isolated D1 and Pages Functions, perform only a credential-free auth-gate smoke if accessible, then complete independent review and the required fresh seven-day read-only portfolio history before any authenticated research-only acceptance.
