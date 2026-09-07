# North Ledger 0.1.207 development checkpoint

## Ultimate Suite reporting gate

Reports must be generated from the same posted journal/subledger basis and respect the currently open company.

### Core accountant reports
- Trial Balance with opening, period debit, period credit and ending balance.
- General Ledger with source-document drill-down.
- Profit & Loss: current period, prior period, YTD and comparative.
- Balance Sheet: current as-of date and comparative prior date.
- Cash Flow statement with operating/investing/financing sections.
- AR Aging and AP Aging using remaining balances after partial payments/credits.
- Inventory Valuation and Inventory/GL reconciliation.
- GST/HST detail, filing summary and CRA settlement history.
- Bank reconciliation report with outstanding deposits/payments.
- GIFI mapping/validation report.

### Report controls
- company identity displayed on every report;
- fiscal/reporting date range visible;
- account number + account name;
- zero-balance suppression optional;
- drill-down never crosses company databases;
- report totals reconcile to Trial Balance;
- export/print must not recalculate using a different basis than on-screen totals.

## Chart of Accounts presentation gate
COA must expose Account Number, Name, Type, Subtype, Normal Balance, Tax Default, GIFI Code, Active status and balance. Operational selectors show only active/relevant accounts for the open company, while historical reports retain inactive accounts with posted history.

## Next gate
Audit the dashboard/navigation and accountant workflows after report consistency controls are complete.
