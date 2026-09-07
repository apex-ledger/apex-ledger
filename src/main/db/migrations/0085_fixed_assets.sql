-- Fixed asset register with month-by-month book depreciation. Each posted month is recorded here
-- against its journal entry, which is what makes a depreciation run safe to repeat: a month with a
-- row is never posted twice. Safe to re-run as a migration (CREATE only).
CREATE TABLE fixed_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  asset_account_id INTEGER NOT NULL REFERENCES accounts(id),
  accumulated_depreciation_account_id INTEGER REFERENCES accounts(id),
  depreciation_expense_account_id INTEGER REFERENCES accounts(id),
  cost_cents INTEGER NOT NULL,
  salvage_cents INTEGER NOT NULL DEFAULT 0,
  acquired_date TEXT NOT NULL,
  in_service_date TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'straightLine',
  useful_life_months INTEGER NOT NULL DEFAULT 0,
  declining_rate REAL NOT NULL DEFAULT 0,
  cca_class TEXT,
  serial_number TEXT,
  location TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  disposed_date TEXT,
  proceeds_cents INTEGER,
  disposal_journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE fixed_asset_depreciation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_month TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  UNIQUE (asset_id, period_month)
);
