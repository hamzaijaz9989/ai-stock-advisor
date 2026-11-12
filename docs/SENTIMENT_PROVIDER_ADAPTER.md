# Sentiment provider adapter

Northstar currently has no approved timestamped sentiment or positioning provider configured. The Sentiment Analyst therefore remains `UNAVAILABLE` on real research runs. No headline, price movement, or unlicensed estimate is used as a substitute.

A future source adapter must implement `createSentimentProviderAdapter({ providerId, fetchObservations })` from `web/lib/sentiment-provider.js` and return observations containing:

- The requested ticker and a source observation timestamp with an explicit timezone, no later than the research as-of time.
- A declared population (`retail`, `institutional`, `short_interest`, `options_positioning`, `analyst_revisions`, or `news_sentiment`) and a named metric.
- Provider methodology, sample count, and a score the provider already documents on the `-1..+1` scale.
- Provider identity and evidence sufficient to establish the account's license, endpoint entitlement, refresh cadence, and population definitions.

Northstar rejects unknown scale values; it does not convert raw sentiment metrics or combine scores from unlike populations or vendors. Adapter output is passed to `buildResearchCouncilContext({ sentimentObservations })`, which retains provenance as evidence. A provider-specific adapter and its contract tests must be added only after the source and entitlement are approved.
