CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  memo TEXT,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  invoice_journal_entry_id INTEGER REFERENCES journal_entries(id),
  payment_journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_order INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  revenue_account_id INTEGER NOT NULL REFERENCES accounts(id),
  tax_code TEXT,
  manual_hst_cents INTEGER
);

CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
