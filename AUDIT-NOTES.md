# North Ledger Accounting Audit — Initial Pass

Date: 2026-08-23
Base: 0.1.190 source
Working audit build: 0.1.192-test

## Fixed in this pass

1. GST/HST system accounts now use one central mapping everywhere:
   - GST/HST Payable -> GIFI 2680 (Taxes payable)
   - GST/HST Recoverable -> GIFI 1066 (Taxes receivable)
   Credit notes and HST filing previously had fallback mappings 2310/1310, which are not the correct corporate GIFI mappings for these tax balances.

2. Inventory movement / general-ledger atomicity strengthened:
   - Inventory Asset account is required before tracked stock moves.
   - COGS account is required before stock is reduced.
   - A funding/counter account is required for positive-cost receipts.
   - Journal posting and inventory movement are committed in one database transaction.
   - A movement with a posted journal entry can no longer simply be deleted and leave the GL behind; a reversing inventory adjustment is required.

## Confirmed as sound in the initial review

- Customer invoice: Dr A/R; Cr revenue; Cr GST/HST payable.
- Customer payment: Dr bank/Undeposited Funds; Cr A/R.
- Vendor bill: Dr expense/asset; Dr recoverable GST/HST where applicable; Cr A/P.
- Vendor payment: Dr A/P; Cr bank.
- Perpetual inventory issue: Dr COGS; Cr Inventory Asset at moving weighted-average cost.
- Customer credit note reverses revenue and GST/HST and credits A/R.
- Vendor credit reverses expense/asset and ITC and debits A/P.

## High-priority items still to upgrade for the Ultimate Suite

- Invoice stock posting currently happens as a second call after the invoice saves. It should be redesigned so inventory-linked documents have a controlled, recoverable posting workflow and cannot silently remain half-posted.
- Bills and invoice receipts currently use a full-payment-only model. Ultimate Suite should support partial payments, multiple payments, deposits, credits, write-offs, and outstanding balances by document.
- HST filing currently combines filing and bank settlement. Ultimate Suite should separate filing/assessment from later CRA payment or refund receipt.
- GIFI export needs a final CRA validation layer for required totals, unrecognized mappings, sign conventions, and Schedule 100/101/125/141 readiness.
- Purchase orders need a receiving/bill matching flow for inventory (PO -> receive -> vendor bill -> A/P) so inventory does not rely on manual movement entry.

## Verification limitation

The source was inspected and patched. Full automated tests could not yet be executed in this environment because the dependency installation did not complete and the local test type package `vitest/globals` is unavailable. A TypeScript compile attempt reached that missing dependency before application code checking.

## 0.1.192 follow-up corrections

3. GIFI fiscal-period logic corrected:
   - Balance Sheet codes use cumulative balances through the fiscal year-end date.
   - Income Statement / Schedule 125 codes use activity only inside the selected fiscal period.
   - CRA required totals 2599, 3499, 3620, 8299, 9368 and 9999 are system-computed.
   - GIFI total lines are reserved and cannot be used as ordinary account mappings.
   - Unclosed cumulative net income is bridged into retained earnings/equity so the CRA balance-sheet validity equation agrees with North Ledger's Balance Sheet before formal closing entries are posted.
   - Legacy GIFI unit tests were updated to the fiscal-period API.

4. GST/HST filing account picker tightened:
   - The filing screen now offers only active `Cash and Bank` accounts instead of every Asset account.
   - This prevents accidental CRA remittance/refund postings to Accounts Receivable, Inventory, prepaid assets, etc.

## Verification in this environment

- Direct TypeScript smoke test of the corrected GIFI engine passed for opening equity + current-period revenue/expense and produced a balanced CRA validity equation.
- Full `npm test` / Electron installer build remains blocked in this container because npm dependencies cannot be downloaded from the registry (network name resolution is disabled here). A real patched EXE must not be falsely produced by renaming/copying the old installer.
