-- Filed GST/HST returns. One row per closed reporting period: what was collected, what was
-- claimed as input tax credits, and the net paid to (or refunded by) CRA. The journal entry it
-- posted is referenced so the filing can be voided as a unit.
CREATE TABLE hst_filings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  collected_cents INTEGER NOT NULL,
  itc_cents INTEGER NOT NULL,
  net_payable_cents INTEGER NOT NULL,
  payment_account_id INTEGER REFERENCES accounts(id),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  memo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_hst_filings_period ON hst_filings(period_start, period_end);
