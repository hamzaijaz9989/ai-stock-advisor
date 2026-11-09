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
