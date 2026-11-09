# PAPER execution activation runbook

## Status

The guarded activation endpoint is implemented at `POST /api/paper/activate`, but it is **not currently approved or ready to run in production**. Production and preview controls must remain PAPER-disabled with the kill switch engaged until every prerequisite below is independently verified. Do not use this endpoint as a test; its successful outcome changes the execution-control row.

## Required server-side configuration

Configure these only in the Cloudflare Pages environment/secret store. Never commit values, paste them into logs, or put them in workflow YAML.

- `ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY`: PAPER-account credentials only.
- `NORTHSTAR_OPERATOR_TOKEN`: existing operator credential.
- `NORTHSTAR_INTENT_REVIEW_TOKEN` and `NORTHSTAR_INTENT_REVIEWER`: independent intent-review credential and reviewer identity.
- `NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN` and `NORTHSTAR_PAPER_EXECUTION_APPROVER`: separate activation credential and approver identity.
- `NORTHSTAR_PAPER_ACCOUNT_ID`: exact UUID of the Alpaca PAPER account.

The operator, intent reviewer and activation approver must be distinct where enforced by the application. The activation approval token must be different from both the operator and intent-review tokens. The endpoint rejects missing, reused or undersized credentials before any sync or broker request. Secret values are never returned or written to the activation evidence.

## Mandatory prerequisites

1. The deployed production commit must contain the reviewed activation code, and production D1 must have migrations 0001–0012 applied and verified.
2. The execution-control row must be `mode='paper'`, `enabled=0`, `kill_switch=1`, with the exact $1,000 virtual allocation, 0.5% default risk, 1% maximum risk and 25% maximum position limits.
3. The independent strategy-validation approval row must be approved, have a valid report SHA-256 and HTTPS report URI, and identify its reviewer.
4. The broker account ID must exactly match the configured PAPER account; the account must be ACTIVE, USD-denominated and have positive equity and buying power.
5. A fresh account snapshot must be no older than 15 minutes, and the history must contain a positive-equity baseline at least seven days old. Daily loss must remain below $20 and maximum drawdown below $80.
6. The US market clock must be open. A fresh SPY IEX quote must be no older than 60 seconds and have a spread no greater than 1%.
7. The endpoint itself must complete read-only account sync, fill import/order-state sync and read-only broker-to-ledger reconciliation. Fill import must explicitly report `FILL_IMPORT_AND_ORDER_SYNC_PASSED_READ_ONLY`; reconciliation must report `RECONCILIATION_PASSED_READ_ONLY` with no mismatches.
8. The initial executor must have no broker or ledger orders, no broker or ledger positions, no fill-derived positions, no durable single-flight claim, and no pending or approved-but-unsubmitted intents. This is a deliberately restrictive first-activation condition.
9. All applicable CI checks, independent code review, production endpoint verification, backup and migration rehearsal must be complete. This endpoint does not substitute for those release gates.

## Activation request

Only after the prerequisites are satisfied, a separately authorized operator may send a POST request to `/api/paper/activate` with:

- `Authorization: Bearer <NORTHSTAR_OPERATOR_TOKEN>`
- `X-NORTHSTAR-PAPER-EXECUTION-APPROVAL: <NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN>`
- A unique `X-Request-ID` containing 8–160 safe characters.
- JSON body with both `action` and `confirmation` exactly equal to `ENABLE_PAPER_EXECUTION`.

Transmit credentials through a secure client/secret manager; do not place them in shell history, chat, source code, CI output or query strings. The request performs only PAPER-host GET checks and read-only sync/reconciliation, followed by one atomic D1 control transition and audit trigger. It never creates, submits, amends, cancels or flattens an order.

A successful response means the PAPER execution controls were enabled and the immutable activation event/audit record verified. It does **not** mean an order was placed. Every later trade still requires a separately reviewed intent, fresh per-symbol preflight, risk validation, idempotent submission and a verified protective stop.

## Failure and emergency stop

- Any missing migration, secret, reviewer, approval, account match, fresh quote/history, strategy approval, clean reconciliation or flat-ledger requirement must fail closed.
- A failed compare-and-set must not enable execution. If post-write verification fails, the endpoint attempts to re-engage the kill switch and returns an explicit unknown-state warning if verification remains unavailable.
- To stop PAPER execution, use the existing authenticated `POST /api/paper/control` action `ENGAGE_KILL_SWITCH`. Verify the control row is `enabled=0`, `kill_switch=1` and confirm the audit record before further action.
- Never change `mode` to live, never use live broker credentials or endpoints, never submit a real-money order, and never create an order as a test.

## Current blockers

At the latest audit, production has only migrations 0001–0005 recorded, the seven-day equity history and strategy approval are not present, the PAPER account/activation identity variables are not configured, and the production deployment does not yet contain this route. Therefore activation must remain unused and PAPER execution disabled.
