CREATE TABLE recurring_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  money_account_id INTEGER NOT NULL REFERENCES accounts(id),
  category_account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount_cents INTEGER NOT NULL,
  tax_code TEXT,
  manual_hst_cents INTEGER,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_recurring_templates_type ON recurring_templates(type);
