CREATE TABLE sales_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  receipt_number TEXT NOT NULL UNIQUE,
  receipt_date TEXT NOT NULL,
  memo TEXT,
  total_cents INTEGER NOT NULL,
  deposit_to_account_id INTEGER NOT NULL REFERENCES accounts(id),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  deposit_id INTEGER REFERENCES deposits(id),
  foreign_currency TEXT,
  foreign_amount_cents INTEGER,
  exchange_rate REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sales_receipt_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_receipt_id INTEGER NOT NULL REFERENCES sales_receipts(id) ON DELETE CASCADE,
  line_order INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  revenue_account_id INTEGER NOT NULL REFERENCES accounts(id),
  tax_code TEXT,
  manual_hst_cents INTEGER
);

CREATE INDEX idx_sales_receipts_customer ON sales_receipts(customer_id);
CREATE INDEX idx_sales_receipts_deposit ON sales_receipts(deposit_id);
CREATE INDEX idx_sales_receipt_lines_receipt ON sales_receipt_lines(sales_receipt_id);
