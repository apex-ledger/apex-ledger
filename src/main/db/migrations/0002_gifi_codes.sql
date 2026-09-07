CREATE TABLE gifi_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  statement_type TEXT NOT NULL CHECK (statement_type IN ('BalanceSheet','IncomeStatement')),
  category TEXT,
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_gifi_statement_type ON gifi_codes(statement_type);
