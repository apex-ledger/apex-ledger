import type { CoaTemplate } from './coaTemplateTypes';

// GIFI codes below are cross-checked against CRA's own published GIFI examples ("Example 1 —
// Financial statements for a corporation" / "Example 2 — Financial statements for a
// partnership", General Index of Financial Information (GIFI) guide, canada.ca) — see
// gifi_codes.seed.ts for the full list and per-row confidence (CONFIRMED / SECONDARY /
// UNVERIFIED). Where a category isn't covered by either example, the code is left blank rather
// than guessed — the accountant can assign one from the GIFI picker when they know it.
export const GENERAL_SERVICES_TEMPLATE: CoaTemplate = {
  id: 'general_services',
  label: 'General / Professional Services',
  description: 'A general-purpose chart of accounts for a services-based business with no inventory.',
  accounts: [
    // Assets
    { code: '1000', name: 'Chequing Account', accountType: 'Asset', accountSubtype: 'Cash and Bank', gifiCode: '1002' },
    { code: '1005', name: 'Savings Account', accountType: 'Asset', accountSubtype: 'Cash and Bank', gifiCode: '1002' },
    { code: '1010', name: 'Cash Account', accountType: 'Asset', accountSubtype: 'Cash and Bank', gifiCode: '1001' },
    { code: '1180', name: 'Short-Term Investments', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1180' },
    { code: '1200', name: 'Accounts Receivable', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1060' },
    // A contra-asset — a reserve for AR that's realistically not collectible, so it carries a
    // CREDIT balance and reduces AR's net total shown on the Balance Sheet, rather than a
    // negative number typed anywhere. Same convention as the Accumulated Depreciation accounts
    // below reducing their own paired fixed asset.
    { code: '1210', name: 'Allowance for Doubtful Accounts', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1061' },
    { code: '1240', name: 'Notes Receivable', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1243' },
    // Money advanced to an employee (e.g. before a business trip, or a payroll advance) — expected
    // back, either repaid in cash or deducted from a future paycheque, so it's a receivable, not an
    // expense, until then.
    { code: '1270', name: 'Employee Advances', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1071' },
    { code: '1400', name: 'Prepaid Expenses', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1484' },
    { code: '1600', name: 'Land', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1600' },
    { code: '1610', name: 'Buildings', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1680' },
    { code: '1611', name: 'Accumulated Amortization - Buildings', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1681' },
    { code: '1700', name: 'Computer Equipment', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1774' },
    { code: '1701', name: 'Accumulated Depreciation - Computer Equipment', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1775' },
    { code: '1710', name: 'Furniture & Equipment', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1787' },
    { code: '1711', name: 'Accumulated Depreciation - Furniture & Equipment', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1788' },
    { code: '1720', name: 'Leasehold Improvements', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1918' },
    { code: '1721', name: 'Accumulated Amortization - Leasehold Improvements', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1919' },
    { code: '1730', name: 'Vehicles', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1742' },
    { code: '1731', name: 'Accumulated Depreciation - Vehicles', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1743' },
    // Heavier equipment than the office-oriented Furniture & Equipment above — machinery, tools,
    // shop/production equipment.
    { code: '1740', name: 'Machinery & Equipment', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1740' },
    { code: '1741', name: 'Accumulated Amortization - Machinery & Equipment', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1741' },
    { code: '1750', name: 'Long-Term Investments', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '2300' },
    { code: '1760', name: 'Mortgages Receivable', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '2361' },
    { code: '1250', name: 'GST/HST Recoverable', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1066' },
    // Money the company has lent to a shareholder — CRA generally requires repayment within one
    // year of the corporate year-end (s.15(2)) or it's included in the shareholder's income.
    { code: '1260', name: 'Loan to Shareholder', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1300' },
    // A temporary holding account for a bank-side mistake (e.g. an accidental double withdrawal
    // that the bank reverses a day or two later) — post BOTH the erroneous withdrawal and its
    // reversal here instead of a real expense/revenue account, so the two net to zero and never
    // touch the Income Statement. Not a CRA-defined line, so left without a GIFI code — a healthy
    // set of books should keep this account at $0 once every entry in it is resolved.
    { code: '1290', name: 'Suspense Account (Bank Errors)', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1480' },

    // Liabilities
    { code: '2100', name: 'Accounts Payable', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2621' },
    // A line of credit or overdraft protection tied directly to the bank account itself — distinct
    // from Line of Credit below, which covers a separate, standalone credit facility.
    { code: '2110', name: 'Bank Overdraft', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2600' },
    // Costs already incurred but not yet invoiced or paid (e.g. a utility bill for services used
    // this month that won't arrive until next month) — the catch-all CRA calls "amounts payable
    // and accrued liabilities" alongside the more specific Accounts Payable (an actual invoice on
    // hand) and Wages Payable below.
    { code: '2120', name: 'Accrued Liabilities', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2620' },
    // Payroll already earned by employees but not yet paid out as of the balance sheet date —
    // distinct from Payroll Remittances Payable below, which is the CPP/EI/tax withheld FROM pay
    // already issued, owed to CRA rather than to the employees themselves.
    { code: '2130', name: 'Wages Payable', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2624' },
    { code: '2200', name: 'Income Taxes Payable', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2680' },
    // Money already received for a sale/service not yet delivered — recognized as revenue only
    // once earned. "Current" here covers what's expected to be delivered within a year.
    { code: '2250', name: 'Deferred Revenue (Current)', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2770' },
    { code: '2280', name: 'GST/HST Payable', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2680' },
    { code: '2300', name: 'Payroll Remittances Payable', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2627' },
    // Money received up front from a customer before the work/goods are delivered — e.g. a
    // deposit on a custom order or a retainer — stays a liability until earned.
    { code: '2350', name: 'Customer Deposits', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2961' },
    // Declared but not yet actually paid out — the moment between a board resolution to pay a
    // dividend and the cheque/transfer clearing. Once paid, the SAME amount also debits Dividends
    // Paid (an Equity account, see below) — this account is the in-between liability, not a
    // duplicate of that one.
    { code: '2360', name: 'Dividends Payable', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2962' },
    // Money the company owes a shareholder that's expected to be settled within a year — the
    // short-term counterpart to Due to Shareholder (Long-Term) below. A real shareholder loan
    // (e.g. "Loan - [Name]") often belongs here rather than under Long-Term, unless there's a
    // formal repayment term stretching past 12 months.
    { code: '2370', name: 'Due to Shareholder (Current)', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2780' },
    // The portion of a longer loan (see Long-Term Debt, Mortgage Payable, Vehicle Loan below) due
    // within the next 12 months — moved here from Long-Term at each year-end so the Balance Sheet
    // correctly reflects it as a current obligation.
    { code: '2380', name: 'Current Portion of Long-Term Debt', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2920' },
    { code: '2500', name: 'Long-Term Debt', accountType: 'Liability', accountSubtype: 'Long-Term Liability', gifiCode: '3143' },
    { code: '2550', name: 'Line of Credit', accountType: 'Liability', accountSubtype: 'Long-Term Liability', gifiCode: '3149' },
    { code: '2600', name: 'Mortgage Payable', accountType: 'Liability', accountSubtype: 'Long-Term Liability', gifiCode: '3141' },
    // A dedicated loan for a financed vehicle — kept separate from the generic Long-Term Debt
    // above so a specific vehicle's remaining balance is easy to track against its own asset
    // account (Vehicles, in Assets above) without digging through a mixed-purpose loan.
    { code: '2610', name: 'Vehicle Loan', accountType: 'Liability', accountSubtype: 'Long-Term Liability', gifiCode: '3143' },
    { code: '2650', name: 'Deferred Revenue (Long-Term)', accountType: 'Liability', accountSubtype: 'Long-Term Liability', gifiCode: '3220' },
    // Financed equipment (a capital/finance lease) or an equipment loan — same idea as Vehicle
    // Loan above, kept distinct from a vehicle-specific loan and from Long-Term Debt in general.
    { code: '2660', name: 'Equipment Loan / Capital Lease Obligation', accountType: 'Liability', accountSubtype: 'Long-Term Liability', gifiCode: '3321' },
    // The long-term counterpart to Due to Shareholder (Current) above — money the company owes a
    // shareholder with a repayment horizon past 12 months.
    { code: '2700', name: 'Due to Shareholder (Long-Term)', accountType: 'Liability', accountSubtype: 'Long-Term Liability', gifiCode: '3260' },
    { code: '2050', name: 'Visa', accountType: 'Liability', accountSubtype: 'Credit Card', gifiCode: '2707' },
    { code: '2060', name: 'Mastercard', accountType: 'Liability', accountSubtype: 'Credit Card', gifiCode: '2707' },

    // Equity
    { code: '3000', name: 'Common Shares', accountType: 'Equity', accountSubtype: 'Share Capital', gifiCode: '3500' },
    { code: '3010', name: 'Preferred Shares', accountType: 'Equity', accountSubtype: 'Share Capital', gifiCode: '3520' },
    // Capital contributed by a shareholder without new shares being issued in exchange — most
    // commonly a shareholder loan formally forgiven/waived and documented as a capital
    // contribution rather than income.
    { code: '3020', name: 'Contributed Surplus', accountType: 'Equity', accountSubtype: 'Equity', gifiCode: '3541' },
    { code: '3620', name: 'Retained Earnings', accountType: 'Equity', accountSubtype: 'Equity', gifiCode: '3600' },
    // A contra-equity account — reduces total equity, so its balance nets NEGATIVE on the Balance
    // Sheet (debit it when a dividend is paid out, credit the bank account) rather than needing a
    // negative amount typed anywhere. See openingBalanceEquity.ts for how a starting balance for
    // this account is entered (signed, unlike Asset/Liability starting balances).
    { code: '3700', name: 'Dividends Paid', accountType: 'Equity', accountSubtype: 'Equity', gifiCode: '3700' },

    // Revenue
    { code: '4000', name: 'Service Revenue', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8000' },
    { code: '4100', name: 'Consulting Fees', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8241' },
    { code: '4200', name: 'Commission Income', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8120' },
    { code: '4300', name: 'Rental Income', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8140' },
    // Money received back for something the business already reported as an expense elsewhere
    // (an insurance payout, a management fee billed to a related company) — distinct from a
    // vendor refund/rebate below, which nets against Cost of Sales/Expenses instead.
    { code: '4400', name: 'Management & Administration Fees Income', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8239' },
    // Government/program funding received — a wage subsidy, a regional development grant, etc.
    { code: '4500', name: 'Grants & Subsidies', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8242' },
    // Realized gain (or loss, if negative) on selling a fixed asset for more/less than its net
    // book value — a normal, occasional event (trading in a work vehicle, selling old equipment),
    // not an operating source of income.
    { code: '4600', name: 'Gain/Loss on Disposal of Assets', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8210' },
    // The CAD value swing on a foreign-currency (USD) transaction between when it was booked and
    // when it actually settled — this app's own FX conversion (Bills/Invoices/Quick Entry) already
    // computes the CAD amount at booking time; this account is where a settlement-date difference,
    // if tracked, would post. A loss here is a negative amount, same convention as any other
    // revenue-side contra.
    { code: '4700', name: 'Foreign Exchange Gain/Loss', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8231' },
    { code: '4900', name: 'Interest Income', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8090' },
    { code: '4950', name: 'Other Revenue', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8230' },
    // A refund paid OUT to a customer (overpayment, dissatisfied client, etc.) — posted as a debit
    // here to net against revenue, the same convention Retail's Sales Returns & Allowances uses.
    { code: '4990', name: 'Customer Refunds & Returns', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8000' },

    // Expenses
    { code: '5000', name: 'Advertising & Promotion', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { code: '5010', name: 'Bank Charges', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { code: '5015', name: 'Merchant / Credit Card Processing Fees', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { code: '5020', name: 'Insurance', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { code: '5030', name: 'Interest & Bank Charges - Long-Term Debt', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { code: '5035', name: 'Cost of Goods Sold', accountType: 'Expense', accountSubtype: 'Cost of Sales', gifiCode: '8518' },
    { code: '5040', name: 'Office Supplies', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { code: '5041', name: 'Office Expenses', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { code: '5045', name: 'Software & Subscriptions', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { code: '5050', name: 'Legal & Accounting Fees', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8860' },
    { code: '5060', name: 'Meals & Entertainment', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8523' },
    { code: '5070', name: 'Motor Vehicle Expenses', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { code: '5075', name: 'Vehicle Lease', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8915' },
    { code: '5080', name: 'Amortization Expense', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8670' },
    { code: '5090', name: 'Rent / Lease', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { code: '5095', name: 'Property Tax', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9180' },
    { code: '5100', name: 'Salaries, Wages & Benefits', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9060' },
    // A distinct line from the salaries/wages above — group insurance, RRSP matching, and other
    // benefit costs an employer provides beyond gross pay itself. Separate from Payroll
    // Remittances Payable (a Liability, the CPP/EI amount withheld and owed to CRA).
    { code: '5105', name: 'Employee Benefits', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8620' },
    // Commission paid out to salespeople — separate from Commission Income (Revenue) above, which
    // is commission the business itself earns.
    { code: '5107', name: 'Sales Commissions Paid', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9061' },
    { code: '5110', name: 'Subcontract Costs', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9110' },
    { code: '5120', name: 'Telephone', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9225' },
    // Kept distinct from Telephone above — most bookkeepers track internet service as its own
    // line, and CRA's own detailed GIFI list has a dedicated code for it.
    { code: '5121', name: 'Internet', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9152' },
    { code: '5125', name: 'Utilities', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9220' },
    { code: '5130', name: 'Travel Expenses', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9200' },
    { code: '5140', name: 'Dues & Subscriptions', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8761' },
    { code: '5150', name: 'Training & Education', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8876' },
    { code: '5160', name: 'Charitable Donations', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8522' },
    // Fees paid for a business license, permit, or registration — the QuickBooks-familiar
    // "Licenses and Permits" category, distinct from Dues & Subscriptions (a membership) above.
    { code: '5170', name: 'Licenses & Permits', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8764' },
    // The specific cost of writing off a customer invoice that's realistically never getting
    // collected — distinct from Allowance for Doubtful Accounts (an Asset contra-account, the
    // running reserve estimate) in the Chart of Accounts' Assets section above.
    { code: '5180', name: 'Bad Debt Expense', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8590' },
    { code: '5190', name: 'Postage & Delivery', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9275' },
    { code: '5200', name: 'Storage', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8917' },
    { code: '5210', name: 'Security', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9013' },
    { code: '5220', name: 'Waste Removal', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9014' },
    // A catch-all for costs directly tied to closing a sale (trade show booths, sample products,
    // sales collateral) that don't fit neatly under Advertising & Promotion above.
    { code: '5230', name: 'Selling Expenses', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9273' },
    { code: '5240', name: 'Research & Development', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9282' },
    // A genuine CRA-recognized catch-all distinct from "Other Operating Expenses" below (which
    // maps to the truly-uncategorized 9270 line) — for overhead that's clearly G&A but doesn't fit
    // a more specific line above.
    { code: '5250', name: 'General & Administrative Expenses', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9284' },
    { code: '5900', name: 'Other Operating Expenses', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    // A refund received back IN from a vendor (overpayment, duplicate charge, price correction) —
    // posted as a credit here to net against expenses instead of showing up as new revenue, which
    // would overstate both what you spent and what you earned.
    { code: '5990', name: 'Vendor Refunds & Rebates', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '9270' },
  ],
};
