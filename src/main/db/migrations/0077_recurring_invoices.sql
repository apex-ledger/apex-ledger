-- Recurring invoices: the monthly fee, the quarterly retainer, the annual licence — generated on
-- schedule as real posted invoices instead of retyped. Lines are stored as JSON on the template
-- because they are copied wholesale into each invoice; nothing reports on them directly.
CREATE TABLE recurring_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  frequency TEXT NOT NULL,
  next_date TEXT NOT NULL,
  end_date TEXT,
  payment_terms TEXT,
  memo TEXT,
  customer_po_number TEXT,
  auto_email INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  lines_json TEXT NOT NULL,
  last_generated_date TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_recurring_invoices_next ON recurring_invoices(is_active, next_date);
