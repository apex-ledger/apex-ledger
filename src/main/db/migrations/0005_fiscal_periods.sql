CREATE TABLE fiscal_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  label TEXT NOT NULL,
  is_locked INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT
);

CREATE INDEX idx_fiscal_periods_range ON fiscal_periods(period_start, period_end);
