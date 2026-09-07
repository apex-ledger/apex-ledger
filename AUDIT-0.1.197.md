# North Ledger 0.1.197 accounting audit

## Purchase-order receiving foundation

- A PO remains non-posting until goods are actually received or a supplier bill is entered.
- **Receive goods** now posts tracked products at PO unit cost: **Dr Inventory Asset / Cr Goods Received Not Invoiced (GRNI)**.
- GRNI is a current liability mapped to GIFI 2620 (amounts payable and accrued liabilities).
- Inventory movement rows and the receipt journal entry are committed in one database transaction.
- Every product line is validated before posting; missing/inactive/non-tracked products or missing Inventory Asset setup block the receipt before anything is written.
- The PO stores receipt date, receipt journal entry, and received quantity by line.
- The old direct status-only “Received” action is removed from the list; receiving now means an actual stock/accounting event.
- The legacy PO → Bill conversion is deliberately blocked after stock receipt until GRNI invoice matching is completed. This prevents the existing bill engine from debiting Inventory/expense a second time.

## Next accounting step

Implement supplier-invoice matching for received POs: Dr GRNI (received inventory cost), Dr GST/HST Recoverable, Dr/Cr price variance where needed, Cr Accounts Payable. Expense/service PO lines remain direct expense/asset debits. Support partial receipts and partial supplier invoices after the full-receipt path is proven.
