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



## 2026-11-10 12:23 PKT / 07:23 UTC — exact Preview runtime and isolation verification

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Objective: verify the new Preview deployment after correcting the project-level Preview D1 binding.
- PR #103 branch head at the start of this verification: `0a10bed861adb2d3d487d273db6c7b9c5d8afc27`; current main `e4f57e89401b63023e81463f2ac6b68049abb0c2`; PR compares 174 ahead / 0 behind, OPEN, non-draft, mergeable. No formal review submissions or review threads.
- Exact-head CI for `0a10bed861adb2d3d487d273db6c7b9c5d8afc27`: Tests `42774778011` SUCCESS; Validate `42774777981` SUCCESS; full-history secret scan `42774778173` SUCCESS; companion push Tests `42774771185` SUCCESS.
- Preview deployment `201dbcd3-b91a-453c-bf1a-7a81e8c6bb8a` completed all five stages successfully for the exact head; `uses_functions=true`; deployment-level D1 binding is `NORTHSTAR_DB -> bdffc29f-a4f6-498e-ade7-22c85d9bd373` (`northstar-preview`). This confirms the Preview deployment is isolated from Production. Cloudflare project read-back also confirms Preview D1 points to the Preview database, Preview `NORTHSTAR_OPERATOR_TOKEN` remains configured, `fail_open=false`, and Production D1/secrets are unchanged.
- Live Preview UI smoke: Firecrawl fetched `/trading-lab.html` with HTTP 200. Returned page contains the Stock Brain nine-agent workspace, run button, role matrix/scorecard areas, run-time operator-token prompt, and explicit research-only / no-order safety copy. This is UI/deployment verification, not an authenticated council acceptance run.
- API route smoke remains blocked at the edge: an unauthenticated POST to `/api/research/collect` from the Cloudflare execution environment returned HTTP 403 plain text, before an application JSON auth response could be observed; Firecrawl GET of the POST-only route could not retrieve it. No Authorization token was supplied, and no collection or D1 write was triggered. Do not claim the protected route's 401/auth behavior is verified.
- Fresh Production D1 read-only audit: migration ledger 0001–0006, with `0006_continuous_market_monitor.sql` recorded at `2026-11-10T07:07:53Z`; 124 monitor runs, all `market_closed`, 0 symbols checked, 0 errors, latest `2026-11-10T07:20:53.328Z`; 0 monitor quotes/events; one equity snapshot at `2026-11-08T18:34:38.720Z`; 0 council runs/traces, intents, orders, positions, fills or paper trade events. `northstar_strategy_approval` remains absent in Production. Controls remain `enabled=0`, `mode=paper`, `kill_switch=1`.
- Preview D1 remains on migrations 0001–0012 with `approved=0` and empty research/paper/monitor tables. No D1 writes or migrations occurred in this verification.
- Worker `northstar-market-monitor` remains deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version `2739d49a-4182-423f-8113-616252c5ddd6` at 100%, cron `*/5 * * * *`. The FMP quote adapter in repository source is not yet deployed to this separate Worker.
- Production Pages remains on successful deployment `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365` for commit `839e135dad88849350a7f6f61c929ee8ce4bc046`; no Production deployment occurred.
- Credentials: Production has canonical `FMP_API_KEY`, Alpaca Paper and Gemini secret names. Preview still has only `NORTHSTAR_OPERATOR_TOKEN`; Preview provider credentials are missing. Secret values were not read. FMP provider validity remains unverified (last known provider response was HTTP 401).
- Safety: no broker requests, orders, D1 writes/migrations, Production configuration changes, secret reads/changes, execution-control changes or Production deployments. No paper or live order was submitted; validated BUY remains disabled.
- Exact next action: obtain an independent PR review and authorized branch governance; restore required Preview provider secrets through the owner's secure Cloudflare workflow; establish a fresh reconciled snapshot and genuine seven-day equity baseline; then perform one controlled authenticated research-only collection and verify all nine roles, reports, vetoes, scorecard, telemetry, durable persistence and idempotent replay. Keep execution disabled and kill switch engaged.


## Repository visibility and continuity correction — 2026-11-10 12:25 PKT

## 2026-11-10 12:25 PKT / 07:25 UTC — repository-visibility continuity correction and main synchronization

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. The universe-scanning milestone remains user-confirmed COMPLETE.
- Current main advanced from `e4f57e89401b63023e81463f2ac6b68049abb0c2` to `08886f7f7cb1fbdcdee647d41cc244f9c4323159` through four documentation-only commits (`784c9df9`, `b2f679e3`, `6d7eafaf`, `08886f7f`). Main CI on `08886f7f`: Tests `42774857264` SUCCESS; Validate `42774857026` SUCCESS; full-history secret scan `42774857245` SUCCESS.
- The latest main documentation asserted that the owner had confirmed the repository was intentionally changed from private to public. That assertion conflicts with the current owner instruction for this project, which says the owner states the repository is private and explicitly prohibits claiming a user-confirmed public change. This PR branch therefore preserves the correct unresolved state: GitHub API metadata reports `visibility=public`, owner intent is private, and actual GitHub Settings visibility has not been independently confirmed. Treat repository contents as publicly accessible until Settings confirms otherwise. Do not change visibility without explicit authorization. Do not ask the owner to repeat the documented intent.
- PR #103 branch `northstar/research-council-status-dashboard` is synchronized with latest main via a merge commit whose parents are the prior PR head and `08886f7f7cb1fbdcdee647d41cc244f9c4323159`. The PR branch's README/handbook/blocker/build-plan wording intentionally supersedes the conflicting public-confirmation claim while preserving all Stock Brain implementation and live-evidence addenda.
- No application code, tests, Pages deployment, Production settings, D1 state, secrets, broker calls, orders, or execution controls changed in this documentation/continuity correction. The prior Preview verification remains valid for unchanged app code: deployment `201dbcd3-b91a-453c-bf1a-7a81e8c6bb8a` succeeded with Pages Functions and isolated Preview D1; Trading Lab UI returned HTTP 200. The protected API endpoint was not accepted because the external edge returned 403 before application auth could be observed.
- Governance remains unchanged: main is unprotected; PR #103 has no formal independent review; no merge is authorized by this work item.
- Exact next action: finish exact-head CI on the synchronized PR branch; keep PR #103 open pending independent review and branch-governance confirmation; correct the same unsupported visibility assertion on main through a narrowly scoped reviewable documentation PR. Keep execution disabled, kill switch engaged and BUY disabled.


## 2026-11-10 — Continuity and repository state
- Repository visibility remains unresolved: the owner states private, GitHub API reports `visibility=public`, and GitHub Settings has not been independently verified. Treat contents as publicly accessible until verified; do not change visibility without explicit authorization and do not claim the owner confirmed a public change.
- The canonical provider secret is `FMP_API_KEY` only and the user has confirmed it is already configured. Do not ask for it again; verify runtime behavior instead.
- Read the handbook and blocker log before requesting user input. Update the project documents after every meaningful code/configuration/deployment/status change.


## Repository visibility and governance correction — 2026-11-10 12:27 PKT

## 2026-11-10 12:27 PKT / 07:27 UTC — owner-directed repository-visibility correction (superseding unsupported claim)

- Current owner instruction for this project: the owner states the repository is private; connected GitHub API metadata reports `visibility=public`. Actual GitHub Settings visibility has not been independently verified. The discrepancy remains unresolved.
- Treat repository contents as publicly accessible until GitHub Settings confirms the actual visibility. Do not change visibility without explicit authorization.
- The four branch commits `7f400ac6115d61d1574ab3601454140d12540889`, `987625d9786fb9cec7d2f51dc5dd99bbc325e627`, `fb24b74becc3c97cbf91a02e624aee8ca197eb11`, and `d7d0e2efc4415c069220ab2b196409c29ed85251` reintroduced the statement that the user explicitly confirmed a private-to-public change. That statement is not supported by the current owner instruction and is superseded by this correction. Do not repeat it.
- A narrow correction PR was opened from latest main: PR #107, `docs: correct unresolved repository visibility status`, branch `northstar/visibility-continuity-correction-20261110`, commit `3c80f4d869184d91a74cbfcc7db92e51a994e83f`. Exact-head Tests `42775330841`, Validate `42775330630`, full-history secret scan `42775330715`, and push Tests `42775324008` all SUCCESS. PR #107 is 1 ahead / 0 behind main, OPEN, non-draft and mergeable; no formal review is present.
- Current main is `08886f7f7cb1fbdcdee647d41cc244f9c4323159`. PR #103's branch was synchronized to that main; current branch head before this correction was `d7d0e2efc4415c069220ab2b196409c29ed85251`, 178 ahead / 0 behind, OPEN, non-draft and mergeable. Exact-head Tests were still running at the time of this entry; Validate `42775351570` and full-history secret scan `42775351259` passed.
- This correction changes documentation only. No repository visibility, application code, secrets, Cloudflare configuration, deployment, D1, broker, order or execution-control setting was changed. The previously verified Preview deployment and isolated Preview D1 remain unchanged.
- Exact next action: finish CI for the corrected PR #103 head; keep both PRs open pending independent review and authorized governance. Do not merge or change repository visibility without the required owner/reviewer gates. Keep execution disabled, kill switch engaged and BUY disabled.


## 2026-11-10 — Continuation audit and Preview binding distinction
- Repository visibility remains unresolved: the owner states the repository is private; GitHub API reports `visibility=public`; actual GitHub Settings has not been independently verified. Treat contents as publicly accessible until verified; do not change visibility without explicit authorization and do not claim the owner confirmed a public change.
- User has confirmed `FMP_API_KEY` is already configured. Do not ask them to add/re-add it. Only the canonical `FMP_API_KEY` binding is supported.
- Cloudflare read-only inventory: Worker `northstar-market-monitor` exposes secret binding name `FMP_API_KEY` and D1 binding `NORTHSTAR_DB`; version 6 is preview-only and not promoted. This is binding-name evidence, not a test of secret validity/provider access.
- The distinct Pages project `ai-stock-advisor` currently lists Production secret names including `FMP_API_KEY`, while Pages Preview metadata lists only `NORTHSTAR_OPERATOR_TOKEN`. Values were not read. Do not assume a Worker secret is automatically available to Pages Functions.
- Direct preview HTTP probes from the connected runtime were inaccessible; no application response was received. Current Pages preview deployment for the latest docs-synchronized PR head is `idle`; do not claim endpoint or FMP health.
- PR #103 current branch head at this audit: `d7d0e2efc4415c069220ab2b196409c29ed85251`, 180 ahead / 0 behind main, open, non-draft, mergeable. Formal reviews and inline review threads: zero. Exact-head CI is unverified because the connected workflow/status lookup returned no entries.
- No application code, production deployment, D1 write/migration, secret mutation, broker request, order or execution-control change was made. Keep paper execution disabled, kill switch engaged and BUY disabled.
- Next: complete latest-head Preview deployment and runtime smoke tests; resolve Pages Preview binding discrepancy without asking the user for a key; then obtain exact-head CI and independent review before considering merge.



## 2026-11-10 12:32 PKT / 07:32 UTC — clean Stock Brain review branch and exact Preview acceptance

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE and is not being rebuilt.
- Current main: `d1a966debfc69b59ac465f942d807720ae585c71`. Clean review branch: `northstar/stock-brain-clean-review-20261110`. Application consolidation commit: `f29523277e827353b3078aa958381ebc7c108019`. PR #108 is OPEN, non-draft, mergeable, 1 commit ahead / 0 behind main, with the 34-file Stock Brain change set consolidated into one commit.
- Exact-head CI on `f29523277e827353b3078aa958381ebc7c108019`: Tests `42776074449` SUCCESS; Validate `42776074470` SUCCESS; full-history secret scan `42776074646` SUCCESS; push Tests `42776068092` SUCCESS.
- Pages Preview deployment `ad94b5a0-48fd-40a9-b173-57160da0298c` completed SUCCESS for the exact application commit. `uses_functions=true`; deployment-level `NORTHSTAR_DB` points to isolated Preview database `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. Cloudflare project read-back confirms Preview D1 points to this Preview DB, Preview retains only `NORTHSTAR_OPERATOR_TOKEN`, `fail_open=false`, and Production remains on D1 `528f3a23-1d1f-4d16-8463-f643d85f5deb`.
- Live Preview UI smoke via Firecrawl returned HTTP 200 for `/trading-lab.html`. The page includes the Stock Brain Research Council workspace, nine-agent run action, runtime-only operator-token prompt, and explicit research-only/no-order safety text. This is UI/deployment verification, not authenticated council acceptance.
- API acceptance remains blocked at the external edge: a credential-free POST to `/api/research/collect` returned HTTP 403 plain text before application auth behavior could be observed. No token was supplied; no collector run or D1 write occurred. Do not claim API route auth or council execution is verified.
- Original PR #103 has become an unstable, diverged history: current branch head `d1ffddb0a75d7e89037c76e7956159fee3af2924`, 184 ahead / 3 behind main, GitHub mergeable state `dirty`; concurrent documentation commits repeatedly reintroduced unsupported repository-public confirmation. Do not merge PR #103. PR #108 is the clean replacement based on current main, with the same application diff in one commit.
- Focused repository-visibility correction PR #107 is also open, branch head `431ba512a6e698d97ff66264fea69a1135b53e47`, 3 ahead / 0 behind main, mergeable. Exact-head Tests `42775685470`, Validate `42775685797`, full-history secret scan `42775685818`, and push Tests `42775677089` all SUCCESS. It removes unsupported claims that the owner confirmed a private-to-public change.
- Visibility remains unresolved: the owner states the repository is private; GitHub API reports `visibility=public`; GitHub Settings has not been independently verified. Treat contents as publicly accessible until Settings confirms otherwise. Do not change visibility without explicit authorization.
- Production D1 remains migrations 0001–0006; monitor migration 0006 was recorded at `2026-11-10T07:07:53Z`. Production still lacks `northstar_strategy_approval`, has one stale equity snapshot at `2026-11-08T18:34:38.720Z`, no genuine seven-day baseline, zero council runs/traces, and zero paper intents/orders/positions/fills/events. Production execution control remains `enabled=0`, `mode=paper`, `kill_switch=1`.
- Latest read-only monitor audit: 124 runs, all `market_closed`, zero symbols checked/errors, zero quote rows and zero event rows; latest completed `2026-11-10T07:20:53.328Z`; cron `*/5 * * * *`. Worker deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` remains 100% on version `2739d49a-4182-423f-8113-616252c5ddd6`. The FMP quote adapter source has not been deployed to that separate Worker.
- Preview D1 remains migrations 0001–0012 with strategy approval `approved=0` and empty research/paper tables. Preview provider secrets FMP/Alpaca/Gemini remain absent; Production has the canonical `FMP_API_KEY` name and Alpaca/Gemini bindings. Secret values were never read. FMP provider validity remains unknown (last known HTTP 401).
- Strategy validation remains NOT APPROVED; validated BUY remains disabled. Paper lifecycle remains NOT READY. No paper or live order was submitted.
- Database/safety impact: all D1 operations in this audit were SELECT-only; no database writes/migrations, broker calls, orders, execution-control changes, secret reads/changes or Production deployment occurred. The only Cloudflare change in this work item was the Preview-only D1 binding correction, verified by read-back and deployment metadata.
- Complete: clean one-commit Stock Brain PR created; exact-head CI passed; Preview Functions deployed with isolated D1; Trading Lab UI returned HTTP 200.
- Still blocked: independent review and authorized branch governance; Preview provider credentials; fresh reconciled 15-minute snapshot and genuine seven-day baseline; API edge access to protected route; authenticated nine-agent acceptance; Production schema parity and strategy approval.
- Exact next action: obtain independent review for PR #108 and #107; resolve secure Preview provider credentials and portfolio-history prerequisites; then run one controlled authenticated research-only council collection and verify all nine role outputs, reports, vetoes, scorecard, telemetry, durable persistence and idempotent replay. Keep execution disabled, kill switch engaged and BUY disabled.



## 2026-11-10 12:35 PKT / 07:35 UTC — final clean-branch CI and Preview verification

- Current main: `d1a966debfc69b59ac465f942d807720ae585c71`. Clean Stock Brain branch: `northstar/stock-brain-clean-review-20261110`. Application commit `f29523277e827353b3078aa958381ebc7c108019`; documentation/verification commit `3048c91d771ed7fdc07b788feda4ea386b8f87e6`. PR #108 is OPEN, non-draft, mergeable, 2 ahead / 0 behind main.
- Exact-head CI on `3048c91d771ed7fdc07b788feda4ea386b8f87e6`: Tests `42776219022` SUCCESS; Validate `42776219057` SUCCESS; full-history secret scan `42776218718` SUCCESS; push Tests `42776211994` SUCCESS.
- Latest Preview deployment `0009e2d1-04a4-4d8b-9ae1-360a1f787736` completed SUCCESS for the docs follow-up head; `uses_functions=true`; D1 binding points to isolated Preview database `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. Earlier application deployment `ad94b5a0-48fd-40a9-b173-57160da0298c` also succeeded for application commit `f295232...` with the same Preview D1 binding.
- Final Preview UI smoke for `https://0009e2d1.ai-stock-advisor.pages.dev/trading-lab.html` returned HTTP 200. The page contains the Stock Brain Research Council workspace, run action, run-time operator-token prompt and explicit research-only / execution-locked / no-order safety copy.
- Protected collector API remains unverified: unauthenticated POST probe returned HTTP 403 plain text at the external edge before application auth could be observed. No operator token was supplied; no collector run or D1 write occurred.
- PR #107 visibility correction is 3 ahead / 0 behind main and exact-head CI passed: Tests `42775685470`, Validate `42775685797`, secret scan `42775685818`, push Tests `42775677089`. No independent reviews have been submitted.
- Original PR #103 remains unstable/diverged (184 ahead / 3 behind, GitHub mergeable state dirty) and should not be merged; PR #108 is the clean one-commit application replacement plus documentation follow-up.
- Visibility remains unresolved: owner states private; GitHub API reports public; Settings has not been independently verified. Treat repository contents as publicly accessible until Settings confirms; no visibility change is authorized.
- Production remains unchanged: D1 ledger 0001–0006, one stale equity snapshot at `2026-11-08T18:34:38.720Z`, no seven-day baseline, no council runs/traces or paper lifecycle records, execution disabled, paper mode, kill switch engaged. Latest read-only monitor evidence: 124 market_closed runs, zero symbols/errors/quotes/events; Worker deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` at 100%, cron `*/5 * * * *`.
- Strategy validation remains NOT APPROVED; paper lifecycle NOT READY; BUY remains disabled. Preview provider secrets remain absent except the operator token; Production has canonical `FMP_API_KEY` binding, but provider validity remains unknown.
- No D1 writes/migrations, secret reads/changes, broker calls, orders, execution-control changes or Production deployment occurred. No paper or live order was submitted.
- Exact next action: obtain independent review and authorized branch governance for PR #108 and #107; resolve secure Preview provider credentials and fresh reconciled seven-day portfolio history; then perform one controlled authenticated research-only council acceptance and verify all nine roles, reports, vetoes, scorecard, telemetry, durable persistence and idempotent replay. Keep execution disabled and kill switch engaged.



## 2026-11-10 12:35 PKT / 07:35 UTC — open-PR dependency and paper-lifecycle governance audit

- Phase 2 remains the active priority. The nine-agent Stock Brain work is isolated in clean PR #108 (3 ahead / 0 behind main, OPEN, mergeable); focused visibility correction is PR #107 (3 ahead / 0 behind, OPEN, mergeable). Neither has independent formal review. Main remains unprotected.
- Original PR #103 is superseded by #108 and remains unstable: 184 ahead / 3 behind, GitHub mergeable state `dirty`. Do not merge #103.
- PR #85 (draft, 490 ahead / 15 behind) contains paper submission/recovery routes and a conflicting migration history: Production has already applied `0006_continuous_market_monitor.sql` at `2026-11-10T07:07:53Z`, while #85 adds `0006_northstar_fill_position_ledger.sql` and renames the monitor migration to 0011. Do not merge or apply its migrations until a new forward-only migration plan reconciles Production and Preview. Keep paper execution disabled; no order testing is authorized.
- PR #88 (draft, 26 ahead / 22 behind) adds GitHub OIDC snapshot orchestration. Its validator currently accepts both `repository_visibility=public` and `private`, although the PR description says private visibility is pinned. The repository visibility remains unresolved (owner states private; GitHub API reports public). Its workflow also calls public `GET /api/paper/readiness`, which exposes ledger configuration/control-state metadata; this conflicts with the prior decision to avoid unnecessary public readiness/configuration surfaces. Keep #88 draft until the visibility policy and a protected/non-public preflight are resolved.
- PR #83 (draft, 2 ahead / 38 behind) proposes verified portfolio-context gates. The current main `web/functions/api/research/council.js` already rejects missing/unverified provenance, missing risk fields and future-dated portfolio snapshots with HTTP 422; current endpoint tests already cover those cases. Treat #83 as functionally superseded unless a specific regression is found. PR #82 (draft, 1 ahead / 39 behind) is a stale specialist-agent status document; the current Stock Brain runbook in #108 is the active continuity source. PR #101 is documentation-only and 1 ahead / 11 behind. Legacy #39/#30/#24/#23 remain open but are not active phase priorities.
- Production D1 latest read-only audit: migrations 0001–0006; one stale equity snapshot at `2026-11-08T18:34:38.720Z`; 0 research council runs/traces, 0 paper intents/orders/positions/fills/trade events. Execution control remains `enabled=0`, `mode=paper`, `kill_switch=1`. Production still lacks `northstar_strategy_approval`.
- Production monitor: 127 runs, all `market_closed`, 0 symbols checked, 0 errors, 0 quote rows, 0 event rows; latest completed `2026-11-10T07:35:53.289Z`. Cron remains `*/5 * * * *`. Worker deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` remains 100% on version `2739d49a-4182-423f-8113-616252c5ddd6`; the FMP quote adapter source has not been deployed to that separate Worker.
- Preview D1 remains migrations 0001–0012, strategy approval `approved=0`, with zero research/paper/monitor rows. Pages Preview binding is isolated to `bdffc29f-a4f6-498e-ade7-22c85d9bd373`; Production remains `528f3a23-1d1f-4d16-8463-f643d85f5deb`. Preview secret names remain only `NORTHSTAR_OPERATOR_TOKEN`; Production includes canonical `FMP_API_KEY`, Alpaca Paper and Gemini names. No secret values were read.
- Preview verification remains: deployment `ad94b5a0-48fd-40a9-b173-57160da0298c` for app commit `f295232...` and deployment `0009e2d1-04a4-4d8b-9ae1-360a1f787736` for docs commit `3048c91...` both succeeded with Functions and isolated Preview D1. UI returned HTTP 200. Protected collector API auth remains unverified because the external edge returned 403 before application auth.
- Strategy validation is NOT APPROVED; paper lifecycle is NOT READY; validated BUY remains disabled. No paper or live order was submitted.
- No D1 writes/migrations, secret reads/changes, broker calls, execution-control changes or Production deployment occurred.
- Exact next action: obtain independent review for PR #108 and #107; do not merge #85/#88 or activate paper execution. Complete valid Preview provider credentials and fresh reconciled 15-minute/seven-day portfolio history, then run one controlled authenticated research-only council acceptance with durable trace and idempotent replay checks.
## Phase 2 continuation — Preview D1 isolation — 2026-11-10 12:56 PKT



## 2026-11-10 12:56 PKT — Pages Preview D1 isolation repair

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE; no scanner work was reopened.
- Objective: correct a live Cloudflare Pages environment-binding drift that defeated the repository's existing Preview/Production D1 isolation test.
- Evidence before repair: Cloudflare Pages project `ai-stock-advisor` read-back showed BOTH `deployment_configs.preview.d1_databases.NORTHSTAR_DB` and `deployment_configs.production.d1_databases.NORTHSTAR_DB` pointing to Production database `northstar-paper-ledger` (`528f3a23-1d1f-4d16-8463-f643d85f5deb`). A separate `northstar-preview` database existed (`bdffc29f-a4f6-498e-ade7-22c85d9bd373`). This contradicted the prior PR #108 statement that the deployed project binding was isolated; the checked-in `web/wrangler.toml` test alone did not verify Cloudflare's live project setting.
- Remediation: Cloudflare Pages project PATCH updated ONLY the Preview `NORTHSTAR_DB` binding to `northstar-preview`. Immediate GET read-back confirmed Preview=`bdffc29f-a4f6-498e-ade7-22c85d9bd373`, Production=`528f3a23-1d1f-4d16-8463-f643d85f5deb`. Preview `NORTHSTAR_OPERATOR_TOKEN` binding remained configured; Production secret-name metadata remained `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `FMP_API_KEY`, `GEMINI_API_KEY`, `NORTHSTAR_OPERATOR_TOKEN`. Secret values were never read or changed. Both environments retain `fail_open=false`.
- D1 read-only evidence: Preview migration ledger is 0001–0012; 0 council runs/traces, 0 monitor runs/quotes/events, 0 equity snapshots, 0 orders/positions/intents/trade events; controls `enabled=0`, `mode=paper`, `kill_switch=1`. Production migration ledger is 0001–0006; 133 monitor runs, all `market_closed`, 0 symbols checked, 0 errors, 0 quote/event rows; 1 equity snapshot at `2026-11-08T18:34:38.720Z`; 0 council runs/traces and 0 paper lifecycle rows; controls remain `enabled=0`, `mode=paper`, `kill_switch=1`. Every D1 query reported 0 rows written and `changed_db=false`.
- Worker/cron: `northstar-market-monitor` deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version `2739d49a-4182-423f-8113-616252c5ddd6` at 100%; cron `*/5 * * * *`. Latest monitor run #133 completed `2026-11-10T08:05:53.203Z` with `market_closed`, 0 symbols and 0 errors. No Worker deployment change.
- Repository/PR: main `d1a966debfc69b59ac465f942d807720ae585c71`; PR #108 branch `northstar/stock-brain-clean-review-20261110`, pre-update head `c004179b64bba90054503e2add11584f19978142`, compare 5 ahead / 0 behind, OPEN/non-draft/mergeable, 0 formal reviews. Exact pre-update head CI: Tests `42776707128`, Validate `42776707045`, full-history secret scan `42776707322` — all SUCCESS. This documentation update is on PR #108; exact resulting commit is the new PR head.
- Pages: current Production deployment `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365` succeeded for main commit `839e135dad88849350a7f6f61c929ee8ce4bc046`. PR #108 Preview deployment `c4776915-0b34-4010-b97e-51b0cd13de3d` was still `idle` before this docs commit. Cloudflare docs state a redeploy is required for a changed D1 binding to take effect; wait for the new Preview deployment and verify it before any endpoint test.
- Database changes: none. Only Cloudflare Pages project configuration was changed; no D1 migration/query write, secret mutation, broker call, order action, execution-control change, or Production deployment occurred.
- Safety impact: prevents future Preview deployments from being bound to the Production paper ledger. Production binding was explicitly preserved. This is a configuration-level repair; it is NOT yet runtime-verified until a fresh Preview deployment completes.
- Remaining blockers: Preview lacks FMP/Alpaca/Gemini secret bindings (Production has the canonical `FMP_API_KEY`; no alternate key name is used). Production equity history is one stale snapshot and lacks a seven-day baseline. Strategy validation remains NOT APPROVED; paper lifecycle NOT READY. PR #108 still needs independent review; main branch protection is not verified; repository visibility remains unresolved because owner intent is private while GitHub API reports public. The old PR #103 is dirty/diverged and is not the review target.
- Next exact action: complete a new Preview deployment from this PR branch after the binding correction; verify deployment status, runtime route and Preview D1 isolation without invoking the collector or any broker endpoint. Then update the PR handover with the new deployment ID and exact-head CI. Keep execution disabled, kill switch engaged and BUY disabled.


## 2026-11-10 13:13 PKT — Preview redeployment and endpoint verification

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Objective: verify the Cloudflare Pages Preview D1 binding repair at the deployed runtime and refresh the release handover.
- Repository baseline: main `d1a966debfc69b59ac465f942d807720ae585c71`; PR #108 branch `northstar/stock-brain-clean-review-20261110`, application/documentation head `e520541baf4813c3290baf12128e1fa4e05c6977`, 6 ahead / 0 behind main, OPEN/non-draft/mergeable. Exact-head CI on `e520541baf4813c3290baf12128e1fa4e05c6977`: Tests `42780500987`, Validate `42780501064`, full-history secret scan `42780501300` — all SUCCESS. PR #108 has zero formal review submissions.
- Preview deployment: `e9b57833-c63c-4046-beea-b8421f3093d6`, SUCCESS, commit `e520541baf4813c3290baf12128e1fa4e05c6977`, Pages Functions enabled. URL: `https://e9b57833.ai-stock-advisor.pages.dev`.
- Live Preview UI smoke: `GET /trading-lab.html` returned HTTP 200 and rendered the Stock Brain workspace, read-only paper telemetry, and locked-execution safety copy.
- Read-only Preview API checks: `GET /api/paper/performance` returned HTTP 200 with `execution=false`, `snapshotCount=0`, no current account value, no positions, no imported fills and no equity curve. `GET /api/monitor` returned HTTP 200 with `latestRun=null`, no quotes and no events. `GET /api/paper/readiness` returned HTTP 200 with `configured=true`, `policyVerified=true`, `mode=paper`, `executionEnabled=false`, `killSwitchEngaged=true`, and limits of $1,000 virtual allocation / $5 default risk / $10 maximum risk / $250 position cap. These results agree with the isolated Preview D1 read-only counts and confirm the new deployment uses the empty Preview ledger rather than Production data.
- Provider gate: `GET /api/fmp-health` returned HTTP 503 with `status=MISSING_BINDING`, `fmpBindingPresent=false`, `fmpConfigured=false`; the Preview Trading Lab also reports Alpaca credentials not configured. Cloudflare project metadata confirms Preview has only `NORTHSTAR_OPERATOR_TOKEN`; Production has `FMP_API_KEY`, Alpaca Paper and Gemini bindings. No secret values were read or changed. The canonical FMP name remains `FMP_API_KEY` only.
- No authenticated `POST /api/research/collect` was invoked; no operator token was supplied. No broker endpoint, D1 write, migration, order, execution-control mutation or Production deployment occurred. D1 read queries continue to report 0 rows written and `changed_db=false`.
- Production remains unchanged: Pages deployment `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365` serves main commit `839e135dad88849350a7f6f61c929ee8ce4bc046`. Production D1 migrations 0001–0006; 133 monitor runs, all market-closed with 0 symbols/errors/quotes/events; one stale equity snapshot at `2026-11-08T18:34:38.720Z`; 0 council runs/traces and 0 paper orders/positions/intents/fills/events. Controls remain execution-disabled and kill-switched.
- Related follow-up PR #110 (`northstar/five-specialist-agents`) adds five deterministic evidence-first specialists and removes the obsolete `FMP_API_KEY2` fallback. Its latest head `ad659c421b052a8650de8b8a74868b971a0a8a12` is 6 ahead / 0 behind main; exact-head Tests `42780850949`, Validate `42780850868`, secret scan `42780851376` all SUCCESS; Preview deployment `7cd76113-7649-4eba-8ef1-c3ecfb8c2c0c` succeeded. It remains a separate draft PR and must be reviewed/reconciled with #108 before merging because both touch `research-council-adapters.js` and FMP provider paths. PR #109 adds a news-quality layer but is not yet wired into live dashboard scoring.
- Files changed in this documentation work item: `NORTHSTAR_BLOCKERS.md`, `docs/NORTHSTAR_PROJECT_HANDBOOK.md`, `docs/BUILD_PLAN.md`, `docs/STOCK_BRAIN_SPEC.md`, `docs/CONTINUOUS_MARKET_MONITOR.md`, `web/docs/NORTHSTAR_RESEARCH_COUNCIL.md`.
- Documentation commit: this follow-up commit on PR #108; exact SHA is recorded in the updated PR head and Git history. PR #108 body contains the exact endpoint/deployment evidence.
- Database changes: none. Safety impact: Preview/Production D1 separation is now both API-read-back-verified and runtime-smoke-verified; no Production resource or execution control was changed.
- Remaining blockers: Preview provider credentials are absent; Production has no genuine seven-day equity baseline and only one stale snapshot; authenticated collector acceptance remains blocked. Strategy validation NOT APPROVED; paper lifecycle NOT READY; validated BUY disabled. Independent review and branch governance remain outstanding. Repository visibility remains unresolved (owner intent private; GitHub API reports public); do not change visibility.
- Next exact action: continue safe review/integration of the deterministic five-specialist follow-up and provider adapters; resolve Preview credentials only through authorized secret configuration; do not run the collector until the seven-day baseline and read-only broker reconciliation gates are satisfied. Keep execution disabled, kill switch engaged and BUY disabled.


## 2026-11-10 14:24 PKT / 2026-11-10 09:24 UTC — Phase 2 implementation and release checkpoint

## 2026-11-10 14:24 PKT / 2026-11-10 09:24 UTC — Phase 2 news chronology hardening and runtime audit

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE; no scanner work was reopened.
- Objective: prevent future, undated, date-only, and timezone-less news from entering the point-in-time Council evidence dossier; refresh current GitHub, Preview, Production, D1, monitor, and safety evidence.
- Implementation: `web/lib/research-council-facts.js` now admits NEWS_DISCOVERY only when publication time is an ISO-8601 timestamp with an explicit `Z` or numeric timezone offset and is at or before the research `asOf`. Future items are excluded; missing, date-only, and timezone-less timestamps are excluded. Counts are exposed in `resourceCoverage.newsQuality` and the citable `RESOURCE_COVERAGE_SNAPSHOT`. The news role is `INSUFFICIENT` when no eligible timestamped news exists. Earnings-calendar events remain a separate event evidence type.
- Regression coverage: `tests/research-council-facts.test.mjs` covers valid, future-dated, undated, date-only, and timezone-less news, verifies only eligible items remain citable, and checks that exclusion counts persist in the resource-coverage snapshot.
- Files changed in this work item: `web/lib/research-council-facts.js`, `tests/research-council-facts.test.mjs`, `NORTHSTAR_BLOCKERS.md`, `docs/NORTHSTAR_PROJECT_HANDBOOK.md`, `docs/BUILD_PLAN.md`, `docs/STOCK_BRAIN_SPEC.md`, `web/docs/NORTHSTAR_RESEARCH_COUNCIL.md`.
- Implementation/test head: `9e1c2ddb15a58892f0f45359bb945602387db826`; PR #108, branch `northstar/stock-brain-clean-review-20261110`, OPEN/non-draft/mergeable, 13 ahead / 0 behind main `d1a966debfc69b59ac465f942d807720ae585c71`. PR #108 has zero formal review submissions. Documentation follow-up is committed separately on the same PR branch.
- Exact-head CI on `9e1c2ddb15a58892f0f45359bb945602387db826`: Tests `42790088245` SUCCESS (231 JavaScript tests, 94 Python tests, Ruff clean); Validate `42790087919` SUCCESS (Python/lint, JS syntax and frontend logic, paper readiness, SEC ingestion, synthetic validation guard); full-history secret scan `42790088218` SUCCESS.
- Preview application deployment: `d5ea289a-fa8b-4e96-b5a5-da30074c926c`, SUCCESS for application code head `8455e58955326cc22c6bb8a0afe826f33b57f8d8`, Pages Functions enabled, D1 binding isolated to Preview database `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. The later `9e1c2ddb` commit is test-only and does not change deployed application code. Live Preview UI `GET /trading-lab.html` returned HTTP 200. Preview read-only endpoints: `/api/paper/performance` 200 (zero snapshots), `/api/monitor` 200 (no monitor run/quotes/events in Preview), `/api/paper/readiness` 200 (configured, policy verified, execution disabled, kill switch engaged), and `/api/fmp-health` 503 `MISSING_BINDING` (FMP and Alpaca bindings absent). Preview has only `NORTHSTAR_OPERATOR_TOKEN`; FMP/Alpaca/Gemini provider credentials are absent.
- Production deployment remains `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365`, serving main application commit `839e135dad88849350a7f6f61c929ee8ce4bc046`; no Production deployment was made. Live Production UI `GET /trading-lab.html` returned HTTP 200. Read-only endpoints: `/api/paper/performance` 200 with one snapshot at `2026-11-08T18:34:38.720Z` (equity/cash $100,000; buying power $400,000; no positions/fills); `/api/monitor` 200; `/api/paper/readiness` 200 with execution disabled and kill switch engaged; `/api/fmp-health` 200 `FMP_REACHABLE`, HTTP 200, 31 rows, latest provider date `2026-11-09`. Production FMP authentication is now verified reachable; no secret value was read. Production Alpaca binding names are present, but broker authentication/reconciliation was not tested.
- Production D1 read-only audit: migrations `0001`–`0006`; one stale equity snapshot (`alpaca_paper_read_only_sync`, `2026-11-08T18:34:38.720Z`); zero research-council runs, decision traces, paper orders, positions, intents, broker fills, or trade events. Monitor ledger: 148 runs, latest `2026-11-10T09:20:52.839Z`, aggregate zero symbols checked and zero errors; zero quote rows and zero event rows. `northstar_strategy_approval` is absent in Production. Preview D1 migrations are `0001`–`0012`, with zero research/paper/monitor/snapshot rows and strategy approval `approved=0`.
- Worker/cron: `northstar-market-monitor` deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version `2739d49a-4182-423f-8113-616252c5ddd6`, 100%; cron `*/5 * * * *`.
- Open-PR audit: #103 is 184 ahead / 3 behind and diverged (do not merge); #85 is draft, 490 ahead / 15 behind and conflicts with Production's already-applied `0006_continuous_market_monitor.sql` (do not merge/apply); #88 is draft, 26 ahead / 22 behind and its public-readiness/visibility assumptions remain unresolved; #107 is 3 ahead / 0 behind, open/non-draft/mergeable, no review; #109 is draft, 5 ahead / 0 behind; #110 is draft, 15 ahead / 0 behind and overlaps PR #108 in adapters/FMP paths; #111 is draft, 1 ahead / 0 behind and overlaps FMP diagnostics. Do not merge these branches without reconciliation and independent review.
- Repository visibility remains unresolved: owner states private; GitHub API reports `visibility=public`; Settings has not been independently verified. Treat contents as publicly accessible; no visibility change was made. Branch-protection/ruleset access remains unverified (prior API read returned 403); no bypass was attempted.
- Database/configuration/safety impact: no D1 writes or migrations; no Cloudflare secret reads/changes; no broker API calls; no order actions; no execution-control changes; no Production deployment. No operator token was supplied and no authenticated `POST /api/research/collect` was invoked. Production execution remains `enabled=0`, `mode=paper`, `kill_switch=1`; Preview has the same closed controls. No paper or live order was submitted.
- Complete: news chronology gate implemented; regression tests and exact-head CI passed; Preview application deployed; Preview and Production read-only UI/health routes verified; Production FMP provider health now reachable.
- Still blocked: one stale Production snapshot and no genuine seven-day equity baseline; no fresh reconciled broker snapshot; Preview provider credentials absent; operator-token-protected collector acceptance not run; independent PR review and branch governance; Production schema parity/strategy approval; repository visibility verification. Strategy validation remains NOT APPROVED, paper lifecycle NOT READY, and validated BUY remains disabled.
- Exact next action: continue reviewing/reconciling PR #110's evidence-first specialists with #108 without merging duplicate FMP changes; obtain authorized Preview provider bindings; allow verified read-only snapshots to accumulate until a genuine seven-day baseline exists; then run one controlled authenticated research-only acceptance and verify all nine roles, vetoes, scorecard, telemetry, durable persistence, and idempotent replay. Keep execution disabled, kill switch engaged, and BUY disabled.


## 2026-11-10 14:30 PKT / 2026-11-10 09:30 UTC — synthetic acceptance milestone and remaining release gates

## 2026-11-10 14:30 PKT / 2026-11-10 09:30 UTC — synthetic nine-agent collector acceptance

- Phase: Phase 2 — nine-agent Research Council / Stock Brain.
- Objective: exercise the complete protected collector path under deterministic synthetic dependencies, without contacting real providers/brokers or touching Production.
- Test added: `tests/research-collector-integration.test.mjs`. It uses a fake D1 binding, synthetic seven-day equity baseline, mocked quote/FMP/SEC/news/earnings/Gemini responses, and dummy credentials. It executes pre-sync reconciliation, read-only Alpaca GETs, read-only snapshot sync into fake D1, all nine Council roles, deterministic risk committee, scorecard/telemetry generation, durable `research_council_runs` persistence, and idempotent replay. Assertions: 9/9 roles complete; 9/9 telemetry roles measured; durable trace/scorecard present; `execution=false`; `automatedOrderSubmission=false`; broker calls GET-only; no paper-order or trade-intent writes; replay performs no provider/broker calls and no extra writes.
- Exact implementation/test head: `404aa7393e09fa435910db7d25f5da5734b0ec54`; PR #108, branch `northstar/stock-brain-clean-review-20261110`, OPEN/non-draft/mergeable, 15 ahead / 0 behind main `d1a966debfc69b59ac465f942d807720ae585c71`. Independent review submissions remain zero.
- Exact-head CI: Tests `42791018413` SUCCESS (232 JavaScript tests, 94 Python tests; synthetic collector acceptance subtest passed); Validate `42791018008` SUCCESS; full-history secret scan `42791018022` SUCCESS.
- Deployment state: this commit changes tests only. The latest Preview runtime remains deployment `0509b9e0-e9a0-4816-a5df-de79429d2b90` for docs head `4b2859c6a2a4cfa28d702f67007ed20e2af82fa7`, SUCCESS, Pages Functions enabled, isolated Preview D1 `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. Its UI and read-only health endpoints were separately verified; Preview FMP health remains 503 `MISSING_BINDING`, and Preview paper-performance/monitor datasets remain empty.
- Production evidence unchanged: Pages deployment `2054cdeb-b9bf-41d8-a6f8-8e5004ba7365` on `839e135dad88849350a7f6f61c929ee8ce4bc046`; Production FMP health is HTTP 200 `FMP_REACHABLE` (31 rows, latest date 2026-11-09); one stale equity snapshot remains at `2026-11-08T18:34:38.720Z`; 148 monitor runs, zero symbols checked/errors/quotes/events; zero Council runs/traces and zero paper orders/positions/intents/fills/events. Production execution remains disabled with kill switch engaged.
- Database changes: none in this test run; all D1 activity is in-memory fake state. No real D1 writes/migrations, secret reads/changes, broker API calls, order actions, execution-control changes, or Production deployments. No authenticated collector POST was invoked outside the synthetic test.
- Safety impact: verifies the collector's research-only path and idempotent durable trace without enabling paper execution or submitting any order. This is a SYNTHETIC integration acceptance test, not Production/Preview provider acceptance and not strategy validation.
- Complete: synthetic end-to-end collector test passed on exact head; 232 JS + 94 Python tests and all validation/secret-scan workflows passed.
- Still blocked: real Production collector acceptance requires a fresh reconciled snapshot and genuine seven-day baseline; Preview FMP/Alpaca/Gemini bindings remain absent; operator-authenticated run not attempted; independent PR review and branch governance remain outstanding. Strategy validation NOT APPROVED, paper lifecycle NOT READY, validated BUY disabled.
- Exact next action: inspect PR #110's evidence-first specialists and PR #109's news-quality work for safe integration into #108 without duplicating FMP diagnostics; then obtain independent review/governance and resolve the real-data prerequisites before a controlled authenticated research-only acceptance. Keep execution disabled and kill switch engaged.



## 2026-11-10 15:41 PKT / 10:41 UTC — live Preview isolation repair, specialist merge and current acceptance checkpoint

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE; no scanner rebuild was started.
- Objective: restore and verify Cloudflare Pages Preview/Production D1 isolation after detecting live configuration drift; synchronize the clean Stock Brain PR with current main, including the five deterministic evidence-first specialists and canonical provider diagnostics; add a reusable read-only live-binding verifier.
- Repository: main is `485b1d3f4b7e552fa54f26f09503a1a0e4d6cb74`. PR #108 branch `northstar/stock-brain-clean-review-20261110` now has merge commit `7f1f050887ffac381ded1e142fa8bdcd09b130b4`, 17 ahead / 0 behind main, OPEN, non-draft and mergeable. The merge brings in main's specialist implementation and Gemini/FMP diagnostics without rewriting main. PR #108 still has zero formal reviews; do not merge before independent review and release governance.
- Council integration: five deterministic evidence-first specialists (`market_scanner`, `technical_analyst`, `fundamental_analyst`, `news_analyst`, `sentiment_analyst`) are now wired into the council adapter; `bull_researcher`, `bear_researcher`, and `portfolio_analyst` remain model-backed with constrained evidence-only prompts; `risk_committee` remains deterministic. The nine-role dashboard/collector and synthetic nine-agent integration test remain in the PR branch.
- CI on merge commit `7f1f050887ffac381ded1e142fa8bdcd09b130b4`: Tests run `42801050518`, Validate run `42801050399`, full-history secret scan run `42801050364`, Push Tests run `42801042729`. They were observed IN_PROGRESS at the initial post-push check; final results must be read from GitHub Actions before merge. A follow-up documentation/test commit will have its own exact-head runs.
- Cloudflare Preview repair: before correction, live Pages project metadata showed both Preview and Production `NORTHSTAR_DB` bound to Production D1 `528f3a23-1d1f-4d16-8463-f643d85f5deb`. A separate Preview database `bdffc29f-a4f6-498e-ade7-22c85d9bd373` existed. The Pages project PATCH changed only Preview `NORTHSTAR_DB` to that isolated database; Production binding remained unchanged. Immediate GET read-back confirms Preview=`bdffc29f-a4f6-498e-ade7-22c85d9bd373`, Production=`528f3a23-1d1f-4d16-8463-f643d85f5deb`, and `fail_open=false` in both environments. Preview operator-token binding and Production secret-name bindings were preserved; secret values were never read or changed.
- Preview deployment: `28ad4278-1ef7-49a7-b7f4-6527f5639844`, SUCCESS, exact commit `7f1f050887ffac381ded1e142fa8bdcd09b130b4`, Pages Functions enabled. Preview URL: `https://28ad4278.ai-stock-advisor.pages.dev`. UI `GET /trading-lab.html` returned HTTP 200 and rendered Stock Brain. Read-only Preview APIs: `/api/paper/performance` 200 (0 snapshots, no positions/fills, execution=false); `/api/monitor` 200 (no Preview runs/quotes/events); `/api/paper/readiness` 200 (configured and policy verified, paper mode, execution disabled, kill switch engaged); `/api/fmp-health` 503 `MISSING_BINDING` (FMP/Alpaca/Gemini bindings absent in Preview). These runtime results agree with the isolated Preview D1 ledger. No authenticated collector POST was invoked.
- Production Pages remains on deployment `a1663ff7-f9bc-4a9f-abf2-46bbe983af77`, serving main commit `485b1d3f4b7e552fa54f26f09503a1a0e4d6cb74`; no Production deployment was made.
- Production D1 read-only evidence: migration ledger `0001`–`0006`; one stale equity snapshot at `2026-11-08T18:34:38.720Z`; 164 monitor runs, all `market_closed`, zero symbols checked/errors, zero monitor quotes/events; zero research-council runs/traces; zero paper orders, positions, intents, broker fills and trade events. Production execution control remains `enabled=0`, `mode=paper`, `kill_switch=1`. Preview ledger is `0001`–`0012`; its research, monitor, equity and paper lifecycle tables are empty; Preview controls remain disabled and kill-switched. Production does not yet contain the Preview-only `northstar_strategy_approval` table; no schema migration was applied.
- Worker/cron: `northstar-market-monitor` remains deployed at 100% on deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version `2739d49a-4182-423f-8113-616252c5ddd6` (version 3). Cron remains `*/5 * * * *`. Uploaded version 6 `1690bbc4-a330-42ce-834e-e999b583c648` is Preview-only and has not been promoted. The 164 Production runs were all market-closed; no market-open quote/event cycle has been verified.
- Regression guard: added `scripts/verify_pages_d1_isolation.mjs`, a read-only Cloudflare Pages project verifier that compares live Preview/Production D1 bindings and `fail_open` settings against `web/wrangler.toml`. Tests use an injected fake fetch and never require or expose a real API token. The live connector read-back above is the actual configuration verification; CI tests validate the verifier logic, not live Cloudflare credentials.
- Files changed in this work item: `scripts/verify_pages_d1_isolation.mjs`, `tests/pages-d1-environment-isolation.test.mjs`, `NORTHSTAR_BLOCKERS.md`, `docs/NORTHSTAR_PROJECT_HANDBOOK.md`, `docs/BUILD_PLAN.md`, `docs/STOCK_BRAIN_SPEC.md`, `docs/CONTINUOUS_MARKET_MONITOR.md`, `web/docs/NORTHSTAR_RESEARCH_COUNCIL.md`.
- Commit: this documentation/test follow-up is committed on PR #108 after merge commit `7f1f050887ffac381ded1e142fa8bdcd09b130b4`; its exact SHA and exact-head CI IDs are recorded in Git history/PR checks after push.
- Database changes: none. Cloudflare project configuration only: Preview binding corrected; no D1 writes or migrations. No secrets read or mutated, no broker calls, no order actions, no execution-control changes, and no Production deployment.
- Safety impact: Preview can no longer share the Production paper/research ledger. Production remains unchanged, execution-disabled and kill-switched. No paper or live order was submitted. BUY remains disabled.
- Complete: latest main merged into the Stock Brain review branch; five deterministic specialists integrated with the existing four-role model/deterministic design; Preview D1 binding corrected and API-read-back verified; exact-head Preview UI and four read-only API routes verified; live-binding verifier and regression tests added.
- Still blocked: Preview FMP/Alpaca/Gemini credentials are absent; Production has only one stale snapshot and no genuine seven-day equity baseline; fresh read-only Alpaca reconciliation is not verified; Production schema is behind Preview; controlled authenticated collector acceptance is not run; PR #108 has no independent review; main branch governance remains unverified; repository visibility remains unresolved (owner intent private, GitHub API reports public). Strategy validation NOT APPROVED; paper lifecycle NOT READY; validated BUY disabled.
- Exact next action: finish and record exact-head CI on the follow-up commit; verify the latest Preview deployment and read-only routes again; reconcile open PRs #109 and #111 against the now-merged specialist/FMP work to avoid duplicate code; obtain independent review and release governance. Do not run the protected collector until the fresh seven-day portfolio baseline and read-only broker reconciliation gates are genuinely satisfied. Keep execution disabled, kill switch engaged and BUY disabled.


## 2026-11-10 16:03 PKT / 11:03 UTC — Phase 2 Research Council checkpoint

- Main: `485b1d3f4b7e552fa54f26f09503a1a0e4d6cb74`. PR #108 branch `northstar/stock-brain-clean-review-20261110`: 21 ahead / 0 behind; test head `f97af5ff8a37440f14dbf4715d2fa25a74a4a634`; no independent review yet.
- CI: Tests `42803828769`, Validate `42803828737`, full-history secret scan `42803828623` all SUCCESS. JavaScript suite 264/264; Python test step and Ruff passed.
- Implemented/tested: nine-role result matrix, durable synthetic scorecard/trace, idempotent replay, broker GET-only assertions, deterministic-first specialist telemetry. Synthetic collector correctly returns NO_TRADE because no eligible timestamped news or dedicated sentiment feed exists; downstream bull/bear/portfolio/risk stages remain BLOCKED. This is intentional fail-closed behavior, not a successful live acceptance.
- Infrastructure: Cloudflare Pages Preview D1 project binding corrected to isolated Preview database `bdffc29f-a4f6-498e-ade7-22c85d9bd373`; Production remains `528f3a23-1d1f-4d16-8463-f643d85f5deb`; `fail_open=false` in both. Existing pre-correction Preview deployments are not trusted; new Preview endpoint verification is pending.
- Production GET smoke: paper readiness, performance, monitor and FMP health all HTTP 200. Production D1 has migrations 0001–0006, one stale snapshot, 168 market_closed monitor runs, zero research traces/runs and zero paper lifecycle rows. Controls remain disabled/paper/kill-switched.
- Blocked: timestamped news and sentiment inputs, Preview provider credentials, fresh reconciled seven-day equity baseline, independent PR review/governance, Production schema parity and verified repository visibility. Strategy validation NOT APPROVED; paper lifecycle NOT READY; BUY disabled.
- Next exact action: verify the fresh isolated Preview deployment after the runbook update, then reconcile #109/#111 into #108 without duplicate provider code. Do not invoke the protected collector until all live-data and broker-reconciliation gates are met.


## 2026-11-10 17:31 PKT — Phase 2 OIDC hardening and live acceptance checkpoint

- Phase 1 universe scanning remains user-confirmed COMPLETE.
- Phase 2 code/test head: `b8fb8704e8cbbe0720808098c99bb8a703f9e46e` (OIDC NumericDate type hardening and regression tests); implementation commit `47e2a19b37e78b9a2ee8c5076fb02885bccf6eaf`; PR #108.
- Exact-head CI: Tests `42817051649` PASS (274 JS tests, 94 Python tests, Ruff); Validate `42817052712` PASS; full-history secret scan `42817051960` PASS.
- Preview: deployment `2e9280db-2275-49cc-a473-ac117013dbfa` SUCCESS for implementation commit; Trading Lab 200; paper readiness 200 (execution disabled / kill switch engaged); monitor 200; FMP health 503 MISSING_BINDING (Preview provider secrets absent). Preview D1 is isolated.
- Production Pages: `3782f3e9-0d2e-4d04-b95a-4dcd931a6133` SUCCESS for main `3f765d8dd0f9099e05df57d09c9f48c9b247ba9c`; no Production deploy by this work item.
- Production D1: migrations 0001–0006; 2 equity snapshots (latest `2026-11-10T11:42:59.813Z`), not a seven-day baseline; 186 monitor runs, all market_closed / 0 symbols / 0 errors; no council runs/traces or paper lifecycle rows; execution disabled and kill switch engaged. Preview migrations 0001–0012 and empty research/paper ledgers.
- No database writes/migrations, secret changes, broker calls, order actions, execution-control changes or Production deployment. Strategy validation NOT APPROVED; paper lifecycle NOT READY; BUY disabled.
- Next: reconcile news-quality helper PR #109 into the canonical Council evidence path without adding recommendation authority; keep collector gated until seven-day history and broker reconciliation are verified.


## Phase 2 — SEC-primary fundamental fallback (2026-11-10 17:58 PKT)

- [x] Synchronize Stock Brain PR #108 with current main; branch is 56 ahead / 0 behind.
- [x] Make the FMP fundamentals endpoint best-effort; SEC company facts remain the primary reported-fundamentals source.
- [x] Record missing FMP cross-check as an explicit resource gap and source mode, never as fabricated data.
- [x] Preserve the hard requirement for FMP daily price history, fresh quote, read-only Alpaca reconciliation, current equity snapshot and genuine seven-day baseline.
- [x] Add unit and synthetic collector regression coverage for SEC-only fundamentals with unavailable FMP statement cross-check.
- [x] Exact-head CI: Tests 42819884077, Python tests 42819884062, full-history secret scan 42819884161; Cloudflare Pages check SUCCESS.
- [x] Preview deployment 98773cbf-8748-4ff9-999a-dbfca4cc84c6 and read-only route smoke verified.
- [ ] Obtain independent review and authorized branch-governance confirmation for PR #108.
- [ ] Resolve FMP daily-history authentication or approve a separately reviewed, licensed alternative.
- [ ] Configure Preview FMP/Alpaca Paper/Gemini credentials without exposing values.
- [ ] Establish a fresh reconciled Production snapshot and genuine seven-day equity baseline.
- [ ] Connect a real timestamped sentiment/positioning source and verify news chronology/source quality.
- [ ] Perform one authenticated research-only acceptance run; verify nine roles, deterministic vetoes, scorecard, telemetry, durable trace and idempotent replay.
- [ ] Reconcile Production/Preview D1 migration histories before any future Production migration.
- Safety: no Production D1 writes/migrations, secret changes, broker requests, orders, execution-control changes or Production deployment. Execution remains disabled and kill switch engaged; validated BUY remains disabled.


## Data-provider licensing gate — 2026-11-10 18:02 PKT

- [x] Screen official no-cost alternatives before selecting a fallback.
- [x] Reject Alpha Vantage free access for the current public deployment unless a written commercial agreement is in place.
- [x] Reject Twelve Data Free Tier for commercial/public use under its current terms; Basic is for testing/side projects.
- [x] Do not substitute unofficial Yahoo/Stooq scraping or personal-use data plans.
- [ ] Restore valid authorized FMP daily-history access or obtain a provider/plan with documented public-display and derived-data rights.
- [ ] Only then implement and test an alternate history adapter; preserve source, timestamps, adjustment policy, rate limits, attribution and fail-closed behavior.
- Evidence: Alpha Vantage Terms https://www.alphavantage.co/terms_of_service/; Twelve Data Terms https://twelvedata.com/terms; Twelve Data pricing https://twelvedata.com/pricing.
- Safety: no credentials read/changed, no database writes, no broker calls/orders, no deployment or strategy approval.


## Phase 2 review-surface cleanup and provider decision — 2026-11-10 18:03 PKT

- [x] Consolidate Stock Brain implementation and evidence in PR #108.
- [x] Close PR #111 as superseded by current main/PR #108 (FMP key/diagnostic code and current tests already present).
- [x] Close PR #112 as superseded by PR #108 (capital-basis changes already present and tested).
- [x] Keep PR #103 open pending full diff reconciliation; do not discard its unreviewed changes blindly.
- [x] Screen no-cost provider alternatives against official terms; reject Alpha Vantage personal/non-commercial access and Twelve Data Free Tier for public deployment absent appropriate commercial/display rights.
- [ ] Obtain authorized valid FMP daily-history access or a licensed alternative.
- [ ] Obtain independent review and governance approval for PR #108; main is not protected.
- [ ] Establish fresh reconciled snapshot, genuine seven-day baseline, news/sentiment evidence and authenticated research-only acceptance.
- Evidence: latest CI on 5ab317d87e39edcdb10ed8560a6ec2f44a87ee8d — Tests 42820802873, Python tests 42820803006, secret scan 42820802939 all PASS. Docs-only Pages deployment skipped by path_config; latest successful Functions Preview cf2c1da8-9c6a-44f8-9715-163b1165044e.
- Safety: no D1 writes/migrations, secret changes, broker calls/orders, execution-control changes or Production deployment; BUY remains disabled.


## Sentiment-provider due diligence — 2026-11-10 18:05 PKT

- [x] Confirm Stocktwits developer API registration is currently closed to new registrations during its API/terms review.
- [x] Confirm Reddit Data API requires a separate agreement for commercial use and explicit approval; do not use unapproved access.
- [x] Preserve the deterministic sentiment analyst's UNAVAILABLE result when no authorized timestamped feed exists.
- [x] Do not infer crowd sentiment from price moves or news headlines and do not use unofficial scraping/wrappers.
- [ ] Obtain approved sentiment/positioning data rights and credentials.
- [ ] Implement a source-specific adapter preserving timestamp, population, source, sample count, normalized score, lookback and retention policy; add tests for future/missing timestamps, source concentration and population separation.
- Evidence: Stocktwits developer page https://api.stocktwits.com/developers; Reddit Data API Terms https://redditinc.com/policies/data-api-terms; Responsible Builder Policy https://support.reddithelp.com/hc/en-us/articles/16471395473812-Moderation-Bots-Tooling.
- Safety: no code or runtime changes; no data collection, credentials, D1 writes, broker calls/orders or deployment.


## Phase 2 — sentiment source gate and verification (2026-11-10 18:06 PKT)

- [x] Confirm Stocktwits API registration is closed to new applications during its API/terms review.
- [x] Confirm Reddit Data API commercial use requires a separate agreement and API access approval.
- [x] Preserve sentiment_analyst as UNAVAILABLE without an authorized timestamped source.
- [x] CI on 35b3c0a2a2f5ebb6d83c9adcb0869fe2313ff066: Tests 42821213045, Python tests 42821212956, secret scan 42821212740, Cloudflare Pages SUCCESS; duplicate Tests run 42821204983 PASS.
- [x] Preview 93907c0b-8f5b-4d87-9e99-e0de877d0f6b deployed with Functions; Trading Lab and readiness smoke 200, FMP health 503 due missing Preview bindings.
- [ ] Obtain authorized FMP daily-history access and approved timestamped sentiment/positioning source.
- [ ] Establish fresh reconciled snapshot and genuine seven-day equity baseline.
- [ ] Complete authenticated research-only nine-role acceptance and durable trace/replay verification.
- [ ] Obtain independent PR #108 review and governance approval before merge.
- Safety: no D1 writes/migrations, secrets, broker calls/orders, execution-control changes or Production deployment; BUY remains disabled.

## Phase 2 — scorecard telemetry accounting correction (2026-11-10 18:25 PKT / 13:25 UTC)

- [x] Restrict token/cost aggregation to the three model-assisted roles: Bull, Bear and Portfolio.
- [x] Keep latency/provider/version telemetry for all nine roles, including six deterministic roles.
- [x] Force deterministic role token/cost fields to null and add a regression with deliberately misleading deterministic usage values.
- [x] Exact-head CI: Tests `42824109684`, Validate `42824109727`, full-history secret scan `42824110005` — all SUCCESS.
- [x] Exact-commit Preview deployment `33dac559-e3c9-41ff-b394-afbf25dda626` — SUCCESS; Trading Lab and paper read-only endpoints 200; Preview FMP health 503 MISSING_BINDING.
- [ ] Independent PR #108 review and branch governance; fresh seven-day Production equity baseline; Preview provider bindings if Preview provider acceptance is required; controlled authenticated research-only acceptance.
- Database changes: none. Production remains execution-disabled and kill-switched; BUY remains NOT APPROVED.

## Phase 2 — read-only OIDC snapshot workflow integration (2026-11-10 18:34 PKT / 13:34 UTC)

- [x] Replace the GitHub Actions operator-secret dependency with a short-lived, audience-pinned GitHub OIDC token.
- [x] Route scheduled capture through the server-side `POST /api/paper/snapshot` handler, which performs pre/post reconciliation, read-only sync, persistence verification and idempotent audit.
- [x] Add tests for missing/malformed OIDC rejection before D1/provider access and for the workflow's fail-closed OIDC contract.
- [x] Corrected exact-head CI: Tests `42825720825`, Validate `42825720610`, full-history secret scan `42825720633` — all SUCCESS.
- [ ] Verify Preview deployment `141f931c-63e2-41b8-bd06-b052f1c5173b` (last read: queued/idle).
- [ ] Obtain independent review/governance; merge only after review and required checks; verify scheduled workflow on main.
- [ ] Accumulate genuine seven-day Production snapshots and reconciled broker state; do not run paper orders.
- Safety: no database changes/migrations, secret reads/changes, broker requests, orders, Production deployment or execution-control changes. Execution disabled, kill switch engaged, BUY not approved.


## Phase 2 — FMP monitor authentication regression (2026-11-10 19:40 PKT / 14:40 UTC)

- [x] Confirm Production Pages FMP health, history and fundamentals for NVDA; daily history returned 1,255 bars and all 7 requested datasets.
- [x] Identify deployed monitor's FMP key transport as a likely mismatch: Worker used a custom header while the official FMP quickstart documents the `apikey` query parameter.
- [x] Change `monitor/worker.js` to use `?apikey=`; add exact request-contract regression in `tests/continuous-monitor.test.mjs`.
- [x] Exact code/test-head CI: Tests `42836191193`, Validate `42836191199`, secret scan `42836191055`, companion push Tests `42836181974` — all SUCCESS on `3040f164f5bd31ee60b59e55b9cbac68045a8d35`, PR #108.
- [ ] Deploy the separate Worker version only after independent review/release governance; verify market-open quotes and zero provider errors. Current Worker deployment `7326f3e7-f323-4856-badf-aa8b979dffb4` / version `2739d49a-4182-423f-8113-616252c5ddd6` remains at 100% and does not include this fix.
- [ ] Continue Phase 2 acceptance prerequisites: fresh 15-minute read-only snapshot, genuine seven-day baseline, reconciled broker state, authorized sentiment/news sources and model credentials; then one controlled research-only collector run with durable nine-role trace and idempotent replay.
- Database changes: none; SELECT-only audit. No secret mutation, broker call, order or execution-control change. Paper execution disabled; kill switch engaged; BUY not approved.


## 2026-11-10 20:08 PKT / 15:08 UTC — Phase 2 provenance blocker correction

- Phase 1 universe scanning remains COMPLETE and user-confirmed. Phase 2 nine-agent Research Council / Stock Brain remains active.
- Implemented in PR #108 commit 041d2a94c4c2651d3399bce3167148569eec812b: risk history now uses only server-side alpaca_paper_read_only_sync snapshots. Plugin/manual/unknown provenance rows remain in D1 for audit but are excluded from risk calculations. If no verified rows remain, the collector fails closed.
- Regression: mixed trusted/untrusted histories are filtered to trusted rows; all-untrusted and empty histories remain blocked. Files: web/functions/api/research/collect.js; tests/research-collector.test.mjs.
- Exact-head CI: Tests 42840853696 and 42841187476 PASS; Validate 42841187573 PASS; full-history secret scan 42841187556 PASS.
- Exact-head Preview: deployment 22ddcb73-9d93-48d2-8435-bc33bf8f7342 SUCCESS. Trading Lab, readiness, performance and monitor routes HTTP 200; FMP health 503 MISSING_BINDING is expected in isolated Preview. No authenticated collector POST.
- Production remains on Pages deployment 3782f3e9-0d2e-4d04-b95a-4dcd931a6133 / main 3f765d8dd0f9099e05df57d09c9f48c9b247ba9c. D1 migrations 0001–0006; 2 equity snapshots, latest 2026-11-10T11:42:59.813Z from plugin capture and therefore excluded; no trusted seven-day baseline. 0 council runs/traces and 0 paper lifecycle rows. Execution disabled; kill switch engaged.
- Operational regression: monitor Worker still reports 10/10 quote failures on latest runs; the separate FMP query-auth fix in PR #108 commit 3040f164f5bd31ee60b59e55b9cbac68045a8d35 is not deployed. Cron remains */5 * * * *.
- Governance/visibility: PR #108 remains unreviewed; branch-protection GET is 403. GitHub API reports repository public while owner states private; Settings unverified, so visibility remains unresolved and content is treated as public. No visibility change.
- Database changes: none. No Production deployment, D1 write/migration, secret read/change, broker request, order, or execution-control change.
- Status: IMPLEMENTED / CI-PASSED / PREVIEW-VERIFIED; NOT PRODUCTION-VERIFIED; strategy NOT APPROVED; paper lifecycle NOT READY; BUY disabled.
- Next: continue independent review and branch-governance verification; keep collector blocked until fresh trusted 15-minute snapshot, seven-day trusted baseline, reconciliation, provider/auth, news and sentiment gates are genuinely satisfied.


## 2026-11-10 20:31 PKT / 15:31 UTC — latest live Phase 2 audit

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Phase 1 universe scanning remains user-confirmed COMPLETE; no scanner rebuild was started.
- Objective: refresh repository, CI, Preview/Production Pages, Worker/cron, D1, data freshness, Council, strategy and paper-lifecycle evidence; preserve fail-closed gates.
- Source commit: `7fa64406351d5e5dfa36bdec4d8b6ae8ab2f4292` on PR #108 branch `northstar/stock-brain-clean-review-20261110`; main is `3f765d8dd0f9099e05df57d09c9f48c9b247ba9c`. PR #108 is OPEN, non-draft, mergeable, 71 ahead / 0 behind before this docs refresh; formal reviews 0; inline threads 0. Main branch-protection GET returned 403 Resource not accessible by integration; required-check enforcement is unverified. PR #103 is stale/non-mergeable; PR #109 is a separate draft and its news-quality helper is not wired into Council scoring.
- Exact source-head CI: Tests `42842079359`, Validate `42842079254`, full-history secret scan `42842079583` — all SUCCESS on `7fa64406351d5e5dfa36bdec4d8b6ae8ab2f4292`. This docs-only follow-up needs its own exact-head CI; do not inherit these results as proof for the new head.
- Preview: Pages deployment `a20a98b6-a3b4-4b6a-a560-e2deb277fe12` succeeded for `7fa64406351d5e5dfa36bdec4d8b6ae8ab2f4292`, Functions enabled, isolated Preview D1 `bdffc29f-a4f6-498e-ade7-22c85d9bd373`. Live Trading Lab UI returned HTTP 200. Read-only readiness/performance/monitor returned HTTP 200; readiness confirms paper mode, execution disabled and kill switch engaged; Preview snapshots/runs/quotes/events are empty. FMP health returned HTTP 503 `MISSING_BINDING`, expected because Preview has no FMP/Alpaca/Gemini bindings.
- Production: Pages deployment `3782f3e9-0d2e-4d04-b95a-4dcd931a6133` serves main `3f765d8dd0f9099e05df57d09c9f48c9b247ba9c`. Read-only readiness, performance, monitor and FMP-health returned HTTP 200. Production FMP health reports quote 1 row, history 32 rows (latest 2026-11-10), fundamentals 1 row (latest 2026-01-25); this diagnostic is not proof of complete provider coverage or Council acceptance.
- Production D1: migrations `0001`–`0006`; 2 equity snapshots. Only `2026-11-08T18:34:38.720Z` (`alpaca_paper_read_only_sync`) is eligible trusted provenance. `2026-11-10T11:42:59.813Z` is `alpaca_paper_plugin_read_only_capture` and excluded from risk history. No trusted point is yet seven days old; earliest existing trusted baseline reaches seven days at `2026-11-15T18:34:38.720Z`. Council runs/traces 0/0; paper orders/positions/intents/fills/trade events 0; monitor quotes/events 0/0; audit rows 2. Controls: `enabled=0`, `mode=paper`, `kill_switch=1`. Preview D1 migrations `0001`–`0012`, empty, strategy approval `approved=0`.
- Snapshot workflow blocker: scheduled main workflow run `42837941172` failed at job `129905057412`, step 3, because GitHub Actions secret `NORTHSTAR_OPERATOR_TOKEN` was empty/missing. Production readiness precheck passed; sync/reconciliation steps were skipped, so no snapshot was written. PR #108 contains the replacement pinned-OIDC workflow and `POST /api/paper/snapshot` handler, but it is not merged or Production-verified.
- Monitor blocker: Production D1 has 222 monitor runs: 209 `market_closed`, 13 `failed`, aggregate errors 70; zero runs checked symbols and zero quote/event rows. Latest run #222 at `2026-11-10T15:30:53.341Z` failed with `Shortlist cache is stale or incomplete; monitoring fail-closed.` Cache `generatedAt=2026-11-10T11:04:27.273Z`, status success, 253 universe / 201 ranked / 52 excluded; at audit time it was about 4h27 old, beyond the Worker's 4h limit. Latest scheduled refresh observed: run `42803828945` (11:00:13Z–11:04:34Z); no later scheduled cache run was present as of 15:31Z. Worker `northstar-market-monitor` remains deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version `2739d49a-4182-423f-8113-616252c5ddd6` at 100%, cron `*/5 * * * *`. Deployed code still sends FMP auth in a custom header; PR #108 commit `3040f164f5bd31ee60b59e55b9cbac68045a8d35` changes to `apikey` query auth but is not deployed. Current latest failures are stale-cache failures; earlier runs #214–#216 had 10/10 quote failures.
- Council: all nine role integrations, dashboard rendering, durable trace/scorecard and telemetry are implemented on PR #108 and exact source-head CI passed. Synthetic integration is not live acceptance: without eligible timestamped news and a permitted sentiment feed it correctly returns `NO_TRADE` (market scanner, technical and fundamental complete; news/sentiment unavailable; bull/bear/portfolio/risk blocked). Sentiment remains unavailable until a permitted timestamped source is authorized; do not scrape or use unofficial wrappers. Preview provider bindings are absent.
- Strategy validation NOT APPROVED; paper lifecycle NOT READY; validated BUY disabled. No authenticated `POST /api/research/collect` was invoked.
- Database changes: NONE. D1 access was SELECT-only (`rows_written=0`, `changed_db=false`). No migrations, secrets read/changed, broker calls, order actions, execution-control changes or Production deployment.
- Repository visibility unresolved: GitHub API reports `private=false` / public while the owner states private; GitHub Settings has not been verified. Do not change visibility; treat contents as publicly accessible until Settings confirms otherwise.
- Exact next action: obtain independent review and authorized governance for PR #108; after approval/merge, verify the pinned-OIDC scheduled read-only snapshot workflow and separate Worker release. Keep the collector blocked until fresh trusted snapshot, genuine seven-day baseline, broker/ledger reconciliation, provider/auth, eligible news and permitted sentiment gates all pass. Then run one controlled research-only collection and verify all nine outcomes, trace/scorecard, telemetry and idempotent replay. Never enable execution or submit an order.

### Phase 2 acceptance checklist — current state

- [x] Nine roles integrated and visible in Trading Lab on PR #108.
- [x] Durable Council run/trace, scorecard, role telemetry and idempotent replay implemented and covered by synthetic integration tests.
- [x] Exact source-head Tests/Validate/secret scan passed; Preview UI and read-only readiness/performance/monitor endpoints verified.
- [ ] Independent review and authorized branch governance for PR #108; no merge before this gate.
- [ ] Merge/release PR #108, then separately verify Production Pages Functions and OIDC snapshot workflow; CI alone is insufficient.
- [ ] Restore scheduled read-only snapshot path without a GitHub operator secret; verify fresh trusted snapshots and broker/ledger reconciliation.
- [ ] Accumulate genuine seven-day trusted equity baseline; earliest existing trusted point reaches seven days at 2026-11-15 18:34:38.720Z.
- [ ] Resolve stale shortlist refresh and deploy the separately reviewed FMP query-auth Worker version; verify market-open quotes.
- [ ] Connect only authorized timestamped news and sentiment sources; keep unavailable roles explicit.
- [ ] Run one controlled research-only collection only after every collector gate passes; verify all nine statuses, reports/vetoes, trace/scorecard, telemetry and replay with zero order writes.
- Universe scanning remains COMPLETE and user-confirmed; do not rebuild it absent a demonstrated regression.


## 2026-11-10 20:36 PKT / 15:36 UTC — production research-input freshness addendum

- Phase/objective: Phase 2 Council acceptance; verify the live quote/history/news/earnings inputs without invoking the collector. Universe scanning remains COMPLETE; this is a provider smoke, not a scanner rebuild.
- Source commit under audit: `131e5e6c41cad84ba16a01a4dec3292e5eb63b4f`; PR #108 branch is 72 ahead / 0 behind main `3f765d8dd0f9099e05df57d09c9f48c9b247ba9c`. PR #108 remains open with no independent reviews; main branch-protection evidence remains unavailable. Exact-head Tests push run `42845606056` passed. No exact-head Validate or secret-scan run has yet been observed; prior code head `7fa64406351d5e5dfa36bdec4d8b6ae8ab2f4292` had Tests `42842079359`, Validate `42842079254`, secret scan `42842079583` all SUCCESS.
- Exact Preview deployment `943d2f90-65a0-4ac5-9c7e-b6e6bf8a62b3` succeeded for `131e5e6c41cad84ba16a01a4dec3292e5eb63b4f`. Firecrawl smoke: Trading Lab UI 200; readiness/performance/monitor 200; Preview FMP health 503 MISSING_BINDING as expected. Preview D1 remains isolated and empty; no POST was made.
- Production read-only research input smoke at approximately 15:35Z: `GET /api/fmp-history?ticker=NVDA` returned HTTP 200, 1,255 daily bars from 2021-11-10 through 2026-11-10 and 7/7 requested datasets; separate FMP news coverage was 0. `GET /api/quote?ticker=NVDA` returned HTTP 200 with a Nasdaq-labelled quote timestamped 2026-11-10T15:35:00Z (fresh at retrieval). `GET /api/news?ticker=NVDA` returned timestamped discovery items, but every returned item had `publisherVerified=false` and discovery/redirect attribution; treat these as unverified discovery claims, not original-source corroboration. The current news analyst may report dated items with explicit unverified-source risks; do not promote them to verified catalysts. `GET /api/earnings?ticker=NVDA` returned a Nasdaq calendar event for 2026-11-17 AMC with `verified=true`; still verify against issuer IR before trading. No provider/model credentials were read.
- Sentiment remains the decisive upstream Council gap: no dedicated permitted timestamped sentiment/positioning feed is connected. Therefore the downstream debate/synthesis/risk chain must remain blocked when sentiment is unavailable. PR #109's quality helper remains separate and not wired into live Council scoring.
- Database changes: NONE; all calls were GET-only. No authenticated collector POST, D1 write/migration, broker request, order, execution-control change or Production deployment.
- Status: provider quote/history smoke VERIFIED for this symbol; live Council acceptance NOT RUN; news is discovery-only; sentiment UNAVAILABLE; strategy NOT APPROVED; paper lifecycle NOT READY; BUY disabled.
- Exact next action: preserve the source-quality caveat and obtain a permitted timestamped sentiment feed plus independent PR #108 review/governance. Do not run the collector until the trusted seven-day baseline, fresh snapshot, reconciliation, auth and evidence gates all pass.


## 2026-11-10 20:38 PKT / 15:38 UTC — sentiment-source alternatives and exact-head verification

- Phase/objective: finish the independent sentiment-source investigation for Phase 2 and refresh exact-head CI/Preview evidence; no production collection or order endpoint was invoked.
- Source commit under audit: `f9a52aa3ad877382eba7ff66129e25fc1563a766` on PR #108, 73 commits ahead / 0 behind main. PR #108 remains open; independent reviews 0; branch protection still not readable (403); mergeability state is unknown, not confirmed conflict-free. Exact-head CI all SUCCESS: Tests push `42846179313`, Tests PR `42846199256`, Validate `42846200399`, full-history secret scan `42846199331`.
- Exact Preview deployment `57dde387-e8ec-42d9-a87e-79cf5ab0dd28` succeeded. Smoke: Trading Lab UI 200; readiness/performance/monitor 200; paper mode/locked execution/kill switch confirmed; FMP health 503 MISSING_BINDING as expected in isolated Preview. No Preview writes.
- Provider alternatives evaluated:
  1. FMP Historical Social Sentiment exists only in FMP's legacy endpoint documentation and its example timestamp is a timezone-less string (for example `2022-06-30 23:00:00`). It cannot meet Northstar's exact point-in-time chronology requirement until FMP confirms timezone semantics. FMP's official public-app/client-dashboard guidance says the agreement must cover the intended users, datasets and delivery method; an individual API plan is not sufficient evidence of commercial display/redistribution rights. Do not use it for Council sentiment until both written rights and timestamp semantics are confirmed. Sources: https://site.financialmodelingprep.com/developer/docs/social-sentiment-api and https://site.financialmodelingprep.com/insights/platform/can-you-use-fmp-data-in-a-public-app-website-or-client-dashboard
  2. Finnhub documents a `/stock/social-sentiment` endpoint for Reddit/Twitter. Its official Startups/Enterprise pricing lists Social Sentiment and commercial use/redistribution rights under Enterprise with contact-sales pricing. Public schema examples expose `atTime` as a timezone-less local datetime, so timezone semantics also require written confirmation. No Finnhub commercial contract or API credential is connected. Do not integrate until licensed and timestamp-qualified. Source: https://api.finnhub.io/pricing-startups-and-enterprise
  3. News discovery is not a substitute for social sentiment. Current production news items are timestamped but publisherVerified=false and redirect/discovery attributed; the News Analyst may report them with explicit source-quality risks, not as verified catalysts. The Nasdaq earnings calendar event for 2026-11-17 AMC is a separate event input, not sentiment.
- Current production input smoke remains: FMP history 1,255 bars and 7/7 datasets through 2026-11-10; quote timestamp 2026-11-10T15:35:00Z; news discovery items present but unverified; Nasdaq earnings event found. No sentiment feed. The collector was not called.
- Database changes: NONE; GET-only provider checks and SELECT-only D1 audit. No secrets read/changed, broker requests, orders, execution-control changes or Production deployment.
- Status: source alternatives researched; no safe credential-free/licensed/timezone-qualified sentiment provider can be enabled now. Sentiment Analyst remains UNAVAILABLE; downstream Council roles remain blocked; strategy NOT APPROVED; paper lifecycle NOT READY; BUY disabled.
- Exact next action: obtain independent review/governance for PR #108. Separately, only after the owner has a commercial provider agreement and provider-confirmed UTC/timezone semantics, add a provider adapter with timestamp/coverage/volume/quality tests. Until then, keep sentiment explicitly unavailable and keep the collector blocked by the remaining gates.


## 2026-11-10 21:36 PKT / 16:36 UTC — current Phase 2 status overlay

- Universe scanning remains COMPLETE and user-confirmed; no rebuild initiated.
- Phase 2 Research Council implementation is on PR #108 head `c2a3a061d1423db0641223c1d8466d750b58041e`, 74 ahead / 0 behind main. Exact-head Tests `42846592976`, Validate `42846592970`, secret scan `42846592843` all passed. PR remains open, non-draft, mergeable, and has zero independent formal reviews; branch protection is not verifiable (403). No merge.
- Latest Preview `020c9c4d-bb0d-41c6-bd17-2ba4b1a70738` on `c2a3a061d1423db0641223c1d8466d750b58041e` shows Stock Brain UI; Production `3782f3e9-0d2e-4d04-b95a-4dcd931a6133` remains on main `3f765d8...` and does not yet show Stock Brain.
- Production Council runs/traces remain 0; trusted snapshot history remains one row; sentiment unavailable; monitor latest run #235 fail-closed on stale shortlist. Strategy NOT APPROVED, BUY disabled, paper lifecycle NOT READY, execution disabled and kill switch engaged.
- Files updated in this work item: handbook, blockers, build plan, Stock Brain spec, monitor runbook, paper-readiness runbook. Audited source commit `c2a3a061d1423db0641223c1d8466d750b58041e`; documentation commit is recorded in the PR/commit history. No database changes, secrets, broker calls, orders, migrations, production control changes or deployments.
- Exact next action: independent review/governance for PR #108; then approved Production Pages/OIDC verification, separate Worker release, fresh trusted seven-day snapshot history, permitted sentiment source and controlled research-only acceptance. Do not restart scanner work.


## 2026-11-10 — documentation evidence commit pointer
- Phase: Phase 2 Research Council / Stock Brain live acceptance and operations audit.
- Source/code head audited: `c2a3a061d1423db0641223c1d8466d750b58041e`.
- Consolidated six-file evidence refresh commit: `c9a7a4add2a5cdb3e4b93f2c3d9ebd8ff04a3a3e` (handbook, blocker log, build plan, Stock Brain spec, monitor runbook, paper-readiness runbook).
- PR: #108. Exact-head push Tests for the evidence refresh: run `42856710511` SUCCESS. Pull-request Validate and full-history secret scan were not observed for this docs-only Git-data ref update; prior code-head PR runs on `c2a3a061` remain successful and are not represented as tests on the documentation head.
- Database changes: NONE. Deployment: no Production deployment; Preview static evidence remains deployment `020c9c4d-bb0d-41c6-bd17-2ba4b1a70738` on the source/code head.
- Safety: research-only; execution disabled, kill switch engaged, BUY disabled; no broker calls or orders.
- Exact next action: complete independent review/governance for PR #108, then verify all release checks on the approved final head before merge/deploy.


## 2026-11-10 21:41 PKT / 16:41 UTC — monitor follow-up run #236

- Phase: Phase 2 Research Council / Stock Brain; this is an operational evidence refresh, not a scanner rebuild.
- Production D1 latest monitor run #236 started `2026-11-10T16:40:54.078Z`, completed `16:40:54.514Z`, status `failed`, symbols_checked 0, errors 0, detail `Shortlist cache is stale or incomplete; monitoring fail-closed.`. Latest runs #234–#236 share the same fail-closed stale-cache reason. Ledger now has 236 runs: 27 failed, 209 market_closed, aggregate errors 70, and 0 symbols checked across all runs; monitor_quotes=0 and monitor_events=0.
- The cache refresh workflow remains scheduled at `7 */3 * * *`; latest recorded successful run remains `42803828945` (started `11:00:13Z`, completed `11:04:34Z`). No later 14:07Z scheduled run is present in the observed Actions list. Do not bypass the freshness gate or rerun/rebuild the completed universe scanner without a specific code regression.
- Production Worker remains deployment `7326f3e7-f323-4856-badf-aa8b979dffb4`, version 3 `2739d49a-4182-423f-8113-616252c5ddd6` at 100%, cron `*/5 * * * *`. Version 6 `1690bbc4-a330-42ce-834e-e999b583c648` is Preview-only; the FMP auth fix in PR #108 is not deployed.
- Preview application deployment remains `020c9c4d-bb0d-41c6-bd17-2ba4b1a70738` on code head `c2a3a061d1423db0641223c1d8466d750b58041e`. Documentation-only Pages deployments for `c9a7a4a` and `0b781e3` were explicitly skipped by `path_config`; no application deployment was expected. Production Pages remains `3782f3e9-0d2e-4d04-b95a-4dcd931a6133` on main `3f765d8dd0f9099e05df57d09c9f48c9b247ba9c`.
- Latest docs pointer head `0b781e318b412286331a96b75733ca0d315f3cb9` Tests push run `42856924887` SUCCESS. The previous evidence-refresh head `c9a7a4add2a5cdb3e4b93f2c3d9ebd8ff04a3a3e` Tests push run `42856710511` SUCCESS. No exact-head PR Validate or secret-scan runs were observed for these docs-only Git-data ref updates; prior code-head PR runs on `c2a3a061` remain PASS and are not relabelled as latest-head checks.
- Production execution controls remain `enabled=0`, `mode=paper`, `kill_switch=1`. No D1 writes/migrations, broker calls, order submissions, secret reads/changes, production deployments or control changes occurred. This update is documentation-only.
- Exact next action: independent formal review/governance for PR #108; then approved final-head CI/merge, separate Worker release and Production endpoint verification. Independently investigate the missing cache schedule event, keep the monitor fail-closed, and do not restart scanner implementation. Keep seven-day snapshot, sentiment licensing, strategy validation and paper lifecycle gates intact.

---

## 2026-11-10 22:38 PKT / 17:38 UTC — Phase 2 build-plan checkpoint

- Phase 1 universe scanning: COMPLETE and tested by owner confirmation; do not rebuild or reprioritize absent a specific scanner regression.
- Phase 2 Research Council: implementation complete on PR #108 (nine roles, resource coverage, fail-closed stage progression, durable trace, report-integrity scorecard, measured telemetry, Trading Lab visibility). Exact PR-head CI passed at 244e12a: Tests 42857800224, Validate 42857800075, secret scan 42857800142.
- Preview verification: successful app deployment 020c9c4d-bb0d-41c6-bd17-2ba4b1a70738 on code head c2a3a061; Trading Lab contains Stock Brain. Preview readiness and monitor GETs return 200; D1 isolated/empty.
- Production verification: main deployment 3782f3e9 on 3f765d8; Trading Lab does not yet contain Stock Brain. Readiness endpoint confirms paper-only, execution disabled, kill switch engaged. Monitor endpoint confirms stale-cache failure.
- Acceptance: NOT RUN. Production Council tables contain zero runs/traces. Synthetic tests only prove fail-closed behavior when news/sentiment are unavailable; they are not live acceptance.
- Production D1: migrations 0001–0006; 247 monitor runs (38 failed, 209 market_closed), 0 quotes/events, 0 council runs/traces, 2 equity snapshots (one trusted but stale; one plugin capture excluded), 0 paper orders/positions/intents/fills/trade events, 2 audit rows. Execution control enabled=0, mode=paper, kill_switch=1.
- Snapshot workflow: run 42837941172 failed at POST /api/paper/sync with HTTP 401 after both readiness and secret-presence steps passed. The previous 'secret empty' classification is withdrawn. PR #108's pinned OIDC path is implemented but not merged/Production-verified.
- Cache refresh: latest successful run 42803828945 at 11:00Z; expected 12:07Z and 15:07Z scheduled refreshes absent from observed run history; Worker fail-closed due >4-hour cache age. Do not change the completed scanner or bypass freshness.
- Strategy: NOT APPROVED, historicalValidationPass=false, BUY disabled. Paper lifecycle NOT READY. News/sentiment source gates remain open.
- Next: independent review/governance for PR #108; after approved merge verify Production Pages and OIDC snapshot; separately investigate cache schedule delivery; collect genuine seven-day equity history; then controlled research-only acceptance and persisted trace/scorecard/telemetry verification.

---

## 2026-11-10 22:44 PKT / 17:44 UTC — OIDC snapshot success-path regression coverage

- Phase: Phase 2 — nine-agent Research Council / Stock Brain. Universe scanning remains user-confirmed COMPLETE and was not rebuilt.
- Objective: close a test-coverage gap in the pinned GitHub OIDC read-only snapshot endpoint by exercising its successful path, sequential idempotent replay, read-only broker request methods, and pre-sync reconciliation failure.
- Test file changed: tests/paper-snapshot-oidc.test.mjs. It now uses a synthetic signed GitHub OIDC fixture, mocked JWKS/Alpaca GET responses, and an in-memory D1 adapter; no real credential, broker, Cloudflare or production D1 access occurs.
- New regression test 1: valid OIDC -> pre-sync reconciliation PASS -> one read-only account sync -> persisted trusted equity snapshot and completion audit -> post-sync reconciliation PASS. Repeating the same run_id/run_attempt returns replayed=true without another broker call, D1 batch, snapshot or audit row. All mocked external requests are GET-only; execution=false and automatedOrderSubmission=false.
- New regression test 2: an untracked broker order causes pre-sync reconciliation to return 409 and blocks the snapshot write, sync audit and OIDC completion audit.
- Source test commit: 36b4a355e9ead45e01b02784bd57c61dbe6680e2. PR #108 branch northstar/stock-brain-clean-review-20261110 is 79 commits ahead / 0 behind main 3f765d8dd0f9099e05df57d09c9f48c9b247ba9c; PR remains OPEN, non-draft, mergeable=true, with 0 independent reviews. This documentation follow-up is based on that exact test commit.
- Exact-head CI for 36b4a355e9ead45e01b02784bd57c61dbe6680e2: Tests 42867972228 PASS (Python tests, JavaScript API/evidence-score tests, scanner syntax and lint); Validate AI Stock Advisor 42867972275 PASS; full-history secret scan 42867972266 PASS.
- Deployment separation: Cloudflare Preview deployment cf353b27-1f68-4513-805f-896f16f8cdab for the test-only commit was skipped by path_config. No application deployment was expected. The latest successful application Preview remains 020c9c4d-bb0d-41c6-bd17-2ba4b1a70738 on code head c2a3a061d1423db0641223c1d8466d750b58041e. Production Pages remains 3782f3e9-0d2e-4d04-b95a-4dcd931a6133 on main 3f765d8dd0f9099e05df57d09c9f48c9b247ba9c.
- Current Production monitor D1 evidence: run #248 at 2026-11-10T17:40:52.911Z failed closed on stale/incomplete shortlist, 0 symbols and 0 errors. Ledger totals 248 runs (39 failed, 209 market_closed), 70 aggregate errors, 0 symbols checked, 0 quotes/events. Research Council runs/traces remain 0. Production controls remain enabled=0, mode=paper, kill_switch=1.
- Database changes: NONE. The new tests use synthetic in-memory D1 and mock all network requests; live D1 audits remain SELECT-only with changed_db=false and rows_written=0.
- Safety impact: tests only. No secret values read or changed, no live broker request, no real paper order, no D1 write/migration, no execution-control mutation, no Worker deployment or Production Pages deployment.
- Complete: OIDC verifier unit tests plus endpoint-level success/replay and pre-reconciliation fail-closed tests now pass on the exact test commit. This is CI verification only; the OIDC endpoint remains unmerged and not Production-verified.
- Blockers: independent PR review and verified branch governance; unresolved repository visibility; production fresh trusted snapshot and seven-day baseline; snapshot workflow OIDC route not merged; stale shortlist refresh schedule; unverified news and unlicensed/timezone-ambiguous sentiment; controlled live research-only acceptance; separate strategy validation and approval.
- Exact next action: obtain independent formal review/governance for PR #108. After approved merge, separately verify Production Pages/OIDC route and a scheduled read-only snapshot; investigate cache refresh schedule delivery without changing the completed scanner; accumulate a genuine seven-day trusted equity baseline. Only then run one controlled research-only Council acceptance and verify nine roles, vetoes, scorecard, telemetry, durable trace and idempotent replay. Keep execution disabled, kill switch engaged and BUY disabled; never submit any paper or live order.
