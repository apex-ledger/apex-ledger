/** Lessons: the voice agent as a trainer. Each lesson opens the real screen and walks through it
 * one control at a time, pointing at the field or button and saying what to do with it. Nothing is
 * entered on the reviewer's behalf; the lesson shows, the reviewer does.
 *
 * A step names its control by the text a person sees on the screen (a field label, a button, a tab)
 * so a lesson stays right when the code behind the screen changes, and simply points at the whole
 * page when a control is not on screen yet (a list that is empty, a section further down).
 *
 * The catalogue below is the self-tutorial: every screen a bookkeeper uses, in the order a new
 * company is set up and run. Settings → Self tutorial lists them with a Start button each. */
export interface LessonStep {
  /** The screen this step happens on; opened before the step runs. */
  view?: Record<string, unknown>;
  /** How to find the control to point at, by what the reviewer sees. */
  find?: { label?: string; button?: string; text?: string; placeholder?: string; testId?: string };
  /** 'click' presses the control once it is found — how a lesson opens a blank form to teach on. */
  act?: 'click';
  say: string;
}

export type LessonGroup = 'Getting started' | 'Money in' | 'Money out' | 'Banking' | 'Payroll' | 'Sales tax' | 'Accounting and reports' | 'Year end and housekeeping';

export interface Lesson {
  id: string;
  group: LessonGroup;
  title: string;
  /** About how long, spoken at a normal pace. */
  minutes: number;
  /** Words that start this lesson: "teach me quick entry", "how to create an invoice". */
  keys: RegExp;
  intro: string;
  steps: LessonStep[];
  outro: string;
}

export const LESSONS: Lesson[] = [
  // ---------------- Getting started ----------------
  {
    id: 'tour', group: 'Getting started', title: 'Finding your way around', minutes: 3,
    keys: /\b(tour|around the app|the layout|where things are|get(?:ting)? started|the basics|orientation)\b/,
    intro: 'Three places to know: the sidebar on the left for every area, the toolbar for the things you do all day, and Search everything for anything by name.',
    steps: [
      { view: { kind: 'dashboard' }, find: { text: 'Sales & Payments' }, say: 'The sidebar. Sales and Payments is money in, Expenses and Bills is money out, Banking and Accounting is where the bank meets the books. Reports and Analytics is at the bottom because you enter first and review after.' },
      { find: { button: 'New Invoice' }, say: 'The toolbar: New Invoice, New Bill, New Expense, Receive Payment, Make Payment, Transfer, Import Bank and Scan Receipt. These are the daily actions, one click from anywhere.' },
      { find: { button: 'Search everything' }, say: 'Search everything, or Control K. Type an invoice number, a customer, an account or a report name and jump straight there.' },
      { find: { button: 'Action Centre' }, say: 'Action Centre collects what needs doing: recurring entries due, overdue invoices, payroll waiting, filings coming up. Start the day here.' },
      { find: { button: 'Favorite Bar' }, say: 'The Favourite Bar keeps your most-used pages for this company. Star any page to add it.' },
    ],
    outro: 'That is the layout. Every page has a Back button that follows the path you took to get there.',
  },
  {
    id: 'newCompany', group: 'Getting started', title: 'Setting up a new company', minutes: 4,
    keys: /\b(set(?:ting)? up|create|new|start)\b.*\bcompany\b|\bcompany (?:setup|set up|creation)\b/,
    intro: 'A company is one file: the business, its chart of accounts and every transaction. Setting it up takes the legal name, the fiscal year and a starting chart.',
    steps: [
      { view: { kind: 'companySettings' }, find: { text: 'Company Information' }, say: 'File, then Create New Company, or say "new company" to me with the name, the business type and the year end. The wizard asks for the legal name, fiscal year, business number and a starting chart of accounts matched to the trade.' },
      { find: { text: 'Company Information' }, say: 'After it is created, Settings holds the rest: HST number and filing frequency, payroll number and remitter type, addresses, WSIB and EHT.' },
      { view: { kind: 'chartOfAccounts' }, find: { text: 'Chart of Accounts' }, say: 'Then the Chart of Accounts. The template gives you banks, cards, receivables, payables, HST accounts, equity and the usual income and expense accounts. Add or rename what the business needs.' },
      { find: { text: 'Balance' }, say: 'Opening balances: enter what each bank, card, loan and receivable stood at on the first day, so the first reconciliation starts from the truth.' },
    ],
    outro: 'That is a company. Customers, vendors and employees come next, then the first entries.',
  },
  {
    id: 'contacts', group: 'Getting started', title: 'Customers and vendors', minutes: 3,
    keys: /\b(add(?:ing)?|new|create|set up)\b.*\b(customer|client|vendor|supplier|contact)s?\b|\b(customers?|vendors?) list\b/,
    intro: 'Customers are who you invoice; vendors are who bills you. Each one carries terms and defaults so new documents come prefilled. I will open a blank customer.',
    steps: [
      { view: { kind: 'sales', tab: 'customers' }, find: { button: '+ Add' }, act: 'click', say: 'Step one: Add on the Customers list. A blank customer opens.' },
      { find: { label: 'Display Name' }, say: 'Step two: the display name, the name you will see on lists and invoices. Company or legal name and the primary contact are optional.' },
      { find: { label: 'Email' }, say: 'Step three: email and phone. The email is where invoices, statements and reminders go.' },
      { find: { label: 'Payment Terms' }, say: 'Step four: payment terms, so the due date fills in on every invoice. A late-interest rate is here too, only if the agreement allows it.' },
      { find: { button: 'Save & Close' }, say: 'Then Save and Close. Vendors work the same way from Expenses and Bills, Vendors, with a usual expense account so bills land on the right category, and a T5018 flag for subcontractors.' },
    ],
    outro: 'That is contacts. Close this form with Cancel if you are not adding one now. Merge duplicate, on a customer or vendor page, folds a name entered twice into one.',
  },
  {
    id: 'products', group: 'Getting started', title: 'Items, services and inventory', minutes: 3,
    keys: /\b(items?|services?|products?|inventory|stock)\b.*\b(set ?up|add|new|create|track)\b|\b(add|new|create)\b.*\b(item|product|service|stock)\b|\binventory\b/,
    intro: 'Items are what you sell and buy: services with a price, and stock items that track quantity and cost. I will open a blank item.',
    steps: [
      { view: { kind: 'products' }, find: { button: 'Add' }, act: 'click', say: 'Step one: Add on the Inventory list. A blank item row opens.' },
      { find: { placeholder: 'New product…' }, say: 'Step two: the name, and a SKU or barcode if it has one. Type is Service, Non-inventory or Inventory.' },
      { find: { label: 'Sale price' }, say: 'Step three: the sale price and default tax, and for stock the purchase cost. A stock item also needs Track quantity and a reorder point.' },
      { find: { label: 'Income account' }, say: 'Step four: the accounts. Income for sales; for stock, the inventory asset account and cost of goods sold, so a sale moves cost out of stock automatically.' },
      { find: { button: 'Save' }, say: 'Then Save. Stock arrives through bills and purchase orders and leaves through invoices and sales receipts, at moving-average cost.' },
    ],
    outro: 'That is items. Inventory Status and Inventory Movement are the reports behind the on-hand figures.',
  },

  // ---------------- Money in ----------------
  {
    id: 'invoice', group: 'Money in', title: 'Creating an invoice', minutes: 3,
    keys: /\b(create|make|write|issue|send|new)\b.*\binvoice\b|\binvoice\b.*\b(create|how)\b|\binvoicing\b/,
    intro: 'An invoice bills a customer for work done. It posts to Accounts Receivable now and is paid later through Receive Payment.',
    steps: [
      { view: { kind: 'invoiceEditor' }, find: { placeholder: 'Select a customer…' }, say: 'Step one: the customer. Pick them from the list, or choose Add New Customer if this is the first job for them.' },
      { find: { label: 'Invoice Date' }, say: 'Step two: the invoice date. The due date fills in from the customer\'s payment terms, and you can change either one.' },
      { find: { text: 'Description' }, say: 'Step three: the lines. Pick a service or a stock item, or type a description, then the quantity and the unit price. Stock items reduce inventory when the invoice is saved.' },
      { find: { text: 'Tax' }, say: 'Step four: the tax code on each line. HST for most work in Ontario, No HST for an exempt customer, GST only for an Alberta customer.' },
      { find: { button: '+ Add line' }, say: 'Add as many lines as the job needs. The subtotal, tax and total update as you go.' },
      { find: { button: 'Save' }, say: 'Then Save. From here you can email the invoice as a PDF with your logo, print it, or come back and record the payment when it arrives.' },
    ],
    outro: 'That is an invoice. When the customer pays, use Receive Payment on the toolbar and the balance clears.',
  },
  {
    id: 'estimate', group: 'Money in', title: 'Estimates and sales orders', minutes: 2,
    keys: /\b(estimate|quote|quotation|sales order)s?\b/,
    intro: 'An estimate is a promise of price, not a sale. Nothing posts until it becomes an invoice. I will open a blank estimate.',
    steps: [
      { view: { kind: 'sales', tab: 'estimates' }, find: { button: 'New Estimate' }, act: 'click', say: 'Step one: New Estimate. A blank estimate opens.' },
      { find: { label: 'Customer' }, say: 'Step two: the customer, the estimate date and when it expires.' },
      { find: { placeholder: 'Optional product…' }, say: 'Step three: the lines, exactly like an invoice: product or description, quantity, unit price, revenue account and tax.' },
      { find: { button: 'Save Estimate' }, say: 'Then Save Estimate and email it. When the customer says yes, Convert to Invoice on the list carries the lines over and marks the estimate accepted. A sales order sits between, for accepted work delivered in stages.' },
    ],
    outro: 'That is estimates. Nothing here touches the books until it is an invoice.',
  },
  {
    id: 'salesReceipt', group: 'Money in', title: 'Sales receipts for paid-on-the-spot sales', minutes: 2,
    keys: /\b(sales receipt|paid on the spot|cash sale|counter sale|point of sale)\b/,
    intro: 'A sales receipt is a sale and its payment in one step, for a customer who pays right away.',
    steps: [
      { view: { kind: 'salesReceiptEditor', id: 'new' }, find: { placeholder: 'Select a customer…' }, say: 'Step one: the customer, which can be a walk-in customer you keep for the purpose.' },
      { find: { label: 'Deposit To' }, say: 'Step two: Deposit To, the bank or cash account the money went into, or Undeposited Funds if it will be banked later with other receipts.' },
      { find: { placeholder: 'Select item…' }, say: 'Step three: the lines: item or description, quantity, price, revenue account and tax, like an invoice.' },
      { find: { button: 'Save Sales Receipt' }, say: 'Then Save Sales Receipt. Revenue, tax and the money post together; there is no receivable to chase.' },
    ],
    outro: 'That is a sales receipt. Use an invoice instead whenever the customer will pay later.',
  },
  {
    id: 'receivePayment', group: 'Money in', title: 'Receiving a payment and depositing it', minutes: 3,
    keys: /(receive|record|apply).*payment|customer (?:paid|payment)|deposit(?:s|ing)?/,
    intro: 'Two steps, like the bank does it: receive the payment against the invoice, then deposit it to the bank on the day it was banked. I will open the Receive Payment form.',
    steps: [
      { view: { kind: 'sales', tab: 'invoices' }, find: { button: 'Receive Payment' }, act: 'click', say: 'Step one: Receive Payment on the toolbar. The form opens.' },
      { find: { placeholder: 'Who is paying?' }, say: 'Step two: the customer. Their open invoices appear below.' },
      { find: { label: 'Invoice' }, say: 'Step three: the invoice being paid, with its balance. A part payment leaves the rest open.' },
      { find: { label: 'Payment Date' }, say: 'Step four: the date the money arrived, from the cheque or the bank line.' },
      { find: { label: 'Amount Received' }, say: 'Step five: the amount. Deposit To is Undeposited Funds by default, so several payments can be banked together in one deposit.' },
      { view: { kind: 'sales', tab: 'deposits' }, find: { text: 'Waiting to be banked' }, say: 'Step six: close the form with Escape or Cancel if you are not receiving one now, then Deposits. Tick the payments that went to the bank together, choose the bank account and the deposit date. The total must equal the line on the bank statement.' },
    ],
    outro: 'That is receiving and depositing. Undeposited Funds should be back to zero once every payment has been deposited.',
  },
  {
    id: 'creditNote', group: 'Money in', title: 'Credit notes and refunds', minutes: 2,
    keys: /\b(credit note|credit memo|refund)s?\b/,
    intro: 'A credit note reverses part of a sale or a purchase without touching the original document. I will open a blank one.',
    steps: [
      { view: { kind: 'sales', tab: 'creditNotes' }, find: { button: 'New Credit Note' }, act: 'click', say: 'Step one: New Credit Note. A blank credit note opens.' },
      { find: { placeholder: 'Select…' }, say: 'Step two: the customer, the date and a memo saying why: goodwill, a return, a price correction.' },
      { find: { placeholder: 'Description' }, say: 'Step three: the lines, taxed the same way the invoice was, with the revenue account the sale went to.' },
      { find: { button: 'Save & Close' }, say: 'Then Save and Close. On the list, Apply puts it against an open invoice; Refund pays it back through a bank account. Vendor credits work the same way under Expenses and Bills.' },
    ],
    outro: 'That is credits. Undo Settlement is there if a credit was applied to the wrong document.',
  },
  {
    id: 'lateInterest', group: 'Money in', title: 'Chasing overdue invoices', minutes: 2,
    keys: /\b(overdue|late (?:payment|interest)|chase|reminder|collections?)\b/,
    intro: 'Overdue invoices show up on the A/R Ageing report and on each customer\'s page, with the tools to chase them.',
    steps: [
      { view: { kind: 'report', report: 'agingReceivable' }, find: { text: 'A/R Ageing' }, say: 'A/R Ageing: every open invoice in buckets of thirty, sixty and ninety days. Click a name to open the customer, or an invoice number to open it.' },
      { find: { button: 'Send reminder' }, say: 'Send reminder emails the customer a copy with a polite note. Statements sends every customer with a balance their statement.' },
      { view: { kind: 'sales', tab: 'customers' }, find: { text: 'Overdue' }, say: 'Charge late interest, when the customer has a rate on file, adds an interest invoice from the day after the due date.' },
    ],
    outro: 'That is collections. The Action Centre lists overdue invoices every morning.',
  },

  // ---------------- Money out ----------------
  {
    id: 'quickEntry', group: 'Money out', title: 'Quick Entry — recording an expense', minutes: 3,
    keys: /\b(quick entry|record(?:ing)? (?:an? )?expense|enter(?:ing)? (?:an? )?expense|expense entry|new expense)\b/,
    intro: 'Quick Entry is the fastest way to record money that has already been spent, like a receipt or a card charge. Five fields and Save.',
    steps: [
      { view: { kind: 'quickEntry', type: 'expense' }, find: { label: 'Date' }, say: 'Step one: the date. This is the day the money left, the date on the receipt or the card statement, not today.' },
      { find: { label: 'Paid From' }, say: 'Step two: Paid From. Choose the bank account, credit card or cash box the money came out of. This is what makes the bank reconcile later.' },
      { find: { placeholder: 'Expense category' }, say: 'Step three: the expense category. Start typing and pick the account, such as Motor Vehicle for fuel or Office Supplies. A vendor you have used before fills this in for you.' },
      { find: { text: 'Base' }, say: 'Step four: the amount before tax. If the receipt shows one total with tax included, type the total and tick tax included; the split is done for you.' },
      { find: { text: 'Tax Amt' }, say: 'Step five: the tax. HST at thirteen percent is the default in Ontario. Choose No HST for insurance, bank fees or an exempt supplier, and Meals for restaurant receipts, where only half the tax is claimable.' },
      { find: { button: 'Save & Close' }, say: 'Then Save and Close, or Save and Next to keep going. The entry posts straight to the ledger, the tax goes to GST/HST Recoverable, and it appears in Today\'s Entries below where you can open or correct it.' },
    ],
    outro: 'That is Quick Entry. You can also just say the whole thing to me: expense forty dollars parking on Visa with HST.',
  },
  {
    id: 'quickIncome', group: 'Money out', title: 'Quick Entry — income and transfers', minutes: 2,
    keys: /\b(quick entry income|record(?:ing)? income|income entry|transfer(?:s|ring)? (?:between|money|funds)|bank transfer)\b/,
    intro: 'The same screen records money in without an invoice, and money moved between your own accounts.',
    steps: [
      { view: { kind: 'quickEntry', type: 'income' }, find: { text: 'Sale / Income' }, say: 'Sale slash Income: interest earned, a rebate, scrap sold, a grant. Deposited To is the account the money landed in; the category is the income account.' },
      { view: { kind: 'quickEntry', type: 'transfer' }, find: { text: 'Transfer' }, say: 'Transfer: from one of your accounts to another, such as paying the Visa from chequing or topping up savings. No tax, no category, just the two accounts and the amount.' },
    ],
    outro: 'That is income and transfers. A transfer never changes profit; it moves money you already had.',
  },
  {
    id: 'bill', group: 'Money out', title: 'Entering a vendor bill', minutes: 3,
    keys: /(enter|record|add|create).*(vendor )?bill|bill entry|vendor bills?/,
    intro: 'A bill is money you owe a vendor and will pay later. Entering it now keeps Accounts Payable and the HST credits right on the day of the invoice. I will open a blank bill so you can see every field.',
    steps: [
      { view: { kind: 'purchases', tab: 'unpaid' }, find: { button: '+ Enter Bill' }, act: 'click', say: 'Step one: Enter Bill here, or the orange New Bill on the toolbar. A blank bill opens.' },
      { find: { placeholder: 'Select a vendor…' }, say: 'Step two: the vendor. Pick them from the list; a new vendor can be added right here. Their terms and usual expense account fill in.' },
      { find: { label: 'Vendor Invoice Number' }, say: 'Step three: the vendor’s invoice number, exactly as printed. The same number cannot be entered twice for one vendor, which stops a bill being paid twice.' },
      { find: { label: 'Bill Date' }, say: 'Step four: the bill date from the invoice, not the day you type it. The due date comes from the terms.' },
      { find: { placeholder: 'Select an expense or asset account…' }, say: 'Step five: the lines. Each line has an expense or asset account, a description, the amount before tax and the tax code. Add a line for each thing the bill covers.' },
      { find: { button: 'Save & Close' }, say: 'Then Save and Close. The bill sits under Unpaid until you pay it with Make Payment, in full or in part. Read from PDF or scan, above, fills the vendor, date and amounts from the invoice file.' },
    ],
    outro: 'That is a bill. Close this form with Escape if you are not entering one now. Pay it from Make Payment when the money goes out.',
  },
  {
    id: 'payBill', group: 'Money out', title: 'Paying bills', minutes: 2,
    keys: /\b(pay(?:ing)?|make payment)\b.*\bbills?\b|\bbill payments?\b/,
    intro: 'Paying a bill moves it from Accounts Payable to the bank on the day the money left. I will open the payment form.',
    steps: [
      { view: { kind: 'purchases', tab: 'unpaid' }, find: { button: 'Make Payment' }, act: 'click', say: 'Step one: Make Payment on the toolbar, or Pay beside a bill. The form opens.' },
      { find: { placeholder: 'Who is being paid?' }, say: 'Step two: the vendor, then the bill being paid with its balance.' },
      { find: { label: 'Payment Date' }, say: 'Step three: the payment date, the day the cheque was written or the transfer sent.' },
      { find: { label: 'Amount to Pay' }, say: 'Step four: the amount, in full or in part, and Pay from: the bank account it comes out of.' },
      { find: { button: 'Pay' }, say: 'Then Pay. The bill moves to Paid Bills, where Reverse Last Payment undoes a payment recorded from the wrong account or on the wrong day.' },
    ],
    outro: 'That is paying bills. Close the form with Cancel if you are not paying one now. A/P Ageing shows what is still open.',
  },
  {
    id: 'purchaseOrder', group: 'Money out', title: 'Purchase orders and receiving stock', minutes: 2,
    keys: /\bpurchase orders?\b|\bpo\b|\breceiv(?:e|ing) stock\b/,
    intro: 'A purchase order is what you asked a vendor for. Receiving it brings stock in; matching the vendor\'s invoice turns it into a bill. I will open a blank order.',
    steps: [
      { view: { kind: 'purchaseOrders' }, find: { button: 'New Purchase Order' }, act: 'click', say: 'Step one: New Purchase Order. A blank order opens.' },
      { find: { placeholder: 'Select a vendor…' }, say: 'Step two: the vendor and the expected date.' },
      { find: { placeholder: 'Optional product…' }, say: 'Step three: the lines: the item or a description, the quantity, the price and the category. Nothing posts yet.' },
      { find: { button: 'Save' }, say: 'Then Save. On the list, Receive when the goods arrive brings stock in on that date, and Match supplier invoice turns it into the bill for the amount received.' },
    ],
    outro: 'That is purchase orders. Convert to bill skips receiving for services and non-stock purchases.',
  },
  {
    id: 'receipts', group: 'Money out', title: 'Scanning receipts', minutes: 2,
    keys: /\b(scan|scanning|receipt inbox|photo of (?:a )?receipt|attach(?:ments?|ing)?)\b/,
    intro: 'A receipt can be scanned or photographed into the Receipt Inbox, read for its amounts, and attached to the entry it supports.',
    steps: [
      { view: { kind: 'receiptInbox' }, find: { button: 'Scan Receipt' }, say: 'Scan Receipt on the toolbar takes a scan or a file. The inbox reads the vendor, date and total.' },
      { find: { button: 'Scan Receipt' }, say: 'From the inbox, create the expense or bill from it; the receipt stays attached, which is what the Source Documents report and an auditor look for.' },
    ],
    outro: 'That is receipts. Large items with no attached document show on the Year-End Sign-off until the paper is there.',
  },
  {
    id: 'recurring', group: 'Money out', title: 'Recurring entries and bills', minutes: 2,
    keys: /\b(recurring|repeat(?:ing)?|every month|monthly|templates?)\b.*\b(bill|expense|invoice|rent|entr(?:y|ies))\b|\brecurring\b/,
    intro: 'Rent, subscriptions and retainers happen every month. A template posts them with one click, on schedule.',
    steps: [
      { view: { kind: 'quickEntry', type: 'expense' }, find: { text: 'Load a saved template' }, say: 'Save any Quick Entry as a template with a schedule. Load a saved template fills the row; Action Centre reminds you when one is due.' },
      { view: { kind: 'sales', tab: 'recurring' }, find: { text: 'Recurring' }, say: 'Recurring invoices do the same for customers on retainer, and a template can post as a vendor bill instead of a paid expense.' },
    ],
    outro: 'That is recurring. The next due date moves forward each time one is posted.',
  },

  {
    id: 'scenarioCustomerPays', group: 'Money in', title: 'Scenario: invoice a customer, get paid, bank it', minutes: 5,
    keys: /\b(customer pays?|get(?:ting)? paid|invoice to bank|money in scenario|from invoice to (?:deposit|bank)|whole (?:sales )?cycle|end to end sales)\b/,
    intro: 'The whole money-in cycle on blank forms: the invoice, the payment when it arrives, the deposit to the bank, and the line you will tick when you reconcile.',
    steps: [
      { view: { kind: 'invoiceEditor' }, find: { placeholder: 'Select a customer…' }, say: 'Part one, the invoice. Pick the customer; the date and due date fill in from their terms.' },
      { find: { text: 'Description' }, say: 'Add the lines with quantity, price and tax, then Save. Accounts Receivable goes up and the HST collected is recorded. Email the PDF to the customer.' },
      { view: { kind: 'sales', tab: 'invoices' }, find: { button: 'Receive Payment' }, act: 'click', say: 'Part two, the payment arrives. Receive Payment on the toolbar.' },
      { find: { placeholder: 'Who is paying?' }, say: 'Choose the customer, tick the invoice, enter the payment date and the amount received. It lands in Undeposited Funds, so the receivable is cleared and the money waits to be banked.' },
      { view: { kind: 'sales', tab: 'deposits' }, find: { text: 'Waiting to be banked' }, say: 'Part three, the deposit. Close the payment form if it is still open. Deposits lists everything waiting to be banked.' },
      { find: { button: 'Make Deposit' }, act: 'click', say: 'Make Deposit. Tick the payments that went to the bank together, choose the bank account and the deposit date. The total must equal the line on the bank statement.' },
      { view: { kind: 'bankReconciliation' }, find: { label: 'Account' }, say: 'Part four, the bank. When you reconcile this account, that deposit is one line to tick. Invoice, payment, deposit, statement: the same money, in the same order the bank saw it.' },
    ],
    outro: 'That is the customer cycle. A/R Ageing shows what is still unpaid, and Undeposited Funds should be zero once every payment is banked.',
  },
  {
    id: 'scenarioVendorBill', group: 'Money out', title: 'Scenario: a vendor bills you, you pay it from the bank', minutes: 5,
    keys: /\b(vendor (?:issues?|sends?) (?:a )?bill|bill to (?:payment|bank)|money out scenario|from bill to payment|whole (?:purchase )?cycle|end to end (?:bills?|purchases?)|pay (?:the )?vendor)\b/,
    intro: 'The whole money-out cycle on blank forms: the bill when it arrives, the payment when the money leaves, and the line you will tick when you reconcile.',
    steps: [
      { view: { kind: 'purchases', tab: 'unpaid' }, find: { button: '+ Enter Bill' }, act: 'click', say: 'Part one, the bill arrives. Enter Bill. A blank bill opens.' },
      { find: { placeholder: 'Select a vendor…' }, say: 'The vendor, their invoice number, and the bill date from the invoice. Then the lines: expense account, amount before tax and tax code. Save and Close. Accounts Payable goes up and the HST credit is recorded on the bill date, even though nothing has been paid.' },
      { find: { button: 'Save & Close' }, say: 'The bill now sits under Unpaid with its due date. A/P Ageing shows it until it is paid.' },
      { view: { kind: 'purchases', tab: 'unpaid' }, find: { button: 'Make Payment' }, act: 'click', say: 'Part two, paying it. Close the bill form if it is still open, then Make Payment.' },
      { find: { placeholder: 'Who is being paid?' }, say: 'The vendor and the bill, the payment date, the amount, and Pay from: the bank account the money left. Pay. The payable clears and the bank goes down on that date.' },
      { view: { kind: 'purchases', tab: 'paid' }, find: { text: 'Paid Bills' }, say: 'Part three, the record. Paid Bills keeps the bill with its payment; Reverse Last Payment is there if the wrong account or date was used.' },
      { view: { kind: 'bankReconciliation' }, find: { label: 'Account' }, say: 'Part four, the bank. When you reconcile this account, that payment is one line to tick. Bill, payment, statement: the expense was booked on the bill date, the cash left on the payment date.' },
    ],
    outro: 'That is the vendor cycle. If the bill was paid on the spot, Quick Entry records it in one step instead.',
  },

  // ---------------- Banking ----------------
  {
    id: 'bankImport', group: 'Banking', title: 'Importing a bank statement', minutes: 3,
    keys: /\b(import|upload|download)\b.*\b(bank|statement|ofx|csv|qbo)\b|\bbank (?:import|feed|download)\b/,
    intro: 'The bank\'s download file is the quickest way to catch everything you did not enter by hand.',
    steps: [
      { view: { kind: 'bankImport' }, find: { button: 'Import Bank' }, say: 'Import Bank. Choose the OFX, QFX, QBO or CSV file from online banking. OFX needs no column mapping; a CSV asks once which column is which.' },
      { find: { label: 'Bank Account' }, say: 'Choose the bank account the statement belongs to. Each line then gets a suggested category from your rules and history. Accept, change it, or match the line to an invoice payment or a bill.' },
      { find: { label: 'Statement Type' }, say: 'Statement type is the file format. Post the lines you have reviewed. Already-entered lines are recognised and skipped, so nothing doubles up.' },
    ],
    outro: 'That is importing. Reconcile right after, while the statement is in front of you.',
  },
  {
    id: 'reconcile', group: 'Banking', title: 'Reconciling a bank account', minutes: 3,
    keys: /\b(reconcile|reconciliation|reconciling)\b/,
    intro: 'Reconciling proves the books match the bank statement to the cent. Do it every month for every bank and card.',
    steps: [
      { view: { kind: 'bankReconciliation' }, find: { label: 'Account' }, say: 'Step one: choose the account.' },
      { find: { label: 'Statement Date' }, say: 'Step two: the statement date and the ending balance, copied from the statement.' },
      { find: { button: 'Start' }, say: 'Step three: Start. Every line up to that date is listed; tick each one that appears on the statement and the difference at the top counts down.' },
      { find: { label: 'Statement Ending Balance' }, say: 'Step four: when the difference is zero, Complete. Ticked lines lock and the Reconciliation Report is ready for the accountant. A difference that will not clear is a missing entry: Import Bank brings in the lines you have not entered.' },
    ],
    outro: 'That is reconciliation. Past reconciliations can be reopened if something must change.',
  },
  {
    id: 'creditCards', group: 'Banking', title: 'Credit cards and card payments', minutes: 2,
    keys: /\b(credit cards?|visa|mastercard|amex|card payment|pay(?:ing)? the card)\b/,
    intro: 'A credit card is a liability account that behaves like a bank: purchases go on it, the monthly payment is a transfer from chequing.',
    steps: [
      { view: { kind: 'chartOfAccounts' }, find: { text: 'Visa' }, say: 'Each card is its own account with the Credit Card subtype and GIFI 2707, so it appears in Paid From lists and can be reconciled to its statement.' },
      { view: { kind: 'quickEntry', type: 'transfer' }, find: { text: 'Transfer' }, say: 'Paying the card: Transfer from chequing to the card account on the day the payment cleared. Never enter the payment as an expense; the expenses were the purchases.' },
    ],
    outro: 'That is cards. Reconcile each card to its statement like a bank account.',
  },

  // ---------------- Payroll ----------------
  {
    id: 'employees', group: 'Payroll', title: 'Setting up employees', minutes: 3,
    keys: /\b(add(?:ing)?|new|create|hire|set ?up)\b.*\bemployee\b|\bemployee (?:setup|set up|record)\b/,
    intro: 'An employee record carries everything a pay run needs: province, pay, frequency, TD1 claims and vacation treatment. I will open a blank employee.',
    steps: [
      { view: { kind: 'payroll' }, find: { button: '+ Add Employee' }, act: 'click', say: 'Step one: Add Employee. A blank employee opens.' },
      { find: { label: 'Employee Name' }, say: 'Step two: name and province. The province sets the tax tables.' },
      { find: { label: 'Pay Type' }, say: 'Step three: pay type, hourly or salary, the rate, and the pay schedule: weekly, biweekly, semi-monthly or monthly.' },
      { find: { label: 'Vacation Pay' }, say: 'Step four: vacation pay percent, and whether it is paid each period or accrued to a balance.' },
      { find: { label: 'Federal (TD1)' }, say: 'Step five: the TD1 claim amounts, federal and provincial, from the forms the employee signed. The SIN goes on the T4.' },
      { find: { label: 'Health/Dental Benefit' }, say: 'Step six: benefits and RRSP match if the company provides them, and bank details only if you will produce direct deposit files.' },
      { find: { button: 'Save & Close' }, say: 'Then Save and Close. Deactivate, never delete, when someone leaves; the ROE and T4 still need them.' },
    ],
    outro: 'That is an employee. Close the form with Cancel if you are not adding one now.',
  },
  {
    id: 'payroll', group: 'Payroll', title: 'Running payroll', minutes: 4,
    keys: /\b(run|do|process|running)\b.*\bpayroll\b|\bpayroll\b.*\b(how|teach|lesson)\b|\bpay run\b/,
    intro: 'Payroll follows the numbered workflow at the top of the page. I will open a blank pay run.',
    steps: [
      { view: { kind: 'payroll' }, find: { button: '2. Run Payroll' }, act: 'click', say: 'Step one: Run Payroll. The pay run form opens.' },
      { find: { label: 'Employee' }, say: 'Step two: the employee and the pay period. Period start, period end and pay date follow their schedule.' },
      { find: { label: 'Regular Hours' }, say: 'Step three: hours for hourly staff, regular and overtime. Salaried staff need nothing here.' },
      { find: { label: 'Additional Items' }, say: 'Step four: additional items: a bonus, a taxable benefit, a deduction such as union dues, or a reimbursement.' },
      { find: { text: 'Pay Summary' }, say: 'Step five: the pay summary. CPP, EI and income tax are calculated for you; check the net pay and the employer cost.' },
      { find: { button: 'Save & Close' }, say: 'Then Save and Close, and Post from the bank account the pay came from. The pay stub is ready to print or email. PD7A once a month, and the year-end slips, come from these posted runs.' },
    ],
    outro: 'That is payroll. Close the form with Cancel if you are not running one now. A wrong run is reversed, not edited.',
  },
  {
    id: 'payrollYearEnd', group: 'Payroll', title: 'T4s, ROEs and payroll year end', minutes: 3,
    keys: /\b(t4|t4a|t5018|roe|record of employment|payroll year[- ]end|year[- ]end slips?|eht|employer health tax|wsib)\b/,
    intro: 'Payroll year end is a checklist: remittances reconciled, T4s issued by the end of February, EHT and WSIB filed.',
    steps: [
      { view: { kind: 'payroll' }, find: { button: '5. Year-End Slips' }, say: 'Year-End Slips: T4 for employees and the T4 Summary, T4A and T5018 for contractors. Preview before generating; the numbers come from posted runs.' },
      { find: { text: 'EHT for the month' }, say: 'The EHT panel accrues Ontario Employer Health Tax on remuneration above the exemption, and the year-end checklist lists every due date.' },
      { find: { text: 'ROE' }, say: 'ROE on an employee row prepares the Record of Employment when someone leaves or is laid off.' },
    ],
    outro: 'That is payroll year end. The Payroll Register report backs every slip.',
  },

  // ---------------- Sales tax ----------------
  {
    id: 'taxCodes', group: 'Sales tax', title: 'Tax codes on every entry', minutes: 2,
    keys: /\b(tax codes?|which tax|hst code|exempt|zero[- ]rated|meals hst|gst only)\b/,
    intro: 'The return is only as right as the code on each line. There are a handful to know.',
    steps: [
      { view: { kind: 'quickEntry', type: 'expense' }, find: { text: 'Tax' }, say: 'HST thirteen percent for most Ontario purchases and sales. No HST for exempt things: insurance, bank charges, wages, and exempt customers such as work on reserve.' },
      { find: { text: 'Tax' }, say: 'Meals HST claims only half the tax, as CRA allows. GST only, five percent, for Alberta and the territories. Custom rate when the receipt shows an odd amount: type the exact tax.' },
      { view: { kind: 'report', report: 'salesTaxByProvince' }, find: { text: 'Sales Tax by Province' }, say: 'Sales Tax by Province handles PST, RST and QST for customers elsewhere, each on its own return.' },
    ],
    outro: 'That is tax codes. The Sales Tax Detail report lists every line behind the return.',
  },
  {
    id: 'hstReturn', group: 'Sales tax', title: 'Filing the GST/HST return', minutes: 3,
    keys: /\b(file|filing)\b.*\b(hst|gst|sales tax|return)\b|\b(hst|gst) return\b/,
    intro: 'The return is built from the tax codes on every entry. Filing it records the amount, posts the payment and locks the period.',
    steps: [
      { view: { kind: 'report', report: 'hstSummary' }, find: { text: 'HST Collected' }, say: 'Step one: GST/HST Payable. Check collected, input tax credits and the net for the period. The by-account breakdown shows where each figure comes from.' },
      { view: { kind: 'report', report: 'hstReconciliation' }, find: { text: 'Activity Totals' }, say: 'Step two: Reconciliation. It compares the tax figures with your sales and purchases totals, so a line coded with the wrong tax stands out before you file.' },
      { view: { kind: 'report', report: 'hstFiling' }, find: { text: 'Period' }, say: 'Step three: File. Confirm the period, choose the bank account the payment comes from, or where the refund lands, and File. The period locks so nothing changes what was reported.' },
    ],
    outro: 'That is the return. If something must change later, void the return from the GST/HST Centre, fix the entry, and file again.',
  },

  // ---------------- Accounting and reports ----------------
  {
    id: 'chartOfAccounts', group: 'Accounting and reports', title: 'Chart of accounts and GIFI', minutes: 3,
    keys: /\b(chart of accounts|add(?:ing)? an? account|new account|gifi|account codes?)\b/,
    intro: 'The chart is the list of drawers every dollar is filed in. Each account has a code, a type, and a GIFI code for the tax return. I will open a blank account.',
    steps: [
      { view: { kind: 'chartOfAccounts' }, find: { button: '+ New Account' }, act: 'click', say: 'Step one: New Account. A blank account opens.' },
      { find: { label: 'Account Type' }, say: 'Step two: the type and subtype. Bank accounts and credit cards get their own subtype so they show up wherever money is chosen.' },
      { find: { label: 'GIFI Code' }, say: 'Step three: the GIFI code the T2 wants: banks 1002, cash 1001, credit cards 2707. A sub-account inherits its parent\'s code.' },
      { find: { label: 'Opening Balance' }, say: 'Step four: an opening balance and its date, for an account that already had money in it when the books started.' },
      { find: { button: 'Save' }, say: 'Then Save. Make an account inactive rather than deleting it; history stays. A duplicate name and type is refused.' },
    ],
    outro: 'That is the chart. Close the form with Cancel if you are not adding one now. Business Tax and GIFI exports the schedule figures when the year is done.',
  },
  {
    id: 'journal', group: 'Accounting and reports', title: 'Journal entries and adjustments', minutes: 2,
    keys: /\b(journal entr(?:y|ies)|general journal|adjusting entr(?:y|ies)|accrual|depreciation entry|manual entry)\b/,
    intro: 'A journal entry is for what no document covers: accruals, depreciation, corrections, opening balances.',
    steps: [
      { view: { kind: 'journalForm', id: 'new' }, find: { text: 'Date' }, say: 'Date and memo, then lines: each with an account, a debit or a credit, and a description. The entry must balance before it posts.' },
      { find: { text: 'Is Adjusting' }, say: 'Tick Adjusting for year-end adjustments so they appear on the Adjusting Entries report for the accountant. A tax code on a line puts it on the HST return.' },
      { view: { kind: 'journalList' }, find: { text: 'Journal Entries' }, say: 'The list shows every entry with its source. Posted entries are voided, not deleted; the date can be corrected without reposting.' },
    ],
    outro: 'That is journals. Reclassify Transactions in Accountant Centre moves many lines at once with one adjusting entry each.',
  },
  {
    id: 'reports', group: 'Accounting and reports', title: 'Reports and drilling down', minutes: 3,
    keys: /\b(reports?|drill ?down|trial balance|profit and loss|balance sheet|financial statements?|export to excel)\b/,
    intro: 'Every report is grouped by who asks for it: your accountant, CRA, the CPA at year end, who owes you, whom you owe.',
    steps: [
      { view: { kind: 'reportsHub' }, find: { text: 'For my accountant' }, say: 'For my accountant: Trial Balance, Profit and Loss, Balance Sheet, Cash Flow and the General Ledger. Pick a group on the left, a report on the right.' },
      { view: { kind: 'report', report: 'incomeStatement' }, find: { text: 'Revenue' }, say: 'Profit and Loss has an accrual or cash basis switch, a comparison period, and every account name opens its General Ledger for the same dates.' },
      { find: { button: 'Export Excel' }, say: 'Export Excel and Save as PDF on every report. Add to favourites keeps the ones you use on the hub\'s first page.' },
      { view: { kind: 'report', report: 'agingReceivable' }, find: { text: 'A/R Ageing' }, say: 'Names and document numbers are links everywhere: a customer opens their page, an invoice number opens the invoice, and Back returns to the report.' },
    ],
    outro: 'That is reports. The Comprehensive Company Report puts the whole package on one Excel sheet.',
  },
  {
    id: 'projectsTags', group: 'Accounting and reports', title: 'Projects, tags and budgets', minutes: 2,
    keys: /\b(projects?|job costing|tags?|classes|departments?|budgets?)\b/,
    intro: 'Tags and projects answer "which job" and "which department"; budgets answer "how does it compare to the plan".',
    steps: [
      { view: { kind: 'tags' }, find: { text: 'Tag' }, say: 'Tags: create a group such as Department or Location and its tags. Any line on an invoice, bill or entry can carry them; P&L by Tag Group reports on them.' },
      { view: { kind: 'projects' }, find: { text: 'Projects' }, say: 'Projects collect income and cost per job, so a fixed-price job shows its margin.' },
      { view: { kind: 'report', report: 'budgetVsActual' }, find: { text: 'Budget' }, say: 'Budget vs Actual: enter a budget by account and month, and see the variance.' },
    ],
    outro: 'That is projects and tags. They never change the ledger; they slice it.',
  },

  // ---------------- Year end and housekeeping ----------------
  {
    id: 'monthEnd', group: 'Year end and housekeeping', title: 'Month-end routine', minutes: 3,
    keys: /\b(month[- ]end|monthly routine|closing the month|month end close|checklist)\b/,
    intro: 'A month is closed when the bank is reconciled, the tax is checked, payroll is remitted and the period is locked.',
    steps: [
      { view: { kind: 'actionCentre' }, find: { text: 'Month-end routine' }, say: 'Action Centre, Month-end routine: the checklist with an example on each line. Tick them off as you go; it remembers per month.' },
      { view: { kind: 'monthEndClose' }, find: { text: 'Month-End Close' }, say: 'Month-End Close locks the period. After that, posting into it needs an accountant override, and a filed HST return locks its own period.' },
    ],
    outro: 'That is month end. Do it every month and year end is a formality.',
  },
  {
    id: 'yearEnd', group: 'Year end and housekeeping', title: 'Year-end sign-off', minutes: 3,
    keys: /\b(year[- ]end|sign[- ]?off|close the (?:year|books))\b/,
    intro: 'The Year-End Sign-off is a clipboard of checks with a light on each. Green passes, amber needs a note, red must be fixed before the period is signed.',
    steps: [
      { view: { kind: 'report', report: 'yearEndSignoff' }, find: { button: 'Re-run checks' }, say: 'Step one: set the period and re-run. Every check reads the live books.' },
      { find: { text: 'Bank and cash' }, say: 'Step two: work down the reds. Each row has an Open button to the screen that fixes it. Come back and re-run; watch the light turn green.' },
      { find: { text: 'Final report' }, say: 'Step three: the decision. When it reads Ready, record it with your name and a note. Then lock the period in Month-End Close.' },
    ],
    outro: 'That is the sign-off. The record of who signed and when stays on the company file.',
  },
  {
    id: 'audit', group: 'Year end and housekeeping', title: 'Audit trail and finding mistakes', minutes: 3,
    keys: /\b(audit|mistakes?|errors?|find(?:ing)? (?:a )?(?:mistake|error|duplicate)|activity log|who changed)\b/,
    intro: 'Mistakes happen; what matters is finding them before an auditor does. Three screens do that.',
    steps: [
      { view: { kind: 'report', report: 'auditExceptions' }, find: { text: 'Audit Exceptions' }, say: 'Audit Exceptions runs the tests an auditor runs: control accounts, suspense, backdating, duplicates, round amounts, missing support. Each failing row opens.' },
      { view: { kind: 'report', report: 'activityLog' }, find: { text: 'Activity Log' }, say: 'Activity Log: who changed what and when, for every save on the file.' },
      { view: { kind: 'reclassify' }, find: { text: 'Reclassify' }, say: 'Reclassify Transactions fixes lines posted to the wrong account in bulk; Merge duplicate fixes a vendor entered twice; Reverse last payment fixes a payment to the wrong bank.' },
    ],
    outro: 'That is finding mistakes. The Year-End Sign-off pulls all of it onto one clipboard.',
  },
  {
    id: 'backups', group: 'Year end and housekeeping', title: 'Backups, users and access', minutes: 2,
    keys: /\b(backups?|back up|restore|recovery|users?|access|permissions?|passwords?|sign[- ]in)\b/,
    intro: 'The company file is the books. Backups protect it; users and roles control who can change it.',
    steps: [
      { view: { kind: 'companySettings' }, find: { text: 'Backups' }, say: 'Backup on the toolbar saves a copy now. A backup is taken automatically every day beside the file, and to a second folder if you set one here: a cloud-synced folder or an external drive.' },
      { view: { kind: 'accessPermissions' }, find: { text: 'Access' }, say: 'Users and Access: each person signs in with their own name. Roles limit what a bookkeeper, an accountant or a read-only reviewer can do; the sign-in history shows who was in.' },
    ],
    outro: 'That is backups and access. Restore from File, Open Company, Recovery points.',
  },
  {
    id: 'voiceAgent', group: 'Year end and housekeeping', title: 'Using Help & Tutor', minutes: 2,
    keys: /\b(help and tutor|help tutor|voice agent|voice commands?|talk(?:ing)? to you|use you|microphone|speak)\b/,
    intro: 'I answer how-do-I questions, teach any screen step by step, look up figures from the books, and post entries you type. Voice is optional and off unless turned on in Settings.',
    steps: [
      { find: { testId: 'voice-agent-button' }, say: 'The Help and Tutor button in the top bar, or More, Help and Tutor, opens me. Type a question and press Go.' },
      { find: { testId: 'voice-agent' }, say: 'Ask "how do I file the HST return", "how much does Maple Ridge owe", or "teach me payroll". Type an entry such as "expense 40 dollars parking on Visa with HST" and it comes back as a card to confirm before posting. With voice enabled in Settings, the microphone does the same by speaking.' },
    ],
    outro: 'That is Help and Tutor. Settings, Self tutorial, lists every lesson with a Start button.',
  },
];

LESSONS.push(
  {
    id: 'actionCentre', group: 'Getting started', title: 'Action Centre — what needs doing today', minutes: 3,
    keys: /\b(action centre|action center|what needs doing|to[- ]?do list|today'?s tasks|reminders due)\b/,
    intro: 'Action Centre is the day\'s to-do list, built from the books: what is due, what is overdue, what is waiting for you.',
    steps: [
      { view: { kind: 'actionCentre' }, find: { text: 'Action Centre' }, say: 'The badge on the sidebar is the count. Each card is one thing to do, with an example of what it means and a button to the screen that does it.' },
      { find: { text: 'Suggestions' }, say: 'Suggestions are things the books hint at: a vendor entered twice, an invoice unpaid past ninety days, a recurring entry due, a pay run left in draft, a return coming up.' },
      { find: { text: 'Month-end routine' }, say: 'Month-end routine is the checklist for closing a month, and Examples show what a good entry looks like for each kind of transaction.' },
    ],
    outro: 'That is Action Centre. When it is empty, the books are current.',
  },
  {
    id: 'crm', group: 'Getting started', title: 'Client Management (CRM) for a bookkeeping firm', minutes: 3,
    keys: /\b(crm|client management|client hub|my clients|client reminders|filing deadlines|engagement)\b/,
    intro: 'For a firm keeping books for many clients: every client, their filings and deadlines, and reminders, in one place across company files.',
    steps: [
      { view: { kind: 'clientHub' }, find: { text: 'Client Management' }, say: 'Client Management on the toolbar. Each client card carries the business, contacts, fiscal year end, HST and payroll frequency, and which company file holds their books.' },
      { find: { text: 'Deadlines' }, say: 'Deadlines are computed from those facts: HST returns, payroll remittances, T4s, T2 and T1 due dates. The app warns two weeks ahead and can email the client.' },
      { view: { kind: 'calendar' }, find: { text: 'Calendar' }, say: 'The Calendar shows appointments and filing dates together. Reminders can be snoozed or marked informed once the client has been told.' },
      { view: { kind: 'forms' }, find: { text: 'Forms' }, say: 'Forms and Letters: engagement letters, CRA authorizations and client letters with the client\'s details filled in.' },
    ],
    outro: 'That is the CRM. Switch between client company files from File, Open Company, or the recent list on the welcome screen.',
  },
  {
    id: 'fixedAssets', group: 'Accounting and reports', title: 'Fixed assets, CCA and loans', minutes: 3,
    keys: /\b(fixed assets?|capital assets?|cca|capital cost allowance|depreciation|amortization|vehicle loan|loan schedule|equipment)\b/,
    intro: 'A van, a computer, a machine: bought once, deducted over years. The register keeps each asset, its class and its CCA. I will open a blank asset.',
    steps: [
      { view: { kind: 'fixedAssets' }, find: { button: '+ Add asset' }, act: 'click', say: 'Step one: Add asset. A blank asset opens.' },
      { find: { label: 'Name' }, say: 'Step two: the name, the cost, and the date acquired. The purchase itself is a bill or an entry to the asset account; the register tracks the tax side.' },
      { find: { label: 'CCA class' }, say: 'Step three: the CCA class for tax, and the accounts: the asset account, accumulated depreciation and the depreciation expense.' },
      { find: { button: 'Save asset' }, say: 'Then Save asset. Run depreciation posts the period\'s entry, and the CCA Schedule report computes the year\'s claim by class with the half-year rule.' },
      { view: { kind: 'report', report: 'loanSchedule' }, find: { text: 'Loan Schedule' }, say: 'Loans: enter the principal, rate and term, and the schedule splits each payment into principal and interest so the liability runs down correctly.' },
    ],
    outro: 'That is assets and loans. The continuity reports at year end tie opening, additions, disposals and closing.',
  },
  {
    id: 'shareholders', group: 'Accounting and reports', title: 'Shareholders, dividends and T5', minutes: 2,
    keys: /\b(shareholders?|dividends?|t5|shareholder loan|owner draw|owner'?s? (?:draw|contribution)|due to shareholder)\b/,
    intro: 'Money between the owner and the company must be recorded on the right side: a loan, capital, or a dividend.',
    steps: [
      { view: { kind: 'payroll' }, find: { button: 'Shareholders & T5' }, say: 'Shareholders and T5 on the payroll workflow: each shareholder, their share class, and dividends paid. The T5 slips come from here.' },
      { view: { kind: 'chartOfAccounts' }, find: { text: 'Due to Shareholder' }, say: 'Due to Shareholder is the loan account: money the owner put in or took out. Common Shares is capital; Dividends Paid is a distribution of profit. The Shareholder Continuity report shows the year\'s movement.' },
    ],
    outro: 'That is shareholders. Personal expenses paid by the company go to the shareholder loan, never to an expense.',
  },
  {
    id: 'approvals', group: 'Year end and housekeeping', title: 'Approvals and controls', minutes: 2,
    keys: /\b(approv(?:e|al|als)|authoris|authoriz|controls?|thresholds?|segregation)\b/,
    intro: 'Approvals put a second pair of eyes on large bills and journals before they can be paid or posted.',
    steps: [
      { view: { kind: 'approvals' }, find: { text: 'Approvals' }, say: 'Approvals lists what is waiting. A bill above the threshold set in Settings must be approved before Make Payment will pay it; the Bill Approval Status report shows the queue.' },
      { view: { kind: 'accessPermissions' }, find: { text: 'Access' }, say: 'Roles decide who can approve, who can post, and who can only read. The Activity Log records every approval under the user\'s name.' },
    ],
    outro: 'That is approvals. Set the thresholds in Company Settings.',
  },
  {
    id: 'mileage', group: 'Money out', title: 'Mileage and vehicle expenses', minutes: 2,
    keys: /\b(mileage|kilomet|km|vehicle log|trips?|car allowance)\b/,
    intro: 'Business kilometres are a deduction. Log each trip; claim them at the CRA rate as one entry when you choose. I will open a blank trip.',
    steps: [
      { view: { kind: 'expenses', tab: 'mileage' }, find: { button: 'Add trip' }, act: 'click', say: 'Step one: Add trip. A blank trip row opens.' },
      { find: { placeholder: 'Who you saw and why' }, say: 'Step two: the date, the kilometres, the purpose, and the vehicle. The purpose is what CRA asks for.' },
      { find: { text: 'Claim' }, say: 'Step three: Post claim turns the year\'s trips into one Motor Vehicle expense at the prescribed rate, credited to the shareholder or the employee who drove.' },
    ],
    outro: 'That is mileage. Fuel and repairs paid by the company go through Quick Entry as usual; the claim is for a personal vehicle.',
  },
  {
    id: 'foreignCurrency', group: 'Accounting and reports', title: 'Foreign currency', minutes: 2,
    keys: /\b(foreign|us dollars?|usd|currency|exchange rate|fx)\b/,
    intro: 'CAD stays the books. A US-dollar invoice or bill records the foreign amount and the rate, and the difference on payment is exchange gain or loss.',
    steps: [
      { view: { kind: 'invoiceEditor' }, find: { text: 'Amounts are' }, say: 'On an invoice or bill, choose the currency and the rate; the CAD amount is what posts. The rate can come from the Bank of Canada table in Settings.' },
      { view: { kind: 'monthEndClose' }, find: { text: 'Guided close' }, say: 'At month end, the revaluation card restates open foreign balances at the closing rate, and the Foreign Exchange Gain/Loss account carries the difference.' },
    ],
    outro: 'That is foreign currency. The Comprehensive report has a foreign currency section for the accountant.',
  },
  {
    id: 'businessTax', group: 'Year end and housekeeping', title: 'Business tax, GIFI and the T2', minutes: 2,
    keys: /\b(business tax|corporate tax|t2|t2125|gifi export|schedule 100|schedule 125|tax return)\b/,
    intro: 'When the year is signed off, the T2 needs the GIFI schedules and the accountant needs the continuity reports.',
    steps: [
      { view: { kind: 'taxGifi' }, find: { text: 'GIFI' }, say: 'Business Tax and GIFI: every account mapped to a GIFI code, unmapped ones flagged, and Export builds the schedule 100 and 125 figures. A sole proprietor gets the T2125 instead.' },
      { view: { kind: 'report', report: 't2Reconciliation' }, find: { text: 'T2' }, say: 'The T2 Preliminary Tax Reconciliation adds back depreciation, deducts CCA, and shows what is missing before the accountant starts.' },
    ],
    outro: 'That is business tax. The CPA year-end continuity group holds the schedules the accountant asks for next.',
  },
  {
    id: 'accountantCentre', group: 'Year end and housekeeping', title: 'Accountant Centre and workpapers', minutes: 2,
    keys: /\b(accountant centre|accountant center|workpapers?|cpa review|compliance|review package)\b/,
    intro: 'Accountant Centre is where the accountant works: compliance checks, workpapers for each balance, and the CPA review package.',
    steps: [
      { view: { kind: 'accountantCentre' }, find: { text: 'Accountant Centre' }, say: 'Compliance first: engagement letter, authorizations and licences before work starts. Reclassify Transactions and Journal Entries are the tools.' },
      { view: { kind: 'workpapers' }, find: { text: 'Workpapers' }, say: 'Workpapers: one sheet per balance-sheet account with status, notes and attachments, so the file speaks for itself.' },
      { view: { kind: 'cpaReview' }, find: { text: 'CPA Review' }, say: 'CPA Review: notes for the reviewer, resolved as they are answered, and Generate Review Package bundles statements and schedules into one PDF.' },
    ],
    outro: 'That is Accountant Centre. The Auditor Centre next door runs the double-entry checks any time.',
  },
);

export const LESSON_GROUPS: LessonGroup[] =['Getting started', 'Money in', 'Money out', 'Banking', 'Payroll', 'Sales tax', 'Accounting and reports', 'Year end and housekeeping'];

const STOP = new Set(['teach', 'me', 'us', 'train', 'show', 'how', 'to', 'do', 'i', 'we', 'walk', 'through', 'guide', 'tutorial', 'lesson', 'on', 'for', 'about', 'learn', 'the', 'a', 'an', 'please', 'want', 'need', 'help', 'with', 'and', 'of', 'in', 'my', 'our', 'your', 'can', 'you']);

/** The lesson a sentence asks for: by its trigger phrases first, then by the topic words left
 * once the asking words are stripped ("teach me payroll" → "payroll" → Running payroll). */
export function findLesson(text: string): Lesson | null {
  const lower = text.toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ');
  const byKeys = LESSONS.find((l) => l.keys.test(lower));
  if (byKeys) return byKeys;
  const words = lower.split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  if (words.length === 0) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ');
  const scored = LESSONS.map((l) => {
    const hay = `${norm(l.title)} ${l.id.toLowerCase()} ${norm(l.group)}`;
    const hits = words.filter((w) => hay.includes(w.replace(/s$/, ''))).length;
    return { l, hits, titleHit: words.some((w) => norm(l.title).includes(w.replace(/s$/, ''))) };
  }).filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits || Number(b.titleHit) - Number(a.titleHit) || a.l.title.length - b.l.title.length);
  return scored[0]?.l ?? null;
}
