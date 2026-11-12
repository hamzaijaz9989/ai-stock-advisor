# Northstar Specialist Agents — Operational Status and Completion Gate

Updated: 2026-11-09

## Scope

This document distinguishes implemented orchestration from live autonomous operation. A role name or a successful model response is not proof that the complete research workflow is operational.

## Specialist roster

| Stage | Role | Current implementation |
|---|---|---|
| Independent analysis | Market Scanner | Role prompt + report contract; receives supplied context |
| Independent analysis | Technical Analyst | Role prompt + report contract; receives supplied context |
| Independent analysis | Fundamental Analyst | Role prompt + report contract; receives supplied context |
| Independent analysis | News Analyst | Role prompt + report contract; receives supplied context |
| Independent analysis | Sentiment Analyst | Role prompt + report contract; receives supplied context |
| Adversarial review | Bull Researcher | Role prompt + report contract; receives supplied context |
| Adversarial review | Bear Researcher | Role prompt + report contract; receives supplied context |
| Synthesis | Portfolio Analyst | Role prompt + report contract; receives supplied context |
| Final research veto | Risk Committee | Deterministic portfolio-limit checks; no model decision authority |

The Research Council invokes the five independent roles concurrently, then Bull/Bear, then Portfolio Analyst, then the deterministic Risk Committee. Any unavailable or invalid required report prevents acceptance for review. Specialist claims must cite IDs from the supplied fact/evidence set. The Council is advisory and cannot submit orders.

## Existing building blocks

- `web/lib/research-council.js`: role orchestration, report validation, fail-closed sequencing.
- `web/lib/research-council-adapters.js`: Gemini/OpenAI model adapters and deterministic Risk Committee.
- `web/lib/research-council-facts.js`: canonical fact/evidence context builder and verified-portfolio validation.
- `web/functions/api/research/council.js`: operator-authenticated council endpoint with idempotent D1 audit persistence.
- `web/lib/agent-pipeline.js`: deterministic quote/evidence/liquidity/risk/sizing gates. Review-only; no order execution.
- `web/functions/api/research/decision.js`: durable decision trace for the deterministic pipeline.
- `web/functions/api/research/pipeline.js`: non-durable diagnostic endpoint; do not use it as the production audit path.

## What is not yet an autonomous end-to-end system

1. The Council endpoint accepts a context payload. It does not itself collect quote, OHLCV, SEC, fundamentals, earnings, news, sentiment, and reconciled broker/ledger portfolio data.
2. The canonical context builder exists, but the production Council endpoint does not call it to construct context from trusted server-side provider responses.
3. The current model adapters provide role-specific prompts, but they do not independently verify source truth. Model output remains untrusted and must not be treated as a verified data source.
4. No production scheduler currently proves a full 253-symbol scan every three hours, with a durable run record and bounded concurrency.
5. There is no completed, tested, reconciled broker order lifecycle in this agent path. The executor is explicitly disabled.
6. The diagnostic pipeline endpoint does not persist traces. Use the durable decision endpoint for its current limited purpose.

## Required implementation sequence

### Gate A — Server-side research collection
- Add a server-only orchestrator that validates ticker/universe membership and fetches quote, historical bars, fundamentals, SEC facts/filings, earnings calendar, news discovery, and explicit sentiment data.
- Apply per-provider timeouts, response schemas, rate limits, caching, and partial-failure statuses.
- Preserve provider, source URL, retrieval time, publication/filing time, units, period, and timestamp confidence.
- Never convert unavailable values into zero or infer sentiment when no sentiment source exists.
- Treat news feeds as discovery only. Verify material claims against original publisher/issuer/SEC sources before they can support a factual finding.

### Gate B — Canonical evidence and portfolio snapshot
- Call `buildResearchCouncilContext` only with server-collected provider responses.
- Obtain the portfolio snapshot server-side from Alpaca Paper plus the Northstar ledger; reconcile them before deriving risk inputs.
- Keep the virtual strategy allocation at USD 1,000, independent of the broker account's larger simulated balance.
- Reject stale, future-dated, mismatched-ticker, mixed-period, unverified, or incomplete data.

### Gate C — Durable council run
- Bind each run to a stable request ID and SHA-256 hash of canonical input.
- Persist canonical facts, evidence IDs, provider coverage, each agent report, deterministic vetoes, and timestamps in D1.
- Add explicit run states for partial provider failure, unavailable model, invalid citations, veto, and accepted-for-human-review.
- Do not let a model set the final decision, position size, stop, or order fields.

### Gate D — Scheduled universe scanning
- Use a versioned, explicitly maintained universe (target 253 symbols) and a scheduled three-hour cadence.
- Persist every scan run, per-symbol status, failures, shortlisted candidates, and run duration.
- Enforce concurrency, provider quotas, retry budgets, and a kill switch for the research scheduler.
- Never represent a partial scan as a complete universe scan.

### Gate E — Forward validation and human review
- Require point-in-time data, realistic spread/slippage/fees, out-of-sample and walk-forward tests, and a minimum forward paper-observation period.
- Display source coverage, data age, disagreement, risk vetoes, and why a candidate was rejected.
- Until all gates pass, recommendations remain WATCHLIST/WAIT/AVOID or NO_TRADE; no automatic BUY signal is authorized.

### Gate F — Separate paper execution project
Paper execution is outside the specialist-agent completion scope and remains disabled. Any future implementation must independently prove paper-only broker identity, server-side account reconciliation, idempotent order state transitions, partial-fill handling, unknown-submission recovery, daily loss limits, and kill-switch coverage. Do not enable execution by changing database flags or bypassing readiness checks.

## Acceptance criteria

The agent system is not complete until automated tests demonstrate:

- All nine roles are configured and run in the correct dependency order.
- Missing provider data or one unavailable required agent yields NO_TRADE.
- Every factual claim cites an existing canonical fact/evidence ID.
- Prompt-injection text in headlines, filings, and source descriptions cannot alter system instructions.
- Source identity and publication time are validated before use.
- Portfolio inputs are verified, fresh, reconciled, and server-derived.
- The entire universe scan completes on schedule or is explicitly marked partial/failed.
- Every run and agent report is durably auditable and replayable.
- Forward-validation criteria are met before any candidate can advance to human paper-trade review.
- The kill switch remains engaged and order submission remains impossible until a separately reviewed paper-execution implementation passes its own gates.

## Current safety state

Research Council output is not an order. The deterministic agent pipeline returns review-only/watchlist results and has no broker submission path. Keep paper execution disabled and the kill switch engaged. No claim of live paper trading should be made until a separate safe order lifecycle is implemented, tested, and explicitly verified.
