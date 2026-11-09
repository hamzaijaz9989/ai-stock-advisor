# Build Plan

## Current phase status — 2026-11-10

- Universe scanning: **COMPLETE and user-confirmed tested**. Do not rebuild it without a concrete regression.
- Nine-agent Research Council / Stock Brain: **implementation and dashboard integration in PR #103**, awaiting merge and production acceptance. The nine roles are implemented; durable trace persistence and dashboard result rendering are covered by CI.
- Strategy validation: **NOT APPROVED**. Validated BUY remains disabled until real point-in-time data, frozen rules, walk-forward and holdout evidence, realistic costs, and independent review exist.
- Paper lifecycle: **NOT COMPLETE**. Execution remains disabled and kill switch engaged. No paper or live order may be submitted.

Immediate next sequence: merge PR #103 after exact-head CI and static preview verification; confirm production deployment and protected collector route; restore fresh read-only equity snapshots and a seven-day baseline; run one controlled research-only council collection and verify idempotent replay; only then move to strategy validation.

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

- Repository visibility is public, owner-confirmed.
- Universe scanning remains complete and tested; do not rebuild it without a demonstrated regression.
- Nine-agent Stock Brain code and dashboard integration are combined in open, non-open PR #103 at head `5b39a9b888a6ccb7ba9a2074668cc73cee2e149a`. Exact-head CI passed (Cloudflare Pages, Tests, Validate AI Stock Advisor and full-history secret scan). Cloudflare preview deployment `a1c5704f-7bea-4ca4-a252-c6b049b5857b` succeeded at https://a1c5704f.ai-stock-advisor.pages.dev; live preview endpoint/UI smoke test remains outstanding because both web browsing and Cloudflare execution environments block outbound requests to the Pages host with tool-level 403.
- PR #103 is not merged or production-deployed. Do not treat CI or preview deployment as production acceptance.
- Production D1 currently has zero Research Council runs and one stale equity snapshot. The collector's fresh-snapshot and seven-day-history requirements are not satisfied. Controls remain paper mode, execution disabled, kill switch engaged.
- **Next goal:** complete a real preview runtime smoke test and protected collector auth/failure checks; then finish review and decide on safe merge. Separately establish fresh scheduled read-only equity snapshots and a seven-day baseline before any controlled research-only run with durable replay verification. No orders.
- **After Stock Brain acceptance:** begin the point-in-time strategy-validation milestone. Validated BUY remains disabled until independent evidence gates pass.


## 2026-11-10 — Latest autonomous Stock Brain acceptance checkpoint

- Repository is public by owner choice.
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
