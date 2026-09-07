ALTER TABLE journal_entries ADD COLUMN is_adjusting_entry INTEGER NOT NULL DEFAULT 0;
ALTER TABLE journal_entry_lines ADD COLUMN vendor_id INTEGER REFERENCES vendors(id);
ALTER TABLE journal_entry_lines ADD COLUMN customer_id INTEGER REFERENCES customers(id);
