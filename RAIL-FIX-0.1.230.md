# North Ledger 0.1.230 — rail fixed before testing

Actual `src/renderer/layout/Sidebar.tsx` changes:

- One canonical Ultimate Suite rail in the agreed order.
- Removed duplicate Bookkeeping/Accounting sidebar groups from the rendered rail.
- Added Customers, Vendors, Settings and Tax & GIFI as direct destinations.
- Accounting opens Accountant Centre; Tax & GIFI opens the GIFI report.
- Company legal name is always visible at the top of the sidebar.
- Companies whose name contains DEMO or TEST show a DEMO / TEST badge.
- Rail changed from pill-heavy presentation to compact rounded desktop rows.
- Kept edition gating for Inventory and Payroll.
- Existing customization/order support remains for the canonical rail.
- Legacy BOOKKEEPING_NAV / ACCOUNTING_NAV exports remain empty for compatibility.

Canonical order:
Dashboard
Sales
Purchases
Banking
Expenses
Inventory
HST Centre
Payroll
Accounting
Reports
Tax & GIFI
Customers
Vendors
Settings
