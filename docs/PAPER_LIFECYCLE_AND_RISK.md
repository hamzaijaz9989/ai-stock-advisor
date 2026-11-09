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

## Remaining release and validation gates before PAPER enablement
The branch now contains durable order events, an idempotent paper-order ledger, a singleton submission claim, an atomic D1 compare-and-set at the broker-POST boundary, read-only fills/position synchronization, reconciliation, and operator partial-fill recovery. These are code paths, not proof of production readiness.

1. Obtain an independent formal review of the complete order/recovery lifecycle and configure/verify main-branch protection and required checks.
2. Apply migrations 0006–0009 to production only after compatibility, backup and recovery review.
3. Establish at least seven days of fresh, time-separated production equity snapshots and clean broker-to-ledger reconciliation.
4. Confirm the production broker account is Alpaca PAPER through authenticated read-only checks; keep all broker requests pinned to the paper API host.
5. Produce and independently reproduce a genuine point-in-time strategy validation report with at least 100 completed historical trades, four chronological walk-forward folds, an untouched holdout, and data provenance, survivorship, corporate-action, fee and slippage attestations. Synthetic fixtures do not count.
6. Configure the separate paper-execution approval credential and implement/verify the audited PAPER-only enable procedure. The current operator control endpoint can only engage the kill switch; it cannot enable execution.
7. Only after all prior gates pass, conduct a controlled PAPER forward-validation period and reconcile every broker event. Engineering checks do not establish profitability.

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

The standalone stop is a stop-market order: its stop trigger does not guarantee the eventual execution price. The operator endpoint is implemented in the branch/preview code and remains unavailable in production until formal review and release gates pass. Its broker mutations are restricted to cancellation of an existing Northstar PAPER OTO parent/held child and an exact-quantity standalone GTC SELL stop.


## Single-flight submission boundary — 2026-11-09

Migration `0008_paper_execution_single_flight.sql` adds a durable singleton claim for the deliberately narrow first paper executor. The order row, claim, event and audit row are written in one D1 batch; each dependent insert is conditional on acquiring the singleton. A second distinct intent cannot create a second submission claim. The claim is intentionally permanent for this initial one-order executor and is not released by a terminal broker state.

Immediately before the broker POST, the route re-reads the execution controls and the exact strategy-approval attestation. Migration 0009 adds an immutable `post_started_at` boundary timestamp. A conditional D1 batch can acquire that boundary only while the singleton claim is `SUBMITTING`, no boundary timestamp exists, the strategy attestation still matches, and PAPER controls are enabled with the kill switch disengaged. The D1 transaction serializes with the operator kill-switch transaction: whichever commits first determines whether the broker POST is permitted. The control endpoint waits for an in-flight claim to reach a verified terminal state; `UNKNOWN` is never considered quiesced.

D1 and the external Alpaca API cannot participate in one distributed transaction. A timeout or ambiguous broker result is therefore marked `UNKNOWN`, execution is disabled, and the kill switch is engaged; the system never blindly retries. The route remains hard-pinned to the Alpaca PAPER host with no LIVE URL or fallback. Tests use broker mocks only.

Migrations 0008 and 0009 are branch/preview scope until reviewed and applied through the normal release process. Do not apply them to production or enable paper execution while strategy, recovery, equity-history, credential, governance and end-to-end verification gates remain open.


## Inclusive risk-stop thresholds — 2026-11-09

The $20 daily-loss cap and $80 maximum drawdown are inclusive stop thresholds: preflight and submission block new trades when the verified value is greater than or equal to the limit. The $250 maximum position and $10 maximum per-trade risk remain hard upper bounds. Tests cover values immediately below and exactly at the daily-loss/drawdown caps. A reached loss cap is not permission to place one more trade.

## Operator partial-fill recovery route — 2026-11-09

The branch now implements `POST /api/paper/recover`. It is intentionally separate from normal order submission and is allowed only when `execution_control.mode='paper'`, `enabled=0`, and `kill_switch=1`. It requires the operator token and exact per-request confirmation:

```json
{
  "orderId": "the-existing-Northstar-paper-order-UUID",
  "confirmation": "RECOVER_THIS_PAPER_ORDER"
}
```

The route is limited to a broker-linked Northstar BUY parent and has a two-phase workflow:

1. If the parent can still execute, request cancellation and return. A later invocation must re-query until the parent is terminal; no protective stop is submitted while the entry can still add exposure.
2. If an OTO child is HELD, first reconcile cumulative entry/child fills to the broker position, request cancellation of that non-protective child, and return. Re-query on a later invocation.
3. Once the parent and child are terminal, reconcile the exact remaining long quantity. If an existing OTO stop is active and covers that exact quantity, do not add another order.
4. Otherwise require a bid no older than 60 seconds and strictly above the intended stop. After the initial quote, re-query the nested parent/child, broker positions and a fresh quote; revalidate order identity, cumulative parent/child fills, exact remaining long quantity and the PAPER-disabled/kill-switch-engaged control state. If any value changed or cannot be verified, no stop is submitted.
5. Persist an idempotent recovery-order ledger row, then submit only a SELL stop with GTC time-in-force for the exact remaining shares. Query the broker order and positions again. Accept the recovery only if the client order ID, symbol, side, type, quantity, stop price, GTC setting and remaining-position coverage all match. An ambiguous result is UNKNOWN; never blindly retry.

The route never submits a BUY, market sell, short sale, or flatten request. A stop-market trigger does not guarantee the eventual execution price. The final broker recheck reduces stale-snapshot exposure but cannot make the broker read and subsequent POST atomic against unrelated external account activity; exact post-submit position verification and fail-closed UNKNOWN handling remain necessary, and this boundary requires independent safety review. All cancellation and order submission behavior is covered with mocked broker calls; no broker mutation has been used as a test. The read-only fill importer and reconciliation endpoint recognize standalone recovery-stop rows and compare their fills and leaves against the independent FIFO ledger and broker position.

Example operator request (use a private authenticated client; never paste the token into source control):

```bash
curl --fail --silent --show-error -X POST "$NORTHSTAR_API_BASE/api/paper/recover" \
  -H "Authorization: Bearer $NORTHSTAR_OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"<existing-order-uuid>","confirmation":"RECOVER_THIS_PAPER_ORDER"}'
```

This route is branch/preview code only until formal review and release gates pass. It is not authorization to enable paper execution. Production remains disabled and kill-switched.


## Separate human review of paper intents

A proposal remains `PENDING_REVIEW` until the nested `POST /api/paper/intents/review` endpoint records a decision. Review requires the operator bearer credential plus a distinct `NORTHSTAR_INTENT_REVIEW_TOKEN` header (`X-NORTHSTAR-INTENT-REVIEW`) and a server-configured `NORTHSTAR_INTENT_REVIEWER` identity. The review token must differ from both the operator token and the paper-execution approval token.

An APPROVE decision requires the exact `REVIEW_THIS_PAPER_INTENT` confirmation, a meaningful review note, and a fresh server-side preflight. The live preflight sizing, entry estimate, stop, notional and planned risk must still match the stored proposal; otherwise the intent stays pending and a new proposal must be created. REJECT does not call the broker or preflight. Both decisions are conditional updates from `PENDING_REVIEW`, so concurrent or repeated decisions fail closed.

Migration `0010_paper_intent_review_audit.sql` adds the reviewer field and database guards. Reviewer, review timestamp and decision note become immutable; a status transition to APPROVED_REVIEW_ONLY or REJECTED requires all review metadata; an SQLite trigger writes the reviewer decision to `execution_audit_log` in the same transaction; and intent records cannot be deleted. The submit endpoint additionally requires a valid reviewer and decision timestamp. Review is not execution authorization: the separate paper-execution approval credential, approved strategy attestation, enabled PAPER controls, fresh equity history, clean reconciliation, account checks and all risk limits remain independently required. The review route never creates, submits, amends, cancels or flattens a broker order.

Required server configuration names (values must never be committed): `NORTHSTAR_OPERATOR_TOKEN`, `NORTHSTAR_INTENT_REVIEW_TOKEN`, `NORTHSTAR_INTENT_REVIEWER`, and the separate `NORTHSTAR_PAPER_EXECUTION_APPROVAL_TOKEN`. Missing or reused credentials cause the review route to fail closed.
