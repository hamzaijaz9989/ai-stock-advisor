# Build Plan

## Product contract

- Market: US-listed equities (NYSE/Nasdaq).
- Purpose: long-term investing research and decision support.
- Execution: research and signals only; no order placement.
- Initial infrastructure budget: $0.
- No promised win rate or return.
- Missing or invalid data must lower confidence or block a score.

## Milestone 1 — Financial metric primitives

- [x] Establish Python package and test configuration.
- [x] Add deterministic functions for growth, margins, net debt, CAGR and weighted scores.
- [x] Test undefined inputs and insufficient score coverage.
- [ ] Run tests in a local Python environment / CI.

## Milestone 2 — Data contracts and SEC adapter

- Define a normalized observation schema with ticker, CIK, metric, value, units,
  period end, filing/publication date, source URL, accession number and retrieval time.
- Fetch company submissions and XBRL company facts from official SEC endpoints.
- Respect SEC fair-access guidance, use a descriptive User-Agent, cache responses,
  and avoid excessive request rates.
- Keep raw responses separate from normalized data.
- Never treat fiscal period-end as the date the public could first know the result.

## Milestone 3 — Historical price adapter

- Add a replaceable provider interface for daily adjusted prices.
- Store source, retrieval timestamp, adjustment basis and missing-data flags.
- Check split/dividend adjustments, duplicate sessions, impossible values and gaps.
- Document free-tier delays, quotas and usage terms. Do not imply free data is
  suitable for unrestricted redistribution.

## Milestone 4 — Fundamental analysis

- Revenue and earnings growth, margins, free cash flow, debt and dilution.
- Compare multi-year trends, not just one quarter.
- Distinguish unavailable data from zero.
- Use sector-appropriate comparisons and avoid a single metric for every industry.

## Milestone 5 — Valuation and research report

- Select valuation methods appropriate to business economics.
- Record bear/base/bull assumptions and sensitivity ranges.
- Cite filings and source dates for factual claims.
- Clearly label interpretation, uncertainty and missing evidence.
- A score is a ranking aid, not a probability of profit.

## Milestone 6 — Backtesting and portfolio analysis

- Define the investment rules before looking at holdout results.
- Use point-in-time fundamentals and historical constituents where available.
- Prevent look-ahead, survivorship and selection bias.
- Include dividends, corporate actions, turnover and realistic costs.
- Compare total return and risk metrics with a suitable benchmark.
- Use walk-forward and untouched holdout periods; log all experiments.

## Milestone 7 — News monitoring

- [x] Add best-effort Yahoo Finance RSS and Google News RSS headline discovery endpoint.
- [x] Display linked headlines and source labels in the dashboard.
- [ ] Verify material claims against SEC filings and investor-relations releases.
- [ ] Add deduplication, relevance/event classification, stale-news handling, and point-in-time news storage.
- [ ] Test whether news improves out-of-sample results after costs before it can influence a signal.

## Milestone 8 — Live quote and ranking\n\n- [x] Add best-effort Yahoo Finance quote endpoint with provider timestamp and delayed-data warning.\n- [x] Display selected ticker quote and manual refresh control.\n- [ ] Validate quote availability, stale-data detection and provider terms.\n- [ ] Add historical prices and transparent fundamental/valuation/risk score.\n- [ ] Populate a ranked top-five opportunity list only after data and validation gates pass.\n- [ ] Show valuation-based entry zones, thesis-invalidating exit conditions and scenario ranges, not guaranteed prices.\n\n## Milestone 9 — Dashboard and monitoring

- Searchable watchlist and research reports.
- Evidence links, data freshness and quality warnings.
- Portfolio exposure and concentration analysis.
- Recommendation history and thesis review reminders.

## Non-negotiable safety rules

1. No brokerage credentials or order-placement functionality in this project.
2. Do not fabricate financial figures, citations, probabilities or backtest results.
3. Fail closed when critical data is stale, invalid or unavailable.
4. Do not optimize for win rate alone; evaluate risk, drawdown and returns after costs.
5. Record material methodology changes and rerun tests.


## Status overlay — 2026-11-10

- **Milestone 1 / universe scanning:** complete and tested, confirmed by the user. Do not restart this milestone unless a concrete regression is demonstrated.
- **Current active milestone / nine-agent Research Council (Stock Brain):** nearly complete. The nine logical roles are Market Scanner, Technical Analyst, Fundamental Analyst, News Analyst, Sentiment Analyst, Bull Researcher, Bear Researcher, Portfolio Analyst and deterministic Risk Committee. Finish end-to-end wiring, durable traces, dashboard visibility, exact-head tests and preview verification.
- **Strategy validation:** not approved; validated BUY remains disabled. Software tests and agent scorecards do not prove predictive performance.
- **Paper lifecycle:** not ready; execution remains disabled and kill switch engaged. No paper or live test orders.
- For the full phase order, acceptance workflow and session handover rules, see [Northstar Project Handbook](NORTHSTAR_PROJECT_HANDBOOK.md).


## Repository and continuity status — 2026-11-10
- GitHub repository `hamzaijaz9989/ai-stock-advisor` is **PUBLIC**, intentionally changed by the user. Do not request reconfirmation unless the user later reports a change.
- The project handbook and blocker log are the continuity source of truth. Read them before asking the user for project details and update them after every meaningful change.


## 2026-11-10 — Continuation audit after user instruction to move forward
- Repository visibility is PUBLIC, intentionally changed by the user. This supersedes older private/unresolved wording elsewhere in historical entries. Do not ask again.
- Canonical FMP secret name is `FMP_API_KEY` only. User has confirmed it is already configured; do not ask them to add/re-add it.
- Read-only Cloudflare API inventory confirms Worker `northstar-market-monitor` has a secret binding named `FMP_API_KEY` and D1 binding `NORTHSTAR_DB`. This confirms the binding name only, not the secret value or a successful provider request. Worker version 6 (`1690bbc4-a330-42ce-834e-e999b583c648`) is a preview version; production traffic was not promoted.
- Separate Pages project `ai-stock-advisor` metadata currently lists Production names `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `FMP_API_KEY`, `GEMINI_API_KEY`, `NORTHSTAR_OPERATOR_TOKEN`; Preview metadata currently lists only `NORTHSTAR_OPERATOR_TOKEN`. This is a distinct Pages Functions environment from the Worker. Secret values were never read. Do not infer that the user's Worker Preview key automatically binds to Pages Preview.
- Attempted read-only public preview probes for `/api/fmp-health` and `/trading-lab.html` were blocked by the connected web runtime as inaccessible; no application HTTP response was received. Therefore no endpoint health or FMP success is claimed.
- PR #103 current head after synchronizing documentation: `d7d0e2efc4415c069220ab2b196409c29ed85251`; compare reports 180 ahead / 0 behind `main` (base commit `08886f7f7cb1fbdcdee647d41cc244f9c4323159)); OPEN, non-draft, mergeable. Zero formal reviews and zero inline review threads. Current-head workflow/status APIs returned no run/status entries, so exact-head CI is **not verified** in this audit.
- Pages Preview deployment for exact current head `d7d0e2e...` is listed as `idle` (deployment `ba6d7cf8-f2d0-473d-8185-db993e31a870`); the latest listed successful preview deployment is for docs-only commit `fb24b74...`, not the current PR code head. Do not call the current head preview-accepted.
- PR #103 changes include nine-agent dashboard, server-side research collector/council endpoints, evidence/fact adapters, telemetry/evaluation and tests. Static review confirmed collector requires explicit successful read-only Alpaca sync and reconciles broker/ledger before refreshing; research remains read-only and no order submission path is invoked by the collector. Full runtime acceptance remains blocked by stale equity history and missing seven-day baseline.
- Production D1/strategy/ execution gates remain as documented in the preceding latest audit; no D1 query/write, migration, broker call, order, secret mutation, execution-control change or Production deployment was performed in this continuation.
- Next exact action: get a successful Preview deployment for the latest application-code head, verify its endpoints using a permitted runtime path, and resolve the Pages Preview binding discrepancy without requesting the user's key or exposing any secret. Then complete exact-head CI and independent review before any merge. Keep paper execution disabled, kill switch engaged and BUY disabled.
