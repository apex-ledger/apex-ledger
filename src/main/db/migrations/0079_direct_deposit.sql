-- Direct deposit (CPA-005 bank file): the bank details each employee is paid into, and the
-- firm's EFT originator settings copied from its bank's EFT agreement. The file creation number
-- counts up with every file written; the bank rejects a repeat.
ALTER TABLE employees ADD COLUMN bank_institution TEXT;
ALTER TABLE employees ADD COLUMN bank_transit TEXT;
ALTER TABLE employees ADD COLUMN bank_account TEXT;

ALTER TABLE company_info ADD COLUMN eft_originator_id TEXT;
ALTER TABLE company_info ADD COLUMN eft_originator_short_name TEXT;
ALTER TABLE company_info ADD COLUMN eft_data_centre TEXT;
ALTER TABLE company_info ADD COLUMN eft_settlement_institution TEXT;
ALTER TABLE company_info ADD COLUMN eft_settlement_transit TEXT;
ALTER TABLE company_info ADD COLUMN eft_settlement_account TEXT;
ALTER TABLE company_info ADD COLUMN eft_file_creation_number INTEGER NOT NULL DEFAULT 0;
