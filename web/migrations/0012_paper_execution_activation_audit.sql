-- Explicit, independently approved PAPER-only activation with durable, immutable evidence.
-- This migration does not enable execution. The seeded control row remains disabled
-- with the kill switch engaged until the guarded /api/paper/activate route succeeds.
ALTER TABLE execution_control ADD COLUMN last_activation_request_id TEXT;

CREATE TABLE paper_execution_activation_requests (
  request_id TEXT PRIMARY KEY,
  approver TEXT NOT NULL CHECK(length(trim(approver)) BETWEEN 3 AND 120),
  requested_at TEXT NOT NULL,
  account_id TEXT NOT NULL CHECK(length(trim(account_id)) > 0),
  strategy_report_sha256 TEXT NOT NULL CHECK(
    length(strategy_report_sha256)=64 AND strategy_report_sha256 NOT GLOB '*[^0-9a-fA-F]*'
  ),
  reconciliation_checked_at TEXT NOT NULL,
  latest_snapshot_at TEXT NOT NULL,
  weekly_baseline_at TEXT NOT NULL,
  quote_at TEXT NOT NULL,
  details_json TEXT NOT NULL
);

CREATE TABLE paper_execution_activation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK(event_type='PAPER_EXECUTION_ENABLED'),
  actor TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome='SUCCESS'),
  occurred_at TEXT NOT NULL,
  details_json TEXT NOT NULL,
  FOREIGN KEY(request_id) REFERENCES paper_execution_activation_requests(request_id)
);

CREATE TRIGGER trg_paper_execution_activation_requests_no_update
BEFORE UPDATE ON paper_execution_activation_requests
BEGIN
  SELECT RAISE(ABORT, 'paper execution activation requests are immutable');
END;

CREATE TRIGGER trg_paper_execution_activation_requests_no_delete
BEFORE DELETE ON paper_execution_activation_requests
BEGIN
  SELECT RAISE(ABORT, 'paper execution activation requests are immutable');
END;

CREATE TRIGGER trg_paper_execution_activation_events_no_update
BEFORE UPDATE ON paper_execution_activation_events
BEGIN
  SELECT RAISE(ABORT, 'paper execution activation events are append-only');
END;

CREATE TRIGGER trg_paper_execution_activation_events_no_delete
BEFORE DELETE ON paper_execution_activation_events
BEGIN
  SELECT RAISE(ABORT, 'paper execution activation events are append-only');
END;

CREATE TRIGGER trg_execution_control_paper_state_consistency
BEFORE UPDATE OF enabled, kill_switch ON execution_control
WHEN NEW.enabled + NEW.kill_switch <> 1
BEGIN
  SELECT RAISE(ABORT, 'PAPER execution and kill-switch states must be mutually exclusive');
END;

CREATE TRIGGER trg_execution_control_paper_activation_guard
BEFORE UPDATE OF enabled, kill_switch, last_activation_request_id ON execution_control
WHEN NEW.enabled=1 OR NEW.kill_switch=0
BEGIN
  SELECT CASE WHEN NEW.mode<>'paper' OR NEW.enabled<>1 OR NEW.kill_switch<>0
    THEN RAISE(ABORT, 'Only a consistent PAPER activation state is permitted') END;
  SELECT CASE WHEN NEW.max_portfolio_usd<>1000 OR NEW.default_risk_fraction<>0.005 OR
    NEW.max_risk_fraction<>0.01 OR NEW.max_position_fraction<>0.25
    THEN RAISE(ABORT, 'PAPER activation risk limits do not match the required policy') END;
  SELECT CASE WHEN NEW.last_activation_request_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM paper_execution_activation_requests r
    WHERE r.request_id=NEW.last_activation_request_id
      AND julianday(r.requested_at)>=julianday('now','-5 minutes')
      AND julianday(r.requested_at)<=julianday('now')
      AND julianday(r.reconciliation_checked_at)>=julianday('now')-(60.0/86400.0)
      AND julianday(r.reconciliation_checked_at)<=julianday('now')
      AND julianday(r.quote_at)>=julianday('now')-(60.0/86400.0)
      AND julianday(r.quote_at)<=julianday('now')
      AND r.account_id IS NOT NULL AND length(trim(r.account_id))>0
      AND json_extract(r.details_json,'$.accountId')=r.account_id
      AND json_extract(r.details_json,'$.strategyReportSha256')=r.strategy_report_sha256
      AND json_extract(r.details_json,'$.executionEnabled')=1
      AND json_extract(r.details_json,'$.killSwitchEngaged')=0
      AND json_extract(r.details_json,'$.noBrokerOrderCreated')=1
      AND json_extract(r.details_json,'$.accountSyncStatus')='READ_ONLY_ACCOUNT_SYNC_PASSED'
      AND json_extract(r.details_json,'$.fillSyncStatus')='FILL_IMPORT_AND_ORDER_SYNC_PASSED_READ_ONLY'
      AND json_extract(r.details_json,'$.intentReviewConfigured')=1
      AND r.latest_snapshot_at=(SELECT MAX(captured_at) FROM paper_equity_snapshots)
      AND r.strategy_report_sha256 IS NOT NULL
      AND json_valid(r.details_json)=1
      AND json_extract(r.details_json,'$.accountStatus')='ACTIVE'
      AND json_extract(r.details_json,'$.currency')='USD'
      AND json_extract(r.details_json,'$.paperApiHost')='paper-api.alpaca.markets'
      AND json_extract(r.details_json,'$.reconciliationStatus')='RECONCILIATION_PASSED_READ_ONLY'
      AND json_extract(r.details_json,'$.brokerPositions')=0
      AND json_extract(r.details_json,'$.brokerOrders')=0
      AND json_extract(r.details_json,'$.ledgerPositions')=0
      AND json_extract(r.details_json,'$.ledgerOrders')=0
      AND json_extract(r.details_json,'$.fillDerivedPositions')=0
      AND json_extract(r.details_json,'$.marketOpen')=1
      AND json_extract(r.details_json,'$.quoteAgeMs') BETWEEN 0 AND 60000
      AND json_extract(r.details_json,'$.quoteSpreadPct') BETWEEN 0 AND 1
      AND json_extract(r.details_json,'$.dailyLossUsd')>=0
      AND json_extract(r.details_json,'$.dailyLossUsd')<20
      AND json_extract(r.details_json,'$.maxDrawdownUsd')>=0
      AND json_extract(r.details_json,'$.maxDrawdownUsd')<80
      AND json_extract(r.details_json,'$.virtualCapitalUsd')=1000
      AND json_extract(r.details_json,'$.maxPositionUsd')=250
      AND json_extract(r.details_json,'$.maxRiskUsd')=10
      AND json_extract(r.details_json,'$.dailyLossCapUsd')=20
      AND json_extract(r.details_json,'$.maxDrawdownCapUsd')=80
  ) THEN RAISE(ABORT, 'A fresh, complete PAPER activation request is required') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM northstar_strategy_approval s
    JOIN paper_execution_activation_requests r
      ON r.request_id=NEW.last_activation_request_id
    WHERE s.id=1 AND s.approved=1
      AND s.strategy_version='northstar-provisional-gates-v1'
      AND s.report_version>0
      AND length(s.report_sha256)=64
      AND s.report_sha256=r.strategy_report_sha256
      AND s.report_uri LIKE 'https://%'
      AND s.approved_at IS NOT NULL
      AND s.reviewer IS NOT NULL AND length(trim(s.reviewer))>0
  ) THEN RAISE(ABORT, 'Independently approved strategy evidence is required') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM paper_orders)
    OR EXISTS (SELECT 1 FROM paper_positions)
    OR EXISTS (SELECT 1 FROM paper_execution_claims)
    OR EXISTS (SELECT 1 FROM paper_trade_intents WHERE status IN ('PENDING_REVIEW','APPROVED_REVIEW_ONLY'))
    THEN RAISE(ABORT, 'Initial PAPER executor requires an empty order, position, claim and pending-intent ledger') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM paper_execution_activation_requests r
    JOIN paper_equity_snapshots latest ON latest.captured_at=r.latest_snapshot_at
    WHERE r.request_id=NEW.last_activation_request_id
      AND latest.equity_usd>0
      AND julianday(latest.captured_at)>=julianday('now')-(15.0/1440.0)
      AND julianday(latest.captured_at)<=julianday('now')
  ) THEN RAISE(ABORT, 'A reconciled equity snapshot no older than 15 minutes is required') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM paper_execution_activation_requests r
    JOIN paper_equity_snapshots baseline ON baseline.captured_at=r.weekly_baseline_at
    WHERE r.request_id=NEW.last_activation_request_id
      AND baseline.equity_usd>0
      AND julianday(baseline.captured_at)<=julianday('now','-7 days')
  ) THEN RAISE(ABORT, 'A verified seven-day equity baseline is required') END;
END;

CREATE TRIGGER trg_execution_control_paper_activation_audit
AFTER UPDATE OF enabled, kill_switch ON execution_control
WHEN OLD.enabled=0 AND OLD.kill_switch=1 AND NEW.enabled=1 AND NEW.kill_switch=0
BEGIN
  INSERT INTO paper_execution_activation_events
    (request_id,event_type,actor,outcome,occurred_at,details_json)
  SELECT request_id,'PAPER_EXECUTION_ENABLED',approver,'SUCCESS',NEW.updated_at,details_json
  FROM paper_execution_activation_requests
  WHERE request_id=NEW.last_activation_request_id;

  INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json)
  SELECT approver,'ENABLE_PAPER_EXECUTION','SUCCESS',request_id,details_json
  FROM paper_execution_activation_requests
  WHERE request_id=NEW.last_activation_request_id;
END;

-- OIDC workflow-run claims are unique per run/attempt, even under concurrent retries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_audit_log_github_oidc_snapshot_claim
ON execution_audit_log(request_id)
WHERE action='GITHUB_OIDC_SNAPSHOT_CLAIMED';
