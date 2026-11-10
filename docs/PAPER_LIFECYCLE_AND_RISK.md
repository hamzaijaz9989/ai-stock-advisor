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

## Not implemented intentionally
No order submission, modification, cancellation, D1 mutation, automatic strategy selection, or live execution is implemented by these guards. The current production system remains paper-only, disabled, and kill-switched.

## Validation required before any live-money discussion
1. Add durable, append-only order event persistence and transactional compare-and-set state updates.
2. Integrate broker order submission only in a separately reviewed paper-only service, with idempotency and UNKNOWN recovery.
3. Build audited daily equity snapshots and calculate daily loss/drawdown from a defined high-water mark and trading-day boundary.
4. Add sector/correlation limits, open-order reservations, market-hours/calendar checks, stale-data controls, and price collars.
5. Backtest with point-in-time/unbiased data, corporate actions, survivorship controls, realistic fees/slippage, out-of-sample and walk-forward evaluation, and multiple-testing controls.
6. Run sustained paper forward tests and reconcile every broker event. Engineering checks do not establish profitability.


## Migration and OIDC release gate — 2026-11-10

The persistent-ledger PRs have migration-history divergence: main's `0006_continuous_market_monitor.sql` is duplicated by PR #85's `0011_continuous_market_monitor.sql`, while PR #85 also introduces `0006_northstar_fill_position_ledger.sql`. Production has migrations 0001–0005 recorded despite monitor tables existing; Preview has 0001–0012. Do not apply migrations or merge the overlapping sets until migration order and idempotency are reviewed against a disposable database. PR #88's GitHub OIDC validator accepts both public and private repository visibility despite its stated private-only contract; repository visibility is unresolved and must be treated as public until owner Settings confirm otherwise. No paper execution, paper order, or live order is authorized by this runbook update.
