-- Append-only Northstar research decision traces.
-- This table is deliberately separate from paper_orders and cannot submit orders.
CREATE TABLE IF NOT EXISTS research_decision_traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  input_sha256 TEXT NOT NULL,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('REJECTED', 'PAPER_REVIEW_REQUIRED')),
  decision TEXT NOT NULL CHECK (decision IN ('NO_TRADE', 'WATCHLIST_CANDIDATE')),
  failed_stage TEXT,
  reason TEXT,
  trace_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_research_decision_symbol_time
  ON research_decision_traces(symbol, created_at);
CREATE INDEX IF NOT EXISTS idx_research_decision_status_time
  ON research_decision_traces(status, created_at);
