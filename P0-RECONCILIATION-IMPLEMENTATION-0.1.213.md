# P0 Reconciliation implementation — 0.1.213

## Shared reconciliation API contract
`getControlReconciliations(asOfDate)` returns company-scoped reconciliation rows for AR, AP, Inventory, GST/HST and Undeposited Funds.

Each row contains:
- control name
- GL account id/number/name
- GL balance
- subledger balance
- difference
- status: Reconciled / Exception / Configuration
- drill-down contributors

## Calculations

### Accounts Receivable
GL: AR control balance through as-of date.
Subledger: invoice original amounts less applied receipts and credits through as-of date.

### Accounts Payable
GL: AP control balance through as-of date.
Subledger: bill original amounts less applied vendor payments and credits through as-of date.

### Inventory
GL: each Inventory Asset account balance through as-of date.
Subledger: posted inventory movement valuation mapped to the same asset account through as-of date.

### GST/HST
GL: recoverable/payable control balances.
Subledger: posted tax detail with filed-period settlement/adjustment treatment. Filed returns remain immutable historical snapshots.

### Undeposited Funds
GL: Undeposited Funds control balance.
Subledger: posted customer receipts routed to Undeposited Funds less posted bank-deposit allocations through as-of date.

## Tolerance
Use currency rounding tolerance only (normally $0.01). Never auto-post a plug.

## Acceptance
Known-number fixture must return zero differences after all related postings. Injecting an intentional $10 GL-only journal to Inventory Asset must produce a $10 reconciliation exception and must not modify any transaction.

Status: implementation contract prepared; executable validation remains required before P0 completion.
