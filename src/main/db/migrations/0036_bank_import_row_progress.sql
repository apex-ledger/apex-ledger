-- Persists in-progress Bank Import categorization (category account, tax code, vendor/customer,
-- include/exclude) per transaction, so closing the app mid-review — including to install an
-- update — doesn't silently throw away work that was never actually imported yet. Keyed the same
-- way bank_import_exclusions already is (account + date + description + amount), since bank
-- exports have no stable transaction ID to key on.
CREATE TABLE bank_import_row_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  transaction_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  category_account_id INTEGER REFERENCES accounts(id),
  tax_code TEXT,
  manual_hst_cents INTEGER NOT NULL DEFAULT 0,
  vendor_id INTEGER REFERENCES vendors(id),
  customer_id INTEGER REFERENCES customers(id),
  include INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_bank_import_row_progress_match ON bank_import_row_progress(account_id, transaction_date, description, amount_cents);
