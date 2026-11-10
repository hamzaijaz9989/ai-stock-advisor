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


## 2026-11-10 — Repository visibility remains unresolved (owner instruction)

- The owner states that `hamzaijaz9989/ai-stock-advisor` is private, while the connected GitHub API reports `visibility=public`. The actual GitHub Settings page has not been independently confirmed, so the discrepancy remains unresolved.
- Treat repository contents as publicly accessible until GitHub Settings confirms the actual visibility. Do not change repository visibility without explicit authorization.
- Do not claim that the owner confirmed or requested a change to public visibility. Earlier documentation commits that made that claim are superseded by this owner instruction and are corrected here.
- Do not ask the owner to repeat the documented intent. Use an authorized GitHub Settings view if it becomes available; this API integration alone cannot verify the Settings UI.
- No application code, secret, deployment, database, broker, or execution-control changes were made by this documentation correction.
