-- Records where a journal entry came from, and what the accountant changed about it afterwards.
--
-- A client hands over a spreadsheet, the accountant corrects it, and the corrections ARE the
-- adjusting entries — but nothing kept the original, so the corrected entry simply replaced what
-- the client sent and the difference was unrecoverable. Both halves are needed to report on it:
-- which entries came from the client, and what changed on each one.
--
-- Names here are snake_case because this is raw SQL against the real schema. The application code
-- reads and writes the same tables in camelCase only because Kysely's CamelCasePlugin translates
-- for it (see schema.ts) — a migration gets no such translation.

-- Where the entry came from. 'manual' is the existing behaviour and so is the default, which means
-- every entry already in the file is correctly described without having to guess at its history.
ALTER TABLE journal_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

-- Free text identifying the specific source: the spreadsheet filename, a statement name, a batch
-- reference. Null for anything typed in directly.
ALTER TABLE journal_entries ADD COLUMN source_reference TEXT;

-- One row per field changed, rather than a snapshot of the whole entry per edit. A snapshot would
-- need diffing again at read time to say anything useful, and the report wants exactly this: what
-- changed, from what, to what.
CREATE TABLE journal_entry_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Machine name of the field: 'entryDate', 'line.debitCents', and so on. Stored as the
  -- application spells it, since this is a value rather than an identifier.
  field TEXT NOT NULL,
  -- How to say it on a report: 'Date', 'Debit'.
  label TEXT NOT NULL,
  -- 'added' | 'removed' | 'changed'.
  kind TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  -- Which line this concerned, when it was a line-level change.
  line_label TEXT
);

CREATE INDEX idx_journal_entry_revisions_entry ON journal_entry_revisions(journal_entry_id);
CREATE INDEX idx_journal_entry_revisions_changed_at ON journal_entry_revisions(changed_at);
