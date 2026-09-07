-- The company logo for invoices, receipts and statements: a small PNG or JPG kept in the file
-- itself as a data URL, so the PDF looks the same on every machine that opens the company.
ALTER TABLE company_info ADD COLUMN logo_data_url TEXT;
