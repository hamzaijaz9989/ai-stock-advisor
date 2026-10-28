# Stock Brain Advisor — Decision Engine Specification

## Purpose

Stock Brain is the analysis and decision layer for the existing AI Stock Advisor dashboard. It must turn dated, sourced evidence into a transparent research report for US-listed equities. It is not an autonomous trading system and must never place orders.

## User profile and constraints

- Universe: US-listed NYSE/Nasdaq equities.
- Capital reference: $500.
- Risk tolerance: moderate.
- Holding horizon: a few weeks to six months.
- Research-only; execution and final decisions remain with the user.
- Default planned risk: approximately $5 per position (1% of capital); hard planning ceiling $10 (2%) before gaps, fees, and slippage. These are planning guardrails, not a guarantee of maximum loss.

## Required report

Every analyzed ticker should return:

1. Decision: BUY, WAIT, AVOID, or INSUFFICIENT EVIDENCE.
2. As-of time, quote timestamp (or explicit absence), currency, exchange, and source for each material data group.
3. Thesis summary and key evidence supporting it.
4. Fundamental quality: revenue, profitability, cash flow, balance-sheet risks, and recent quarterly trend, with fiscal period and filing date.
5. Valuation: assumptions, bear/base/bull scenarios, sensitivity, and limitations. Never silently substitute weighted-average shares for current shares outstanding.
6. Technical context: price trend, volatility, drawdown, liquidity where available, and explicitly labelled price levels.
7. Events: earnings date and timing, sourced calendar provider, and whether the issuer IR page was independently checked.
8. Plan: entry zone, target/reference value, invalidation/stop level, reward/risk, position size, cash remaining, and expected holding period. If inputs fail quality gates, show unavailable rather than invent levels.
9. Risks and thesis invalidation: what could go wrong, and what evidence would change the view.
10. Data-quality checklist and reason codes for any blocked recommendation.

## Decision policy

### INSUFFICIENT EVIDENCE
Use whenever critical inputs are missing, stale, contradictory, non-finite, poorly aligned by fiscal period, or not traceable to a source. A missing earnings-calendar result is not proof that no earnings event exists.

### AVOID
Use for a documented thesis failure or a clearly failed financial/risk-quality rule. Explain which rule failed and distinguish business weakness from a data-quality failure.

### WAIT
Use when evidence is usable but price, event proximity, reward/risk, uncertainty, or portfolio concentration makes immediate action unattractive.

### BUY
Keep disabled until all of the following are implemented and independently validated:
- Point-in-time historical fundamentals and prices with no look-ahead or survivorship bias.
- Complete valuation, event, liquidity, and portfolio-risk checks.
- Chronological walk-forward validation and a genuinely untouched holdout.
- Realistic transaction costs, slippage, dividend/split handling, and gap assumptions.
- Results reported by market regime, sector, and time period, with drawdown and expectancy—not only win rate.
- A fresh, dated evidence snapshot and all critical checks passing for the individual report.

A high screen score alone is never a BUY signal. No target win rate is promised.

## Evidence and data governance

- Prefer issuer filings, issuer investor-relations pages, and official exchange data for primary facts.
- Preserve publication/filing time, fiscal period, retrieval time, provider, and units.
- Treat third-party news feeds and earnings calendars as discovery sources until independently confirmed.
- Label delayed, daily-bar, unadjusted-close, or otherwise limited data.
- Do not infer missing information or present stale values as current.
- Before any public/commercial use, confirm data-provider licensing and redistribution permissions. Unofficial endpoints are not a production-grade licensed data strategy.

## Validation roadmap

### Phase 1 — Reliability gates
- Confirm CI actually runs Python tests, lint, JavaScript syntax checks, and Node logic tests.
- Add endpoint smoke checks and malformed/stale-data tests.
- Verify deployed JavaScript and API responses after each code change.

### Phase 2 — Evidence snapshot
- Define one normalized, timestamped report schema.
- Attach source and freshness metadata to every metric and event.
- Add issuer IR confirmation for earnings where feasible; otherwise mark unconfirmed and block BUY.

### Phase 3 — Transparent scoring
- Separate business quality, valuation, price trend, catalysts, and risk.
- Show raw values, scoring thresholds, and missing-data penalties.
- Never treat keyword-based news flags as sentiment analysis or a predictive model.

### Phase 4 — Strategy validation
- Connect actual candidate rules to a point-in-time backtest.
- Include delisted securities where data is available, avoid look-ahead, and account for costs.
- Run walk-forward folds and reserve a holdout period that is not repeatedly tuned against.
- Track live paper recommendations prospectively before enabling BUY.

### Phase 5 — Portfolio-aware reports
- Account for current holdings, sector concentration, correlated exposures, available cash, whole-share constraints, and earnings gaps.
- Track every recommendation and its later outcome without rewriting the original snapshot.

## Current implementation status (2026-10-28)

Already present in the dashboard: SEC filing/fundamental retrieval, quote/history/news/earnings discovery endpoints, preliminary DCF scenario logic, a ten-stock research-priority screen, risk-plan calculations, and a backtesting primitives module.

Not yet proven: end-to-end point-in-time strategy backtesting, live/holdout performance, licensed production-grade market data, issuer-confirmed earnings for every ticker, portfolio-level simulations, and an automated passing CI run. The existing screen is a research-priority ranking—not a validated investment signal.
