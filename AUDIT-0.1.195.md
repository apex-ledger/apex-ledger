# North Ledger 0.1.195 — Partial Payments & Payment-Date Reporting

## Accounting engine changes

- Added migration 0056 with `invoice_payments` and `bill_payments` history tables.
- Added `paid_cents` to invoices and bills, with safe backfill for existing paid documents.
- Customer receipts may now be partial. Each receipt posts Dr Cash/Bank or Undeposited Funds and Cr Accounts Receivable for only the amount received.
- Vendor payments may now be partial. Each payment posts Dr Accounts Payable and Cr Cash/Bank for only the amount paid.
- Overpayments are rejected; full settlement changes the document to paid, while a partial balance remains open.
- A/R and A/P aging use the remaining balance rather than the original document total.
- Documents with any payment cannot be deleted, preventing orphaned payment journals.

## Undeposited Funds / deposits

- New invoice payments are deposit candidates individually, so two partial cheques on one invoice can be deposited on different dates/batches.
- Legacy paid invoices remain compatible with the old invoice-level deposit tracking.
- Deleting/voiding a deposit releases the linked invoice-payment rows back to Undeposited Funds.
- Direct Receive Payment now permits only active Cash and Bank accounts; other asset accounts can no longer be selected as a fake bank destination.

## Bank import

- Matching a bank line to an invoice or bill posts the statement amount, not automatically the whole document total.
- Match labels show the outstanding balance, so partially settled documents are represented correctly.

## Credit notes

- A full credit can settle the remaining balance after earlier partial payments.
- Applying a credit updates `paid_cents` so aging and document status remain consistent.

## CRA information returns

- T4A Box 048 now uses payment dates for modern bill payments and excludes GST/HST from the reported fees-for-services amount.
- T5018 uses payment dates for modern bill payments; Box 22 remains gross including GST/HST, while the >$500 reporting threshold is evaluated on the pre-tax amount.
- Legacy fully-paid bills created before payment-history migration retain bill-date fallback because their original payment date cannot be reconstructed reliably.

## Validation performed in this environment

- Migration 0056 executed successfully against a SQLite compatibility schema and correctly backfilled paid/unpaid balances.
- All TypeScript/TSX source files passed TypeScript syntax parsing.
- Full `npm test` / Electron packaging still requires the Windows development dependencies to be installed on the test PC.
