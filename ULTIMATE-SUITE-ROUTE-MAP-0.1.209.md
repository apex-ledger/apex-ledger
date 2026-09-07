# North Ledger Ultimate Suite route map — 0.1.209

## Dashboard
Overview, KPI cards, due/overdue work, reconciliation exceptions, recent activity.

## Sales
Estimates | Sales Orders | Invoices | Sales Receipts | Customer Receipts | Deposits | Credit Notes | AR Aging

## Purchases
Purchase Orders | Receive Goods | Supplier Invoice Match | Bills | Vendor Payments | Vendor Credits | AP Aging

## Banking
Bank Accounts | Bank Feed/Import | Match & Categorize | Transfers | Deposits | Reconcile | Reconciliation History

## Expenses
Expenses | Recurring Expenses | Receipts/Documents | Mileage

## Inventory
Products & Services | Stock on Hand | Inventory Movements | Adjustments | Valuation | Inventory/GL Reconciliation

## HST Centre
Tax Detail | Filing Periods | Prepare Return | Filed Returns | CRA Payments/Refunds | Adjustments

## Payroll
Employees | Pay Runs | Pay Stubs | Payroll Liabilities | PD7A/Remittances | T4 | ROE support

## Accounting
Chart of Accounts | Journal Entries | Trial Balance | General Ledger | Opening Balances | Period Lock | Year End | Audit Trail

## Reports
Financial Statements | Sales | Purchases | AR/AP | Inventory | Tax | Banking | Payroll | Custom/Favourites

## Tax & GIFI
GIFI Mapping | GIFI Validation | Schedule 100/101 | Schedule 125 | Schedule 141 support | Corporate Tax Working Papers

## Customers / Vendors
Dedicated centres with balances, documents, payment history, notes and activity.

## Settings
Company Profile | Fiscal Year | Sales Tax | Numbering | Users/Permissions | Templates | Backup/Restore | Preferences

## UI consistency rules
- One route owns each feature; shortcuts link to it rather than duplicating screens.
- One consistent icon per concept throughout the app.
- Primary action is top-right; secondary actions use an overflow/menu pattern.
- Company name and fiscal context stay visible in the shell.
- All money tables use consistent alignment, currency precision and open-balance columns.
- Posted/reconciled/filed records expose reversal or adjustment workflows rather than Delete.

## Next release gate
Perform screen inventory against existing routes/components, identify orphan/duplicate screens, then run final packaging and Windows installer readiness checks.
