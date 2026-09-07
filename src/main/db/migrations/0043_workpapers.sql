-- Per-account review state for a working trial balance ("workpapers"). Deliberately NOT part of the
-- ledger: "I have checked this account for the year ended X" is a fact about the review, not about
-- the books, so it lives alongside rather than inside the journal. Scoped by period_end so last
-- year's sign-offs stay intact when this year's review starts from scratch.
CREATE TABLE workpaper_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_end TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'query')),
  note TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (period_end, account_id)
);

-- Supporting documents tied to one account's review — a bank statement backing up the cash balance,
-- a loan agreement behind a liability. Stored as a path to the file on disk (the same approach bills
-- already use for receipt_file_path) rather than copied into the database, so the company file
-- doesn't balloon.
CREATE TABLE workpaper_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workpaper_account_id INTEGER NOT NULL REFERENCES workpaper_accounts(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_workpaper_accounts_period ON workpaper_accounts(period_end);
CREATE INDEX idx_workpaper_attachments_parent ON workpaper_attachments(workpaper_account_id);
