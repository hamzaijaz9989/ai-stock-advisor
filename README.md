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


## Latest verified Northstar checkpoint

- Active phase: nine-agent Research Council / Stock Brain. Universe scanning remains complete; do not rebuild it without a demonstrated regression.
- Main: `68c0c7b8a547487073e25ef286b91a3a892b2187`. Active PR #108 head: `7345c3333860329413e25800d1f3e33b750e9e3c`, 83 ahead / 0 behind, mergeable, but awaiting independent review and governance. Exact-head Tests, Validate and secret scan runs `42879636217`, `42879636245`, `42879636208` passed.
- Production OIDC snapshot workflow run `42878930747` successfully completed read-only sync and pre/post reconciliation with execution disabled. Production Pages deployment: `ab1f9eb5-eb68-4824-9bb4-d7b5c2cea8f5`; Stock Brain Preview: `f82b5260-3b84-45d8-9a13-b39f9731a48d`.
- Production Research Council acceptance remains pending: no durable Council runs/traces exist, a genuine seven-day trusted equity baseline is not yet available, Preview provider secrets are absent, and the market monitor remains fail-closed on a stale shortlist. Keep execution disabled, kill switch engaged and BUY disabled.


## 2026-11-10 23:56 PKT — exact documentation-head verification

- Documentation/source commit verified: `c4f60fee02b8f7adc61eb654bf1e8f6fa12cef8a` on PR #108, branch `northstar/stock-brain-clean-review-20261110`.
- Exact-head CI on `c4f60fee02b8f7adc61eb654bf1e8f6fa12cef8a`: Tests run `42881677857` PASS; Validate run `42881678080` PASS; full-history secret scan run `42881677828` PASS. These results are for the exact c4f60 commit.
- Cloudflare Preview deployment `b08bcda9-7952-4da1-9f07-e061fe0a0c10` succeeded from `c4f60fee02b8f7adc61eb654bf1e8f6fa12cef8a`, with Functions enabled and the isolated Preview D1 binding. Production remains on deployment `ab1f9eb5-eb68-4824-9bb4-d7b5c2cea8f5` from main `68c0c7b8a547487073e25ef286b91a3a892b2187`; no Production deployment occurred.
- PR #108 is now 84 commits ahead / 0 behind main, open/non-draft, mergeable clean, with zero formal reviews. Main remains `protected=false`; do not merge before independent review and governance approval.
- Files in this documentation verification addendum: README, project handbook, blocker register, build plan, Stock Brain spec, continuous-monitor runbook, paper-readiness runbook and Research Council spec. Database changes: NONE; SELECT-only audit; no secrets read/changed, no broker mutation, no orders, no Production migration/control change/deployment. Safety interlocks remain unchanged.
- Exact next action: independent formal review/governance for PR #108; continue separate verification of scheduled OIDC snapshots and cache-refresh delivery; preserve the seven-day baseline and research-only acceptance gates.


## 2026-11-10 23:56 PKT — exact redaction and release-state handover

- Phase/objective: Phase 2 Research Council / Stock Brain; record the final exact-head verification and public-repository data-hygiene state. Universe scanning remains user-confirmed COMPLETE and unchanged.
- PR #108 source head `10e5a728d9b072ce8e6bb69505e7a69a111e290f`, branch `northstar/stock-brain-clean-review-20261110`, 86 ahead / 0 behind main `68c0c7b8a547487073e25ef286b91a3a892b2187`, non-draft, mergeable, 0 independent reviews. Exact-head Tests `42882484814`, Validate `42882484976`, secret scan `42882484966`: all PASS. Preview deployment `b45c1a9a-0780-4b69-9a9f-f281ccb3c9a6` succeeded from this head with Functions enabled. Production Pages remains `ab1f9eb5-eb68-4824-9bb4-d7b5c2cea8f5` on main; no PR #108 code is in Production.
- Separate data-hygiene PR #114 head `7ca39d93e2fde60089471eac2198f205212a6318`, one commit ahead / zero behind main, non-draft, mergeable, 0 reviews. Exact-head Tests `42882587882`, Validate `42882587696`, secret scan `42882588286`: all PASS. It removes historical broker account balance/cash/buying-power values from the current main blocker-log text. Its root-only documentation change does not require a Pages application deployment. Current main remains unchanged until the PR is reviewed and merged.
- Public-data handling: PR #108's current documentation and PR description no longer include broker account equity/cash/buying-power amounts. PR #114 applies the blocker-log redaction to main. Existing Git history is not rewritten; older committed versions may remain retrievable. No history rewrite was attempted. GitHub reports repository visibility public while owner intent is private; treat all content as public until Settings confirms the actual visibility. Main branch is `protected=false`; both PRs have zero independent reviews. Do not merge either without review and governance approval.
- Production OIDC snapshot run `42878930747` passed on a push event: readiness, pinned OIDC, read-only sync, pre/post reconciliation; execution=false and automatedOrderSubmission=false. A trusted snapshot and audit were persisted. The scheduled OIDC cron `17 */3 * * *` remains unverified by a schedule event.
- Production D1 remains migrations `0001`–`0006`; Preview retains 12 historical migration entries. No migrations applied. Production monitor has 264 runs (55 failed, 209 market_closed), 70 aggregate errors, zero symbols/quotes/events; latest #264 failed closed on stale/incomplete cache. Cache last generated `2026-11-10T11:04:27.273Z` by run `42803828945`; no later scheduled refresh observed. Worker `7326f3e7-f323-4856-badf-aa8b979dffb4` remains at 100%, cron `*/5 * * * *`; PR #108 FMP auth fix is not deployed.
- Research Council Production runs/traces remain zero; no collector acceptance was invoked. Synthetic integration proves fail-closed role handling, not live acceptance. Preview lacks provider bindings for a real-provider run; news remains unverified and sentiment unavailable pending a permitted timestamped source. Paper controls remain `enabled=0`, `mode=paper`, `kill_switch=1`; no paper/live orders, positions, intents, fills or trade events. Two trusted read-only sync snapshots and one plugin capture exist; plugin capture is excluded. The seven-day baseline cannot exist before `2026-11-15T18:34:38.720Z` if recurring trusted snapshots continue. Strategy validation NOT APPROVED; BUY disabled.
- Files updated in this handover: README, handbook, blocker register, build plan, Stock Brain spec, continuous-monitor runbook, paper-readiness runbook and Research Council spec. Audited commit SHA `10e5a728d9b072ce8e6bb69505e7a69a111e290f`; PR #108. CI and Preview evidence above. Database changes in this documentation work: NONE (SELECT-only audit); no secret read/change, broker mutation, order, control change, Production migration or Production deployment.
- Safety impact: documentation and PR metadata only; execution remains disabled and kill switch engaged. No scanner code or freshness gate changed.
- Complete: exact-head CI and Preview pass for PR #108; exact-head CI pass for the focused PR #114 redaction; Production OIDC snapshot path verified by workflow evidence.
- Blockers: independent reviews/governance for both PRs; seven-day baseline; cache-refresh schedule delivery; Preview provider configuration; timestamped news and licensed sentiment; controlled research-only Council acceptance; strategy validation and approval.
- Exact next action: obtain independent review/governance for PR #108 and PR #114; verify the next scheduled OIDC/cache refresh events; keep monitor fail-closed; continue trusted snapshots until the seven-day baseline; then perform one controlled research-only Council acceptance and verify all nine outcomes, vetoes, scorecard, telemetry, durable trace and idempotent replay. Never enable paper execution or submit any order.


## 2026-11-11 00:32 PKT / 2026-11-10 19:32 UTC — current research and data-quality status

Production Alpaca paper and FMP quote/history/fundamentals bindings now pass read-only GET health checks; do not re-enter working keys based on older screenshots. FMP news remains HTTP 402, discovery headlines are not publisher-verified, and no permitted timestamped sentiment feed is configured. The monitor's latest run #270 still fails closed on stale shortlist cache with zero symbols/quotes/events. The nine-agent POST routes were not invoked because they require the run-time operator token; no live Council acceptance is claimed. The seven-day trusted snapshot baseline remains unavailable before 2026-11-15T18:34:38.720Z. Execution remains disabled, kill switch engaged and BUY disabled.
