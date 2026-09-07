-- Stable actor attribution for a multi-login company file.
ALTER TABLE journal_entry_revisions ADD COLUMN changed_by TEXT;

CREATE TABLE user_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_key TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_email TEXT,
  topic TEXT NOT NULL,
  action TEXT NOT NULL,
  target_reference TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_user_activity_changed_at ON user_activity_log(changed_at);
CREATE INDEX idx_user_activity_actor_key ON user_activity_log(actor_key);
