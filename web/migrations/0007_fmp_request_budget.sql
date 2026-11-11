-- Durable daily request budget for the scheduled FMP market monitor.
-- Apply through the reviewed D1 migration process; never create this table at runtime.
CREATE TABLE IF NOT EXISTS fmp_request_budget (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0)
);
