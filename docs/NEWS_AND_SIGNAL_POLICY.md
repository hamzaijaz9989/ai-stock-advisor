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


## Sentiment provider access — 2026-11-10

A sentiment observation must come from an authorized, timestamped source with an explicit population and methodology. Stocktwits currently is not accepting new API registrations while its APIs, documentation and terms are under review. Reddit's Data API requires a separate agreement for commercial use and approval for API access; user content cannot be used for model training without express rightsholder permission. Northstar must not scrape either source or substitute unofficial wrappers. If no authorized source is connected, the sentiment analyst must report UNAVAILABLE. Price movements and ordinary news headlines are not a substitute for crowd/positioning sentiment.

Official references: https://api.stocktwits.com/developers, https://redditinc.com/policies/data-api-terms, https://support.reddithelp.com/hc/en-us/articles/16471395473812-Moderation-Bots-Tooling.
