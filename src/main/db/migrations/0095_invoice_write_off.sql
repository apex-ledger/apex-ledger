-- Bad-debt write-off of an invoice: the amount written off and the journal that did it, so the
-- receivable clears, the customer statement shows it, and it can be undone.
ALTER TABLE invoices ADD COLUMN written_off_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN write_off_journal_entry_id INTEGER;
