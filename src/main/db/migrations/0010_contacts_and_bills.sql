CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  bill_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  category_account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount_cents INTEGER NOT NULL,
  tax_code TEXT,
  manual_hst_cents INTEGER,
  memo TEXT,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  bill_journal_entry_id INTEGER REFERENCES journal_entries(id),
  payment_journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bills_vendor ON bills(vendor_id);
CREATE INDEX idx_bills_status ON bills(status);
