# Northstar AI paper-execution readiness

## Current state

Paper execution is **not enabled**. The Trading Lab's Alpaca integration is read-only, and the browser journal stores plans locally. This document and the D1 migration establish the persistent-ledger design only. They do not submit, simulate, or authorize broker orders.

## Fixed operating limits

- Virtual planning capital: USD 1,000.
- Default planned risk: 0.5% of virtual capital (USD 5).
- Hard maximum planned risk: 1.0% (USD 10).
- Maximum position notional: 25% of virtual capital (USD 250).
- Broker environment: Alpaca Paper Trading only.
- Live trading: prohibited.
- No-trade is the required outcome whenever any data, strategy, account, risk, or operational gate is unknown or fails.

These are planning limits, not guarantees of maximum realized loss. Stops can gap and fills can slip.

## Durable ledger

Migration `web/migrations/0001_paper_trading.sql` creates:
- A single execution-control row, initially disabled with the kill switch engaged.
- An idempotent order ledger with unique client request keys and broker order IDs.
- Broker-reconciled positions.
- Append-only order lifecycle events.
- Equity snapshots for drawdown and performance reporting.
- An audit log for execution-control and operational events.

## Mandatory gates before any paper order route exists

1. Bind a Cloudflare D1 database to the Pages project and apply the migration.
2. Keep broker credentials and the execution token in server-side Cloudflare secrets only.
3. Require authenticated, non-browser-public operator/scheduler access; never embed a bearer secret in HTML or JavaScript.
4. Enforce server-side fixed capital, per-trade risk, notional, symbol, order-type, buying-power, open-order and portfolio exposure limits. Ignore client-supplied risk limits.
5. Persist an idempotency key and a request hash before broker submission; reject reused keys with changed payloads.
6. Reconcile broker orders, fills, positions and account state after every submission and on every scheduled cycle. Treat timeouts as UNKNOWN and reconcile before retrying.
7. Add a server-side kill switch that blocks new submissions and supports cancel-all only after an explicit, separately tested policy.
8. Add unit, integration and failure-injection tests for duplicate requests, partial fills, network timeouts, rejected orders, stale quotes, market closures, gaps, and concurrent scheduler invocations.
9. Verify every broker URL is the Alpaca paper host; reject any configurable live-trading host.
10. Run in disabled / preview-only mode first. Enable paper submissions only after the above checks and an explicit user confirmation.

## Operational safeguards

- Never convert a research ranking into a trade automatically. Each candidate needs fresh quote data, market-regime permission, earnings/news checks, a defined entry/stop, a positive reward/risk profile, and a strategy eligibility result.
- The current strategy validation status is not eligible: no verified point-in-time historical dataset or demonstrated edge has been established. Therefore the execution gate must remain closed even after the ledger is deployed.
- Store no API keys, secrets, or access tokens in this repository, database, browser storage, logs, or chat.
- A scheduled workflow must use a single-flight lock and a durable run record so overlapping scans cannot place duplicate orders.
- Report proposed, accepted, filled, rejected and unknown states separately. Never call an accepted order a fill.

## Cloudflare binding (later step)

The Pages project will need a D1 binding named `NORTHSTAR_DB` pointing to a newly created database. Its database ID is account-specific and must not be guessed. Add the binding only after the database exists; then apply the migration with Wrangler. No database ID or credentials are required in this repository change.
