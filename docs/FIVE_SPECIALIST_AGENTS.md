# Five specialist agents — implementation contract

This module provides five deterministic, provider-neutral specialist workers for Northstar's research council. It does not fetch data, invoke an LLM, access a broker, persist results, or authorize orders.

## Agents
- Market Scanner: evaluates supplied quote and OHLCV evidence, including relative session volume; it explicitly does not claim a universe-wide ranking from one ticker.
- Technical Analyst: calculates 20/50-session simple moving averages and 14-session RSI from supplied daily closes.
- Fundamental Analyst: reports the coverage of SEC and provider fundamental observations and flags missing cross-checks or point-in-time availability.
- News Analyst: counts timestamped discovery items and flags unverified sources; discovery is not equivalent to issuer corroboration.
- Sentiment Analyst: requires a dedicated timestamped sentiment/positioning observation with source, positive sample count and bounded normalized score. Missing feeds return UNAVAILABLE.

## Acceptance and limitations
Every COMPLETE finding/risk references canonical fact or evidence IDs. Agents return UNAVAILABLE when minimum evidence is absent. Outputs are advisory and cannot set the risk committee decision or submit orders.

The unit tests use synthetic fixtures and prove deterministic logic only. They do not establish live provider connectivity, current-market accuracy, complete universe coverage, corporate-action-adjusted history, or production acceptance. Live acceptance requires provider-specific integration tests and timestamp/source validation. Sentiment remains unavailable until a real sentiment source is connected.
