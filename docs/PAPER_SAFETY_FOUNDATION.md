# Northstar AI — paper safety foundation

## Current guarantees
- Alpaca connection checks use the Paper Trading host and are read-only.
- The D1 ledger remains configured with virtual capital $1,000, default risk 0.5%, maximum risk 1%, maximum single-position notional 25%.
- Execution remains disabled and the kill switch remains engaged.
- `POST /api/paper/preview` calculates a long-only whole-share sizing preview from user-supplied prices. It makes no broker call and creates no order.
- `GET /api/paper/control` reports the fail-closed control state.
- `POST /api/paper/control` accepts only `ENGAGE_KILL_SWITCH`, requires `Authorization: Bearer <NORTHSTAR_OPERATOR_TOKEN>`, forces execution disabled and kill switch engaged, and writes an audit entry.
- `POST /api/paper/preflight` is an authenticated, read-only paper preflight. It checks a fresh Alpaca IEX quote (maximum age 60 seconds), bid/ask spread (maximum 1%), long stop placement, active account and buying power, broker-vs-ledger position reconciliation, existing same-symbol positions, virtual-capital exposure, and whole-share risk sizing.
- `POST /api/paper/reconcile` is an authenticated, read-only reconciliation. It compares broker and ledger positions, then compares broker order IDs, symbols, sides, and quantities against every ledger order. It reports unexpected broker orders, ledger orders missing broker IDs, and ledger orders not found at Alpaca. A mismatch returns HTTP 409 and a fail-closed status.
- Reconciliation reads up to 2,500 most recent Alpaca orders (five pages of 500). If more pages are needed, it refuses to claim a complete reconciliation.
- The preflight returns `PREFLIGHT_PASSED_PREVIEW_ONLY_NOT_AN_ORDER`; reconciliation returns `RECONCILIATION_PASSED_READ_ONLY` only when the compared data matches. Neither route creates, updates, cancels, or submits an order, nor writes to D1.
- There is deliberately no endpoint to release the kill switch or enable execution.

## Required Cloudflare secret
Set `NORTHSTAR_OPERATOR_TOKEN` as a Production secret in the Cloudflare Pages project. Use a long, random value; do not commit it or send it in chat. Without it, authenticated operator routes are inaccessible.

## Not yet implemented / not approved
Broker order placement, cancellation, webhook processing, partial-fill lifecycle, durable reconciliation snapshots, exchange-calendar/news/earnings blocks, short-sale controls, strategy walk-forward and holdout validation. No strategy has been approved for automated execution.

## Test examples
Sizing preview (user-supplied prices only):
```bash
curl -X POST https://ai-stock-advisor.pages.dev/api/paper/preview \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"NVDA","entryPrice":180,"stopPrice":175}'
```

Authenticated preflight (read-only; no order):
```bash
curl -X POST https://ai-stock-advisor.pages.dev/api/paper/preflight \
  -H "Authorization: Bearer $NORTHSTAR_OPERATOR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"NVDA","stopPrice":175}'
```

Authenticated reconciliation (read-only; no order):
```bash
curl -X POST https://ai-stock-advisor.pages.dev/api/paper/reconcile \
  -H "Authorization: Bearer $NORTHSTAR_OPERATOR_TOKEN"
```

Read control state:
```bash
curl https://ai-stock-advisor.pages.dev/api/paper/control
```

Engage emergency kill switch:
```bash
curl -X POST https://ai-stock-advisor.pages.dev/api/paper/control \
  -H "Authorization: Bearer $NORTHSTAR_OPERATOR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"ENGAGE_KILL_SWITCH"}'
```

All endpoints in this foundation are paper-only and none submit orders.
