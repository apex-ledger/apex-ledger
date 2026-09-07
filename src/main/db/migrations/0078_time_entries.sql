-- Time tracking: hours a firm's people spend on a client, kept until they are invoiced. An
-- accounting practice bills time; without this the hours live in a spreadsheet and the invoice is
-- retyped. Each entry knows the customer, who did the work, the date, hours, the rate and whether
-- it is billable; invoicing stamps the invoice id so nothing is billed twice.
CREATE TABLE time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  employee_id INTEGER REFERENCES employees(id),
  staff_name TEXT,
  work_date TEXT NOT NULL,
  hours REAL NOT NULL,
  rate_cents INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  billable INTEGER NOT NULL DEFAULT 1,
  invoice_id INTEGER REFERENCES invoices(id),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_time_entries_customer ON time_entries(customer_id, invoice_id);
CREATE INDEX idx_time_entries_date ON time_entries(work_date);
