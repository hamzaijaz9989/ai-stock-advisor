# Parallel live-data acceptance: Market Scanner + Technical Analyst

The authenticated POST endpoint `/api/research/specialists` collects quote and FMP historical OHLCV evidence without invoking Alpaca, D1, portfolio sync, or execution. It requires the existing `NORTHSTAR_OPERATOR_TOKEN` bearer token and a ticker.

The endpoint verifies ticker identity, quote timestamp, quote age, OHLCV schema, chronology and minimum history coverage. It runs the Market Scanner and Technical Analyst against the same canonical evidence and returns provider/source timestamps and explicit limitations. It never places orders or returns a BUY decision.

Market Scanner calculates relative latest-session volume against the prior 19 sessions and reports the provider quote change. It is a single-ticker analysis, not a universe-wide ranking; provider-delayed quotes are explicitly flagged.

Technical Analyst calculates SMA(20), SMA(50), RSI(14), MACD(12,26,9) and the observed 20-session high/low range. Historical adjustment policy remains unverified, so the report carries that limitation and must not be treated as certified support/resistance.

Synthetic tests cover malformed and out-of-order bars and indicator output. A live Preview request with a valid operator token is still required for live acceptance. No Production deployment is part of this change.
