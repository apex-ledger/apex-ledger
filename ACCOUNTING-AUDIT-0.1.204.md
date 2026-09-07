# North Ledger 0.1.204 development checkpoint

## Period-lock enforcement contract

Every posting-capable workflow must validate its effective accounting date before writing journals or subledger movements.

Required checks:
- company books lock date;
- GST/HST filed-through date;
- reversal date;
- source-document date when editing a draft into a posted document;
- bank reconciliation protection when a transaction has already cleared a completed reconciliation.

A blocked transaction must fail before any partial posting occurs.

## Reconciliation exception layer

The dashboard/reconciliation centre must calculate and expose, by company and as-of date:

### Accounts Receivable
AR control-account GL balance versus total open customer invoice balances net of applied receipts/credits.

### Accounts Payable
AP control-account GL balance versus total open vendor bill balances net of applied payments/credits.

### Inventory
Inventory Asset GL by mapped inventory account versus inventory subledger valuation derived from posted stock movements.

### GST/HST
GST/HST Recoverable and Payable GL balances versus the tax-detail engine for unfiled periods, with filed-period differences treated as adjustments/exceptions.

### Undeposited Funds
Undeposited Funds GL balance versus customer receipts not yet included in a posted bank deposit.

## Exception behavior

- Never auto-create a plug journal.
- Show difference amount and status.
- Allow drill-down to contributing source documents/journals.
- Zero difference = Reconciled.
- Non-zero difference = Exception.
- A stale/missing account mapping = Configuration exception.

## Journal integrity gate

All posting services must reject any journal where absolute(total debits - total credits) exceeds the configured currency rounding tolerance.

## Release gate

This remains a development checkpoint. Final Windows installer is withheld until reconciliation calculations, reversals, financial-statement regressions, and installer build checks are complete.
