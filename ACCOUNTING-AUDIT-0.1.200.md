# North Ledger 0.1.200 development checkpoint

## Audit cycle now in progress
1. Reversal/unmatch workflows must reverse linked journals and subledger effects rather than deleting posted documents.
2. Sales Receipts for tracked products must post Revenue/Tax plus Inventory/COGS atomically.
3. Partial PO receipts/backorders must expose ordered, received, and outstanding quantities from receipt history.
4. Inventory reconciliation must compare stock valuation to Inventory Asset GL by account and flag differences.

## Release gate
Do not treat this checkpoint as the finished Windows test release. The final test package is held until the accounting audit cycle and installer build are complete.
