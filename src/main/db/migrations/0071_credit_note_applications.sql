-- A credit can now settle part of a document, and more than one document. Each application is its
-- own row so it can be undone in order; applied_cents on the credit is the running total, kept on
-- the row so the list screen does not have to sum applications for every credit it shows.
ALTER TABLE credit_notes ADD COLUMN applied_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE credit_note_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  -- Invoice id for a customer credit, bill id for a vendor credit — same convention as
  -- credit_notes.applied_to_id, and for the same reason.
  target_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  applied_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_credit_note_applications_note ON credit_note_applications(credit_note_id);
CREATE INDEX idx_credit_note_applications_target ON credit_note_applications(target_id);

-- Every credit applied before this migration settled exactly one document, in full, on its own
-- date. Recording that as an application keeps undo working the same way for old and new credits.
INSERT INTO credit_note_applications (credit_note_id, target_id, amount_cents, applied_date)
SELECT id, applied_to_id, total_cents, credit_note_date
FROM credit_notes cn
WHERE status = 'applied' AND applied_to_id IS NOT NULL
  -- Guarded: migrations are re-applied on every open, so this must not insert twice.
  AND NOT EXISTS (SELECT 1 FROM credit_note_applications a WHERE a.credit_note_id = cn.id);

UPDATE credit_notes SET applied_cents = total_cents WHERE status = 'applied';
