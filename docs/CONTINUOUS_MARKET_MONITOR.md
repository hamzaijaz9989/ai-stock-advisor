# Continuous market monitor

The Northstar market monitor is a separate Cloudflare Worker (`northstar-market-monitor`), distinct from the dashboard Pages Functions and the slower full-universe scanner.

## Schedule and scope

- Cron cadence: every five minutes.
- The Worker exits without quote requests outside the US regular session (09:30–16:00 America/New_York, weekdays, with exchange holiday and early-close handling).
- It rotates two symbols per run from the exact 87-symbol FMP Free-plan allowlist.
- It also checks up to ten valid symbols from the current research shortlist that are outside the FMP allowlist.
- Requests are serialized (one concurrent provider request) with a 900 ms request gap.

## Provider routing

1. **FMP first** for symbols in the exact account-specific Free-plan allowlist, subject to the atomic 200-attempt-per-UTC-day monitor ceiling.
2. **Finnhub next** when FMP fails, or directly for non-FMP shortlist symbols. It uses the Worker secret `FINNHUB_API_KEY`.
3. **Yahoo Finance last** when Finnhub is unavailable or fails.

Every provider response must contain a positive price and a valid, fresh timestamp (maximum age 15 minutes; future skew at most two minutes). Missing, malformed, stale, or future-dated quotes fail closed. Finnhub's free quote endpoint is not a historical OHLC/candles replacement and remains subject to personal-use terms.

The Pages Functions environment and the Worker environment are separate. The Pages project secret `FMP_API_KEY` does not automatically bind to the `northstar-market-monitor` Worker. Configure the same key separately as a Worker Secret when FMP monitoring is intended. Never commit or log provider keys.

## Data and events

- Latest quote snapshots are stored in D1 table `monitor_quotes`, including provider quote time, fetch time, provider source, and provisional watch-zone fields.
- Events are deduplicated in `monitor_events`; current event types include entry/exit from an existing provisional watch zone and an absolute daily move of at least 3%.
- Run health and provider diagnostics are stored in `monitor_runs`.
- The read-only Pages endpoint `/api/monitor` exposes the latest run and event feed.
- A stale or incomplete shortlist cache fails closed; the monitor does not invent a quote or turn a provider observation into a BUY signal.

## Budget

- FMP monitor ceiling: 200 quote attempts per UTC day, leaving 50 of the stated 250-call Free-plan allowance as headroom.
- Two FMP-eligible symbols are selected per five-minute run.
- Failed FMP attempts count against the monitor budget.
- The ledger is an atomic conditional upsert; the monitor must not reserve attempt 201 for a UTC day.
- Other Northstar components using the same FMP key are not automatically charged to this Worker ledger; preserve the reserved headroom.

## Current runtime audit — 2026-11-12

See [Provider Health Audit](PROVIDER_HEALTH_AUDIT_2026-11-12.md). In brief: Finnhub is confirmed in use from production D1 quote/event rows. The user has now updated the FMP key, and a fresh Worker settings read confirms the `FMP_API_KEY` secret binding is present. The latest recorded run #563 still showed two FMP HTTP 401 fallbacks, but it occurred at/around the update and no later run was yet available. Verify a subsequent scheduled run before calling the FMP Worker path healthy.

## Safety

- The monitor is research-only and read-only with respect to brokerage execution.
- It does not produce validated BUY signals or submit, cancel, or modify broker orders.
- No paper-trading activation is implied by successful quote ingestion.
- Paper execution remains disabled and the kill switch remains engaged.
