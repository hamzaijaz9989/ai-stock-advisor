-- Northstar approved research/paper pilot planning limits.
-- Rebuild execution_control because SQLite cannot alter existing CHECK constraints.
-- This migration does not enable execution; it explicitly preserves the kill switch.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE execution_control_new (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  mode TEXT NOT NULL DEFAULT 'paper' CHECK (mode = 'paper'),
  kill_switch INTEGER NOT NULL DEFAULT 1 CHECK (kill_switch IN (0, 1)),
  max_portfolio_usd REAL NOT NULL DEFAULT 1000 CHECK (max_portfolio_usd = 1000),
  default_risk_fraction REAL NOT NULL DEFAULT 0.005 CHECK (default_risk_fraction > 0 AND default_risk_fraction <= 0.005),
  max_risk_fraction REAL NOT NULL DEFAULT 0.01 CHECK (max_risk_fraction > 0 AND max_risk_fraction <= 0.01),
  max_position_fraction REAL NOT NULL DEFAULT 0.25 CHECK (max_position_fraction > 0 AND max_position_fraction <= 0.25),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO execution_control_new
  (id, enabled, mode, kill_switch, max_portfolio_usd, default_risk_fraction, max_risk_fraction, max_position_fraction, updated_at)
SELECT id, 0, 'paper', 1, 1000, 0.005, 0.01, 0.25, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM execution_control WHERE id = 1;

DROP TABLE execution_control;
ALTER TABLE execution_control_new RENAME TO execution_control;

INSERT INTO execution_audit_log(actor,action,outcome,details_json)
VALUES(
  'northstar-migration-0007',
  'UPDATE_RESEARCH_PILOT_RISK_LIMITS',
  'APPLIED',
  '{"allocationUsd":1000,"defaultRiskUsd":5,"maxRiskPerTradeUsd":10,"maxAggregateOpenRiskUsd":10,"dailyLossLimitUsd":20,"maxPositionNotionalUsd":250,"executionEnabled":false,"killSwitch":true}'
);

COMMIT;
PRAGMA foreign_keys = ON;
