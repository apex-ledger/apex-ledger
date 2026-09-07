-- Budgets: what each account was expected to do, so actual results can be compared against it.
--
-- Stored per account per period rather than as one annual figure. A yearly total cannot answer
-- "are we over budget by March", which is the question a budget is actually for, and spreading an
-- annual number evenly across twelve months would invent a monthly profile the business never had
-- — rent is flat, but heating and sales are not.
--
-- snake_case: raw SQL against the real schema.

CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  -- The fiscal year this budget covers, as its year-end date.
  fiscal_year_end TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_budgets_year ON budgets(fiscal_year_end);

CREATE TABLE budget_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- 1-12, the period within the fiscal year rather than the calendar month: period 1 is the first
  -- month of the year, whenever that falls. A business with a September year end budgets from
  -- October, and storing calendar months would put its figures in the wrong year.
  period INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX idx_budget_lines_unique ON budget_lines(budget_id, account_id, period);
CREATE INDEX idx_budget_lines_budget ON budget_lines(budget_id);
