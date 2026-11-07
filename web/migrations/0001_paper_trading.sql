-- Northstar AI paper-trading ledger foundation.
-- This migration creates durable records only; it does NOT enable order execution.
-- Execution must remain disabled until the authenticated API, broker reconciliation,
-- idempotency, risk controls, kill switch and tests are complete.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS execution_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  mode TEXT NOT NULL DEFAULT 'paper' CHECK (mode = 'paper'),
  kill_switch INTEGER NOT NULL DEFAULT 1 CHECK (kill_switch IN (0, 1)),
  max_portfolio_usd REAL NOT NULL DEFAULT 1000 CHECK (max_portfolio_usd = 1000),
  default_risk_fraction REAL NOT NULL DEFAULT 0.005 CHECK (default_risk_fraction > 0 AND default_risk_fraction <= 0.01),
  max_risk_fraction REAL NOT NULL DEFAULT 0.01 CHECK (max_risk_fraction > 0 AND max_risk_fraction <= 0.01),
  max_position_fraction REAL NOT NULL DEFAULT 0.25 CHECK (max_position_fraction > 0 AND max_position_fraction <= 0.25),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO execution_control
  (id, enabled, mode, kill_switch, max_portfolio_usd, default_risk_fraction, max_risk_fraction, max_position_fraction)
VALUES (1, 0, 'paper', 1, 1000, 0.005, 0.01, 0.25);

CREATE TABLE IF NOT EXISTS paper_orders (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  client_request_hash TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  qty REAL NOT NULL CHECK (qty > 0),
  order_type TEXT NOT NULL CHECK (order_type IN ('market', 'limit', 'stop', 'stop_limit')),
  time_in_force TEXT NOT NULL CHECK (time_in_force IN ('day', 'gtc', 'ioc', 'fok')),
  limit_price REAL,
  stop_price REAL,
  status TEXT NOT NULL CHECK (status IN ('PREVIEWED', 'SUBMITTING', 'ACCEPTED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'UNKNOWN')),
  broker_order_id TEXT UNIQUE,
  submitted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  response_json TEXT,
  CHECK ((order_type IN ('limit', 'stop_limit') AND limit_price IS NOT NULL) OR order_type NOT IN ('limit', 'stop_limit')),
  CHECK ((order_type IN ('stop', 'stop_limit') AND stop_price IS NOT NULL) OR order_type NOT IN ('stop', 'stop_limit'))
);

CREATE INDEX IF NOT EXISTS idx_paper_orders_symbol_status ON paper_orders(symbol, status);
CREATE INDEX IF NOT EXISTS idx_paper_orders_submitted_at ON paper_orders(submitted_at);

CREATE TABLE IF NOT EXISTS paper_positions (
  symbol TEXT PRIMARY KEY,
  qty REAL NOT NULL,
  avg_entry_price REAL NOT NULL,
  market_value REAL,
  unrealized_pl REAL,
  broker_updated_at TEXT NOT NULL,
  reconciled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS paper_trade_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT,
  event_type TEXT NOT NULL,
  event_at TEXT NOT NULL,
  source TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (order_id) REFERENCES paper_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_events_order_time ON paper_trade_events(order_id, event_at);
CREATE INDEX IF NOT EXISTS idx_trade_events_type_time ON paper_trade_events(event_type, event_at);

CREATE TABLE IF NOT EXISTS paper_equity_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL,
  equity_usd REAL NOT NULL,
  cash_usd REAL NOT NULL,
  buying_power_usd REAL,
  day_pl_usd REAL,
  source TEXT NOT NULL,
  UNIQUE(captured_at)
);

CREATE TABLE IF NOT EXISTS execution_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  request_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_execution_audit_time ON execution_audit_log(occurred_at);
