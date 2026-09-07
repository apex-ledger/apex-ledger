CREATE TABLE deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_date TEXT NOT NULL,
  bank_account_id INTEGER NOT NULL REFERENCES accounts(id),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE invoices ADD COLUMN deposit_id INTEGER REFERENCES deposits(id);
