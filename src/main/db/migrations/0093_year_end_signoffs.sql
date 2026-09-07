-- Year-End Sign-off: who reviewed the period, what the lights said, and the decision recorded.
-- One row per sign-off; a period can be signed again after corrections, so the history is kept.
CREATE TABLE IF NOT EXISTS year_end_signoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL,
  green_count INTEGER NOT NULL DEFAULT 0,
  amber_count INTEGER NOT NULL DEFAULT 0,
  red_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  signed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_year_end_signoffs_period ON year_end_signoffs(period_end, signed_at);
