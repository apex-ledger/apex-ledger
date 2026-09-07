-- A file on any transaction — the way QuickBooks lets a PDF, photo or email sit on an invoice,
-- a journal entry or a payment, not only on a supplier bill. The file itself is copied into the
-- app's documents folder; this row is the link plus who attached it and when, so an auditor can
-- see the evidence behind any entry from the entry itself.
CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  added_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);
