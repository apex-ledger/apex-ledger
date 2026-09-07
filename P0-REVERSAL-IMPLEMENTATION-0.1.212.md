# P0 Reversal implementation — 0.1.212

## Shared API contract

`reversePostedTransaction({ sourceType, sourceId, reversalDate, reason })`

The service must:
1. Load the original posted source and linked journal(s).
2. Reject if already reversed.
3. Validate company lock date and reconciliation/filed-HST protections.
4. Create one linked reversal journal with every original journal line inverted.
5. Reverse linked inventory/subledger effects in the same database transaction.
6. Mark the source Reversed/Void without deleting it.
7. Store original/reversal linkage and reason.
8. Roll back everything if any step fails.

## Required schema fields/table
A reversal link must persist source_type, source_id, original_journal_id, reversal_journal_id, reversal_date, reason, created_at, and actor/user where available.

## First wiring order
1. Customer Invoice + COGS/inventory
2. Customer Receipt
3. Vendor Bill / PO matched bill
4. Vendor Payment
5. Sales Receipt
6. Credit Note / Refund
7. Inventory Adjustment / Receipt
8. Bank Deposit

## Acceptance fixture
Post invoice $2,000 + $260 HST with $1,000 COGS, then reverse it before payment. Expected net GL effect across original + reversal = zero for AR, Sales, HST Payable, COGS and Inventory. Inventory quantity/value returns to its pre-invoice state. Trial Balance remains balanced.

Status: implementation contract prepared; executable validation still required before P0 can be marked complete.
