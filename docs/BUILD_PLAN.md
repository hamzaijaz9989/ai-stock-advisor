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


## Current execution checkpoint — 2026-11-10

- Repository visibility is public, owner-confirmed.
- Universe scanning remains complete and tested; do not rebuild it without a demonstrated regression.
- Nine-agent Stock Brain code and dashboard integration are combined in open, non-open PR #103 at head `5b39a9b888a6ccb7ba9a2074668cc73cee2e149a`. Exact-head CI passed (Cloudflare Pages, Tests, Validate AI Stock Advisor and full-history secret scan). Cloudflare preview deployment `a1c5704f-7bea-4ca4-a252-c6b049b5857b` succeeded at https://a1c5704f.ai-stock-advisor.pages.dev; live preview endpoint/UI smoke test remains outstanding because both web browsing and Cloudflare execution environments block outbound requests to the Pages host with tool-level 403.
- PR #103 is not merged or production-deployed. Do not treat CI or preview deployment as production acceptance.
- Production D1 currently has zero Research Council runs and one stale equity snapshot. The collector's fresh-snapshot and seven-day-history requirements are not satisfied. Controls remain paper mode, execution disabled, kill switch engaged.
- **Next goal:** complete a real preview runtime smoke test and protected collector auth/failure checks; then finish review and decide on safe merge. Separately establish fresh scheduled read-only equity snapshots and a seven-day baseline before any controlled research-only run with durable replay verification. No orders.
- **After Stock Brain acceptance:** begin the point-in-time strategy-validation milestone. Validated BUY remains disabled until independent evidence gates pass.


## 2026-11-10 — Latest autonomous Stock Brain acceptance checkpoint

- Repository is public by owner choice.
- PR #103 is open and non-draft at head `5b39a9b888a6ccb7ba9a2074668cc73cee2e149a`; exact-head CI is green and Cloudflare preview deployment succeeded at https://a1c5704f.ai-stock-advisor.pages.dev.
- Live HTTP/UI smoke testing remains outstanding due to the connected browsing layer's inability to reach the Pages host. Deployment success is not runtime acceptance.
- Next task: verify preview dashboard/status/auth paths in an authorized browser, then complete review and safe merge decision. No production deployment or DB mutation has been made.
