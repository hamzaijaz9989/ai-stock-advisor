-- Independent Northstar fill-derived long-position ledger.
-- Cloudflare Pages preview must bind to its isolated northstar-preview D1 database, never production.
-- Broker account snapshots remain a separate mirror and must reconcile to this ledger.
CREATE TABLE IF NOT EXISTS northstar_fill_ledger (
  activity_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  broker_order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  qty REAL NOT NULL CHECK (qty > 0),
  price REAL NOT NULL CHECK (price > 0),
  transaction_time TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  raw_json TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES paper_orders(id)
);
CREATE INDEX IF NOT EXISTS idx_northstar_fill_symbol_time
  ON northstar_fill_ledger(symbol,transaction_time,activity_id);
CREATE INDEX IF NOT EXISTS idx_northstar_fill_order
  ON northstar_fill_ledger(order_id,transaction_time);

CREATE TABLE IF NOT EXISTS paper_position_lots (
  lot_id TEXT PRIMARY KEY,
  source_activity_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  entry_price REAL NOT NULL CHECK (entry_price > 0),
  original_qty REAL NOT NULL CHECK (original_qty > 0),
  open_qty REAL NOT NULL CHECK (open_qty > 0 AND open_qty <= original_qty),
  FOREIGN KEY (source_activity_id) REFERENCES northstar_fill_ledger(activity_id),
  FOREIGN KEY (order_id) REFERENCES paper_orders(id)
);
CREATE INDEX IF NOT EXISTS idx_paper_position_lots_symbol
  ON paper_position_lots(symbol,opened_at,lot_id);

CREATE TABLE IF NOT EXISTS paper_realized_trades (
  close_activity_id TEXT NOT NULL,
  open_activity_id TEXT NOT NULL,
  open_order_id TEXT NOT NULL,
  close_order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  qty REAL NOT NULL CHECK (qty > 0),
  entry_price REAL NOT NULL CHECK (entry_price > 0),
  exit_price REAL NOT NULL CHECK (exit_price > 0),
  realized_pl_usd REAL NOT NULL,
  closed_at TEXT NOT NULL,
  PRIMARY KEY (close_activity_id,open_activity_id),
  FOREIGN KEY (close_activity_id) REFERENCES northstar_fill_ledger(activity_id),
  FOREIGN KEY (open_activity_id) REFERENCES northstar_fill_ledger(activity_id),
  FOREIGN KEY (open_order_id) REFERENCES paper_orders(id),
  FOREIGN KEY (close_order_id) REFERENCES paper_orders(id)
);
CREATE INDEX IF NOT EXISTS idx_paper_realized_closed_at
  ON paper_realized_trades(closed_at,close_activity_id);
