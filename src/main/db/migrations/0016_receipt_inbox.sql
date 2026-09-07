ALTER TABLE bills ADD COLUMN receipt_file_path TEXT;

CREATE TABLE receipt_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file_name TEXT NOT NULL,
  archived_file_path TEXT NOT NULL,
  bill_id INTEGER REFERENCES bills(id),
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_receipt_imports_source ON receipt_imports(source_file_name);
