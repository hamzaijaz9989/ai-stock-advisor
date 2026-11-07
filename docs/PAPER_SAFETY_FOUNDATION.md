# Northstar AI — paper safety foundation

## Current guarantees
- Alpaca connection checks use the Paper Trading host and are read-only.
- The D1 ledger remains configured with virtual capital $1,000, default risk 0.5%, maximum risk 1%, maximum single-position notional 25%.
- Execution remains disabled and the kill switch remains engaged.
- `POST /api/paper/preview` calculates a long-only whole-share sizing preview from user-supplied prices. It makes no broker call and creates no order.
- `GET /api/paper/control` reports the fail-closed control state.
- `POST /api/paper/control` accepts only `ENGAGE_KILL_SWITCH`, requires `Authorization: Bearer <NORTHSTAR_OPERATOR_TOKEN>`, forces execution disabled and kill switch engaged, and writes an audit entry.
- There is deliberately no endpoint to release the kill switch or enable execution.

## Required Cloudflare secret
Set `NORTHSTAR_OPERATOR_TOKEN` as a Production secret in the Cloudflare Pages project. Use a long, random value; do not commit it or send it in chat. Without it, the operator control write route is inaccessible. The preview endpoint does not require operator authentication because it cannot change state or place an order.

## Not yet implemented / not approved
Broker order placement, cancellation, webhook processing, partial-fill lifecycle, broker-to-ledger reconciliation, quote freshness checks, buying-power/exposure aggregation, short-sale controls, exchange-calendar/news/earnings blocks, strategy walk-forward and holdout validation. No strategy has been approved for automated execution.

## Test examples
Sizing preview:
```bash
curl -X POST https://ai-stock-advisor.pages.dev/api/paper/preview \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"NVDA","entryPrice":180,"stopPrice":175}'
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

These routes are intentionally paper-only and do not submit orders.
