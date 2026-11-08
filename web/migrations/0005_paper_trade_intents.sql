-- Durable proposal and human-review ledger. These records are NEVER broker orders.
CREATE TABLE IF NOT EXISTS paper_trade_intents (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side = 'buy'),
  qty INTEGER NOT NULL CHECK (qty > 0),
  reference_price REAL NOT NULL CHECK (reference_price > 0),
  stop_price REAL NOT NULL CHECK (stop_price > 0 AND stop_price < reference_price),
  estimated_notional_usd REAL NOT NULL CHECK (estimated_notional_usd > 0),
  planned_risk_usd REAL NOT NULL CHECK (planned_risk_usd > 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING_REVIEW','APPROVED_REVIEW_ONLY','REJECTED','CANCELLED','EXPIRED')),
  rationale TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT,
  decision_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_paper_intents_status_created ON paper_trade_intents(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_intents_symbol_created ON paper_trade_intents(symbol,created_at DESC);
