-- Shared rolling FMP request ledger and provider-response cache.
-- Use 0008 to coexist with the existing open PR that proposes 0007_fmp_request_budget.sql.
CREATE TABLE IF NOT EXISTS fmp_request_budget (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0)
);
CREATE TABLE IF NOT EXISTS fmp_request_events (
  event_id TEXT PRIMARY KEY,
  requested_at_ms INTEGER NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('monitor','pages')),
  cost INTEGER NOT NULL CHECK (cost > 0)
);
CREATE INDEX IF NOT EXISTS idx_fmp_request_events_time ON fmp_request_events(requested_at_ms);
CREATE TABLE IF NOT EXISTS fmp_response_cache (
  cache_key TEXT PRIMARY KEY,
  response_json TEXT,
  expires_at_ms INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until_ms INTEGER NOT NULL DEFAULT 0
);
-- Carry recent monitor usage into the rolling ledger. Timestamp at migration time
-- because the legacy daily aggregate did not preserve individual request times;
-- this intentionally overcounts rather than granting fresh quota during cutover.
INSERT OR IGNORE INTO fmp_request_events(event_id,requested_at_ms,service,cost)
SELECT 'legacy:'||day,CAST(strftime('%s','now') AS INTEGER)*1000,'monitor',requests
FROM fmp_request_budget
WHERE day >= date('now','-1 day') AND requests > 0;
