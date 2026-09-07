ALTER TABLE journal_entry_lines ADD COLUMN foreign_currency TEXT;
ALTER TABLE journal_entry_lines ADD COLUMN foreign_amount_cents INTEGER;
ALTER TABLE journal_entry_lines ADD COLUMN exchange_rate REAL;

ALTER TABLE bills ADD COLUMN foreign_currency TEXT;
ALTER TABLE bills ADD COLUMN foreign_amount_cents INTEGER;
ALTER TABLE bills ADD COLUMN exchange_rate REAL;

ALTER TABLE invoices ADD COLUMN foreign_currency TEXT;
ALTER TABLE invoices ADD COLUMN foreign_amount_cents INTEGER;
ALTER TABLE invoices ADD COLUMN exchange_rate REAL;
