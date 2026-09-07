# Essentials: Sales, Expenses and HST

Apex Ledger Essentials accepts only three tax choices:

- `hst_13` — calculates 13% and rounds once to the nearest cent
- `hst_exempt` — records zero tax
- `manual_hst` — uses an explicit whole-cent amount entered by the user

## Automatic ledger posting

A sale posts debit Bank for the total, credit Revenue for the base and credit
GST/HST Payable for tax collected. An expense posts debit Expense for the base,
debit GST/HST Recoverable for the ITC and credit Bank for the total. Exempt
transactions omit the zero-value tax line.

The visible business transaction and its journal entry are created in one
database transaction. If validation, account selection, subscription access,
period locking or journal balancing fails, neither record is committed.

## Sales-tax summary

For a selected date range the API returns:

- sales/revenue before tax
- HST collected from customers
- expenses before tax
- HST/ITC paid to vendors
- net HST payable, calculated as collected minus ITC

## Corrections

Posted business transactions and their journal lines are immutable. The future
correction workflow will create a linked reversal and replacement instead of
editing or deleting accounting history.
