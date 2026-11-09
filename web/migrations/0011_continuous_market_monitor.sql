-- Continuous market-monitor snapshots and deduplicated event history.
CREATE TABLE IF NOT EXISTS monitor_quotes (
  symbol TEXT PRIMARY KEY,
  price REAL NOT NULL,
  previous_close REAL,
  change_pct REAL,
  quote_time TEXT,
  fetched_at TEXT NOT NULL,
  source TEXT NOT NULL,
  watch_low REAL,
  watch_high REAL,
  in_watch_zone INTEGER NOT NULL DEFAULT 0 CHECK(in_watch_zone IN (0,1))
);
CREATE TABLE IF NOT EXISTS monitor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
  message TEXT NOT NULL,
  price REAL,
  change_pct REAL,
  source TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_monitor_events_time ON monitor_events(observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_events_symbol_time ON monitor_events(symbol,observed_at DESC);
CREATE TABLE IF NOT EXISTS monitor_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  symbols_checked INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  detail TEXT
);
