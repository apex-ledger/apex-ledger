# North Ledger 0.1.202 development checkpoint

## Reversal engine design gate
Every posted source document must retain its original journal. A correction creates a new reversal journal dated by the user, with equal and opposite lines, and links reversal -> original. The source document becomes Reversed/Void rather than being physically deleted.

Reversal coverage required:
- customer invoices and their inventory/COGS posting
- sales receipts
- vendor bills and PO/GRNI matched bills
- customer receipts and vendor payments
- credit notes/refunds
- inventory adjustments/receipts
- bank deposits and reconciliation-safe corrections

## Period controls
A reversal date may not fall in a locked accounting period. Previously filed HST periods must surface a warning/adjustment workflow rather than silently rewriting the filed return.

## Audit trail
Store original document id/type, original journal id, reversal journal id, reversal date, reason, user/timestamp where available. Reports must include both original and reversal so the GL remains reproducible.

## Next code gate
Implement the shared reversal service and wire the highest-risk document types first, then run Trial Balance and subledger reconciliation checks.
