# North Ledger 0.1.193 — Accounting audit pass

## Fixed in this pass
- GST/HST filing no longer pretends that filing the return and paying/receiving CRA cash happen on the same date.
- Filing now clears period GST/HST collected and ITCs into either:
  - GST/HST Filed Payable (liability, GIFI 2680), or
  - GST/HST Refund Receivable (asset, GIFI 1066).
- Actual CRA payment/refund remains a separate banking event, preserving bank reconciliation integrity.
- HST Centre no longer asks for a bank account merely to file a return.
- Added/updated unit tests for net payable, refund, zero-net, empty filing, negative source totals, and overlapping periods.

## Retained from 0.1.191–0.1.192
- Consistent GST/HST GIFI mappings.
- Atomic inventory/GL posting safeguards.
- Fiscal-period GIFI income statement logic vs closing-date balance sheet logic.
- Current/unclosed earnings included in GIFI equity validity logic.

## Next audit targets
1. Partial customer receipts and partial vendor payments with open-balance aging.
2. Credit-note partial applications rather than full-document-only settlement.
3. PO -> receive -> vendor bill three-way inventory flow.
4. Dedicated CRA settlement action for filed HST payable/refund accounts.
5. End-to-end tests: source document -> subledger -> GL -> trial balance -> statements -> GIFI.
