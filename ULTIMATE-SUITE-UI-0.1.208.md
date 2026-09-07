# North Ledger Ultimate Suite UI — 0.1.208 checkpoint

## Navigation hierarchy
Primary navigation is task-oriented rather than exposing database/accounting internals:

Dashboard | Sales | Purchases | Banking | Expenses | Inventory | HST Centre | Payroll | Accounting | Reports | Tax & GIFI | Customers | Vendors | Settings

## Dashboard first frame
Show the currently open company prominently. Core cards:
- Bank / cash position
- Accounts Receivable
- Accounts Payable
- Sales
- Expenses
- Net income
- GST/HST payable or refund
- Inventory value
- Reconciliation exceptions

Cards must drill into the same underlying report, never a separate dashboard calculation.

## Accountant workflow
Accounting workspace:
- Chart of Accounts
- Journal Entries
- Trial Balance
- General Ledger
- Reconciliation Centre
- Period Lock / Year End
- Opening Balances
- Audit Trail

## Sales workflow
Customers -> Estimates -> Sales Orders -> Invoices -> Receipts -> Deposits -> Credit Notes -> AR Aging.

## Purchase workflow
Vendors -> Purchase Orders -> Receive Goods -> Supplier Invoice Match -> Bills -> Payments -> Vendor Credits -> AP Aging.

## Visual system
- light professional surfaces with restrained accent use;
- consistent line icons;
- one icon vocabulary across sidebar, quick actions and page headers;
- status chips for Draft, Posted, Partially Paid, Paid, Overdue, Reversed, Filed and Reconciled;
- financial negatives use accounting presentation and remain readable without relying only on color;
- tables prioritize Date, Number, Name, Status, Due Date, Amount, Open Balance and actions;
- destructive actions never sit beside ordinary primary actions without confirmation.

## Company isolation UX
The open company name is always visible in the application shell. Switching company clears cached selectors/data and reloads dashboard/report state. No global account/customer/vendor picker may span company databases.

## Next gate
Map existing screens/routes into this hierarchy, remove duplicate navigation, standardize icons/status labels, then perform final report + installer release audit.
