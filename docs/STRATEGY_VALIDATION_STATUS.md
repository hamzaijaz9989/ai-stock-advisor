# Northstar Strategy Validation — Evidence Status

**Status: NOT APPROVED — validated BUY remains disabled.**  
**Strategy version under review:** `northstar-provisional-gates-v1`  
**Reviewed:** 2026-10-30

## Evidence actually present in the repository

- The repository has a point-in-time snapshot contract and a validation runner in `scripts/run_strategy_validation.py` and `src/stock_advisor/strategy_validation.py`.
- The only checked-in validation input example is explicitly synthetic and intended for CLI smoke tests. It is not market evidence.
- The backtesting documentation explicitly says the replay primitives are not an end-to-end backtest of the live dashboard recommendation strategy.
- SEC ingestion currently produces source bundles whose filing availability timestamps remain unverified until separately reconciled; the SEC bundle is not a complete signal dataset.
- A research-price-history workflow exists, but price bars alone do not reconstruct historical financial statements, earnings calendars, timestamped news, or historical universe membership.
- The dashboard's `historicalValidationPass` remains hard-coded to `false`, as required until approval evidence exists.

## Approval blockers

1. No complete, real, point-in-time snapshot dataset is checked in or attached to this review.
2. No end-to-end historical signals from the frozen dashboard rules have been generated from information demonstrably available at each decision timestamp.
3. No verified, split-consistent historical OHLC dataset has been paired to those signals and an exact-date broad-market benchmark.
4. No completed-trade sample of at least 100 has been demonstrated for the actual strategy.
5. No four-fold chronological walk-forward results and untouched holdout report have been demonstrated on real data.
6. Data provenance, point-in-time coverage, survivorship controls, corporate-action treatment, and calibrated transaction-cost attestations have not been independently verified.
7. Portfolio overlap, capital constraints, uncertainty analysis, and independent review remain outstanding.

## Required next work

1. Obtain a permitted historical dataset covering the strategy universe, including delisted symbols where relevant; daily split-consistent OHLC/adjusted returns; point-in-time SEC fundamentals with verified availability timestamps; historical earnings dates; timestamped news; and point-in-time universe membership.
2. Freeze the signal-generation code and parameters before running the final holdout.
3. Reconstruct dated snapshots without look-ahead, generate signals, and preserve a per-signal audit trail including failed gates and source IDs.
4. Run realistic next-session execution, transaction costs, unfilled-order handling, corporate-action treatment, a portfolio-level equity curve, and SPY (or a justified benchmark) comparisons.
5. Evaluate at least four chronological walk-forward folds and an untouched holdout. Report sample sizes, net returns, profit factor, maximum drawdown, risk-adjusted results, benchmark excess return, and uncertainty.
6. Have an independent reviewer reproduce the run and inspect data lineage and limitations.
7. Only after every predefined acceptance criterion passes, record the reviewed report/version and change the live BUY gate. Any failed criterion means the gate remains closed.

## Non-negotiable guardrail

Do not set approval flags to true merely to satisfy the runner. They are attestations about evidence, not configuration switches. Synthetic fixtures, successful software tests, and a current-history moving-average demo do not approve the live recommendation strategy.

This status document records blockers honestly; it is not itself a validation report or approval.
