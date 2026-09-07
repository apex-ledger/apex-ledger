# North Ledger 0.1.206 development checkpoint

## Known-number regression fixture

This checkpoint adds a deterministic accounting lifecycle fixture. The software must reproduce the same control-account results from source documents, subledgers, GL, reports, HST and GIFI.

Scenario core:
- $1,000 inventory received before supplier invoice.
- $130 recoverable HST on supplier invoice.
- $1,130 supplier payable with two-payment capability.
- Inventory sold for $2,000 + $260 HST.
- $1,000 COGS relieved from Inventory Asset.
- $2,260 customer receivable settled in two $1,130 receipts.

Expected operating result before other expenses: Sales $2,000 - COGS $1,000 = $1,000 gross profit.
Expected tax position from this isolated purchase/sale pair before filing adjustments: $260 collected - $130 ITC = $130 net HST payable.

## Cross-module assertions
- AR open balance after both receipts = $0.
- AP open balance after a single $565 partial payment = $565; after second equal payment = $0.
- Inventory subledger reduction agrees with Inventory Asset GL.
- Trial Balance remains balanced after every posting.
- P&L gross profit = $1,000.
- HST detail net payable = $130 before settlement.
- GIFI derives from the same GL basis and selected fiscal period.

## Failure policy
Any mismatch is a release blocker. No auto-plug or hidden correction journal is permitted.
