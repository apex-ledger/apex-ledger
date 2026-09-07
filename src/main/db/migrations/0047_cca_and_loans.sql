-- Capital cost allowance pools and loan schedules.
--
-- Both are things an accountant currently keeps in a spreadsheet beside the books, and both are
-- worth storing rather than recomputing from scratch each year: a CCA pool's whole purpose is that
-- its closing UCC becomes next year's opening, and a loan's schedule is fixed the day it is signed.
--
-- snake_case, because this is raw SQL against the real schema — Kysely's CamelCasePlugin translates
-- for the application code only.

-- One row per class per fiscal year. Kept per year rather than as a single running pool so a prior
-- year can be looked at, amended, or filed from without disturbing the years after it.
CREATE TABLE cca_pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The fiscal year end this row belongs to, so a pool can be read as it stood at any filing.
  fiscal_year_end TEXT NOT NULL,
  -- CRA class number as written: '8', '10.1', '43.1'. Text because of the decimals.
  class_code TEXT NOT NULL,
  opening_ucc_cents INTEGER NOT NULL DEFAULT 0,
  additions_cents INTEGER NOT NULL DEFAULT 0,
  dispositions_cents INTEGER NOT NULL DEFAULT 0,
  -- The year the additions became available for use, which drives the first-year restriction and is
  -- not always the year they were bought.
  available_for_use_year INTEGER,
  -- Overrides the standard rate — class 13 is straight-line over a lease, and unusual classes are
  -- not all in the shipped table.
  rate_override REAL,
  -- Claiming less than the maximum is a real choice in a loss year; null means claim the maximum.
  claim_cents INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_cca_pools_year_class ON cca_pools(fiscal_year_end, class_code);

CREATE TABLE loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  lender TEXT,
  principal_cents INTEGER NOT NULL,
  -- Nominal annual rate as a fraction: 0.0649 for 6.49%.
  annual_rate REAL NOT NULL,
  -- 'weekly' | 'biweekly' | 'semiMonthly' | 'monthly' | 'quarterly' | 'annually'
  frequency TEXT NOT NULL DEFAULT 'monthly',
  number_of_payments INTEGER NOT NULL,
  -- 'semiAnnual' for a Canadian mortgage, 'perPayment' for most other lending. The difference is
  -- real money and is why a hand-built schedule disagrees with the lender.
  compounding TEXT NOT NULL DEFAULT 'perPayment',
  start_date TEXT,
  -- The liability account this loan sits in, so the schedule can be compared against the books.
  liability_account_id INTEGER REFERENCES accounts(id),
  interest_account_id INTEGER REFERENCES accounts(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_loans_active ON loans(is_active);
