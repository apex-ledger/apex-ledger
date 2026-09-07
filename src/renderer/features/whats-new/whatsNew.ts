/** What changed, newest first. One entry per installer; each line is something a bookkeeper would
 * notice on screen, not a code change. The dashboard shows a one-line banner the first time a
 * new version opens; the full list is under More → What's new. */
export interface ReleaseNote {
  version: string;
  date: string;
  headline: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.330-alpha.17',
    date: '2026-09-06',
    headline: 'Bank downloads, cash-basis reports, recurring bills, EHT and statements',
    items: [
      'Import Bank reads OFX, QFX and QBO downloads directly, with no column mapping.',
      'Help & Tutor (the speech-bubble button in the top bar, or More → Help & Tutor): type how to do something and get the steps with a button to the screen; type "teach me payroll" and a lesson opens the real screen and walks through it field by field; type an entry such as "expense 85 dollars 50 fuel at Shell on Visa with HST" and it comes back as a card to confirm before posting; type "new company Lakeshore Plumbing Inc, plumber, year end December 31" to start the company form filled in. Voice is optional and off by default; turn it on in Settings to add the microphone and read-back. Ask questions too: "how much does Maple Ridge owe", "what is the balance of chequing", "how much HST do I owe this quarter", or "how do I file the HST return" for the steps and a button to the screen. The read-back voice and its mood (friendly, calm, gentle, cheerful, professional) are chosen on the panel. Speech is recognised on this computer and audio never leaves it. Typing the sentence works too. Say "teach me quick entry" or "how to create an invoice" and the agent opens the screen and walks through it, pointing at each field and button in turn; Settings → Self tutorial lists every lesson with a Start button.',
      'Year-End Sign-off (Reports → Audit exceptions, and Auditor Centre): one clipboard of checks with a traffic light on each — books balance, banks reconciled, GST/HST returns filed, sub-ledgers agree, no drafts, no duplicates — a decision that follows from the lights, and a sign-off recorded under the reviewer’s name.',
      'The Reports & Analytics rail now lists the hub’s groups (For my accountant, Who owes you, Whom we owe, Sales and customers, Expenses and vendors, Payroll, Audit exceptions, CPA year-end) instead of four single statements; each opens the hub on that group.',
      'Sales Tax is now Sales Tax (GST/HST) with GST/HST Payable, Reconciliation, Return and Quick Method pages, and a tax-form icon; Reports & Analytics and Auditor Centre have a clipboard icon.',
      'Every report drills down in one click: a customer or vendor name opens their page, a document number opens the invoice or bill, an account name opens its General Ledger for the same period, and Back returns to the report you came from.',
      'Profit and Loss has an Accrual / Cash basis switch.',
      'Recurring transactions can post as a vendor bill to Accounts Payable, with a Create bill button.',
      'Payroll has an Ontario Employer Health Tax panel with a one-click accrual, and a year-end checklist with due dates.',
      'Sales → Customers has Statements for every customer with a balance (PDFs to a folder, or email through Outlook), a Charge late interest button when the customer has a rate, and a credit-available note.',
      'Bill entry can read a PDF or scanned invoice to prefill the vendor, date and amounts.',
      'The Bookkeeping Checklist lives inside Action Centre as the Month-end routine.',
      'The Manual HST Input page is gone: type the exact HST in the entry\'s Tax Amt box with the Custom rate code.',
      'One Balance Sheet card and one Profit and Loss card on the Reports hub, with the variants as links.',
      'The sidebar group is now Sales & Payments, the Favourite Bar names the open company, and the company name in the header always follows the file that is open.',
      'Chart of Accounts refuses a second active account with the same name and type; sub-accounts always carry their master\'s GIFI code.',
      'Every auto-assigned number (accounts, invoices, estimates, purchase orders, receipts, credit notes) moves to the next free number instead of failing.',
      'Reports → Activity Log: who changed what and when, for every save in the company file.',
      'Settings: a company logo for invoices, receipts and statements; a second folder that receives a copy of every backup; and email that sends directly through your mail server instead of opening Outlook.',
      'Payroll screens and slips are visible only to roles with payroll permission, administrators and read-only reviewers.',
      'Accountant Centre → Reclassify Transactions: move posted amounts between accounts in bulk, each with its own adjusting entry.',
      'Merge duplicate customers or vendors from their page: all history moves to the one you keep.',
      'Back buttons follow the path you took: a report opened from Sales goes back to Sales, one opened from a Reports group goes back to that group.',
      'Make Deposit banks a foreign-currency receipt at the cash that actually arrived, so nothing is left behind in Undeposited Funds after the exchange gain or loss.',
      'A bank account held in US dollars (or any other currency) only takes and pays documents in that currency; Receive Payment, Pay Bill, Make Deposit and Sales Receipt say so instead of quietly moving Canadian dollars through it.',
    ],
  },
  {
    version: '0.1.330-alpha.16',
    date: '2026-09-05',
    headline: 'One place for each screen',
    items: [
      'Expenses & Bills is one hub: Record expense, Vendor bills, Paid bills, Vendors, Vendor credits, Mileage.',
      'Sales & Payments has a customer page matching the vendor page.',
      'Action Centre and the Bookkeeping Checklist show a worked example under every item.',
      'Bank and cash account names suggest the right GIFI code.',
    ],
  },
];
