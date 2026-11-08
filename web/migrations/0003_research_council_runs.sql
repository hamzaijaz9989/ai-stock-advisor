-- Append-only audit ledger for the specialist Research Council.
-- This table is isolated from all paper-order and broker tables.
CREATE TABLE IF NOT EXISTS research_council_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  input_sha256 TEXT NOT NULL,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NO_TRADE', 'RESEARCH_REVIEW_REQUIRED')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_research_council_symbol_time
  ON research_council_runs(symbol, created_at);
CREATE INDEX IF NOT EXISTS idx_research_council_status_time
  ON research_council_runs(status, created_at);
