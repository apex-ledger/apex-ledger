ALTER TABLE company_info ADD COLUMN business_type TEXT;
ALTER TABLE company_info ADD COLUMN hst_quick_method_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_info ADD COLUMN hst_quick_method_rate REAL;
