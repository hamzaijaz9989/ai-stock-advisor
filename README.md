# AI Stock Advisor

A research-first prototype for US equities configured for a $500 portfolio, a holding window of several weeks to six months, and moderate risk tolerance. It does not place orders or guarantee returns.

## Project principles

- Capital preservation and data quality before recommendations.
- Fundamentals, valuation, price behavior, earnings and event risk must be considered together.
- Every material figure should be traceable to a source and timestamp.
- Missing or inconsistent data means an explicit warning, not an invented value.
- No automatic brokerage execution, leverage, options, or short selling.

## Python core

Requires Python 3.11+.

```bash
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
# .venv\\Scripts\\Activate.ps1
python -m pip install -e ".[dev]"
pytest
ruff check .
```

## Dashboard

The dashboard in `web/` is deployed to Cloudflare Pages. The repository must remain private.

- [Live dashboard](https://ai-stock-advisor.pages.dev)
- [Private GitHub repository](https://github.com/hamzaijaz9989/ai-stock-advisor)

It includes SEC EDGAR reported facts and filings, best-effort quote and one-year history data, headline discovery, a third-party upcoming-earnings calendar check, a provisional five-year cash-flow-per-share valuation, ATR-based risk levels, and a decision checklist.

## Historical validation framework\n\nA Python backtesting module now supports next-session entries, risk/target exits, gap-aware stop fills, transaction costs, benchmark comparisons, outcome summaries, and expanding walk-forward folds. It is a framework for testing defined signals, **not a completed backtest of the dashboard strategy**. After installing the project, run its explicitly synthetic smoke-test input with `python scripts/run_backtest.py --input examples/backtest_input.example.json`. The runner always marks reports as not decision-eligible. The recommendation engine remains locked to WAIT/AVOID/INSUFFICIENT EVIDENCE until point-in-time strategy signals pass walk-forward and untouched holdout evaluation. See [Historical Validation Framework](docs/BACKTESTING.md).\n\n## Decision policy and current limitations

The dashboard's decision panel is deliberately gated. It can show preliminary scenario values and conditional watch levels when the SEC facts are sufficiently complete. These are **not validated buy or sell signals**.

The DCF uses three comparable annual positive free-cash-flow observations and prefers the diluted weighted-average shares from the same annual reporting period; it falls back only to a recent, unambiguous SEC instant share-count fact. It forecasts five years using a growth assumption blended from recent FCF and revenue growth; bear/base/bull discount rates are 12%/10%/9% and terminal-growth assumptions are 1.5%/2.5%/3.0%. The "FCF" input is operating cash flow minus absolute capital expenditures, a simplified proxy. The model does not fully normalize cash/debt, cyclicality, stock-based compensation, business-specific valuation methods, or consensus forecasts. The entry watch range is set to 75%–80% of the base model value; it is a margin-of-safety heuristic, not a forecast that the price will reach it. The risk trigger is two times the recent 14-day ATR below the midpoint watch entry. These assumptions need sensitivity analysis and testing.

Earnings dates use the public EarningsNxt calendar as a third-party source, not an official exchange or company source. A missing event in that provider's window is **not** proof that no report is scheduled. Confirm dates with company investor relations. News headlines are discovery signals; simple keyword flags are only warnings and must be checked in original sources.

A BUY signal remains disabled because no reproducible walk-forward and out-of-sample validation has passed. The app must keep reporting WAIT or INSUFFICIENT EVIDENCE until the full model is backtested with point-in-time inputs, corporate actions, realistic transaction costs, and benchmark comparison. Quotes may be delayed, incomplete or subject to provider terms. Verify execution prices with a broker. No win rate or return target is promised.

See:
- [News and Signal Policy](docs/NEWS_AND_SIGNAL_POLICY.md)
- [Market Data and Recommendations Policy](docs/MARKET_DATA_AND_RECOMMENDATIONS.md)
- [Recommendation Engine Specification](docs/RECOMMENDATION_ENGINE_SPEC.md)
## Northstar Operations Terminal (paper mode)

The browser dashboard includes a separate operations module at the **Stock operations terminal** section.

- Scans a user-editable universe of up to 30 US tickers using the existing /api/quote and /api/history endpoints.
- Ranks candidates using transparent 20/50-day trend, 20/60-day momentum, average dollar-volume, ATR volatility, quote freshness, and OHLC outlier checks.
- A candidate must pass every scanner rule and have a suitable timestamped quote before the paper-entry control is enabled.
- Paper sizing uses a $500 virtual starting balance, $5 planned risk per trade, a 35% maximum portfolio allocation per position, and no more than three open positions.
- Simulated entries and exits include 0.10% adverse slippage. Initial stop distance is 2×ATR; the reference target is 2R.
- Positions are marked on the latest successful scan. Exits are manual in the paper ledger; the module does not claim intraday stop/target fills.
- Events and paper positions are stored in browser localStorage on the current device. CSV export is available. Clearing browser data or using another device does not sync this ledger.
- The scanner score is a technical screening score, not a probability, forecast, or validated BUY signal. A paper simulation is not a real trade or proof of profitability.

**No broker integration, real-money order routing, or autonomous live execution is included.** Do not enable real execution until a separate point-in-time backtest, walk-forward and holdout validation, corporate-action handling, realistic costs, and operational controls have been independently reviewed.
