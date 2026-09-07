# Apex Ledger field-to-report data-flow audit

Date: 2026-09-01  
Build inspected: 0.1.330-alpha.4 source tree

## Status legend

- **Verified** — saved through validation and database storage, posted to the ledger where applicable, and exercised by an automated accounting/data-flow check.
- **Stored / reference** — intentionally saved for documents, search, schedules, or compliance support; it does not change ledger balances.
- **Non-posting until action** — the form is a draft, quote, commitment, or operational record until the named posting/conversion action occurs.
- **Partial** — the data is saved and useful, but its downstream reporting or drill-through is incomplete.

## Accounting backbone

Every final financial statement is driven by **posted journal-entry lines**, not by copying totals from entry screens. Draft and void entries are excluded from financial totals. The primary chain is:

`entry form -> validation -> document/subledger row + posted journal entry (one database transaction) -> GL -> Trial Balance -> P&L / Balance Sheet / Cash Flow / tax and compliance reports`

The comprehensive demo check confirmed SQLite integrity, balanced debits and credits, A/R, A/P, GST/HST, payroll, payment settlement, and the balance-sheet equation.

## Entry forms and every material field group

| Screen / boxes or columns | Storage and posting | Final outputs | Status |
|---|---|---|---|
| Company: legal/display name, fiscal year end, base currency, BN, HST/payroll numbers, business type, addresses, WSIB | Company settings; no journal | Invoice/forms headers, payroll slips, compliance identity, fiscal defaults | Stored / reference |
| Chart of Accounts: name, type/subtype, parent, GIFI, description, account number, transfer eligibility, master flag | Accounts table; master accounts cannot receive postings | All account selectors, GL/TB/statements, GIFI/T2, bank/reconciliation | Verified. Real account number saves and appears in the GL account heading; internal sort code remains hidden in user-facing labels. |
| Opening balances: account, debit/credit, date | Posted opening journal | GL, TB, P&L/BS, cash flow, GIFI | Verified |
| Customer: name, email, phone, mailing address, notes, terms | Customer master; no journal | Search, invoices/receipts/estimates, customer activity and statements | Stored / reference |
| Vendor: name, email, phone, address, notes, default expense, terms, T4A/T5018 flags and SIN/BN | Vendor master; no journal | Bill/PO defaults, vendor workspace, expense-by-vendor, T4A/T5018 | Verified for linkage; identity/contact boxes are reference data |
| Product/service: SKU, name, description, unit, sale price, purchase cost, income/COGS/asset accounts, track quantity | Product master; no journal until used | Item list, invoice, sales receipt/POS, bill, PO, inventory status/continuity | Verified |
| Quick Entry: expense/income, date, money account, category, base, tax code/custom tax, tax amount, description, vendor/customer, period covered, currency/foreign amount/rate | Atomic posted journal with base/tax/contact/FX metadata | GL, TB, P&L, BS, cash flow, HST detail/summary, vendor/customer analysis | Verified. “Period covered” is informational and does not allocate an amount across months. |
| Bulk expense import: row date, description, amount, category, tax, contact | Creates reviewable client-import journals; rows may remain draft | Journal/adjusting-entry review; final statements only after posting | Verified; non-posted drafts are intentionally excluded |
| Bank/QB import: bank account, date, description, amount, category, tax, contact, include/exclude | Progress/exclusions saved; accepted rows create journals with source fingerprint | GL/statements, reconciliation, adjustment/audit trail | Verified; duplicate/reference protection present |
| Manual Journal: date, memo, reference, period, adjusting/source, account, debit, credit, description, tax/base/manual HST, contact, FX | Journal header and lines; financial reports read posted lines | Every ledger-derived report, adjustment report, audit trail | Verified |
| Bill: vendor, supplier invoice number, bill/due date, terms, category/product, quantity, base, tax code, recoverable tax, total, currency, memo, receipt | Bill and lines plus atomic Dr category/inventory + Dr recoverable HST / Cr A/P | A/P, bills, vendor workspace, expenses-by-vendor, HST/ITC, GL/statements, source evidence | Verified |
| Bill approval: status, approver, timestamp, note | Bill approval metadata; no balance change | Bill Approval report | Verified |
| Bill payment: bill, date, amount, bank, memo | Dr A/P / Cr bank; partial-payment history retained | A/P balance, vendor activity, cheque/cash/GL reports | Verified |
| Invoice: customer, number, invoice/due date, terms, memo, product/service, description, quantity, price, revenue account, tax code/manual tax, discount, currency | Invoice/lines plus atomic Dr A/R / Cr revenue / Cr HST; discount posts to Customer Discounts expense; tracked items also post COGS/inventory | A/R, sales/customer reports, customer P&L, HST, inventory, GL/statements | Verified |
| Invoice payment: invoice, payment date, amount, deposit-to or Undeposited Funds, memo | Dr money/undeposited / Cr A/R; complete partial-payment history | A/R, deposits, cash/GL/customer statement | Verified |
| Bank deposit: selected customer payments/sales receipts, bank, date | Dr bank / Cr Undeposited Funds, atomic links to selected receipts | Deposit history, bank analysis, reconciliation, cash/GL | Verified |
| Sales receipt/POS: customer, number/date, memo, deposit-to, products/services, quantity, price, revenue account, tax, currency | Dr money / Cr revenue/HST; tracked stock atomically posts COGS/inventory | Sales/customer, HST, inventory, GL/statements | Verified |
| Estimate: customer, number/date/expiry, memo, lines, price, tax, product | Estimate and lines only; conversion creates invoice once | Estimate list; financial reports only after conversion | Non-posting until conversion; verified conversion safety |
| Purchase order: vendor, number/order/expected dates, memo, product/category, quantity, price, tax | PO commitment only. Goods receipt posts inventory/GRNI; bill conversion/match posts A/P and recoverable tax | PO list, inventory/GRNI after receipt, bills/A/P/HST after billing | Verified, including partial receipt and reversal |
| Credit note: customer/vendor, number/date, contact, category, quantity, price, tax, memo | Reverses revenue/expense and GST/HST; creates A/R or A/P credit; apply/refund posts settlement | A/R/A/P, HST, GL/statements, credit history | Verified, including undo/reopen |
| Inventory adjustment: product, date, quantity, inbound cost, funding/counter-account, movement type, note | Inventory movement and GL commit together; weighted-average cost used for issues | Inventory status/continuity, COGS, BS inventory, GL | Verified |
| Employee: name, province, pay type/rate, frequency, vacation, SIN/TD1, additional tax, benefits/RRSP, address | Employee master; no journal | Pay calculation, paystubs, T4, payroll reports | Stored / reference |
| Pay run: employee, pay period, pay date, hours, overtime, deductions, benefits | Draft calculation first; Post creates wages/benefits/remittance liabilities and bank entry | Payroll register, paystub, PD7A, T4, GL/statements | Verified, including reversal |
| Shareholder/T5: identity/address/SIN/BN/loan account; payment date/type/amount/bank/memo | Master plus posted T5 payment journal | T5 slips, shareholder continuity, GL/equity/cash | Verified linkage |
| HST return: period, filing date, payment account, memo | Recalculates collected/ITCs from posted lines and posts settlement; stored filing snapshot | HST Summary, category support, reconciliation, CRA boxes, GL | Verified. Filing date alone does not lock entry; an accountant-controlled fiscal lock does. |
| Mileage: trip date, kilometres, purpose, vehicle, start/end | Trip is operational until claim; claim posts expense/payable | Mileage log and GL/statements after claim | Verified, including reversal |
| Bank reconciliation: account, statement date, opening/ending balance, cleared rows | Reconciliation metadata on journal lines; no new income/expense | Reconciliation report and cleared status | Verified |
| Tags: group, tag, journal-line assignment | Tag metadata/line junction | P&L by Tag | Verified where lines are tagged; untagged activity is shown separately |
| Budget: name/year/note, account/month amount | Budget tables; never journalized | Budget vs Actual (actual side comes from posted ledger) | Verified |
| CCA pool: year, class, opening UCC, additions, dispositions, rate, claim, note | Tax schedule only | CCA schedule, fixed-asset continuity, T2 support | Partial: it does not automatically create the depreciation/CCA journal entry |
| Loan: lender, principal, rate, frequency, term, start, liability/interest accounts | Loan schedule only | Loan schedule and debt continuity compared with linked GL balance | Partial: scheduled principal/interest does not automatically post payments |
| Workpapers: year end, account status, note, attachment | Review metadata per account/year; balances read live ledger | Working paper review with prior/current/change/adjustments | Partial: account click opens GL but does not pass the selected account and workpaper dates |
| Audit File: engagement year/status, materiality boxes, workpaper content, preparer/reviewer, queries, lock | Audit engagement tables only | Audit file index/progress | Partial: manual materiality and narrative workpapers are not yet embedded/linked to live reports or frozen report snapshots |
| CRM, appointments, reminders, client file path, user invitations/roles | Operational/access data, not accounting journals | CRM/access screens only | Stored / reference; correctly excluded from financial statements |

## Final report lineage

| Report family | Source of truth | Coverage result |
|---|---|---|
| General Ledger / Journal | Posted journal headers and lines; joins account/contact and document type | Verified; transaction type, tax/base, FX and source navigation available |
| Trial Balance / Working Trial Balance | Posted journal lines through as-of/period date | Verified; balances roll into statements |
| Income Statement / detail / by customer / by tag | Posted Revenue and Expense lines | Verified; customer/tag analyses depend on contact/tag carried on the journal line |
| Balance Sheet / variants / changes in equity | Posted Asset, Liability and Equity lines plus current earnings | Verified; comprehensive demo balanced |
| Cash Flow / cheque register / bank analysis | Posted money-account movements | Verified |
| A/R “Who owes us” / customer statement / sales by customer | Invoice/payment subledger plus customer-linked journal activity | Verified |
| A/P “Whom we owe” / vendor workspace / expenses by vendor | Bill/payment subledger plus vendor-linked journal activity | Verified |
| GST/HST summary, detail, reconciliation and working paper | Tax metadata, base cents, payable/recoverable accounts and filed return | Verified, including category revenue/expense base and tax totals |
| Inventory status and continuity | Product master + dated inventory movements; GL carries inventory/COGS value | Verified |
| Payroll register / PD7A / T4 / T4A / T5018 / T5 | Employee/vendor/shareholder masters + posted runs/payments/bills | Verified for implemented slip calculations |
| GIFI / T2 reconciliation / T2125 | Account GIFI mapping + posted ledger | Verified; unmapped accounts are called out rather than silently omitted |
| Audit trail / adjusting entries | Journal revision log and entry source | Verified for journal changes/import sources |
| Source Documents & Missing Evidence | Bills, invoices and unmatched manual journals | **Partial:** sales receipts, credit notes, payroll, inventory receipts, deposits, mileage, T5 and HST filing are not enumerated as separate source-document rows |
| CCA, debt and shareholder continuity | Schedule/master records compared with related ledger accounts | Verified as reconciliation/support schedules, not automatic postings |
| Audit Engagement File | Manual engagement records | **Partial:** no automatic report embedding, cross-reference IDs, refresh/freeze, risk/assertion/procedure linkage, or live materiality benchmark |

## Cross-cutting controls checked

- Posted documents and their journal entries are created in one database transaction.
- Reversals void linked journals and update/remove the matching subledger rows together.
- Direct deletion/void of document-owned journal entries is blocked; correction must begin from the source document.
- Dates drive period reports; drafts and voids do not enter final balances.
- A global Report Period control and Excel/PDF/copy actions wrap report routes. Reports with their own date boxes receive the chosen range; one-date reports use the To date.
- Non-date master lists and standing schedules (for example Chart of Accounts) do not meaningfully use a From/To range.
- Report export reads the currently rendered table so exported rows match visible filters/dates.
- “Trace Source Entries” is globally available, and transaction-level reports provide source/GL navigation where a journal ID exists.

## Automated checks run for this audit

The following checks passed on 2026-09-01:

1. Comprehensive demo accounting and balance-sheet equation
2. Invoice product entry and 13% HST arithmetic
3. Sales receipt HST
4. Sales-tax category base/HST breakdown
5. Shared item catalogue and inventory links
6. Business-document to GL drill-back
7. Entry actions and report source trace
8. CRA/CPA compliance report routing/query/export
9. Credit application/refund undo
10. Partial payment history and reversal
11. Payroll reversal
12. Purchase-order receipt reversal
13. Estimate/PO conversion safety
14. Inventory movement reversal

## Required follow-up before calling the complete audit system “fully connected”

1. Pass account ID and workpaper period into the Workpapers-to-GL link.
2. Expand Source Documents & Missing Evidence to every posted document family.
3. Link audit documents to report IDs/account IDs/journal IDs and supporting attachments.
4. Allow materiality benchmark amounts to be pulled from a selected live report line, with an explicit refresh/freeze date.
5. Store immutable report snapshots/checksums when an engagement is locked.
6. Add risks, assertions, planned procedures, samples, exceptions and conclusions as structured links rather than narrative-only text.
7. Add an end-to-end engagement test proving: source document -> journal -> trial balance -> financial/tax report -> workpaper cross-reference -> locked snapshot.

