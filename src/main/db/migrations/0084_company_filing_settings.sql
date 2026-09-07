-- The company's own GST/HST reporting period and CRA payroll remitter type. Both used to be
-- chosen on the screen each time; storing them lets deadlines be computed without asking.
ALTER TABLE company_info ADD COLUMN hst_filing_frequency TEXT NOT NULL DEFAULT 'None';
ALTER TABLE company_info ADD COLUMN payroll_remitter_type TEXT NOT NULL DEFAULT 'regular';
