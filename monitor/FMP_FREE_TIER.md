# Legacy FMP configuration — retained only as a fallback

FMP is no longer Northstar's primary market-data or fundamentals provider.

## Current role

- FMP remains a **last-resort quote fallback** in the scheduled market monitor for the legacy allowlisted symbols.
- The Worker limits FMP fallback attempts to 200 per UTC day as a protective local ceiling. This is not a statement of verified FMP account entitlement.
- FMP historical ingestion remains a last-resort fallback behind Massive Basic in the Research Council collector. That adapter can itself fall through to validated Yahoo/Finnhub history.
- FMP fundamentals are queried only when SEC companyfacts produced no observations and a Pages `FMP_API_KEY` is configured.
- FMP is not called for the routine browser Research Lab workflow.

## Credentials

The previous production Pages health check returned HTTP 401 with an invalid-key message. This was a credential rejection, not proof of a general FMP outage.

Pages and the scheduled Worker have separate secret stores. The Worker has persisted FMP-sourced historical quotes in its previous ledger records, but its current key status must be verified independently before being treated as available. Never copy API keys into source code, documentation, issue comments or chat.

## Migration policy

Massive Stocks Basic is the primary EOD source; SEC EDGAR is the primary reported-fundamentals source; Finnhub/Alpaca IEX are the live quote sources; Yahoo remains a validated fallback.

Do not remove the FMP adapter or allowlist until the Massive integration and independent quote fallbacks have passed production acceptance. Do not re-enable FMP as a primary provider.
