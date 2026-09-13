-- Reversing entries: a month-end accrual can name the date it reverses on; posting it posts the
-- mirror entry on that date, linked back so voiding one voids the other.
ALTER TABLE journal_entries ADD COLUMN reverse_on TEXT;
ALTER TABLE journal_entries ADD COLUMN reverses_entry_id INTEGER REFERENCES journal_entries(id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reverses ON journal_entries(reverses_entry_id);
