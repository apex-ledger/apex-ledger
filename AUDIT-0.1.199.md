# North Ledger 0.1.199 development checkpoint

This is a development checkpoint, not the final user test release.

## Added / corrected
- Receipt-level purchase-order history for multiple goods receipts.
- Exact GRNI accrued cost stored per receipt line to avoid tax-rounding drift.
- Supplier Invoice Match flow: clears actual GRNI, recognizes recoverable GST/HST, credits A/P, posts invoice/receipt difference to Purchase Price Variance without debiting Inventory twice.
- Supplier Invoice Match modal accepts actual bill date, due date, terms, base amount, company tax/no-tax/manual tax, and exact tax amount.
- PO lines with received inventory cannot be edited, cancelled, or deleted without reversal.
- Non-recoverable provincial sales tax is capitalized/expensed instead of being misclassified as PPV.
- New tracked-stock reductions cannot create negative quantity; historic negative-stock valuation no longer produces a negative asset or overvalues the next receipt.
- Invoice revenue/A/R and tracked-product Inventory/COGS now post in one database transaction.
- Inventory movements created by invoices carry source-document/source-line links to prevent duplicate posting.
- Stock invoices cannot be directly deleted after COGS posting; use reversal/credit workflow.
- Bills linked to a purchase order/GRNI match cannot be directly deleted.

## Validation performed here
- All SQL migrations through 0059 apply successfully to an empty SQLite database.
- All 476 non-declaration TS/TSX files parsed successfully for syntax using TypeScript transpilation.
- Full dependency-based Vitest/Electron build remains unavailable in this environment because the package cache does not contain every dependency.

## Next audit work
- Proper reversal/unmatch workflows for stock invoices and PO/GRNI receipts.
- Product support + atomic COGS on Sales Receipts.
- Partial receipt quantity UI/backorder visibility.
- Inventory-to-GL reconciliation report and year-end inventory controls.
