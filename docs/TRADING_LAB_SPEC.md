# Northstar Trading Lab — Risk-First Specification

**Version:** 1.0  
**Initial market:** US-listed liquid equities and broad-market ETFs  
**Initial account allocation for simulation:** USD 1,000  
**Execution status:** Paper-only; no live brokerage orders  
**Strategy status:** Experimental; not approved for real-money automation

## 1. Objective and financial reality

The user has approximately USD 1,000 invested in stocks and would like to grow capital toward USD 1,500–2,000 over one or two months. This implies a 50–100% return over a very short period. It is an aspiration, not a forecast, system requirement, or performance promise. No strategy can reliably guarantee that outcome; attempting to force it can result in severe or total loss.

Northstar must optimize for a measurable, repeatable, risk-adjusted edge—not for reaching a dollar target at any cost. It must be allowed to hold cash and produce no trade when evidence is weak. Never tune parameters against the user's target return or display hypothetical returns as expected outcomes.

The existing stock-research application remains intact. Trading Lab is a separate module and must not weaken the existing SEC, data-quality, valuation, or recommendation gates.

## 2. Product architecture

Trading Lab has two future market tabs, but the first implementation is US equities only. Crypto is a separate future engine with its own exchange, liquidity, custody, market-manipulation, and 24/7 operational controls. Do not reuse equity signals for crypto.

### Equity engine agents

1. **Universe and Scanner** — screens only liquid, supported US-listed common stocks and broad-market ETFs. Applies minimum price, average dollar-volume, spread/data-quality, volatility, and corporate-event filters. Produces a timestamped candidate list with source lineage.
2. **Setup Analyst** — evaluates predeclared, deterministic swing-trading setups (trend, relative strength, pullback/breakout, volume confirmation, ATR and market regime). An LLM may explain evidence but must not invent or override numeric inputs or independently authorize a trade.
3. **Catalyst and Event Guard** — checks verified earnings windows, SEC filings, issuer announcements, halts and material news. Unknown event status or material source conflict blocks a new entry.
4. **Risk Guard** — validates quote freshness, liquidity, stop distance, portfolio exposure, correlated positions, daily/weekly loss limits, drawdown and buying-power constraints. This is a hard gate, not a weighted vote.
5. **Position Sizer** — calculates quantity from the risk budget and stop distance, then applies notional, cash, concentration and whole-share/fractional-share constraints. If no valid size fits, it returns NO TRADE.
6. **Paper Executor** — future paper-only order adapter. It may submit orders only to Alpaca's paper host, only after every deterministic gate passes, and only with idempotency, order-state reconciliation, duplicate-order prevention and a kill switch. It must never contain a live-host fallback.
7. **Trade Auditor and Journal** — records every candidate, passed/failed gate, data source and timestamp, strategy version, order request/response, fill, exit, costs and reason. Logs are append-only; corrections create new records.
8. **Equity and Performance Monitor** — reconciles broker equity, cash, positions and fills; reports realized/unrealized P&L, exposure, drawdown, win rate, expectancy, average R, profit factor, turnover, fees/slippage and benchmark-relative performance. Never infer profit from a UI animation or unfilled order.

Agents can run as logical services, but deterministic code owns eligibility and execution. Agent consensus cannot bypass a failed hard gate.

## 3. Initial $1,000 risk profile (simulation defaults)

These are conservative engineering limits for a paper pilot, not personalized financial advice or a guarantee against loss.

| Control | Initial limit |
|---|---:|
| Simulation allocation | $1,000 |
| Planned risk per position | 0.5% equity = $5 |
| Absolute planned risk per position | 1% equity = $10 |
| Aggregate open planned risk | 2% equity = $20 |
| Maximum single-position notional | 25% equity = $250 |
| Maximum sector exposure | 40% equity = $400 |
| Daily loss stop | 2% starting daily equity = $20 |
| Weekly loss stop | 4% weekly starting equity = $40 |
| Strategy drawdown pause | 8% from peak equity = $80 |
| Leverage, margin, options, shorting | Disabled |
| Initial concurrent positions | One until portfolio-level validation passes |

Risk sizing:

`shares = floor(min(risk_budget / (entry - stop), max_position_notional / entry, available_cash / entry))`

The calculation must include expected spread, slippage, fees and currency precision. If the broker supports fractional shares, fractional sizing may be enabled only after its behavior is tested; otherwise round down to whole shares. If the planned loss exceeds the risk budget, data is stale, the stop is invalid, or the position does not fit cash/notional limits, reject the trade.

Stops do not guarantee execution at the stop price. Overnight gaps, halts, spread widening and liquidity shocks can produce larger losses. No martingale, averaging down, doubling after losses, or risk escalation after a winning streak.

A 2% daily stop, 4% weekly stop or 8% peak-to-trough drawdown pause disables new entries and requires review. It must not liquidate holdings blindly; exits follow separately tested rules and broker-state reconciliation.

The user's existing real holdings are not automatically imported as available cash and must not be sold, transferred or changed by this module. The $1,000 allocation is a separate simulation budget until the user explicitly reconciles real holdings.

## 4. Strategy research sequence

Start with one transparent, long-only US-equity swing strategy on liquid names. Do not launch a large collection of untested strategies at once.

Candidate families to evaluate separately:
- Market-regime filter using broad-market trend and volatility.
- Relative-strength and trend continuation.
- Pullback-to-trend with confirmation.
- Breakout with relative-volume and liquidity confirmation.

Freeze each strategy's rules and parameters before holdout testing. Compare against SPY buy-and-hold and simple baselines. Include delisted names where available, point-in-time universe membership, corporate actions, next-session execution, gaps, unfilled orders, spreads, commissions, slippage and realistic market-data availability. Avoid look-ahead, survivorship bias, data snooping and repeated holdout tuning.

The existing 50/200-day moving-average dashboard experiment is diagnostic only; it is not automatically the selected strategy.

## 5. Data and freshness requirements

- Every quote/bar must include provider, timestamp, market session and delay/entitlement status.
- Reject stale or timestamp-less prices for entry decisions.
- Keep raw observations separate from derived features.
- Preserve source IDs, retrieval time, strategy version and feature availability time.
- Cross-check critical prices and corporate actions; halt new entries on material disagreement.
- SEC facts are reported fundamentals, not tick-level execution data.
- News sentiment is a secondary filter. Headlines must link to original sources; an LLM summary is not evidence.
- Use a market-data provider whose licence permits the intended use. The repository currently documents unofficial Yahoo Finance access as research-only and not licensed for commercial redistribution; it is not an approved production execution feed.

## 6. Paper execution safety

The current `/api/alpaca/status` route is read-only and connects only to Alpaca Paper Trading. It does not submit orders. Do not claim that an executor exists until a separately reviewed paper-order route has been implemented and verified.

Before adding paper order placement:
- Add server-side authentication/authorization for order actions; a public unauthenticated endpoint must never be able to place orders using the owner's broker credentials.
- Hard-code the paper API host; no request parameter may select live vs paper.
- Enforce the $1,000 virtual allocation and all limits server-side, independent of Alpaca's displayed buying power.
- Require explicit user arming for each paper session, a clear paper-only label, and a kill switch.
- Validate symbol allowlist, side, quantity, order type, price bounds, buying power, risk budget and event/data gates server-side.
- Use unique client order IDs and reconcile order status before retrying to prevent duplicate orders.
- Log request, response, partial fills, cancellations, rejects and fills.
- Never store broker secrets in browser code, local storage, repository files or client logs.
- No live trading route or credential support in this release.

## 7. Validation and promotion gates

Software tests prove code behavior, not trading profitability. Synthetic fixtures are not market evidence.

Before a strategy can be called validated, require:
1. Licensed and reproducible historical data with verified point-in-time feature availability, historical universe membership, delisted names and corporate-action handling.
2. Frozen signal rules and parameters.
3. At least four chronological walk-forward folds and one untouched holdout.
4. At least 100 completed out-of-sample trades for the strategy under review, with unfilled and incomplete trades reported.
5. Portfolio-level cash, exposure, position overlap, risk sizing, gap handling, transaction costs and benchmark comparison.
6. Net expectancy, profit factor, average R, maximum drawdown, volatility, turnover, benchmark excess return and uncertainty—not win rate alone.
7. No catastrophic fold, no reliance on a single outlier trade, and positive net expectancy after realistic costs. Any numerical acceptance thresholds must be pre-registered before the holdout is opened.
8. Independent reproducibility review of data lineage, code commit, configuration and report.
9. A separately observed paper-trading period with broker fill reconciliation and no unexplained risk-limit breaches.

Until every gate is met, the system must label signals EXPERIMENTAL / UNVALIDATED and must not enable live execution. Passing historical and paper tests still does not guarantee future results.

## 8. Dashboard experience

Add a prominent **Trading Lab** entry point without replacing the stock research homepage.

The first release should show:
- Mode banner: PAPER ONLY.
- Virtual allocation: $1,000 (not broker buying power).
- Current equity, cash, open positions and reconciled P&L.
- Scanner candidates with quote timestamps and passed/failed gates.
- Risk budget, position-size preview and stop/target scenario.
- Agent pipeline status: scanned → checked → sized → paper order → reconciled.
- Trade journal with exact reasons and order/fill states.
- Equity curve, daily/weekly loss limits, drawdown and benchmark comparison.
- Visible data-health panel and emergency pause/kill switch.

Do not display fabricated balances, placeholder trades, guaranteed profit figures or success animations that imply an order filled when it did not. If no candidate qualifies, show NO TRADE.

## 9. Delivery milestones

1. **Foundation audit:** reconcile current main branch, strategy validation status, Alpaca paper connection, data entitlements and account configuration.
2. **Trading Lab read-only UI:** scanner diagnostics, account reconciliation, risk calculator and audit journal; no order submission.
3. **Real historical evaluation:** build point-in-time dataset and evaluate frozen candidate strategies with walk-forward and holdout tests.
4. **Paper execution:** only after authentication and server-side risk enforcement; start with a $1,000 virtual allocation.
5. **Paper observation:** monitor fills, slippage, reconciliation and risk stops over a meaningful sample.
6. **Independent review:** decide whether any strategy merits further consideration. Live trading remains a separate, explicit decision and is outside this implementation.

## 10. Non-negotiable rules

- No promise of turning $1,000 into $1,500 or $2,000 in one or two months.
- No real-money order placement or changes to existing holdings by this project.
- No live API credentials or live trading endpoint.
- No leverage, options, shorting, martingale or loss-chasing.
- No fabricated live data, paper results, trade fills or backtests.
- A valid NO TRADE decision is a successful risk-control outcome.
