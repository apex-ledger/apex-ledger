CREATE TABLE shareholders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  sin TEXT,
  business_number TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE t5_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shareholder_id INTEGER NOT NULL REFERENCES shareholders(id),
  payment_date TEXT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('eligible_dividend', 'non_eligible_dividend', 'interest')),
  amount_cents INTEGER NOT NULL,
  bank_account_id INTEGER NOT NULL REFERENCES accounts(id),
  memo TEXT,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_t5_payments_shareholder ON t5_payments(shareholder_id);
CREATE INDEX idx_t5_payments_date ON t5_payments(payment_date);
