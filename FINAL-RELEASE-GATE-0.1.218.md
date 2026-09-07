# North Ledger 0.1.218 — final release gate

## Accounting correctness
- All source-document postings are balanced and atomic.
- Partial AR/AP payments and aging use remaining balances.
- Inventory receipt/GRNI/supplier invoice matching does not duplicate stock.
- Inventory sales post revenue/tax and COGS/inventory together.
- HST filing is separate from CRA cash settlement.
- Posted records use reversal/adjustment workflows, not destructive deletion.
- Locked/filed/reconciled periods are protected.

## Reconciliation
AR, AP, Inventory, GST/HST and Undeposited Funds must each reconcile GL to subledger with zero unexplained difference.

## Reporting
Trial Balance, General Ledger, P&L, Balance Sheet, Cash Flow, aging, inventory, HST and GIFI must derive from consistent company-scoped data.

## Demo validation
Three retained DEMO / TEST companies must be installable/resettable without touching user companies and must remain available for the user to inspect.

## UI
Ultimate Suite navigation, company identity, consistent icons/statuses/actions, canonical routes and accountant workflows must be coherent.

## Windows package
Final test package must have a separate application identity/data path, clean-install successfully, migrate/reopen successfully, and include source, release notes, checklist and validation summary.

## Status
This document is the acceptance gate. Items remain open until executable Windows validation is performed; design/specification alone does not satisfy the gate.
