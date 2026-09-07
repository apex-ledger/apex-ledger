-- Multiple receipts/payments per document. Existing paid documents are backfilled to preserve
-- their historical closed balance; their legacy payment journal ids remain on the document.
ALTER TABLE invoices ADD COLUMN paid_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN paid_cents INTEGER NOT NULL DEFAULT 0;

UPDATE invoices SET paid_cents = total_cents WHERE status = 'paid';
UPDATE bills SET paid_cents = amount_cents WHERE status = 'paid';

CREATE TABLE invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  money_account_id INTEGER NOT NULL REFERENCES accounts(id),
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  deposit_id INTEGER REFERENCES deposits(id),
  memo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX idx_invoice_payments_deposit ON invoice_payments(deposit_id);

CREATE TABLE bill_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  payment_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  bank_account_id INTEGER NOT NULL REFERENCES accounts(id),
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  memo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bill_payments_bill ON bill_payments(bill_id);
