# North Ledger Ultimate Suite — full UI exposure audit 0.1.233

## Fixed in this pass
- The canonical left navigation now expands Sales, Purchases, Banking, HST Centre, Accounting, Tax & GIFI, and Settings with direct links to their implemented destinations. Groups start expanded, so Chart of Accounts and the other core screens are visible without relying on a hidden card or header menu.
- Accounting now exposes Chart of Accounts, Journal Entries, Trial Balance, General Ledger, Working Trial Balance, Account List/GIFI, Adjusting Entries and invalid-transaction audit.
- Tax & GIFI is now a centre instead of a single GIFI report link.
- Purchases now exposes Purchase Orders, Vendors, AP Ageing and Bill Approval directly.
- Sales now exposes Credit Notes as a first-class tab.
- Sidebar edition-gating tests updated to the new canonical rail rather than the retired sidebar labels.
- Inventory TypeScript null-safety build blocker fixed in source.

## Already implemented and exposed
- Sales: overview, all sales, estimates, invoices, sales receipts, deposits, customers, products/services, credit notes.
- Banking: bank import/transactions, spend, receive, transfer, receipt inbox, bank rules/bulk import, reconciliation.
- Expenses: overview, record expense, purchase orders, purchase invoices, mileage, suppliers.
- Inventory: products, quantity movements/adjustments, account mapping, stock value; Inventory Status report.
- HST Centre: HST payable, reconciliation, manual HST, filing, Quick Method.
- Payroll: payroll page and supporting payroll panels already present.
- Reports: financial statements, AR/AP, sales, expenses, inventory, tax and analysis reports.
- Settings: company/fiscal/business/HST/payroll/WSIB details, appearance, AI keys, COA templates/categories.

## Implemented in code but not a dedicated primary rail item
- Calendar, Forms, QuickBooks import, User Guide, Tools, Knowledge Base, Audit, About, Receipt Inbox, Tags, recurring transactions/rules. These remain accessible through header/tools/centres rather than adding rail clutter.

## Not complete enough to present as finished
- Sales Orders (no full sales-order screen).
- Dedicated user/permission administration.
- Full T2 Schedule 100/125/141 electronic-form workflow. Current Balance Sheet/P&L/GIFI reports provide the accounting data but are not those completed forms.
- A standalone period-lock administration screen was not found.

## Release rule
No future rail simplification may remove the only discoverable path to an implemented accounting feature. Centres may group features, but the centre must visibly link to every core destination it owns.

## Verification of corrected source
- Sidebar navigation and edition-gating tests: 16 passed.
- Full regression suite: 1,101 passed; 2 database fixture suites skipped because no external real-company file was supplied.
- TypeScript and production Vite/Electron build: passed.
