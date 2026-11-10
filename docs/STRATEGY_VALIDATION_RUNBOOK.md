# Northstar AI strategy validation runbook

## Purpose and release boundary

This pipeline generates candidate signals from explicit, dated snapshots and replays them against daily bars. It is a research system, not brokerage execution. A generated `BUY SETUP — UNVALIDATED` is not a validated BUY. The current engine deliberately cannot self-approve the strategy.

## Data contract

Use `scripts/run_strategy_validation.py` with a JSON file containing:

- `metadata`: `data_source`, `data_version` and the final dataset `as_of_date`.
- `snapshots`: one row per ticker and decision date. Each row must contain all fields used by `evaluate_snapshot` and an `as_of_timestamp` with an explicit timezone.
- `available_at`: timezone-aware timestamps for price, annual fundamentals, quarterly fundamentals, earnings, news and universe membership. A field becoming available after the decision timestamp is a look-ahead failure.
- `bars`: daily OHLC and optional adjusted close, keyed by ticker, with split-consistent prices and data through the final cutoff.
- `benchmark_bars`: separate daily bars for a broad-market benchmark (default `SPY`), covering the exact entry and exit dates of completed trades. The report never substitutes the stock's own buy-and-hold return for a broad-market benchmark.
- `quality_attestations`: external evidence statements. These are attestations, not proof; the validator does not infer them.
- optional transaction cost settings and sample-size thresholds.

The provisional snapshot rules mirror the current app's major gates: positive annual and quarterly financial quality, revenue decline limits, price/DCF ratio within 0.40×–2.50×, entry zone at 75–80% of the DCF base, at least 2:1 reward/risk, ATR-derived risk, no known near-term earnings event or flagged risk headline, and whole-share risk/notional sizing. Any missing, malformed or future-dated input fails closed.

## Run

```bash
python -m pip install -e ".[dev]"
python scripts/run_strategy_validation.py --input examples/strategy_validation_input.example.json --output validation-report.synthetic.json
# The fixture is fake and should fail release-quality gates by design.
python scripts/run_strategy_validation.py --input path/to/real_point_in_time_dataset.json --output validation-report.json
pytest
ruff check .
node --test tests/web_logic.test.mjs
```

Do not use synthetic examples as evidence of strategy performance. A report should preserve the exact input data version, source lineage, script commit, configuration, generated signals and failed gates.

## Known gaps before production approval

1. A licensed, complete, reproducible historical data bundle has not yet been wired in. PtData is a candidate for point-in-time corporate facts and historical index constituents; verify its terms and coverage. It does not alone supply every historical price, timestamped news and earnings input required here.
2. The input builder must produce snapshots from source records; manual or today's revised values are not acceptable for historical dates.
3. The validator now includes a cash-only, single-position-at-a-time portfolio equity curve with fixed-dollar risk sizing, cash/notional limits, overlap skips and drawdown. This is deliberately conservative and does not simulate overlapping positions or margin.
4. The report now evaluates frozen-rule signals separately inside each chronological test window and truncates each symbol's future bars at that window's end. It does not fit or tune parameters in each training window; it is a repeated out-of-sample evaluation of a frozen strategy, not an adaptive model-training loop. Fold boundaries are currently based on unique snapshot dates, so the dataset builder must supply genuine market-session dates and a separately untouched final holdout.
5. Each fold reports its own completed/incomplete trades, returns, profit factor and exact-date broad-market benchmark excess where benchmark dates match. Missing or date-incomplete SPY bars are not forward-filled. The same-stock buy-and-hold figure is reported separately and is not used as the broad-market benchmark. Review uncertainty, confidence intervals, parameter sensitivity and missing/delisted-stock coverage independently.
6. The validated BUY gate remains disabled until these gaps are addressed and an independent reviewer approves a versioned report.

## Release checklist

- [ ] Provider licence permits the intended use and distribution.
- [ ] Historical universe includes delisted names and point-in-time membership.
- [ ] Every feature has an availability timestamp and source identifier.
- [ ] Filing amendments/restatements cannot leak into earlier dates.
- [ ] Corporate actions, dividends, splits, suspensions and missing bars are reconciled.
- [ ] Execution uses next-session prices with conservative gap and cost handling.
- [ ] Walk-forward folds and an untouched holdout are fixed before viewing results.
- [ ] Portfolio overlap, capital allocation, cash, drawdown and exposure limits are simulated.
- [ ] Results beat suitable benchmarks net of costs with adequate sample size and uncertainty bounds.
- [ ] Independent review signs off on the exact strategy/data/report version.
- [ ] Automated tests pass and deployment is verified on production.

A high win rate by itself is not proof of an edge. Passing a historical test does not guarantee future returns.


## Conservative SEC/FMP chronology admission — 2026-11-10

For any point-in-time reconstruction, a date-only SEC `filed` value is insufficient to establish intraday availability. Exclude same-day filings unless a separately verified exact public-availability timestamp is no later than the decision timestamp; prior-day date-only filings may be included, with the limitation retained. FMP statement rows require a provider `acceptedDate` time no later than the decision timestamp, or a `filingDate` strictly earlier than the decision date. Provider accepted/filing timestamps are not independently verified public availability, so preserve that caveat. FMP snapshot `retrievedAt` must not be later than the research as-of time. Provider estimates are retrieval-time snapshots, not immutable historical estimate archives. The validator must continue to reject future/missing availability and never infer it from fiscal period end.


## Quote freshness admission — 2026-11-10 10:26 PKT / 05:26 UTC

Historical point-in-time validation must retain quote observation time separately from retrieval time. For the live Stock Brain collection path, the canonical adapter classifies a quote as fresh only when it is no later than the research `asOf` and within the market-state age limit: 15 minutes for open/unknown/pre/post states, or five calendar days only when the provider explicitly reports the market closed. Missing, future and stale quotes are rejected before specialist model invocation. Do not infer a closed session from the wall clock or a missing provider market-state field. This is a conservative admission rule and does not establish licensed data rights or historical strategy validity. Implementation `24b42afd41d0b0455b055cce8719c8a10e01ddec`; exact-head CI Tests `42762768731`, Validate `42762768617`, secret scan `42762768610`, push Tests `42762763147` passed; Preview deployment `700ebefd-605c-4aee-bfa1-5b63214b9844` succeeded. No database changes or Production deployment occurred.
