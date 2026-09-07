CREATE TABLE category_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  tax_code TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_category_rules_active ON category_rules(is_active);
