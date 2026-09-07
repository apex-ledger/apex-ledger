CREATE TABLE audit_engagements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_end TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'fieldwork', 'completion', 'locked')),
  materiality_basis TEXT,
  materiality_basis_cents INTEGER,
  materiality_percent REAL,
  overall_materiality_cents INTEGER,
  performance_materiality_cents INTEGER,
  trivial_misstatement_cents INTEGER,
  materiality_rationale TEXT,
  locked_at TEXT,
  locked_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_id INTEGER NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  index_code TEXT NOT NULL,
  title TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('setup', 'planning', 'risk', 'response', 'completion', 'reporting')),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'prepared', 'reviewed', 'query')),
  content TEXT NOT NULL DEFAULT '',
  prepared_by TEXT,
  prepared_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (engagement_id, index_code)
);

CREATE TABLE audit_review_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES audit_documents(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_by TEXT,
  resolved_at TEXT
);

CREATE INDEX idx_audit_documents_engagement ON audit_documents(engagement_id, phase, index_code);
CREATE INDEX idx_audit_review_notes_document ON audit_review_notes(document_id, status);
