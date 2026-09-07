# North Ledger 0.1.216 — demo company seed gate

## Final test startup requirement
On the isolated test build, North Ledger must offer a one-time **Install Demo Companies** action. It creates demo `.company` databases only when they do not already exist. It never overwrites user companies.

## Demo company labels
- DEMO — CRA/GIFI Validation
- DEMO — Ontario Service Company
- DEMO — Ontario Retail & Inventory

Each demo company is a separate database and must carry an internal `is_demo` marker where supported. The application shell/dashboard must visibly show DEMO / TEST when one is open.

## Retail demo drill-through
The user must be able to open:
Purchase Order -> Goods Receipt -> GRNI journal -> Supplier Bill Match -> AP -> Vendor Payment -> Inventory -> Customer Invoice -> Revenue/HST journal -> COGS journal -> Customer Receipts -> Deposit/Bank -> Trial Balance -> P&L -> Balance Sheet -> HST Centre -> GIFI.

## Seed idempotency
Running demo installation twice must not duplicate companies or transactions. Existing demo companies are left unchanged unless the user explicitly chooses Reset Demo Company. Reset must never be available for non-demo companies.

## Release status
Seed behavior is now part of the final release contract. Executable database generation still requires the compatible Windows build/test environment.
