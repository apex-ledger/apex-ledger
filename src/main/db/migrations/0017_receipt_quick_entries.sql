ALTER TABLE receipt_imports ADD COLUMN journal_entry_id INTEGER REFERENCES journal_entries(id);
