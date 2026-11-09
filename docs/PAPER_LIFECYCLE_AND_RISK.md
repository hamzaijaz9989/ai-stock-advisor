# Paper lifecycle and risk guardrails

This module is deliberately pure: it performs no broker calls, network requests, or database writes.

## Order lifecycle
- Allowed statuses: PREVIEWED, SUBMITTING, ACCEPTED, PARTIALLY_FILLED, FILLED, CANCELED, REJECTED, UNKNOWN.
- UNKNOWN is an unresolved broker outcome. Do not blindly retry submission; reconcile the original client request/idempotency key with broker order history first.
- Terminal FILLED/CANCELED/REJECTED states cannot be resurrected.
- Cumulative fills must be monotonic, non-negative, no greater than order quantity, and have a positive average fill price when filled quantity is positive.
- Cancellation is not considered complete until the broker confirms CANCELED.
- Reuse of an idempotency key is allowed only for an identical canonical request hash.

## Portfolio risk
The pure evaluator checks total gross marked exposure including open-order exposure, position concentration, configured daily loss/drawdown thresholds, and broker account restrictions. It fails closed if daily loss or drawdown inputs are missing. Do not treat a passing calculation as trade approval: quote freshness, liquidity, correlation/sector concentration, corporate actions, and independent strategy validation are separate gates.

## Boundary of the pure guards
The functions in this module perform no broker calls, network requests, database writes, or control changes. Separate authenticated endpoints persist read-only broker snapshots, imported fill activities, and the deterministic fill-derived FIFO ledger. Those maintenance endpoints do not submit, amend, cancel, or flatten broker orders. The current production system remains paper-only, disabled, and kill-switched.

## Validation required before any live-money discussion
1. Add durable, append-only order event persistence and transactional compare-and-set state updates.
2. Integrate broker order submission only in a separately reviewed paper-only service, with idempotency and UNKNOWN recovery.
3. Build audited daily equity snapshots and calculate daily loss/drawdown from a defined high-water mark and trading-day boundary.
4. Add sector/correlation limits, open-order reservations, market-hours/calendar checks, stale-data controls, and price collars.
5. Backtest with point-in-time/unbiased data, corporate actions, survivorship controls, realistic fees/slippage, out-of-sample and walk-forward evaluation, and multiple-testing controls.
6. Run sustained paper forward tests and reconcile every broker event. Engineering checks do not establish profitability.

## Strategy approval is a separate hard gate

The BUY path requires an evidence-backed `northstar_strategy_approval` D1 record in addition to portfolio, quote, equity-history, reconciliation, stop and execution-control checks. The migration seeds it as NOT APPROVED. Missing schema, missing row, invalid report metadata or an unapproved status blocks preflight and submission. Existing-order recovery remains available so an already-submitted order can be reconciled even while new BUYs are blocked. Never treat a unit-test approval fixture as real validation evidence.
