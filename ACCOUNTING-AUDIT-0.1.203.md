# North Ledger 0.1.203 development checkpoint

## Accountant-grade close and control layer

### Accounting period locks
- Company-level lock date protects closed books.
- Optional HST filed-through date protects filed indirect-tax periods.
- Posting, editing, voiding and reversing must validate dates against locks.
- Unlock/change of lock date is an explicit privileged action and belongs in audit history.

### Subledger reconciliation gates
At any as-of date, the suite must expose:
- Accounts Receivable control GL vs open customer balances
- Accounts Payable control GL vs open vendor balances
- Inventory Asset GL vs inventory valuation subledger
- GST/HST Recoverable and Payable GL vs tax-detail engine
- Undeposited Funds GL vs undeposited customer receipts

No reconciliation report may silently create a balancing journal. Differences are exceptions with drill-down.

### Trial balance gate
Total debits must equal total credits for every posted journal and for the aggregate trial balance. Unbalanced journals are rejected at posting time.

### Reversal gate
Reversals preserve original transactions and create linked opposite journals. If a reversal affects a filed HST period, route the tax difference to an adjustment workflow instead of rewriting the historical filed return.

## Next implementation target
Wire lock validation into the shared posting services and build the reconciliation exception dashboard before final financial-statement regression testing.
