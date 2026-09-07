CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  province TEXT NOT NULL DEFAULT 'ON',
  pay_type TEXT NOT NULL CHECK (pay_type IN ('Hourly', 'Salary')),
  hourly_rate_cents INTEGER,
  annual_salary_cents INTEGER,
  pay_periods_per_year INTEGER NOT NULL DEFAULT 26,
  vacation_pay_rate REAL NOT NULL DEFAULT 0.04,
  sin_last_four TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  pay_period_start TEXT NOT NULL,
  pay_period_end TEXT NOT NULL,
  pay_date TEXT NOT NULL,
  regular_hours REAL,
  overtime_hours REAL,
  gross_pay_cents INTEGER NOT NULL,
  vacation_pay_cents INTEGER NOT NULL,
  cpp1_employee_cents INTEGER NOT NULL,
  cpp1_employer_cents INTEGER NOT NULL,
  cpp2_employee_cents INTEGER NOT NULL,
  cpp2_employer_cents INTEGER NOT NULL,
  ei_employee_cents INTEGER NOT NULL,
  ei_employer_cents INTEGER NOT NULL,
  income_tax_cents INTEGER NOT NULL DEFAULT 0,
  net_pay_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_payroll_runs_employee ON payroll_runs(employee_id);
CREATE INDEX idx_payroll_runs_pay_date ON payroll_runs(pay_date);
