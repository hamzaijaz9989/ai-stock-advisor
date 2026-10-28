# Northstar AI strategy validation runbook

## Purpose and release boundary

This pipeline generates candidate signals from explicit, dated snapshots and replays them against daily bars. It is a research system, not brokerage execution. A generated `BUY SETUP — UNVALIDATED` is not a validated BUY. The current engine deliberately cannot self-approve the strategy.

## Data contract

Use `scripts/run_strategy_validation.py` with a JSON file containing:

- `metadata`: `data_source`, `data_version` and the final dataset `as_of_date`.
- `snapshots`: one row per ticker and decision date. Each row must contain all fields used by `evaluate_snapshot` and an `as_of_timestamp` with an explicit timezone.
- `available_at`: timezone-aware timestamps for price, annual fundamentals, quarterly fundamentals, earnings, news and universe membership. A field becoming available after the decision timestamp is a look-ahead failure.
- `bars`: daily OHLC and optional adjusted close, keyed by ticker, with split-consistent prices and data through the final cutoff.
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
4. Fold construction currently uses unique snapshot dates as a calendar. Production validation should use the market's actual session calendar and maintain an untouched final holdout.
5. Review uncertainty, confidence intervals, benchmark comparisons, parameter sensitivity and missing/delisted-stock coverage independently.
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
