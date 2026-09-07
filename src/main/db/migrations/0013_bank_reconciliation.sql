CREATE TABLE bank_reconciliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  statement_date TEXT NOT NULL,
  starting_balance_cents INTEGER NOT NULL,
  ending_balance_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bank_reconciliations_account ON bank_reconciliations(account_id);

ALTER TABLE journal_entry_lines ADD COLUMN cleared_at TEXT;
ALTER TABLE journal_entry_lines ADD COLUMN reconciliation_id INTEGER REFERENCES bank_reconciliations(id);
