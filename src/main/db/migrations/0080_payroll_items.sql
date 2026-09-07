-- Payroll items: every pay-stub line beyond regular, overtime and vacation — bonuses, commissions,
-- stat holiday and sick pay, allowances, taxable benefits, union dues, garnishments, RRSP and
-- pension contributions, reimbursements, employer contributions. The catalogue is per company;
-- each run snapshots the treatment it used so a later edit never rewrites history.
CREATE TABLE payroll_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  cpp_applies INTEGER NOT NULL DEFAULT 1,
  ei_applies INTEGER NOT NULL DEFAULT 1,
  tax_applies INTEGER NOT NULL DEFAULT 1,
  t4_box TEXT,
  default_amount_cents INTEGER NOT NULL DEFAULT 0,
  account_id INTEGER REFERENCES accounts(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payroll_run_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES payroll_items(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  cpp_applies INTEGER NOT NULL DEFAULT 0,
  ei_applies INTEGER NOT NULL DEFAULT 0,
  tax_applies INTEGER NOT NULL DEFAULT 0,
  t4_box TEXT,
  amount_cents INTEGER NOT NULL,
  account_id INTEGER REFERENCES accounts(id)
);
CREATE INDEX idx_payroll_run_items_run ON payroll_run_items(payroll_run_id);
