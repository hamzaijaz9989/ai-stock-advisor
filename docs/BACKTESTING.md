# Historical validation framework

## What is implemented
`src/stock_advisor/backtest.py` provides testable primitives for replaying an already-defined long-only signal against daily OHLC bars:
- entry is no earlier than the next session's open;
- a trade fills only when the next open is within its specified entry zone;
- stop gaps use the observed open, not the planned stop price;
- if a daily bar touches both stop and target, the stop is assumed to occur first;
- configured transaction costs are charged on each side;
- when adjusted closes are available for every remaining session, adjusted-close factors approximate total returns; otherwise dividends are excluded and that limitation is recorded;
- unfinished history is marked incomplete and excluded from completed-trade statistics;
- expanding chronological train/test folds can be built without overlap.

## What is not implemented or proven
This module is **not yet an end-to-end backtest of the dashboard's actual ranking or recommendation strategy**. No point-in-time candidate signals have been generated from old information, no entire portfolio account curve has been simulated, and no live recommendation logic is connected to these functions. Daily-bar testing cannot fully determine intraday order paths; the stop-first convention is deliberately conservative but still an approximation.

## Required validation before enabling BUY
1. Define and freeze the precise historical entry/exit rules and all parameters before examining holdout performance.
2. Preserve point-in-time fundamental facts, earnings dates, news availability times, and ticker universe membership as known on each signal date.
3. Construct only signals that would have existed at that time; do not use revised filings, future financials, or current constituents for past screens.
4. Use adjusted prices or explicitly account for split/dividend changes, delisted names and survivorship.
5. Include trading costs, spreads, next-session execution, price gaps and unfilled entry orders.
6. Run a chronological expanding-window walk-forward evaluation, then evaluate once on an untouched holdout period.
7. Report completed/unfinished/unfilled counts, win rate, mean and median net return, average R, profit factor, max drawdown, volatility, turnover, benchmark and excess return, with sample sizes and confidence intervals where possible.
8. Compare simple benchmarks and null strategies. Investigate sensitivity to reasonable parameter changes and multiple testing.
9. Keep BUY disabled if results are unstable across folds, too few trades exist, data coverage is incomplete, or net performance does not justify risk.

A high in-sample win rate alone is not evidence of a robust strategy. No return or win-rate guarantee is provided.

## Input data contract
The caller must supply bars whose OHLC prices are already consistently adjusted for stock splits across the tested interval. Adjusted-close factors are used only to approximate dividends/total-return effects; the simulator does not independently repair split discontinuities. If split-consistent bars cannot be sourced, the affected signal must be excluded. Daily OHLC cannot reveal the true intraday order of a stop and target; the stop-first rule is a conservative approximation, not tick-level execution reconstruction. Benchmark return is measured from the same signal-entry session's open to the exit close, while strategy returns include the configured entry/exit cost assumption.

## Run the replay tool
After installing the project in editable mode, run the synthetic smoke-test example:

```bash
python scripts/run_backtest.py --input examples/backtest_input.example.json
```

The example contains **synthetic, non-market data** and is meant only to verify the CLI. For real research inputs, provide a JSON object with:
- `metadata.data_source`, `metadata.signals_source`, and an ISO `metadata.as_of_date`;
- `metadata.quality_flags` for point-in-time signals, survivorship control, corporate-action handling, calibrated transaction costs and untouched holdout;
- `signals` with precomputed symbol, signal date, entry zone, stop, target and holding limit;
- `bars` keyed by symbol with chronological OHLC values and optional adjusted close;
- optional per-side slippage and commission basis points under `config`.

The runner rejects signals and market bars after the declared data cutoff, requires provenance metadata, reports absent symbol histories, and **always sets `decision_eligible: false`**. Quality flags record supplied attestations; the runner does not independently verify them.


## Experimental dashboard baseline added

The dashboard now offers an optional five-year 50/200-day simple-moving-average crossover baseline for the ticker under analysis and compares its daily equity curve with SPY buy-and-hold. It enters on the next session open after a close-based crossover and assumes 5 basis points of costs per side. It reports total and annualized returns, maximum drawdown, volatility, completed/open-at-end trade counts, closed-trade win rate, and a profit factor.

**This is not validation of the live advisor.** The baseline uses current provider history, does not reconstruct point-in-time SEC fundamentals/news or historical index membership, does not independently verify delisted stocks or corporate actions, and relies on unofficial Yahoo Finance chart access. A short or revised history can mislead. The test is explicitly labelled experimental and does not change the live BUY gate. It is useful as an initial diagnostic only; a defensible strategy validation still needs point-in-time inputs, robust survivorship/corporate-action handling, walk-forward folds, an untouched holdout, realistic spread/market-impact costs, and reproducible test artifacts.


## Walk-forward dashboard diagnostic

The five-year technical baseline also reports non-overlapping chronological six-month test windows after a 200-session moving-average warm-up. The 50/200-day rule is fixed in advance; no parameter optimization is performed on the test windows. Each fold displays dates, return, drawdown, volatility, and entry/exit counts.

This is a preliminary diagnostic only. The current provider series and adjusted-close daily returns do not reconstruct point-in-time fundamentals, delisted-stock membership, exact intraday fills, or verified corporate-action history. It does not validate the live recommendation engine, and it cannot enable BUY. Treat the fold results as exploratory until the underlying data and execution assumptions are independently validated.
