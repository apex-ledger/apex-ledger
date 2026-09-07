# Northwind Bookkeeping Test Co. — what every screen should show

Generated 2026-09-03 by `scripts/create-fictitious-company.mjs` from the numbers the app
itself produced while building the company. Open the company (Welcome → *Open test company*, or
File → Open → `Northwind Bookkeeping Test Co.company`) and check each screen against this sheet.
Every figure below was computed by the same code the report screens run, so a mismatch is a bug in
the screen, not in the sheet.

## The company

Bookkeeping / accounting firm in Toronto, ON, HST registrant, fiscal year ending December 31.
Activity runs January to August 2026. Three sign-ins are set up (Users & Access): Alex Admin,
Priya Accountant, Jordan Bookkeeper — switch between them from the dropdown in the green bar.

| Records | Count |
|---|---|
| customers | 5 |
| vendors | 5 |
| invoices | 8 |
| bills | 15 |
| payrollRuns | 10 |
| employees | 2 |
| estimates | 2 |
| purchaseOrders | 3 |
| creditNotes | 2 |
| salesReceipts | 2 |
| deposits | 1 |
| hstFilings | 1 |
| mileageTrips | 5 |
| users | 3 |

## Sales → Customers / Invoices

Open invoices (**5**, total **$2,868.00**) — Reports → Accounts Receivable Ageing must agree:

| number | due | balance |
|---|---|---|
| INV-1007 | 2026-09-30 | $452.00 |
| INV-1006 | 2026-07-30 | $495.00 |
| INV-1008 | 2026-07-15 | $1,356.00 |
| INV-1005 | 2026-05-30 | $300.00 |
| INV-1003 | 2026-03-25 | $265.00 |

- **INV-1001** paid in full straight to Chequing on 2026-02-20.
- **INV-1002** paid into Undeposited Funds, then banked in the 2026-03-21 deposit with sales receipt SR-2002.
- **INV-1003** partly paid ($300.00 of $565.00); the payment is still in Undeposited Funds — *Make Deposit* must offer it.
- **INV-1004** sold 2 Receipt Scanner Kits from stock — Items & Prices must show the quantity going out, and P&L must carry their cost.
- **INV-1005** HST-exempt training for the non-profit, due on receipt, unpaid → overdue.
- **INV-1006** the T2 return: $200.00 of credit note CN-0001 applied, $100.00 of it refunded to Spruce on 2026-07-12, then $1,000.00 received; balance still open.
- **INV-1007** August bookkeeping, not yet due.
- **Credit note CN-0001** should read *refunded*, with "Undo Settlement" available; its journal links should open.

## Purchases → Bills / Vendors

Open bills (**5**, total **$3,551.60**) — Reports → Accounts Payable Ageing must agree:

| number | due | balance |
|---|---|---|
| STP-51022 | 2026-09-10 | $248.60 |
| RENT-2026-08 | 2026-08-15 | $2,260.00 |
| AMZ-80211 | 2026-07-12 | $452.00 |
| HYD-2026-Q2 | 2026-06-03 | $308.50 |
| STP-44810 | 2026-03-14 | $282.50 |

- Rent is billed monthly Jan–Aug; Jan–Jul are paid, **RENT-2026-08** is open.
- **STP-44810** had vendor credit **VC-0001** ($56.50) applied against it — Bills & payments on Staples should show it settled by credit, not cash.
- **HYD-2026-Q2** is partly paid ($200.00 of $508.50).
- **STP-MEAL-1** used the Meals code — only half the HST is claimable; the other half sits in the expense.
- **PO-4001** was received into stock (5 kits) and matched to supplier invoice **AMZ-80211**; **PO-4002** was converted straight to bill **STP-51022**; **PO-4003** is still open.

## Payroll

9 posted runs (gross **$27,600.00**), 1 draft — Kim's April run is waiting to be posted from the Payroll screen.
Sam Patel is hourly (75 h a fortnight at $28.00), Kim Nguyen is salaried ($60,000 monthly-paid). PD7A for January–March must show CPP/EI/tax matching the paystubs.

## Inventory

Receipt Scanner Kit on hand: **13** (10 bought on AMZ-77120 − 2 sold on INV-1004 + 5 received on PO-4001).

## Banking

| Account | Balance at 2026-08-31 |
|---|---|
| Chequing Account | $2,878.31 |
| Savings Account | $10,000.00 |
| Undeposited Funds | $300.00 |

Undeposited Funds should equal exactly INV-1003's $300.00 partial payment.

## Sales tax (HST Centre)

Q1 2026 has been **filed** on 2026-04-20 and paid from Chequing; Q2 is ready to file; Q3 is in progress.
Posting a taxed entry dated inside Q1 must be refused with "Reopen that return".

| period | collected | itcs | net |
|---|---|---|---|
| 2026-Q1 | $209.30 | $932.10 | $-722.80 |
| 2026-Q2 | $409.50 | $890.50 | $-481.00 |
| 2026-Q3 | $13.00 | $553.80 | $-540.80 |

## Reports

| Report | Expected |
|---|---|
| Trial Balance (2026-08-31) | debits $68,054.28 = credits $68,054.28 — balanced |
| Profit and Loss (2026-01-01 to 2026-08-31) | revenue $5,160.00, cost of sales $160.00, expenses $48,640.87, **net income $-43,640.87** |
| Balance Sheet (2026-08-31) | assets $19,253.41 = liabilities $12,894.28 + equity $6,359.13 — balances |

## Things to try that must be refused

- Pay INV-1003 with a date before 2026-03-10 → "a payment cannot precede the document it settles".
- Deactivate Maple Consulting Group → refused, it has an unpaid invoice.
- Create a bill for Spruce Retail as a vendor → not offered; add a vendor with the name "Bell Canada" → duplicate refused.
- Run payroll for Sam for 2026-01-01 to 2026-01-14 again → duplicate period refused.
- Post a journal with an HST line dated 2026-02-15 → filed-return lock.
- Apply more of a credit than remains → refused with the remaining amount.

## Things that should just work

- Ctrl+K: type `1003`, `Bell`, `kit`, `Sam`, `ageing` — each finds its record.
- Receive Payment from the toolbar → pick Birch & Co. → INV-1003 appears with $265.00 due.
- Customers → *Invoices & payments* on Maple shows three invoices and two payments with the journal links.
- Invoice editor for a firm shows the Services rail with priced services (T1 $250.00, Monthly Bookkeeping $400.00, T2 $1,500.00).
- Users & Access → Sign-in history shows the current session.
