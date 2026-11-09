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


## Partial-fill recovery decision policy — 2026-11-09

`web/lib/paper-recovery-policy.js` is a pure, fail-closed decision layer for the operator recovery route. It never calls the broker or changes D1.

It deliberately separates recovery into ordered decisions:

1. An open or partially filled entry must first be canceled; a pending cancellation must be observed until the broker confirms a terminal state. No stop is submitted while the parent can still fill.
2. A terminal parent is reconciled against the broker position and any OTO stop-child fills. A held child is never counted as active protection.
3. An already-active OTO stop is accepted only when its remaining quantity equals the exact broker position.
4. If no active child remains, a standalone GTC stop is recommended only when the broker position equals entry fills minus stop-child fills, the quote is no older than 60 seconds, and the bid remains above the intended stop.
5. Any mismatch, unknown state, stale quote, or breached stop price returns `MANUAL_RECOVERY_REQUIRED`. The policy never recommends a blind market flatten.

The standalone stop is a stop-market order: its stop trigger does not guarantee the eventual execution price. The operator endpoint that performs cancellation and stop placement is not implemented yet; this commit establishes and tests the deterministic safety policy before adding broker mutations.


## Single-flight submission boundary — 2026-11-09

Migration `0008_paper_execution_single_flight.sql` adds a durable singleton claim for the deliberately narrow first paper executor. The order row, claim, event and audit row are written in one D1 batch; each dependent insert is conditional on acquiring the singleton. A second distinct intent cannot create a second submission claim. The claim is intentionally permanent for this initial one-order executor and is not released by a terminal broker state.

Immediately before the broker POST, the route re-reads `execution_control` and refuses submission if paper mode is not active, execution is disabled, or the kill switch is engaged. This narrows the control race window but cannot make a D1 read and an external broker request atomic. The route remains paper-only; no LIVE URL or fallback exists. The final-control and singleton-claim tests use broker mocks only.

Migration 0008 is branch/preview scope until reviewed and applied through the normal release process. Do not apply it to production or enable paper execution while the strategy, recovery, equity-history, credential, governance and end-to-end verification gates remain open.
