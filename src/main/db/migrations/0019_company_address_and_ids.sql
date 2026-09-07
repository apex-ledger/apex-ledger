ALTER TABLE company_info ADD COLUMN hst_number TEXT;
ALTER TABLE company_info ADD COLUMN payroll_number TEXT;
ALTER TABLE company_info ADD COLUMN number_of_employees INTEGER;

ALTER TABLE company_info ADD COLUMN business_address_line1 TEXT;
ALTER TABLE company_info ADD COLUMN business_address_line2 TEXT;
ALTER TABLE company_info ADD COLUMN business_city TEXT;
ALTER TABLE company_info ADD COLUMN business_province TEXT;
ALTER TABLE company_info ADD COLUMN business_postal_code TEXT;

ALTER TABLE company_info ADD COLUMN mailing_same_as_business_address INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company_info ADD COLUMN mailing_address_line1 TEXT;
ALTER TABLE company_info ADD COLUMN mailing_address_line2 TEXT;
ALTER TABLE company_info ADD COLUMN mailing_city TEXT;
ALTER TABLE company_info ADD COLUMN mailing_province TEXT;
ALTER TABLE company_info ADD COLUMN mailing_postal_code TEXT;
