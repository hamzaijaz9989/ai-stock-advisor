# Northstar fill-derived paper position ledger

## Scope

Migration `0006_northstar_fill_position_ledger.sql` adds an append-only Northstar fill ledger plus deterministic FIFO-derived open lots and realized-trade matches. It is additive and does not alter existing order, intent, equity, or execution-control rows.

## Data flow

1. The authenticated fill-sync endpoint reads Alpaca Paper fill activities and nested order history. It does not submit, amend, cancel, or flatten broker orders.
2. All valid broker activities may be retained in `broker_fill_activities` for provenance. Only activities whose broker order ID matches a Northstar ledger parent order or its recorded OTO stop-loss child are attributed to Northstar in `northstar_fill_ledger`.
3. Parent entry fills are buys; the recorded OTO stop-loss child fills are sells. Unrelated/manual broker fills are not attributed to Northstar.
4. The pure `derivePaperPositionLedger` function sorts immutable tracked activities by transaction timestamp and activity ID, builds long-only FIFO lots, matches sell fills against the oldest open lots, and computes gross realized P&L.
5. The fill-sync endpoint rebuilds `paper_position_lots` and `paper_realized_trades` in the same D1 batch as newly imported Northstar fills. A sell exceeding tracked open shares, a conflicting activity ID, invalid side/symbol, unavailable migration, or exceeded safe ledger/batch cap fails closed and engages the paper kill switch.
6. Reconciliation compares broker positions against both the latest `paper_positions` account snapshot mirror and the independent fill-derived FIFO positions.

## Limits and interpretation

- This is a long-only ledger for the current narrow executor. Short sales and untracked/manual positions cause reconciliation or ledger failures; they are never silently netted.
- The immutable activity ledger is capped at 5,000 rows for a single deterministic rebuild. The importer and D1 batch have additional bounded limits; reaching a limit blocks the sync rather than publishing partial derived state.
- Realized P&L is gross FIFO before commissions/fees, dividends, taxes, transfers, corporate actions, and other adjustments not yet modeled. It is not a complete tax or broker statement.
- `paper_positions` remains the broker account snapshot mirror. It is not overwritten by FIFO derivation.
- A green unit test or successful reconciliation does not approve the trading strategy or enable execution.

## Remaining lifecycle gap

The FIFO ledger improves exposure accounting, but it does not solve Alpaca OTO partial-fill protection. A partially filled entry can still have a held stop child. The current code detects this and fails closed, but does not cancel the remaining entry or establish a standalone protective stop/flatten the filled quantity. That separate operator-only recovery workflow remains a release blocker.

## Safety

The migration and code do not enable execution. No broker order is created, modified, cancelled, or flattened by fill sync or reconciliation. Production must remain `enabled=0`, `mode='paper'`, and `kill_switch=1` until the full lifecycle, strategy validation, migration deployment, scheduled maintenance, and operational gates are independently verified.
