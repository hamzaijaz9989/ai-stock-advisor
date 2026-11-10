# News and Signal Policy

## Purpose
News supports long-term US equity research. A headline alone must never trigger a buy signal or be treated as verified fact.

## Initial free sources
- Yahoo Finance RSS: ticker-related headline discovery when available.
- Google News RSS: secondary discovery feed, not a primary source of truth.
- SEC EDGAR filings (10-K, 10-Q, 8-K, proxy statements and amendments): primary source for regulated company disclosures.
- Company investor-relations releases: primary source for company-issued announcements; a future adapter must use verified issuer URLs.
- Federal Reserve/FRED releases: useful official macroeconomic context; a future adapter.

The current dashboard's news endpoint aggregates Yahoo Finance RSS and Google News RSS only. It does not yet retrieve full article text, verify facts, score sentiment, or ingest investor-relations releases. Feed availability and terms can change. Items are linked to their source and display publication time when provided.

## Before a news signal influences research
1. Preserve title, publisher/source, URL, publication time, retrieval time and ticker relevance.
2. Deduplicate syndicated copies and repeated headlines.
3. Classify as company-specific, sector, macro, opinion, rumor or unrelated.
4. Separate reported fact from opinion, forecast, rumor and promotional content.
5. Prefer primary sources; verify material announcements against SEC filings or company investor-relations releases.
6. Classify event type: earnings/guidance, M&A, product, regulation/litigation, leadership, cybersecurity, financing/dilution, analyst rating, macro or other.
7. Estimate impact, uncertainty and duration separately. Positive wording is not equivalent to positive expected returns.
8. Test whether the news was already reflected in price; do not claim an edge without point-in-time tests.
9. Keep source links and timestamps in reports. Stale or missing news lowers confidence and must not be silently treated as positive.

## Trading-quality goals
- Do not promise or optimize solely for a 90% win rate.
- Evaluate out-of-sample expectancy, total return, volatility, maximum drawdown, turnover, exposure and performance versus a suitable benchmark after realistic costs.
- Use walk-forward tests and a locked holdout period; avoid look-ahead, survivorship and selection bias.
- Report sample size and uncertainty. A small number of historical wins is not evidence of a durable edge.
- A stock can fall after good news; profitable outcomes cannot be guaranteed.
- Research only: no brokerage connection or automated orders.

## Next stages
- Add a documented article-level provider with appropriate terms and rate limits.
- Add verified issuer/sector mapping and event taxonomy.
- Store point-in-time news history before backtesting any news signal.
- Test duplicates, stale timestamps, missing publication times, source outages, ticker ambiguity and untrusted article content.
- Evaluate whether news adds measurable value beyond fundamentals and valuation before it can influence signals.


## News quality contract (implemented helper; not yet wired into live dashboard scoring)
- Added canonical URL and normalized-title deduplication, including syndicated copies with different URLs.
- Added freshness states: fresh (14 days by default), stale, undated, invalid-date and future-dated. Only fresh items pass the quality gate.
- Added company, sector, macro and ambiguous scope classification; sector/macro items cannot masquerade as company-specific catalysts.
- Added a quality-aware aggregate that requires freshness, company relevance, a classified catalyst and a recognized primary/reported source.
- Existing `aggregateNewsCatalysts` remains unchanged for compatibility. This is not yet wired into dashboard decisions and does not enable BUY.
