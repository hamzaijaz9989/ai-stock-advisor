# FMP Free-tier-aware market monitor

## Scope

The market monitor uses the 87 ticker symbols supplied by the user as the FMP Free-plan allowlist. This is an account-specific working configuration, not a guarantee that every ticker will return a quote on every endpoint. Provider responses remain authoritative; denied, missing, stale, or malformed quotes are not treated as valid market data.

## Request-budget policy

- FMP Free-plan stated allowance: 250 API calls per day.
- Monitor hard ceiling: 200 FMP quote attempts per UTC day.
- Reserved headroom: 50 calls for other Northstar FMP features and unexpected usage.
- Monitor batch size: 2 symbols per scheduled run.
- Schedule: every 5 minutes during US regular market hours only.
- A normal 6.5-hour session has at most 78 scheduled runs, or 156 monitor FMP attempts.
- Failed FMP attempts still consume budget and are counted.
- The D1 budget ledger uses an atomic conditional upsert, so the monitor cannot reserve request 201 for the same UTC day.
- Once the monitor budget is exhausted, it stops calling FMP and may use the existing Yahoo fallback. Yahoo data still must pass timestamp and price validation.

## Universe rotation

The monitor rotates through the configured allowlist in two-symbol batches. This covers the full 87-symbol universe over approximately 220 minutes of scheduled market-open runs. Symbols absent from the current top-stocks cache can still be checked, but they have no provisional entry watch zone until the cache supplies one.

## Safety and limitations

- No batch-quote endpoint is assumed.
- No unsupported symbol is sent to FMP by the monitor.
- The monitor does not interpret a quote as a BUY signal.
- Provider errors and stale data remain fail-closed.
- This change does not enable paper-order execution or live trading.
- The request ledger counts monitor FMP attempts only. Other Northstar components using the same FMP account/key must preserve the 50-call headroom; they are not automatically charged against this monitor ledger.
- The FMP daily reset timezone is not assumed. The ledger uses UTC dates; verify the provider's reset boundary before relying on exact end-of-day alignment.
