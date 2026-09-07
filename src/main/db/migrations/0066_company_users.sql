CREATE TABLE company_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  invitation_token TEXT,
  invited_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_company_users_email ON company_users(email);
CREATE UNIQUE INDEX idx_company_users_invitation_token ON company_users(invitation_token) WHERE invitation_token IS NOT NULL;
