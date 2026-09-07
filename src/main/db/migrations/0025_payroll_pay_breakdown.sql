ALTER TABLE payroll_runs ADD COLUMN regular_pay_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN overtime_pay_cents INTEGER NOT NULL DEFAULT 0;
