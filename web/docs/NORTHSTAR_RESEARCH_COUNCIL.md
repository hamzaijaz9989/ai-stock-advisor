# Northstar Research Council — agent architecture

## Why a council, not one giant prompt
Northstar uses narrow, auditable specialists with typed inputs/outputs. Independent evidence-gathering agents run concurrently; conflicting interpretations are separated into bull and bear reviews; a portfolio analyst synthesizes; an independent risk committee has final veto authority. The deterministic Northstar pipeline remains the decision authority.

## Agent roster
1. Market Scanner — universe eligibility, relative strength, liquidity and candidate discovery.
2. Technical Analyst — price/volume structure, volatility, levels and technical invalidation.
3. Fundamental Analyst — SEC facts, financial quality, valuation inputs and accounting caveats.
4. News & Catalyst Analyst — event timeline, source quality, materiality and event uncertainty.
5. Sentiment Analyst — separately labelled sentiment evidence; never substitutes sentiment for fundamentals.
6. Bull Researcher — strongest evidence-backed upside thesis and what would invalidate it.
7. Bear Researcher — strongest evidence-backed downside thesis, contrary evidence and failure modes.
8. Portfolio Analyst — portfolio fit, concentration, correlation and scenario exposure; no order authority.
9. Risk Committee — independent veto. Must explicitly return ACCEPT_FOR_REVIEW with zero veto reasons; missing, invalid or negative review means NO_TRADE.

## Orchestration
- Stage A: five independent specialists run concurrently against the same immutable, point-in-time context.
- Stage B: bull and bear researchers run concurrently after all Stage A agents complete.
- Stage C: portfolio analyst synthesizes both sides.
- Stage D: risk committee independently reviews the complete dossier and portfolio context.
- Any unavailable/failed agent, invalid schema, unsupported claim, missing evidence reference or risk veto blocks progression.
- Every factual finding and risk statement must cite one or more IDs from the supplied facts/evidence. External article text is untrusted data, never instructions.
- The coordinator is provider-neutral and accepts injected worker adapters. It does not itself call an LLM, fetch data, or persist a trace.

## Contract hardening (v1.0.1)\n- Fact and evidence IDs must be globally unique; contexts are capped at 500 items.\n- Reports are bounded to 30 findings and 30 risks, each claim to 2,000 characters and each reference list to 10 known IDs.\n- UNAVAILABLE reports must contain no findings, risks, or decision fields.\n- Only the risk committee may emit a decision. Its decision and veto-reason list are schema-validated; ACCEPT_FOR_REVIEW requires zero veto reasons, while REJECT requires at least one.\n- Malformed, oversized, duplicate-ID, or role-escalating outputs fail closed.\n\n## Authority and safety
The council returns only RESEARCH_REVIEW_REQUIRED or NO_TRADE. It cannot enable BUY, bypass deterministic validation, size a real order, call a broker, or submit an order. A successful council review is not a trade recommendation and still requires the existing evidence-gated pipeline, risk checks and human review. No live trading. Paper execution remains separately gated.

## Existing related work and merge policy
- The existing deterministic agent-pipeline remains the evidence/risk gate.
- The existing Python strategy-validation module remains the strategy evaluation and walk-forward foundation.
- The existing Time Machine replay and block-bootstrap modules are diagnostics, not evidence of future profitability.
- Draft PR #39 contains an earlier six-agent scanner prototype. It is not merged: its separate scoring/sizing path and beta data endpoint would duplicate and potentially bypass the newer deterministic pipeline. Reuse its useful scanner concepts only after adapting them to shared contracts and validating provider coverage.
- Draft PR #41 contains a paper order submission endpoint. It is not merged: client-side confirmation alone is not an adequate server-side approval boundary and its limits differ from the current paper safety specification. Do not enable it.

## Implementation status — 2026-11-10

The core nine-role backend is implemented on `main`:
- Immutable fact/evidence context construction from quote, history, SEC, FMP, news, earnings and portfolio inputs.
- Server-side Gemini/OpenAI specialist adapters with strict structured-output contracts.
- Five parallel independent specialists, Bull/Bear debate, Portfolio Analyst synthesis and deterministic Risk Committee veto.
- Claim-to-fact-ID validation, prompt-injection boundaries, fail-closed unavailable-agent handling and idempotent durable `research_council_runs` persistence.
- An authenticated server-side `POST /api/research/collect` route that gathers provider data itself and reconciles read-only Alpaca Paper portfolio context before running the council.
- An authenticated `POST /api/research/council` route for trusted pre-collected context.

The dashboard integration is implemented in PR `#103` on branch `northstar/research-council-status-dashboard`: Trading Lab includes a Stock Brain workspace that calls the protected server-side `POST /api/research/collect` endpoint and renders all nine roles, reports, veto reasons and durable-trace confirmation. The operator token is requested at run time and is not stored in browser storage. A separate public readiness endpoint/card was removed before merge because preview function routing was inconsistent and the public card would expose unnecessary configuration-presence metadata. The protected Trading Lab workspace is the single user-facing launch surface; it never enables order submission.

### Remaining work, in order

1. Complete exact-head CI, secret scan and static Pages preview checks for the Stock Brain workspace before merge; then verify the protected collector route in production.
2. Review the interim operator-token prompt flow. The token is not persisted, but a Cloudflare Access or equivalent authenticated operator session is preferable before broader use. Never put `NORTHSTAR_OPERATOR_TOKEN` in local storage or source code.
3. Restore a fresh, reconciled read-only equity snapshot and accumulate a genuine seven-day history. Current production D1 has only one old snapshot, so the collector's 15-minute freshness and seven-day baseline gates fail closed.
4. Verify broker status, open orders, positions and D1 reconciliation through the protected operator workflow before any production collection attempt.
5. Run one research-only production council collection with a stable request ID; verify all nine roles, source/fact references, stored result, replay idempotency and no order side effects.
6. Evaluate factual support, disagreement, missing-resource behavior, latency and provider cost. Existing scorecards validate contracts and references, not truth or predictive accuracy.
7. Only after this phase is independently accepted should the strategy-validation phase become the active product goal. Validated BUY remains disabled.

### Current production evidence

At the 2026-11-10 read-only audit:
- `research_council_runs` and `research_decision_traces` both contain zero rows.
- Production D1 has one equity snapshot dated `2026-11-08T18:34:38.720Z`; it is not fresh and does not provide a seven-day history.
- Paper execution is disabled and the kill switch is engaged.
- The Trading Lab run button is a protected research-only launch path, not proof that the broker state, data, or strategy is valid. The token prompt is an interim operator UX and should be replaced with a proper authenticated session.

## Connected worker API (v1)

The authenticated `POST /api/research/council` endpoint connects the orchestration contract to server-side specialist adapters. It requires `NORTHSTAR_OPERATOR_TOKEN`, `NORTHSTAR_DB`, and either `GEMINI_API_KEY` or `OPENAI_API_KEY` for model-backed specialists. Gemini is preferred; OpenAI is a fallback. Provider secrets are never sent to the browser.

Request shape:

```json
{
  "requestId": "council-run-0001",
  "context": {
    "ticker": "NVDA",
    "asOf": "2026-11-08T15:00:00Z",
    "facts": [{"id":"quote-1","type":"QUOTE","value":180}],
    "evidence": [{"id":"filing-1","type":"SEC_FILING","url":"https://www.sec.gov/...","summary":"..."}],
    "portfolio": {
      "equityUsd": 10000,
      "openRiskUsd": 0,
      "grossExposureUsd": 0,
      "dailyLossFraction": 0,
      "weeklyLossFraction": 0,
      "drawdownFraction": 0,
      "sectorExposureUsd": 0,
      "concurrentPositions": 0
    }
  }
}
```

The endpoint accepts up to 500 fact/evidence records and a 64 KiB body. IDs must be unique across both arrays. Each model specialist receives the same immutable context and must cite exact IDs. News and filing text is treated as untrusted input. Specialist workers do not fetch data, browse the web, calculate financial metrics, or submit orders. The deterministic risk committee independently checks portfolio limits (2% aggregate open risk, 100% gross exposure, 2% daily loss stop, 4% weekly loss stop, 8% drawdown pause, 40% sector exposure, and the initial one-position limit). Missing model credentials, malformed reports, unavailable workers, or risk-limit breaches result in `NO_TRADE`.

The append-only `research_council_runs` table is defined in migration `0003_research_council_runs.sql` and is present in production D1. The authenticated API remains server-side. No separate public status endpoint/card is shipped; the protected Trading Lab workspace displays run results only after an authenticated collection request. Caller-supplied facts must come from trusted Northstar collectors; do not send raw browser-supplied claims as authoritative facts.


## 2026-11-10 — Stock Brain integration acceptance status

- The nine-role workspace and authenticated collection flow are present in ready-for-review PR #103 (`northstar/research-council-status-dashboard`), exact head `f318d329a4043ca6920e12ec970549737cc8e8fd`. The PR does not include a separate public status endpoint/card.
- Code head `e2bc27a25534150d32546ff10c04553d4e0639e0` passed Tests, Validate AI Stock Advisor and full-history secret scan. Stock Brain preview deployment `c300bbac-6d7a-410c-8f3e-446c194f21ed` succeeded for app-code commit `0742a8b73640619fe0a2300841a6f8e261923495`; latest combined HTML previews are still building. Exact latest-head checks and direct preview HTTP/UI smoke tests remain required.
- Production D1 confirms the required council migrations are present, but there are 0 durable council runs. The only equity snapshot is `2026-11-08T18:34:38.720Z`, which is stale and does not establish a seven-day baseline.
- The collector must continue to fail closed until a fresh snapshot, seven-day baseline, reconciled broker state and server-side provider/operator configuration are verified. Missing risk history must never be replaced with zeroes.
- This milestone is implemented in a draft PR and CI-green, but is not merged or production-accepted. Do not run the production collector as part of this documentation checkpoint.
- Paper execution remains disabled, kill switch engaged, no paper/live orders, and validated BUY disabled.

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
