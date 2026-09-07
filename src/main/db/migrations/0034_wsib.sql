ALTER TABLE company_info ADD COLUMN wsib_class_code TEXT;
ALTER TABLE company_info ADD COLUMN wsib_rate REAL;

ALTER TABLE payroll_runs ADD COLUMN wsib_employer_cents INTEGER NOT NULL DEFAULT 0;
