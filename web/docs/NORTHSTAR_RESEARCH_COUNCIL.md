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

## Authority and safety
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
