# Paper ledger milestone — durable read-only account snapshots

## Scope delivered
- Authenticated `POST /api/paper/sync` reads the Alpaca Paper account and positions, validates the payload, then atomically persists an equity snapshot, replaces the current-position snapshot and writes an audit record to D1.
- `GET /api/paper/performance` derives a historical observed equity curve, snapshot-to-snapshot return and peak-to-trough drawdown only from persisted snapshots.
- Sync requires the existing `NORTHSTAR_OPERATOR_TOKEN`, `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` and `NORTHSTAR_DB` bindings.
- Both routes are read-only with respect to Alpaca. Neither submits, changes, or cancels broker orders.

## Explicit limitations
- This milestone persists account/position snapshots, not the complete order/fill lifecycle.
- Realized P&L, closed-trade statistics, win rate, expectancy and profit factor remain unavailable and are returned as null.
- Current positions are a replaceable latest-state snapshot, not an append-only position history.
- The first snapshot establishes a baseline; it does not establish a meaningful return series.
- The connected Alpaca Paper account equity is separate from Northstar's $1,000 virtual planning allocation.

## Safety
- Requires operator bearer-token authentication for sync.
- Sync fails closed unless D1 execution control is in paper mode, execution disabled and kill switch engaged.
- No execution route is added. The kill switch remains engaged.
