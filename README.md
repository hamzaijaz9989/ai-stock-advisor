# AI Stock Advisor

A research-first prototype for US equities. The Trading Lab specification defines a separate $1,000 paper-simulation allocation and conservative risk controls; it does not represent the user's real holdings, place live orders, or guarantee returns.

## Project continuity and operating workflow

Read [Northstar Project Handbook](docs/NORTHSTAR_PROJECT_HANDBOOK.md) before starting a new work session. It records the current phase, nine-agent research-council roles, ordered next steps, safety boundaries, and the mandatory documentation/testing/handover workflow.

## Project principles

- Capital preservation and data quality before recommendations.
- Fundamentals, valuation, price behavior, earnings and event risk must be considered together.
- Every material figure should be traceable to a source and timestamp.
- Missing or inconsistent data means an explicit warning, not an invented value.
- No automatic brokerage execution, leverage, options, or short selling.

## Trading Lab (planned, paper-only)

See [Northstar Trading Lab — Risk-First Specification](docs/TRADING_LAB_SPEC.md) for the proposed equity scanner, deterministic risk gates, position sizing, audit trail, paper-execution safety requirements, $1,000 simulation profile, and validation/promotion criteria. This is a design specification, not a claim that automated paper order placement is already implemented. The current Alpaca endpoint remains read-only, and live execution is not supported.

## SEC point-in-time source ingestion

Fetch official SEC filing/fundamental records (not signals) for a set of symbols:

```bash
python scripts/fetch_sec_history.py --symbols AAPL MSFT NVDA --cutoff 2026-10-28 --output data/sec-source-bundle.json
```

See [SEC point-in-time ingestion](docs/SEC_POINT_IN_TIME_INGESTION.md). The bundle preserves accession IDs and exact acceptance timestamps where available; it never guesses timestamps. The Research Council also excludes same-day date-only SEC facts unless an exact verified public-availability timestamp is supplied; FMP statement rows require a pre-as-of accepted timestamp or a prior-day filing date, and provider retrieval timestamps must not exceed the research as-of time. It is explicitly not decision-eligible and does not unlock BUY.

## Research-only historical price collection

A manual workflow can fetch daily OHLC, adjusted closes, dividends, and splits for up to 10 symbols:

```bash
python scripts/fetch_research_price_history.py --symbols AAPL MSFT NVDA AMZN GOOGL SPY --start 2010-01-01 --cutoff 2026-10-28 --output research-price-history.json
```

The source is an **unofficial Yahoo Finance chart endpoint**. Output is explicitly marked `commercial_use_authorized: false` and `decision_eligible: false`. Use it only for internal research/pipeline testing after reviewing applicable terms; do not use it for commercial display or redistribution. Replace it with a licensed market-data provider before production or commercial use. This price bundle does not include historical universe membership or the live strategy's historical valuation, earnings, timestamped news, and risk-headline inputs.

## Financial Modeling Prep cross-check

Northstar can optionally load a separate Financial Modeling Prep (FMP) fundamentals panel alongside SEC-reported data. The Cloudflare Pages Function at `/api/fmp-fundamentals` retrieves annual income statements, balance sheets, cash-flow statements, key metrics, ratios, and analyst estimates. The FMP API key is read only by the server-side function and is never placed in browser JavaScript.

To enable it, add `FMP_API_KEY` as a **Cloudflare Pages secret/environment variable** for the production project (and Preview if needed), then redeploy. Do not commit the key or paste it into source files. The existing quote route also supports FMP as a provider fallback when its timestamped quote is returned.

FMP is an independent secondary data source. Northstar keeps its figures separate from SEC observations because fiscal periods, currencies, units, and later restatements may differ. Analyst estimates are explicitly forecasts. Missing endpoints are reported as partial coverage rather than silently filled. This integration does **not** enable BUY: the historical-validation gate remains closed until the actual strategy passes point-in-time walk-forward and untouched holdout testing with verified inputs and realistic costs.

Official FMP docs: https://site.financialmodelingprep.com/developer/docs/quickstart and https://site.financialmodelingprep.com/developer/docs.

## Alpaca Paper Trading connection (read-only)

Northstar includes a server-side connection check for an Alpaca **Paper Trading** account at `/api/alpaca/status`. The Cloudflare Pages Function reads the secrets `ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY`, calls only the paper account and positions GET endpoints, and returns a small account/positions summary to the dashboard. The keys are never sent to browser JavaScript. The integration deliberately does not submit, cancel, or modify orders and does not connect to the live trading host.

Add both values as Cloudflare Pages **Secrets** for Production (and Preview only if you also want to test preview deployments), then trigger a new deployment. Use the matching Paper Trading key pair; paper and live credentials are different. In Northstar, open **Data connection details** and select **Test Alpaca connection**.

Official references: [Alpaca authentication](https://docs.alpaca.markets/us/docs/authentication), [Get account](https://docs.alpaca.markets/us/reference/getaccount-1), and [Paper trading](https://docs.alpaca.markets/us/docs/paper-trading).

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

The dashboard in `web/` is deployed to Cloudflare Pages. The connected GitHub API currently reports `visibility=public`, while the owner states the repository should be private. This discrepancy remains unresolved. Treat repository contents as publicly accessible until GitHub Settings confirms the actual visibility; do not change visibility without explicit authorization. Never commit secrets or sensitive customer data.

- [Live dashboard](https://ai-stock-advisor.pages.dev)
- [GitHub repository](https://github.com/hamzaijaz9989/ai-stock-advisor)

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


## Strongest current research setup
The 253-stock screen now adds a conservative, provisional opportunity check across recent quote timestamps, valuation sanity, model watch zone, risk/reward, basic fundamentals, earnings and recent news. It can surface the strongest *current research setup* only if all implemented checks pass; otherwise it says WAIT. This remains research-only and does not enable a validated BUY or promise profit. The full strategy still needs point-in-time walk-forward and untouched holdout validation, and production use requires licensed market data.


## SEC timestamp verification
The SEC ingestion workflow now creates a separate bounded sample cross-checked against SEC filing-index header pages. It checks accession and filing-date consistency, converts EDGAR acceptance time to UTC, records it separately as `acceptance_at`, and keeps `available_at` null with `availability_timestamp_verified: false` because acceptance is not proof of public-web availability. Acceptance time is not proof of the exact moment a filing became publicly retrievable; complete point-in-time strategy validation remains blocked until all required inputs and availability semantics are verified.


Repository visibility is unresolved: GitHub API metadata currently reports `public` while the owner states it is `private`. Do not change visibility without explicit authorization; treat repository contents as publicly accessible until GitHub Settings confirms otherwise.
