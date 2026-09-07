CREATE TABLE journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  memo TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  posted_at TEXT,
  created_by TEXT
);

CREATE TABLE journal_entry_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  debit_cents INTEGER NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  description TEXT,
  line_order INTEGER NOT NULL DEFAULT 0,
  CHECK (NOT (debit_cents > 0 AND credit_cents > 0))
);

CREATE INDEX idx_je_date ON journal_entries(entry_date);
CREATE INDEX idx_je_status ON journal_entries(status);
CREATE INDEX idx_jel_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_jel_account ON journal_entry_lines(account_id);
