-- Record a named, separately authenticated human reviewer for each paper intent.
-- The review endpoint re-runs preflight and writes reviewer metadata atomically.
ALTER TABLE paper_trade_intents ADD COLUMN reviewer TEXT;

CREATE TRIGGER IF NOT EXISTS trg_paper_intent_review_metadata_required
BEFORE UPDATE OF status ON paper_trade_intents
WHEN NEW.status IN ('APPROVED_REVIEW_ONLY','REJECTED')
 AND (
   NEW.reviewer IS NULL OR length(trim(NEW.reviewer)) = 0 OR
   NEW.decided_at IS NULL OR NEW.decision_note IS NULL OR length(trim(NEW.decision_note)) = 0
 )
BEGIN
  SELECT RAISE(ABORT, 'review decisions require reviewer, timestamp and note');
END;

CREATE TRIGGER IF NOT EXISTS trg_paper_intent_reviewer_immutable
BEFORE UPDATE OF reviewer ON paper_trade_intents
WHEN OLD.reviewer IS NOT NULL AND NEW.reviewer IS NOT OLD.reviewer
BEGIN
  SELECT RAISE(ABORT, 'paper intent reviewer is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_paper_intent_review_timestamp_immutable
BEFORE UPDATE OF decided_at ON paper_trade_intents
WHEN OLD.reviewer IS NOT NULL AND NEW.decided_at IS NOT OLD.decided_at
BEGIN
  SELECT RAISE(ABORT, 'paper intent review timestamp is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_paper_intent_review_note_immutable
BEFORE UPDATE OF decision_note ON paper_trade_intents
WHEN OLD.reviewer IS NOT NULL AND NEW.decision_note IS NOT OLD.decision_note
BEGIN
  SELECT RAISE(ABORT, 'paper intent review note is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_paper_intent_review_audit
AFTER UPDATE OF status ON paper_trade_intents
WHEN OLD.status = 'PENDING_REVIEW'
 AND NEW.status IN ('APPROVED_REVIEW_ONLY','REJECTED')
BEGIN
  INSERT INTO execution_audit_log(actor,action,outcome,request_id,details_json)
  VALUES(
    NEW.reviewer,
    CASE WHEN NEW.status = 'APPROVED_REVIEW_ONLY' THEN 'PAPER_INTENT_APPROVED' ELSE 'PAPER_INTENT_REJECTED' END,
    'SUCCESS',
    NEW.id,
    json_object(
      'intentId', NEW.id,
      'symbol', NEW.symbol,
      'qty', NEW.qty,
      'status', NEW.status,
      'reviewer', NEW.reviewer,
      'decisionNote', NEW.decision_note,
      'reviewedAt', NEW.decided_at,
      'reviewEvidence', json_extract(NEW.evidence_json,'$.review')
    )
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_paper_intents_no_delete
BEFORE DELETE ON paper_trade_intents
BEGIN
  SELECT RAISE(ABORT, 'paper intent review records cannot be deleted');
END;
