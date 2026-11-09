-- Evidence-backed strategy approval gate. The initial state is deliberately NOT APPROVED.
-- A BUY/preflight/submit path must fail closed unless a reviewed report is recorded.
CREATE TABLE IF NOT EXISTS northstar_strategy_approval (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
  strategy_version TEXT NOT NULL,
  report_version INTEGER,
  report_sha256 TEXT,
  report_uri TEXT,
  approved_at TEXT,
  reviewer TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    approved = 0 OR (
      report_version IS NOT NULL AND report_version > 0 AND
      report_sha256 IS NOT NULL AND length(report_sha256) = 64 AND
      report_sha256 NOT GLOB '*[^0-9a-fA-F]*' AND
      report_uri IS NOT NULL AND report_uri LIKE 'https://%' AND
      approved_at IS NOT NULL AND
      reviewer IS NOT NULL AND length(trim(reviewer)) > 0
    )
  )
);

CREATE TABLE IF NOT EXISTS northstar_strategy_approval_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_id INTEGER NOT NULL,
  approved INTEGER NOT NULL,
  strategy_version TEXT NOT NULL,
  report_version INTEGER,
  report_sha256 TEXT,
  report_uri TEXT,
  approved_at TEXT,
  reviewer TEXT,
  event_at TEXT NOT NULL
);

INSERT OR IGNORE INTO northstar_strategy_approval
  (id, approved, strategy_version, updated_at)
VALUES
  (1, 0, 'northstar-provisional-gates-v1', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT INTO northstar_strategy_approval_events
  (approval_id, approved, strategy_version, report_version, report_sha256, report_uri, approved_at, reviewer, event_at)
SELECT id, approved, strategy_version, report_version, report_sha256, report_uri, approved_at, reviewer, updated_at
FROM northstar_strategy_approval
WHERE id = 1
  AND NOT EXISTS (SELECT 1 FROM northstar_strategy_approval_events WHERE approval_id = 1);

CREATE TRIGGER IF NOT EXISTS trg_northstar_strategy_approval_audit
AFTER UPDATE ON northstar_strategy_approval
BEGIN
  INSERT INTO northstar_strategy_approval_events
    (approval_id, approved, strategy_version, report_version, report_sha256, report_uri, approved_at, reviewer, event_at)
  VALUES
    (NEW.id, NEW.approved, NEW.strategy_version, NEW.report_version, NEW.report_sha256, NEW.report_uri, NEW.approved_at, NEW.reviewer, NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_northstar_strategy_approval_events_no_update
BEFORE UPDATE ON northstar_strategy_approval_events
BEGIN
  SELECT RAISE(ABORT, 'strategy approval events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_northstar_strategy_approval_events_no_delete
BEFORE DELETE ON northstar_strategy_approval_events
BEGIN
  SELECT RAISE(ABORT, 'strategy approval events are append-only');
END;
