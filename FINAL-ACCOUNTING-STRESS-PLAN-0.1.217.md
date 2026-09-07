# North Ledger 0.1.217 — final accounting stress plan

## Demo stress matrix

### DEMO — Ontario Service Company
Covers:
- service invoice with HST;
- no-tax expense;
- manual-tax transaction;
- partial customer receipt;
- partial vendor payment;
- bank transfer;
- HST filing and later CRA settlement;
- credit note and reversal;
- period lock.

### DEMO — Ontario Retail & Inventory
Covers:
- PO with product/tax;
- partial receipt and backorder;
- GRNI;
- supplier invoice match with price variance;
- recoverable HST;
- inventory valuation;
- credit sale with HST;
- COGS;
- customer partial receipts;
- bank deposit/reconciliation;
- inventory credit/return;
- inventory/GL reconciliation.

### DEMO — CRA/GIFI Validation
Covers:
- opening Balance Sheet;
- current-year P&L;
- retained earnings/current income;
- fixed assets and accumulated depreciation presentation;
- GIFI mapping and required totals;
- Schedule 100/101/125/141-oriented validation.

## Cross-company isolation stress
Open each demo sequentially and prove accounts, customers, vendors, products, HST defaults, reports and dashboard state refresh to the open company only.

## Accounting invariants
After every posted event:
- journal debits = credits;
- no orphan journal/source links;
- AR/AP open balances agree with control accounts;
- inventory quantity/value agrees with inventory movements and GL;
- HST detail agrees with control accounts subject to filed-period adjustments;
- Balance Sheet balances;
- GIFI uses the same GL/report basis.

## Release gate
The final installer is not released until executable stress tests pass in the compatible Windows build environment.
