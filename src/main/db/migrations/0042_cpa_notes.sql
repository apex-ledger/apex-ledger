-- Notes written for the CPA/accountant reviewing the books — the questions and explanations a
-- bookkeeper would otherwise send in a separate email and lose track of ("this deposit is a
-- shareholder loan, not revenue", "need your call on how to treat this lease"). Kept in the company
-- file so they travel with the books and can be bundled into the review package sent to the CPA.
CREATE TABLE cpa_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_date TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  -- 'open' still needs the CPA's answer. 'resolved' has been dealt with.
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  -- Optional anchors so a note can point at what it is actually about.
  account_id INTEGER REFERENCES accounts(id),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  -- The CPA's answer, filled in when the note comes back reviewed.
  cpa_response TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cpa_notes_status ON cpa_notes(status, note_date);
