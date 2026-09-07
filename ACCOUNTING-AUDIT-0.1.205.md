# North Ledger 0.1.205 development checkpoint

## Financial statement regression gate

For every test company and fiscal period, North Ledger must prove:

1. Trial Balance: total debits = total credits.
2. Balance Sheet: Assets = Liabilities + Equity, including current/unclosed earnings.
3. Profit & Loss: revenue and expense accounts use only the selected reporting period.
4. Retained Earnings: prior closed earnings plus current-year treatment agrees with equity presentation.
5. Accounts Receivable and Accounts Payable control balances reconcile to open subledgers.
6. Inventory Asset reconciles to inventory valuation.
7. GST/HST control accounts reconcile to tax detail subject to filed-period adjustments.
8. GIFI totals reconcile to the same GL/reporting basis rather than a separate calculation universe.

## Comparative reporting rules
- Balance Sheet comparisons are point-in-time/as-of-date.
- P&L comparisons are period-to-period.
- Current year and prior year must not share cached company/account data after company switch.

## Closing controls
Year-end close must not destroy transaction history. Closing/retained-earnings presentation is report-driven or supported by explicit closing journals, and opening balances must remain traceable.

## Next gate
Build regression fixtures covering cash sale, credit sale, partial receipt, inventory sale, PO/GRNI/bill match, partial vendor payment, HST filing/settlement, credit note/reversal, and year-end reporting.
