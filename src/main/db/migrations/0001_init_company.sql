CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE company_info (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  legal_name TEXT NOT NULL,
  display_name TEXT,
  fiscal_year_end_month INTEGER NOT NULL DEFAULT 12,
  fiscal_year_end_day INTEGER NOT NULL DEFAULT 31,
  base_currency TEXT NOT NULL DEFAULT 'CAD',
  business_number TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
