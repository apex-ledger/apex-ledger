CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('Asset','Liability','Equity','Revenue','Expense')),
  account_subtype TEXT,
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('Debit','Credit')),
  parent_id INTEGER REFERENCES accounts(id),
  gifi_code TEXT REFERENCES gifi_codes(code),
  is_active INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_accounts_parent ON accounts(parent_id);
CREATE INDEX idx_accounts_gifi ON accounts(gifi_code);
CREATE INDEX idx_accounts_type ON accounts(account_type);
