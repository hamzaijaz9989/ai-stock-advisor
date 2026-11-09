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

## Next integration steps
1. Build provider adapters that map existing quote, price history, SEC, FMP and news responses into canonical immutable fact/evidence IDs.
2. Add per-agent structured prompts and output schemas behind server-side model adapters; keep secrets server-side and treat tool output as untrusted.
3. Persist run events and reports with idempotent request IDs and append-only audit records.
4. Add agent-level evaluation fixtures, adversarial prompt-injection tests, source attribution checks and cost/latency budgets.
5. Run shadow analyses against deterministic baseline, measure disagreement and factual error before any influence on ranking.


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

The append-only `research_council_runs` table is defined in migration `0003_research_council_runs.sql`. Apply that migration to D1 before using the endpoint in production. The endpoint is currently an authenticated API, not yet wired to the dashboard's ticker-analysis flow. Caller-supplied facts must come from trusted Northstar collectors; do not send raw browser-supplied claims as authoritative facts.


## Team operating charter — v1.1

### Responsibilities and handoffs
- **Market Scanner:** data quality, ticker identity, quote freshness, coverage, liquidity evidence and missing/stale inputs. It does not invent a universe or claim relative strength without supplied measurements.
- **Technical Analyst:** supplied price/volume structure, trend, volatility and invalidation. It does not calculate indicators or price levels from raw bars.
- **Fundamental Analyst:** reported financial statements, periods, units, filing provenance, FMP cross-checks and estimates-vs-reported separation. It does not invent valuation or forecasts.
- **News & Catalyst Analyst:** event chronology, publication timestamps, original-source quality, corroboration and materiality. Headlines are discovery evidence, not verified facts.
- **Sentiment Analyst:** explicit, timestamped sentiment/positioning evidence only. It must say when such evidence is absent and never infer sentiment from price action.
- **Bull Researcher:** strongest defensible upside thesis, counter-evidence and falsification conditions.
- **Bear Researcher:** strongest defensible downside thesis, weak assumptions, invalidation and evidence that would change its view.
- **Portfolio Analyst:** portfolio fit, concentration, sector/correlation evidence, existing exposure and missing risk inputs. It has no sizing or order authority.
- **Risk Committee:** deterministic, independent policy veto. It is not an LLM agent and cannot be overridden by the supervisor, analysts or dashboard.

### Resource and permission model
- Provider collectors—not model workers—retrieve quotes, price history, SEC facts, FMP data, news and earnings evidence. The shared evidence bundle is immutable and point-in-time bounded.
- The model workers currently have no direct browser, broker, database-write or market-data tools. This is intentional least privilege: they reason over collected evidence and cannot fetch, mutate or execute.
- Role prompts define specialist scope and require each role to explain missing, stale or conflicting inputs. The full dossier is passed between stages so counter-evidence is not hidden; the task mandate narrows each specialist's responsibility rather than silently deleting evidence.
- Gemini is preferred when configured; OpenAI is the fallback. The workers currently share the selected provider/model configuration; per-role model routing, separate retrieval tools and independent model diversity are future enhancements, not capabilities to assume.
- No persistent agent memory or autonomous background workers are currently provided by this council. Durable run results are stored by the authenticated endpoint; this is audit history, not a verified learning memory.

### Supervisor and quality gates
- The coordinator is the deterministic supervisor: it controls stage order, freezes inputs, validates report schemas and citations, blocks downstream stages after failures, preserves bull/bear disagreement and invokes the Risk Committee only after a complete dossier.
- A model specialist cannot count an empty `COMPLETE` envelope as work. It must return at least one evidence-linked finding or a cited limitation/risk; otherwise the report is blocked. The deterministic Risk Committee is the deliberate exception: its valid output is a decision plus explicit veto reasons, so it may return empty findings/risks.
- Missing workers, provider failures, invalid references, malformed reports and any risk veto result in `NO_TRADE`.
- The supervisor never changes the risk policy, approves strategy validation, enables paper execution or submits an order.

### Evaluation standard
Each release should test individual role boundaries, evidence attribution, prompt-injection resistance, freshness handling, empty/invalid reports, specialist outages, disagreement preservation, duplicate requests, provider timeouts, risk vetoes and end-to-end audit reconstruction. Measure role-level completion, unsupported-claim rate, citation validity, handoff integrity, disagreement coverage, latency and provider cost. A green unit-test suite does not prove investment performance.

### Known limitations
The current implementation is a bounded multi-stage research workflow, not a free-chat agent society. Specialists share one configured model provider/model and the same collected evidence context; they do not independently browse or hold distinct external tool credentials. Dashboard integration, per-role model selection, durable evaluation dashboards and autonomous scheduled research cycles remain separate work. Production use is still gated by the strategy-validation, seven-day equity-history, authenticated collection and release blockers documented in the project blocker log.


### Supervisor contract correction — v1.0.3
- The deterministic Risk Committee emits no model findings; it returns only `decision` and `vetoReasons`. The shared non-empty-report rule previously rejected this legitimate decision-only contract, which would have blocked every real deterministic committee result.
- The validator now applies the non-empty requirement only to model specialists while continuing to validate the committee's explicit decision and veto-reason invariants.
- Regression tests cover both decision-only acceptance and decision-only rejection. A rejection remains a hard veto.


### Deterministic resource coverage inventory — v1.0.4
- The canonical fact adapter now emits a per-role `resourceCoverage` inventory alongside facts, evidence and the verified portfolio snapshot. It records explicit status, related evidence IDs and missing-resource explanations for all eight model specialists.
- The inventory distinguishes partial coverage from insufficient or missing resources. Current known gaps are made explicit: no dedicated timestamped sentiment/positioning feed; no broad cross-sectional universe/breadth feed; no trusted precomputed technical indicator pack or corporate-action-adjusted history attestation; no exact public-availability timestamp for SEC facts; no consistent original-source news corroboration; and no sector/correlation matrix for portfolio analysis.
- The coordinator passes this immutable inventory through independent analysis, bull/bear debate and portfolio synthesis and includes it in the final result. Role prompts explicitly require specialists to disclose their listed gaps.
- Coverage status is an observability aid, not an investment-quality score or approval. `PARTIAL` never means complete; missing resources are not replaced with model guesses. The deterministic validation and risk pipeline remains authoritative.
- Regression tests cover missing resources, partial coverage, and immutable propagation to every specialist stage.


### Research Council evaluation scorecards — v1.0.0
- Added `web/lib/research-council-evaluation.js`, a deterministic evaluator for report-contract observability. It measures claim citation coverage, reference integrity against explicitly supplied fact/evidence IDs, invalid-reference claims, declared resource-coverage status, and optional per-role latency/token/cost/provider/model telemetry.
- Bull/Bear diagnostics report unique and shared cited evidence IDs. Shared evidence is not a semantic disagreement score and does not claim that the debate is high quality.
- The evaluator deliberately does not claim that citations support the claims, that cited facts are true, that model reasoning is correct, or that strategy returns are predictive. Accuracy, source correctness, investment performance and strategy approval require separate independently labelled datasets and holdout evaluation.
- Runtime performance metrics remain null unless explicitly provided by trusted telemetry. No API credentials, provider response content or secret values are recorded by this evaluator.
- Regression tests cover valid/invalid references, role resource status, optional telemetry, empty denominators and the evaluator's explicit limitations.

- The authenticated server-side `/api/research/collect` path now computes and persists this scorecard inside each durable Research Council result using the exact canonical fact/evidence IDs collected for that run. Runtime latency/token/cost fields remain null because the current adapter does not yet expose trustworthy per-role telemetry.

- The deterministic Risk Committee is also represented in the inventory. It is marked `SUFFICIENT_FOR_DETERMINISTIC_GATES` only when the canonical adapter has validated all eight required portfolio risk inputs; the exact required field names are listed in its resource entry. This status means the gate has its required inputs, not that it approves a candidate or enables execution.

### Role-specific resource packs
Each specialist now receives a compact `roleResourcePack` containing its resource status, relevant evidence IDs, required typed inputs and known gaps. This is a prioritization aid, not an evidence filter: the complete shared dossier remains available to every role so counter-evidence and cross-checks are not hidden. The deterministic Risk Committee receives its own required-input inventory as well. Regression tests verify pack identity, coverage status and preservation of the full context.

### Trusted runtime telemetry
- The server-side Gemini/OpenAI adapters now measure elapsed wall-clock time independently for each specialist invocation and record the actual selected provider/model name. Failed calls retain latency and a failure marker; unavailable workers do not receive fabricated metrics.
- The authenticated collector passes this telemetry to the deterministic scorecard before persisting the run. Token usage and dollar cost remain null until provider usage fields and pricing are deliberately mapped, validated and covered by tests. No estimated costs are displayed.
- Telemetry excludes API keys and response bodies. Tests use mocked provider responses; no live model-provider request was made for this change.

- Provider usage metadata is now captured when returned by the API: Gemini prompt/candidate/total token counts and OpenAI input/output/total token counts. The evaluator surfaces per-role and aggregate total tokens only when all relevant reports have trusted values. Provider cost remains null; no hard-coded or estimated pricing is used.
