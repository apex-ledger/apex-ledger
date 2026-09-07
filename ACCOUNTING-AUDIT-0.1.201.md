# North Ledger 0.1.201 development checkpoint

## Inventory / GL reconciliation contract
For every active Inventory Asset account, North Ledger must compare:
- stock subledger value from posted inventory movements; and
- General Ledger balance through the same as-of date.

Difference = Inventory subledger value - Inventory Asset GL balance.
A non-zero difference is an exception requiring drill-down; the software must never silently plug it.

## Posted transaction reversal contract
Posted accounting documents are immutable. Corrections use dated reversing entries and linked reversal records so the original audit trail remains visible. A reversal must reverse every linked effect (AR/AP, tax, inventory, COGS, bank/undeposited funds as applicable).

## Sales Receipt contract
A Sales Receipt for a tracked product is one atomic posting: Cash/Bank (or Undeposited Funds), Revenue, tax liability, COGS, and Inventory. If stock/account validation fails, none of the posting is committed.

## PO/backorder contract
PO UI must derive Ordered / Received / Outstanding from receipt history. Partial receipt keeps PO open; only zero outstanding closes it. Supplier invoice matching is limited to quantities/costs actually received unless an explicit variance workflow is used.

## Release gate
Final Windows test installer remains withheld until these controls plus HST/GIFI/report regression checks pass.
