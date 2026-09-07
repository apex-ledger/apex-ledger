ALTER TABLE employees ADD COLUMN rrsp_employer_match_cents INTEGER;
ALTER TABLE employees ADD COLUMN health_benefit_cents INTEGER;

ALTER TABLE payroll_runs ADD COLUMN rrsp_employer_match_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN health_benefit_cents INTEGER NOT NULL DEFAULT 0;
