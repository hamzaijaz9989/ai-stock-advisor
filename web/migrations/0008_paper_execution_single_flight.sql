-- A durable singleton claim prevents concurrent distinct BUY intents from
-- passing the initial empty-ledger check and submitting multiple orders.
-- The claim is intentionally not released: the initial executor permits one
-- Northstar paper order lifetime until a separately reviewed lifecycle exists.
CREATE TABLE IF NOT EXISTS paper_execution_claims (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  order_id TEXT NOT NULL UNIQUE,
  intent_id TEXT NOT NULL UNIQUE,
  claimed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('SUBMITTING','SUBMITTED','UNKNOWN','REJECTED')),
  FOREIGN KEY (order_id) REFERENCES paper_orders(id),
  FOREIGN KEY (intent_id) REFERENCES paper_trade_intents(id)
);

CREATE TRIGGER IF NOT EXISTS trg_paper_execution_claims_no_delete
BEFORE DELETE ON paper_execution_claims
BEGIN
  SELECT RAISE(ABORT, 'paper execution claim is immutable and cannot be deleted');
END;
