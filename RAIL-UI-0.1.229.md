# North Ledger 0.1.229 — left rail/sidebar acceptance

Required final rail behavior:
- Company name shown at top with DEMO / TEST badge where applicable.
- Canonical order:
  Dashboard, Sales, Purchases, Banking, Expenses, Inventory, HST Centre,
  Payroll, Accounting, Reports, Tax & GIFI, Customers, Vendors, Settings.
- Consistent line icons from one icon library.
- Clear active-item state.
- Compact spacing suitable for desktop bookkeeping use.
- Optional section dividers only where they reduce clutter.
- No duplicate destinations in the rail.
- Legacy routes redirect to canonical pages instead of appearing twice.
- Rail remains readable at standard Windows scaling and dark/light modes.
- Company switch refreshes visible counts/badges and does not reuse stale company state.

Implementation status:
- Canonical navigation config added at src/config/ultimateSuiteNav.ts.
- Existing rail component locations have been inventoried for direct wiring.
- Final visual completion requires the discovered shell/sidebar component(s) to consume this config and their CSS/classes to be normalized before user testing.
