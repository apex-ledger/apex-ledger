# Lakeshore Plumbing & Heating Inc. — final acceptance company

Built 2026-09-06 by `scripts/create-final-test-company.mjs`. Every record went through the app's own
handlers, exactly as if it had been typed on the screen. The file is at:

    D:\ApexLedger Demo Companies\Lakeshore Plumbing FINAL TEST.company

Open it with File → Open Company. A JSON summary of the figures the app computed while building
it sits beside the file.

## The business

Plumbing and heating contractor, Toronto, HST registrant filing quarterly, fiscal year ending
December 31. Activity runs January to August 2026. Associated with another employer, so Ontario
EHT applies from the first dollar (no exemption). WSIB class G at 2.1%.

| Money accounts | |
|---|---|
| Chequing Account | main operating account |
| TD Business Chequing | second bank; Sam's payroll and the Amex payment come out of here |
| Savings Account | earns quarterly interest |
| Cash Account | the shop cash box |
| Visa | fuel, tools, software, van insurance instalments |
| Mastercard | internet, crew coffee (Meals code), Google Ads |
| American Express | Calgary trip, plumbing code course |

| Records | Count |
|---|---|
| Customers | 11 (one HST-exempt on reserve, one Alberta GST-only, one with 18% late interest) |
| Vendors | 19 (one HST-exempt insurer, one licence office, one Alberta GST-only supplier, one T5018 subcontractor, one duplicate) |
| Invoices | 17 |
| Bills | 36 (27 paid, 9 open) |
| Sales receipts | 3 |
| Credit notes | 2 (one customer, one vendor) |
| Estimates | 2 (one converted to an invoice) |
| Employees | 5 |
| Pay runs | 78 posted, 1 draft |
| HST returns | Q1 filed and paid |

## Payroll

Source deductions for January to July were remitted to CRA on the 15th of the following month (references PD7A-2026-01 to -07). August is still owing.

| Employee | Province | Pay | Frequency | What it exercises |
|---|---|---|---|---|
| Marco Silva | ON | $34.00/h | biweekly | overtime in four periods, vacation paid each period |
| Priya Shah | ON | $58,000 | semi-monthly | union dues (T4 box 44), health benefit, RRSP employer match, April bonus, June mileage reimbursement |
| Dan Okafor | ON | $22.00/h, 24 h/week | weekly | vacation accrued, not paid |
| Lena Fischer | BC | $72,000 | monthly | BC tax tables, taxable vehicle benefit; **July run is a draft** to post from the screen |
| Sam Tremblay | AB | $30.00/h | biweekly from March | Alberta tax tables, paid from TD Business Chequing |

Ontario EHT has been accrued to 2026-06-30. PD7A for any month must agree with the paystubs.

## The nine mistakes, and how to fix each one

| # | What was done wrong | Where you will see it | How to correct it |
|---|---|---|---|
| 1 | Bell bill **BELL-2026-05** was coded to Office Supplies instead of Telephone. | Expenses by Vendor → Bell Canada shows Office Supplies; P&L Telephone is one month short. | Accountant Centre → **Reclassify Transactions**: pick Office Supplies, tick the $95.00 Bell line, move it to Telephone. One adjusting entry is posted on the original date. |
| 2 | The April van-insurance instalment on the Visa was keyed with HST ($40.30 ITC claimed). Insurance is exempt. | HST Payable → by-account breakdown shows Insurance with an ITC; Sales Tax Detail lists it. | Open the entry (Journal Entries or Sales Tax Detail row) → set the line's tax code to **NonHST**, or Quick Entry → **Correct** with tax $0.00. The ITC comes out of Q2. |
| 3 | A second vendor **Bell Canada Inc.** was created and July's bill **BELL-2026-07** was entered on it. | Vendors list shows two Bells; A/P Ageing shows the open July bill under the wrong one. | Expenses → Vendors → open Bell Canada → **Merge duplicate…** → choose Bell Canada Inc. The bill moves over and the duplicate becomes inactive. |
| 4 | Wolseley invoice **WOL-10021** ($2,034.00) was keyed a second time from the packing slip as **10021**. | A/P Ageing shows an open Wolseley bill from January that was actually paid in February. | Expenses → Vendor Bills → open **10021** → **Delete** (it is unpaid, so deletion is allowed). |
| 5 | The 2026-06-14 Shell fuel receipt ($85.00 + HST on Visa) was entered twice. | Two identical entries on June 14 in the General Ledger for Visa / Motor Vehicle. | Journal Entries → open either one → **Find possible duplicates** → **Void** the second. |
| 6 | Lakeside Bakery's payment for **INV-1009** ($1,762.80) was received into Savings. The money went to Chequing. | Banking: Savings is too high, Chequing too low by $1,762.80; Chequing will not reconcile. | Sales → Customers → Lakeside Bakery → INV-1009 → **Reverse last payment**, then **Receive** again into Chequing Account with the same date. |
| 7 | A Canadian Tire tools receipt ($142.00 + HST on Visa) was dated **2025-08-11** instead of 2026-08-11. | It sits before the company's opening balances; the 2026 P&L is short and Visa does not reconcile in August. | Journal Entries → open it → **Change date** to 2026-08-11 (allowed on posted entries; only the date changes). |
| 8 | Enbridge's spring gas bill **ENB-2026-Q2** ($215.00 + HST) was entered under **Toronto Hydro**. | Expenses by Vendor shows Toronto Hydro too high and Enbridge Gas missing Q2; A/P Ageing lists it under Hydro. | Expenses → Vendor Bills → open **ENB-2026-Q2** → **Delete** (unpaid), then **New Bill** for Enbridge Gas with the same number, date, and amount. |
| 9 | Marco Silva's pay run for **2026-05-07 to 2026-05-20** was posted with **40 hours** instead of 80. | Payroll → Marco's paystubs: one net pay about half the others; Employee Earnings shows the dip. | Payroll → open that run → **Reverse**, then **Run Payroll** for the same period with 80 regular hours and post it. The reversal and the new run both stay in the audit trail. |

Fixing all nine changes the figures below. Check them again afterwards: Trial Balance must still
balance, Q2 ITCs drop by $40.30, Bell Canada shows eight bills, Wolseley and Hydro lose one open
bill each, Chequing and Savings swap $1,762.80, and Marco's gross for the year rises by 40 hours.

## What the screens show before any correction

| Report | Expected |
|---|---|
| Trial Balance (2026-08-31) | debits $508,470.46 = credits $508,470.46 |
| Profit and Loss (2026-01-01 to 2026-08-31) | revenue $323,839.60, cost of sales $109,213.24, expenses $217,979.83, net loss $3,353.47 |
| Balance Sheet (2026-08-31) | assets $181,135.39 = liabilities $109,630.86 + equity $71,504.53 |
| Chequing Account | $22,944.43 |
| Savings Account | $6,788.40 (includes the misdirected $1,762.80) |
| Undeposited Funds | $200.00 (Jane Whitfield's partial payment, waiting for Make Deposit) |
| Water heaters on hand | 10 (14 bought, 4 sold) |
| Sump pumps on hand | 4 (10 bought, 2 + 1 + 3 sold) |

### HST by quarter

| Quarter | Collected | ITCs | Net | Status |
|---|---|---|---|---|
| Q1 2026 | $3,184.45 | $6,882.66 | refund $3,698.21 | filed 2026-04-28 |
| Q2 2026 | $30,704.57 | $9,370.40 | owing $21,334.17 | ready to file |
| Q3 2026 | $6,272.50 | $2,283.58 | owing $3,988.92 | in progress |

Posting a taxed entry dated inside Q1 must be refused with "Reopen that return".

### Accounts receivable (open invoices)

| Invoice | Customer | Due | Balance |
|---|---|---|---|
| INV-1005 | Jane Whitfield | 2026-03-20 | $223.75 (partly paid, overdue) |
| INV-1007 | Northgate Dental Clinic | 2026-05-07 | $620.37 (overdue) |
| INV-1010 | Evergreen Property Management | 2026-07-02 | $4,497.40 (overdue; **Charge late interest** at 18%) |
| INV-1011 | Maple Ridge Condominium Corp | 2026-07-30 | $15,255.00 (overdue) |
| INV-1013 | Maple Ridge Condominium Corp | 2026-09-19 | $2,090.50 |
| INV-1014 | Six Nations Housing Authority | 2026-09-25 | $1,910.00 (HST-exempt) |
| INV-1015 | Evergreen Property Management | 2026-09-28 | $51,980.00 (from estimate EST-3001) |

### Accounts payable (open bills)

| Bill | Vendor | Due | Balance |
|---|---|---|---|
| 10021 | Wolseley Plumbing Supply | 2026-02-13 | $2,034.00 — mistake 4 |
| BELL-2026-07 | Bell Canada Inc. | 2026-07-25 | $107.35 — mistake 3 |
| ENB-2026-Q2 | Toronto Hydro | 2026-07-23 | $242.95 — mistake 8 |
| HYD-2026-Q2 | Toronto Hydro | 2026-08-05 | $235.05 (partly paid) |
| BELL-2026-08 | Bell Canada | 2026-08-25 | $107.35 |
| RENT-2026-08 | Harbour Properties (Landlord) | 2026-08-15 | $2,825.00 |
| STP-31427 | Staples Business | 2026-09-05 | $226.00 after vendor credit VC-0001 |
| JR-2026-08 | Jordan Reyes Contracting | 2026-09-12 | $1,084.80 |
| WOL-12007 | Wolseley Plumbing Supply | 2026-09-13 | $11,028.80 |

Bills paid: 27, totalling $145,819.50.

## Things that must be refused

- Pay INV-1005 with a date before 2026-03-20.
- Deactivate Maple Ridge Condominium Corp (it has unpaid invoices).
- Add a vendor named "Bell Canada" (duplicate name).
- Run payroll for Marco for 2026-05-07 to 2026-05-20 again without reversing first.
- Post a journal with an HST line dated 2026-02-15 (Q1 is filed).
- Apply more of credit note CN-0001 than remains (it is fully applied).

## Things that should just work

- Ctrl+K: `1009`, `Wolseley`, `heater`, `Marco`, `ageing` each find their record.
- Any name on any report opens the record in one click; Back returns to the report.
- Sales → Customers → Statements produces a statement for every customer with a balance.
- Payroll → PD7A for June shows CPP, EI and tax matching the June paystubs.
- Business Tax & GIFI export: credit cards on 2707, banks on 1002, cash on 1001.
