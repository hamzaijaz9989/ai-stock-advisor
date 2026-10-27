# Market Data and Recommendations Policy

## Live price display
The dashboard may request a latest quote and intraday chart data from Yahoo Finance's chart endpoint through a Cloudflare Pages Function. Availability, latency, coverage and permitted use are controlled by the provider and can change. Treat quotes as indicative; do not promise real-time delivery. Display the provider timestamp and local retrieval timestamp, and clearly label stale or unavailable quotes. Users must verify execution prices with their broker.

## Ranked opportunity list
A ranked list must not be presented as a buy list until the underlying inputs and scoring method are implemented and tested. Every candidate needs a source-linked fundamental record, current price with timestamp, valuation range and assumptions, news/event risk, downside scenario, and explicit conditions that invalidate the thesis. If essential data is missing or stale, the candidate is excluded or marked insufficient evidence rather than assigned an invented score.

## Entry and exit framework
A price target is a scenario estimate, not a guarantee. Entry levels should come from a documented valuation range and risk/reward assumptions; exit conditions should distinguish thesis failure, valuation reaching a target range, material fundamental deterioration, and portfolio risk limits. Avoid arbitrary stop/target prices without volatility, liquidity and holding-period context. Never represent an entry/exit estimate as a certainty.

## Validation gate
Before a ranked signal is enabled, pre-register rules, use point-in-time fundamentals and news, include corporate actions and realistic costs, and validate with walk-forward and untouched holdout tests. Report expectancy, total return, drawdown, volatility, sample size and benchmark comparison. Do not claim a 90% win rate or guaranteed profit.
