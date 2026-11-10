-- Single-flight lease for expensive server-side research collection.
-- Prevents duplicate provider/LLM work for the same request ID. It is not an order table.
CREATE TABLE IF NOT EXISTS research_council_run_leases (
  request_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  lease_until TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_research_council_lease_until
  ON research_council_run_leases(lease_until);
