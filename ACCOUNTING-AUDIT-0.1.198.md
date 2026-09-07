# North Ledger 0.1.198 accounting audit checkpoint

## Current protected flow
- PO receipt posts Inventory / GRNI and must not duplicate inventory at vendor-bill entry.
- Company-specific account isolation remains mandatory.
- Company-address tax default remains Company Tax / No Tax / Manual Tax.

## Next implementation gate
Supplier invoice matching must post the received portion from GRNI into Accounts Payable, recognize recoverable GST/HST from the supplier invoice, and handle price/quantity variances without a second inventory receipt. Partial receipts/backorders require receipt-level quantities rather than a single PO status flag.

This checkpoint deliberately does not label those unfinished items as complete.
