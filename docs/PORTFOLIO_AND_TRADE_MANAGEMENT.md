# Portfolio planning and manual trade management

## Purpose and boundaries

Northstar's goal profile is a diversified USD 1,000 US-stock portfolio combining longer-term holdings with short-term earnings, momentum and catalyst research. The stated USD 150 monthly net-profit target is aspirational: it implies a 15% monthly return on USD 1,000 before the portfolio changes in value. It is not a forecast, validated expectation, recommendation gate, or reason to increase risk. Northstar makes research recommendations and monitoring alerts; the user executes all live trades manually. This module never submits live or paper orders.

## Current planner behavior

`stock_advisor.trade_management.build_portfolio_plan` accepts a verified, timestamped portfolio snapshot and validated candidate facts when called. It is a standalone Python library with deterministic tests; it is not yet wired to the Pages dashboard or live collection route. It does not fetch or invent market data. The Trading Lab now transfers only the ticker from a durable Stock Brain trace into its manual sizing console; entry and stop remain user-supplied, and the standalone allocator is still not invoked by Pages. It checks portfolio reconciliation, freshness and provenance, recommendation gates, evidence IDs, price ordering, entry conditions, invalidation conditions and at least 2:1 reward/risk from the midpoint entry to the conservative target.

Default planning policy is provisional and configurable: 60% long-term sleeve, 20% short-term sleeve, 20% cash reserve, 80% maximum gross exposure, 20% per-name cap, 30% per-sector cap, 0.5% maximum risk per new idea and 1% maximum aggregate planned stop risk, aligned with the Trading Lab risk console. Existing holdings consume the same sleeve, name, sector, exposure and risk budgets. Sizing includes configured commission and slippage assumptions, supports whole shares by default, and does not treat stops as guaranteed fills. Candidates are allocated equally within their sleeve; the planner does not invent or use unvalidated expected returns to rank them.

Outputs are conditional `BUY SETUP — UNVALIDATED` or WAIT/AVOID/INSUFFICIENT EVIDENCE research labels. BUY activation remains disabled. Every plan hardcodes paper eligibility, automated submission and live submission to false. A plan requires human review and refreshed evidence before a manual decision.

## Monitoring and exits

`stock_advisor.trade_management.monitor_trade` produces review alerts for thesis invalidation, missing/stale/future quotes, stop levels, target zones and the planned maximum holding period. Reaching a target requests review of partial profit-taking, continued holding, valuation and thesis evidence; it does not force a sale. A small unrealized gain alone remains HOLD_MONITORING. Stop crossings request a manual review because gaps and liquidity can produce worse executable prices. All monitoring outputs require manual review and disable automated exits.

## Validation status and limitations

The historical engine remains a deterministic, single-position replay with next-session entry assumptions, cost/slippage parameters, gap-aware stop handling, walk-forward folds and a separate benchmark. It is not a portfolio backtest for the multi-holding allocation policy. It does not yet demonstrate licensed point-in-time histories and universe membership, delisted-security coverage, calibrated commissions/spreads/market impact, realistic partial fills, overlapping positions, uncertainty intervals, or an untouched independent holdout for this plan. The new sizing/monitor logic is deterministic policy code, not evidence of positive returns. BUY stays disabled and paper execution stays disabled.

Acceptance work still required: build a point-in-time multi-asset portfolio replay from approved history; model simultaneous candidates and cash/exposure/sector/risk constraints daily; include corporate actions, dividends, delistings, spread/commission/market-impact costs, gaps, liquidity/partial fills and rejected orders; report net returns, turnover, drawdown, benchmark-relative results and uncertainty by walk-forward fold; preserve an untouched holdout and obtain independent review. No profitability claim is supported until these tests are completed.

## Data and operational blockers

- Confirm provider account entitlements and licensed historical-data rights before data collection or backtest use.
- Current portfolio snapshots must be sourced from an authorized read-only portfolio source and verified/reconciled at decision time.
- Trade signals consume only validated existing Northstar evidence. Missing/stale/conflicting inputs block sizing.


## Trading Lab handoff

A durable Stock Brain result exposes a ticker-only handoff to the manual risk console. The handoff deliberately clears entry and invalidation fields; research outputs do not currently provide strategy-validated execution levels. The console counts every locally saved plan against a 1% aggregate planned-risk cap, blocks duplicate symbols, and limits the local plan list to ten. This browser-local planning guard does not reconcile manually held live positions. The dashboard does not invoke the Python multi-sleeve allocator or claim that its outputs are a validated recommendation.
