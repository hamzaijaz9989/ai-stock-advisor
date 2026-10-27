# Market Data and Recommendations Policy

## Live price display
The dashboard requests quote and historical price data through Cloudflare Pages Functions. The quote source may be delayed or unavailable; provider timestamps and retrieval timestamps must remain visible. The user must verify execution prices with their broker. When Yahoo historical data is unavailable, Nasdaq fallback history may use unadjusted closing prices, which omit dividends.

## Earnings and event risk
The dashboard may query EarningsNxt's public earnings calendar as a third-party discovery source. It is not an official exchange or issuer feed. A missing ticker in a returned window never establishes that no earnings report exists. Before any real trade, confirm the date and report time on the company's official investor-relations website or filing. If the date cannot be verified or the calendar results are incomplete, the system must not issue a BUY.

## News review
Yahoo Finance RSS, Google News RSS and Nasdaq company headlines are discovery sources. Publication timestamps, source links, and provider labels must be preserved. Keyword detection is a conservative review prompt only; it is not sentiment analysis and does not establish that an allegation is true. Material claims must be checked against original reporting, company releases and SEC filings. An unavailable or stale news feed is not evidence that there is no risk.

## Preliminary DCF watch levels
The prototype's provisional model is available only when three comparable annual FCF observations are positive and a recent, unambiguous SEC shares-outstanding observation is available. It estimates FCF as operating cash flow minus absolute capital expenditures and discounts an assumed five-year forecast using fixed bear/base/bull assumptions. These are not consensus forecasts or a business-specific fair-value model. The provisional entry watch range uses 75%–80% of base-case value; the risk trigger uses two times 14-day ATR below the midpoint watch entry. These rules are not backtested and must not be presented as validated entry/exit instructions or short-horizon price targets.

## Recommendation states
- **BUY** must remain disabled until required data gates pass and a reproducible walk-forward plus untouched holdout evaluation passes.
- **WAIT** means the price, timing, risk/reward, or validation criteria do not currently justify an entry.
- **INSUFFICIENT EVIDENCE** is required when material inputs are missing, stale, ambiguous, or cannot be confirmed.
- Do not infer a SELL instruction from an experimental score. A current holding requires a separate review of the user's cost basis, tax context, portfolio and updated thesis.

## Position sizing for the configured portfolio
Use a default planned risk budget of 1% of USD 500 ($5) per position and a hard planned-risk ceiling of 2% ($10), before gaps, fees and slippage. For whole shares, calculate shares as the lower of the risk-budget-limited size and affordable capital allocation. If zero whole shares fit, return zero rather than widening risk. Fractional shares may only be shown as an optional broker-dependent alternative. No stop trigger guarantees the exit price.

## Validation gate
Before a ranked signal is enabled, pre-register rules; use point-in-time fundamentals, news and event data; account for corporate actions and survivorship; include realistic fees, spread and slippage; and validate with walk-forward and untouched holdout tests. Report sample size, expectancy, total return, max drawdown, volatility, turnover, and benchmark comparison. Do not claim a 90% win rate or guaranteed profit.
