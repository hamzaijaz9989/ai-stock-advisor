-- Record the exact point at which a claimed submission is authorized to cross
-- the external Alpaca Paper POST boundary. The compare-and-set is serialized
-- with the kill-switch control transaction so a kill switch that wins first
-- prevents the broker request.
ALTER TABLE paper_execution_claims ADD COLUMN post_started_at TEXT;

-- Once recorded, the boundary timestamp is immutable audit evidence.
CREATE TRIGGER IF NOT EXISTS trg_paper_execution_claims_post_started_immutable
BEFORE UPDATE OF post_started_at ON paper_execution_claims
WHEN OLD.post_started_at IS NOT NULL AND NEW.post_started_at IS NOT OLD.post_started_at
BEGIN
  SELECT RAISE(ABORT, 'paper broker POST boundary timestamp is immutable');
END;
