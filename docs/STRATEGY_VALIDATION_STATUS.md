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


## Free-data-only acquisition plan — 2026-11-12

**Cost constraint:** No paid data subscriptions, API upgrades, or new paid services are authorized for this validation effort. Use only existing entitlements and public/free sources. A provider's free access does not imply complete coverage, point-in-time integrity, redistribution rights, or real-time entitlement.

### Permitted source roles and limitations

| Source | Permitted use | Important limitation |
|---|---|---|
| Existing FMP Free entitlement | Request historical EOD prices, statements, and news only where the account actually permits the endpoint and date range | The current historical response is not an immutable archive of every prior vendor revision. Do not assume endpoint access or unlimited history. |
| SEC EDGAR public data | Retrieve filing facts and filing documents; preserve accession number, form, filed/accepted timestamp, and source URL | SEC facts are not a complete historical ticker universe, earnings calendar, news feed, or vendor consensus archive. Respect SEC fair-access policy and identify filing availability precisely. |
| Yahoo Finance chart endpoint (existing fallback) | Exploratory historical daily price series and adjusted-close diagnostics | Unofficial endpoint; series may be revised or incomplete. Not a licensed point-in-time archive. |
| Nasdaq public historical endpoint (existing fallback) | Exploratory daily OHLC fallback when available | Coverage and pagination may be limited; fallback currently supplies unadjusted closes and must not be silently mixed with adjusted series. |
| Existing local repository fixtures | Unit tests, schema validation and deterministic smoke tests | Synthetic fixtures are not market evidence and cannot support performance claims. |

### Data acquisition rules

1. First run a low-volume entitlement/coverage probe against the existing FMP key and record endpoint, response status, requested date range, returned date range, retrieval timestamp, and errors. Do not infer plan entitlement from documentation alone.
2. Store raw responses and normalized records separately. Preserve source, retrieval time, original timestamp, currency, adjustment type, symbol, and any provider identifiers.
3. For filings, use the SEC filing's accepted/filing timestamp as the earliest availability evidence. Never use a later restated fact in an earlier snapshot. If availability cannot be proven, exclude the fact from point-in-time signals.
4. Do not treat current constituents as historical index membership. Without a defensible point-in-time universe and delisted-symbol coverage, label results as a limited-symbol study and do not call them survivorship-bias-controlled.
5. Do not combine adjusted Yahoo bars with unadjusted Nasdaq bars in one return series. Exclude or separately label any series whose split/dividend adjustment policy is unknown.
6. News may be used only when a timestamped article and its publication availability can be retained. Missing historical news is unknown, not zero news and not a clear-risk result.
7. Do not manufacture earnings dates, missing statements, delisted constituents, adjusted prices, or unavailable historical records.
8. Respect provider terms, rate limits, SEC fair-access guidance, and data-use restrictions. No scraping around authentication, paywalls, or rate limits.
9. Keep the strategy frozen before holdout evaluation. Any changes after observing holdout results invalidate that holdout and require a new untouched period.
10. The free-data study remains exploratory unless all original approval blockers are independently satisfied. In particular, it cannot attest to survivorship control or point-in-time completeness merely because the available free endpoints return data.

### Current implementation coverage and next gate

The repository already contains:
- `scripts/run_strategy_validation.py` and `src/stock_advisor/strategy_validation.py` for point-in-time snapshot validation and chronological replay;
- `web/functions/api/fmp-history.js` for existing FMP historical-price/statements/news retrieval, with explicit point-in-time limitations;
- `web/functions/api/history.js` for Yahoo Finance history and Nasdaq fallback, with outlier checks and provider caveats;
- a separate experimental moving-average diagnostic, explicitly not the live recommendation strategy.

Next implementation gate: create a read-only coverage inventory/probe that reports which symbols, dates, datasets and providers are actually available under the existing free entitlements. Do not run the final strategy validator until real source coverage, point-in-time timestamps and corporate-action treatment are evidenced. Keep `historicalValidationPass=false` and live BUY disabled.
