-- Credit notes for both sides of the ledger. kind='customer' is a credit issued to a customer
-- (reverses revenue + GST/HST Payable, credits AR). kind='vendor' is a credit received from a
-- supplier (reverses the expense + GST/HST Recoverable, debits AP). Both live in one table because
-- they carry identical fields and differ only in posting direction — same reasoning as customers
-- and vendors sharing the contact table shape.
CREATE TABLE credit_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('customer', 'vendor')),
  contact_id INTEGER NOT NULL,
  credit_note_number TEXT NOT NULL,
  credit_note_date TEXT NOT NULL,
  memo TEXT,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'refunded')),
  -- Invoice id when kind='customer', bill id when kind='vendor'. Not a foreign key because the
  -- target table depends on kind.
  applied_to_id INTEGER,
  credit_journal_entry_id INTEGER REFERENCES journal_entries(id),
  refund_journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, credit_note_number)
);

CREATE TABLE credit_note_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  line_order INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  category_account_id INTEGER NOT NULL REFERENCES accounts(id),
  tax_code TEXT,
  manual_hst_cents INTEGER
);

CREATE INDEX idx_credit_notes_kind_status ON credit_notes(kind, status);
CREATE INDEX idx_credit_note_lines_note ON credit_note_lines(credit_note_id);
