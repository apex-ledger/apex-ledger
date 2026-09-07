-- Who was signed in, from when until when. One row per sign-in per window; the row is closed
-- when the person switches user, locks the screen, closes the window, or the app closes. Kept in
-- the company file beside the activity log so an administrator can see who was working when a
-- change was made. Never deleted by the application.
CREATE TABLE staff_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_key TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_email TEXT,
  role TEXT NOT NULL,
  window_id INTEGER NOT NULL,
  signed_in_at TEXT NOT NULL DEFAULT (datetime('now')),
  signed_out_at TEXT,
  end_reason TEXT
);

CREATE INDEX idx_staff_sessions_signed_in_at ON staff_sessions(signed_in_at);
CREATE INDEX idx_staff_sessions_actor_key ON staff_sessions(actor_key);
CREATE INDEX idx_staff_sessions_open ON staff_sessions(window_id) WHERE signed_out_at IS NULL;
