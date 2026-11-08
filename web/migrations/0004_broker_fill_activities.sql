-- Durable idempotent copy of Alpaca Paper fill activities.
-- Imported fills are broker-reported executions, not orders submitted by Northstar.
CREATE TABLE IF NOT EXISTS broker_fill_activities (
  activity_id TEXT PRIMARY KEY,
  broker_order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  qty REAL NOT NULL CHECK (qty > 0),
  price REAL NOT NULL CHECK (price > 0),
  cum_qty REAL,
  leaves_qty REAL,
  order_status TEXT,
  transaction_time TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_broker_fills_symbol_time ON broker_fill_activities(symbol,transaction_time,activity_id);
CREATE INDEX IF NOT EXISTS idx_broker_fills_order ON broker_fill_activities(broker_order_id,transaction_time);
