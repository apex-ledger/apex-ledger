/** The voice agent's grammar: turns one spoken sentence into a command the app can carry out.
 *
 * Deterministic on purpose. A bookkeeper says the same few things all day — "expense 85.50 fuel at
 * Shell on Visa with HST", "income 200 scrap copper into cash", "open payroll", "new company
 * Lakeshore Plumbing, plumber, year end December 31" — and a grammar that reads those the same
 * way every time is worth more than a model that is usually right. Nothing here posts anything:
 * the result is shown back for confirmation, and only then does the screen call the same handler
 * a typed entry would.
 *
 * Pure so the tests can throw sentences at it.
 */
import type { Account, TaxCode } from '../types';
import { findLesson } from './lessons';

export interface VoiceContext {
  today: string;
  accounts: Account[];
  /** Business types the company wizard offers, so "plumber" lands on the right one. */
  businessTypes: Array<{ id: string; label: string }>;
  /** Optional: vendor and customer names, so "at Shell" finds "Shell Canada". */
  vendorNames?: string[];
  customerNames?: string[];
}

export interface QuickEntryCommand {
  kind: 'quickEntry';
  type: 'expense' | 'income';
  entryDate: string;
  /** What was said as the amount: the total when "tax included" or a card/receipt total, else the pre-tax figure. */
  spokenCents: number;
  taxIncluded: boolean;
  taxCode: TaxCode | null;
  baseCents: number;
  taxCents: number;
  categoryAccountId: number | null;
  categoryText: string | null;
  moneyAccountId: number | null;
  moneyText: string | null;
  description: string;
  /** Fields the sentence did not settle; the panel asks for them before posting. */
  missing: Array<'amount' | 'category' | 'moneyAccount'>;
}

export interface CreateCompanyCommand {
  kind: 'createCompany';
  legalName: string;
  businessType: string | null;
  businessTypeLabel: string | null;
  fiscalYearEnd: { month: number; day: number } | null;
  businessNumber: string | null;
}

export interface NavigateCommand {
  kind: 'navigate';
  label: string;
  /** A view the store understands; kept as data so the grammar has no store import. */
  view: Record<string, unknown>;
}

export interface HelpCommand {
  kind: 'help';
  topic: string;
  /** Spoken and shown: the steps in one breath. */
  answer: string;
  /** The screen those steps happen on, when there is one. */
  view: Record<string, unknown> | null;
  viewLabel: string | null;
}

/** A question about the books. The grammar names the figure and the period; the screen looks it up. */
export interface QueryCommand {
  kind: 'query';
  question: 'accountBalance' | 'customerOwes' | 'vendorOwed' | 'receivables' | 'payables' | 'hstOwing' | 'sales' | 'expenses' | 'netIncome' | 'cash';
  subjectAccountId: number | null;
  subjectName: string | null;
  from: string;
  to: string;
  periodLabel: string;
}

function periodFrom(lower: string, today: string): { from: string; to: string; label: string } {
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (/\blast month\b/.test(lower)) { const yy = m === 1 ? y - 1 : y; const mm = m === 1 ? 12 : m - 1; return { from: `${yy}-${pad(mm)}-01`, to: `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}`, label: 'last month' }; }
  if (/\bthis month\b/.test(lower)) return { from: `${y}-${pad(m)}-01`, to: today, label: 'this month' };
  if (/\b(this quarter|the quarter)\b/.test(lower)) { const q = Math.floor((m - 1) / 3); return { from: `${y}-${pad(q * 3 + 1)}-01`, to: today, label: 'this quarter' }; }
  if (/\blast quarter\b/.test(lower)) { let q = Math.floor((m - 1) / 3) - 1; let yy = y; if (q < 0) { q = 3; yy -= 1; } return { from: `${yy}-${pad(q * 3 + 1)}-01`, to: `${yy}-${pad(q * 3 + 3)}-${pad(lastDay(yy, q * 3 + 3))}`, label: 'last quarter' }; }
  if (/\blast year\b/.test(lower)) return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: 'last year' };
  return { from: `${y}-01-01`, to: today, label: 'this year to date' };
}

function parseQuery(lower: string, context: VoiceContext): QueryCommand | null {
  const period = periodFrom(lower, context.today);
  const base = { kind: 'query' as const, subjectAccountId: null, subjectName: null, from: period.from, to: period.to, periodLabel: period.label };
  const isQuestion = /^(?:what|what's|whats|how much|how many|who|do i|do we|show)\b/.test(lower) || /\b(balance|owing|owe|owes|outstanding)\b/.test(lower);
  if (!isQuestion) return null;
  // Named party first: "how much does Maple Ridge owe", "what do we owe Wolseley".
  const findName = (names: string[]) => names.find((n) => { const w = normalize(n).split(' ').filter((x) => x.length > 3); return (w.length > 0 && w.every((x) => lower.includes(x))) || (w[0] !== undefined && w[0].length >= 4 && new RegExp(`\\b${w[0]}\\b`).test(lower)); }) ?? null;
  if (/\b(hst|gst|sales tax)\b/.test(lower) && /\b(owe|owing|payable|due|remit|balance|how much)\b/.test(lower)) return { ...base, question: 'hstOwing' };
  if (/\b(do (?:i|we) owe|we owe|i owe|owed to|owing to)\b/.test(lower)) {
    const vendor = findName(context.vendorNames ?? []);
    if (vendor) return { ...base, question: 'vendorOwed', subjectName: vendor };
    return { ...base, question: 'payables' };
  }
  if (/\b(owes?|owing|outstanding|balance due)\b/.test(lower) && !/\b(hst|gst|tax)\b/.test(lower)) {
    const customer = findName(context.customerNames ?? []);
    if (customer) return { ...base, question: 'customerOwes', subjectName: customer };
    if (/\b(who|customers?|receivables?|clients?)\b/.test(lower)) return { ...base, question: 'receivables' };
  }
  if (/\b(hst|gst|sales tax)\b/.test(lower) && /\b(owe|owing|payable|due|remit|balance|how much)\b/.test(lower)) return { ...base, question: 'hstOwing' };
  if (/\b(net income|profit|bottom line|made money|lost money)\b/.test(lower)) return { ...base, question: 'netIncome' };
  if (/\b(sales|revenue|income|billed|invoiced)\b/.test(lower) && /\b(what|how much|total)\b/.test(lower)) return { ...base, question: 'sales' };
  if (/\b(expenses|spend|spent|spending|costs)\b/.test(lower) && /\b(what|how much|total)\b/.test(lower)) return { ...base, question: 'expenses' };
  if (/\b(in the bank|all (?:the |our )?(?:banks?|accounts)|cash position|total cash|how much money|how much cash)\b/.test(lower)) return { ...base, question: 'cash' };
  if (/\b(balance|how much)\b/.test(lower)) {
    const money = matchMoneyAccount(lower, context.accounts);
    if (money.account) return { ...base, question: 'accountBalance', subjectAccountId: money.account.id, subjectName: money.account.name };
    if (/\b(cash|bank|money|in the bank)\b/.test(lower)) return { ...base, question: 'cash' };
    const named = matchAccount(lower.replace(/\b(what|whats|what's|is|the|balance|of|in|on|how|much|do|we|have|account)\b/g, ' '), context.accounts.filter((a) => a.isActive));
    if (named) return { ...base, question: 'accountBalance', subjectAccountId: named.id, subjectName: named.name };
  }
  if (/\b(receivables?|accounts receivable|who owes)\b/.test(lower)) return { ...base, question: 'receivables' };
  if (/\b(payables?|accounts payable)\b/.test(lower)) return { ...base, question: 'payables' };
  return null;
}

/** A lesson: the agent opens the screen and walks through it control by control. */
export interface TeachCommand {
  kind: 'teach';
  lessonId: string;
  title: string;
}

/** Inside a lesson, the words that move it along. */
export type LessonControl = 'next' | 'back' | 'repeat' | 'stop';

export function parseLessonControl(text: string): LessonControl | null {
  const lower = text.trim().toLowerCase().replace(/[.!?]+$/, '');
  if (/^(next|continue|go on|ok next|okay next|got it|done|yes)$/.test(lower)) return 'next';
  if (/^(back|previous|go back)$/.test(lower)) return 'back';
  if (/^(repeat|again|say that again|pardon)$/.test(lower)) return 'repeat';
  if (/^(stop|quit|exit|finish|end|cancel|enough|stop lesson)$/.test(lower)) return 'stop';
  return null;
}

export type VoiceCommand =
  | QuickEntryCommand
  | CreateCompanyCommand
  | NavigateCommand
  | HelpCommand
  | QueryCommand
  | TeachCommand
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'unknown'; text: string };

/** Self-help: "how do I …" answered in the app's own words, with the screen it happens on. */
const HELP: Array<{ keys: RegExp; topic: string; answer: string; view?: Record<string, unknown>; viewLabel?: string }> = [
  { keys: /\b(what can you do|what do you do|help me|commands?|what can i say)\b/, topic: 'What I can do', answer: 'Say an expense or income, like "expense 85 dollars fuel on Visa with HST", and I read it back before posting. Say a page to open, like "open payroll". Say "new company" with the name, business type and year end to start the company form. Or ask how to do something, like "how do I file HST".' },
  { keys: /\b(enter|record|add|create|post)\b.*\b(bill|vendor invoice)\b|\bbill\b.*\b(enter|record|how)\b/, topic: 'Entering a bill', answer: 'Expenses and Bills, then New Bill. Pick the vendor, enter the date, amount and tax code, and Save. The bill sits in Accounts Payable until you pay it from Make Payment.', view: { kind: 'purchases', tab: 'unpaid' }, viewLabel: 'Vendor Bills' },
  { keys: /\b(pay|paying)\b.*\bbill\b|\bmake payment\b/, topic: 'Paying a bill', answer: 'Toolbar Make Payment, or Expenses and Bills, Unpaid. Choose the bill, the bank account, the date and the amount. Part payments are fine; the balance stays open.', view: { kind: 'purchases', tab: 'unpaid' }, viewLabel: 'Vendor Bills' },
  { keys: /\b(quick entry|enter|record|log)\b.*\b(expense|receipt|purchase)\b|\bexpense\b.*\bhow\b/, topic: 'Recording an expense', answer: 'Quick Entry, Expense tab: date, the bank or card it was paid from, the category, the amount and the tax code, then Save. Or just say it to me: "expense 40 dollars parking on Visa with HST".', view: { kind: 'quickEntry', type: 'expense' }, viewLabel: 'Quick Entry' },
  { keys: /\b(receive|record|apply)\b.*\bpayment\b|\bcustomer paid\b|\bgot paid\b.*\binvoice\b/, topic: 'Receiving a payment', answer: 'Toolbar Receive Payment. Pick the customer, tick the invoice, enter the date and amount. It lands in Undeposited Funds; then Make Deposit moves it into the bank on the day it was banked.', view: { kind: 'sales', tab: 'invoices' }, viewLabel: 'Invoices' },
  { keys: /\b(create|send|make|write|issue)\b.*\binvoice\b|\binvoice\b.*\b(how|create)\b/, topic: 'Creating an invoice', answer: 'Toolbar New Invoice. Choose the customer, add lines from your items or type them, check the tax code on each line, then Save and Email or Save as PDF.', view: { kind: 'invoiceEditor' }, viewLabel: 'New Invoice' },
  { keys: /\bdeposit\b/, topic: 'Making a deposit', answer: 'Sales and Payments, Deposits, then Make Deposit. Tick the payments that went to the bank together, choose the account and the date. The total must match the bank line.', view: { kind: 'sales', tab: 'deposits' }, viewLabel: 'Deposits' },
  { keys: /\b(reconcile|reconciliation)\b/, topic: 'Reconciling the bank', answer: 'Banking and Accounting, Bank Reconciliation. Pick the account, enter the statement date and ending balance, tick every line that appears on the statement. Difference zero means done; Complete locks it.', view: { kind: 'bankReconciliation' }, viewLabel: 'Bank Reconciliation' },
  { keys: /\b(import|upload|download)\b.*\b(bank|statement|ofx|csv)\b|\bbank (import|feed)\b/, topic: 'Importing a bank statement', answer: 'Toolbar Import Bank. Choose the OFX, QFX, QBO or CSV file your bank gave you. Each line gets a suggested category; accept or change it, match payments to invoices and bills, then Post.', view: { kind: 'bankImport' }, viewLabel: 'Import Bank' },
  { keys: /\b(file|filing|submit|remit)\b.*\b(hst|gst|sales tax|return)\b|\b(hst|gst)\b.*\b(file|return|how)\b/, topic: 'Filing the GST/HST return', answer: 'Sales Tax, then File GST/HST Return. Check the period, compare collected and input tax credits with GST/HST Payable, choose the account the payment comes from, and File. The period locks so nothing changes what was reported.', view: { kind: 'report', report: 'hstFiling' }, viewLabel: 'File GST/HST Return' },
  { keys: /\b(run|do|process)\b.*\bpayroll\b|\bpay (run|period)\b|\bpayroll\b.*\bhow\b/, topic: 'Running payroll', answer: 'Payroll, then Run Payroll. Pick the employee and the pay period, enter hours for hourly staff, add any bonus, benefit or deduction, and Post. CPP, EI and tax are calculated for you; the pay stub is ready to print or email.', view: { kind: 'payroll' }, viewLabel: 'Payroll' },
  { keys: /\b(add|new|create|hire)\b.*\bemployee\b/, topic: 'Adding an employee', answer: 'Payroll, Add Employee. Name, province, hourly rate or salary, pay frequency, TD1 claim amounts and the SIN. Bank details are only needed for direct deposit files.', view: { kind: 'payroll' }, viewLabel: 'Payroll' },
  { keys: /\b(pd7a|remittance|source deductions)\b/, topic: 'PD7A remittance', answer: 'Payroll, PD7A Remittance. Choose the month; it shows CPP, EI and tax withheld plus the employer share. Pay CRA that amount by the 15th of the following month and record the payment from the bank.', view: { kind: 'payroll' }, viewLabel: 'Payroll' },
  { keys: /\b(t4|t4a|t5018|roe|record of employment|year[- ]end slips?)\b/, topic: 'Year-end slips', answer: 'Payroll, Year-End Slips. T4 for employees, T4A and T5018 for contractors, and the summary, all from the posted pay runs. ROE is on each employee row when someone leaves.', view: { kind: 'payroll' }, viewLabel: 'Payroll' },
  { keys: /\b(add|new|create)\b.*\b(customer|client)\b/, topic: 'Adding a customer', answer: 'Sales and Payments, Customers, then Add. Name, email, phone, payment terms. A late interest rate can be set if their agreement allows it.', view: { kind: 'sales', tab: 'customers' }, viewLabel: 'Customers' },
  { keys: /\b(add|new|create)\b.*\b(vendor|supplier)\b/, topic: 'Adding a vendor', answer: 'Expenses and Bills, Vendors, then Add. Name, terms and the usual expense account, so new bills come prefilled. Mark subcontractors for T5018.', view: { kind: 'expenses', tab: 'vendors' }, viewLabel: 'Vendors' },
  { keys: /\b(add|new|create)\b.*\baccount\b|\bchart of accounts\b/, topic: 'Adding an account', answer: 'Chart of Accounts, Add. Give it a code in the usual range, a name, the type, and a GIFI code; bank accounts and credit cards get their own subtype so they appear in Banking and payments.', view: { kind: 'chartOfAccounts' }, viewLabel: 'Chart of Accounts' },
  { keys: /\bjournal entry\b|\bgeneral journal\b|\badjusting entry\b/, topic: 'Journal entries', answer: 'Toolbar Journal Entry. Date, memo, then lines with debits and credits that balance. Tick Adjusting for year-end adjustments so they show on the Adjusting Entries report.', view: { kind: 'journalForm', id: 'new' }, viewLabel: 'Journal Entry' },
  { keys: /\b(year[- ]end|close the year|closing|sign[- ]?off)\b/, topic: 'Year-end sign-off', answer: 'Reports, Audit exceptions, Year-End Sign-off. Every check gets a light: red must be fixed, amber needs a note. When it reads Ready, record the decision and lock the period in Month-End Close.', view: { kind: 'report', report: 'yearEndSignoff' }, viewLabel: 'Year-End Sign-off' },
  { keys: /\b(backup|back up|restore)\b/, topic: 'Backups', answer: 'Toolbar Backup saves a copy now. Automatic backups go beside the company file every day, and to a second folder if you set one in Settings. Restore from File, Open Company, Recovery points.', view: { kind: 'companySettings' }, viewLabel: 'Settings' },
  { keys: /\bcredit note\b|\brefund\b/, topic: 'Credit notes', answer: 'Sales and Payments, Credit Notes, for a customer; Expenses and Bills, Vendor Credits, for a vendor. Apply it against an open invoice or bill, or refund it through the bank.', view: { kind: 'sales', tab: 'creditNotes' }, viewLabel: 'Credit Notes' },
  { keys: /\b(estimate|quote|quotation)\b/, topic: 'Estimates', answer: 'Sales and Payments, Estimates. Build it like an invoice, send it, and when the customer says yes, Convert to Invoice keeps the lines and numbering.', view: { kind: 'sales', tab: 'estimates' }, viewLabel: 'Estimates' },
  { keys: /\bpurchase order\b|\bpo\b/, topic: 'Purchase orders', answer: 'Inventory, Purchase Orders. Order from the vendor, Receive when stock arrives, then match the supplier invoice so the bill and the stock agree.', view: { kind: 'purchaseOrders' }, viewLabel: 'Purchase Orders' },
  { keys: /\b(inventory|stock|product|item)\b.*\b(add|new|track|count)\b|\b(add|new)\b.*\b(product|item|stock)\b/, topic: 'Inventory items', answer: 'Inventory, Add. Set the sale and purchase prices, the income, cost and asset accounts, and tick Track quantity for stock. Cost is moving average; the status report shows what is on hand.', view: { kind: 'products' }, viewLabel: 'Inventory' },
  { keys: /\b(recurring|repeat|every month|monthly)\b.*\b(bill|expense|invoice|rent)\b/, topic: 'Recurring entries', answer: 'Quick Entry, Recurring tab, or Sales, Recurring for invoices. Save the template with a schedule; Action Centre reminds you when one is due and posts it with one click.', view: { kind: 'quickEntry', type: 'expense' }, viewLabel: 'Quick Entry' },
  { keys: /\b(merge|duplicates?)\b/, topic: 'Merging duplicates', answer: 'Open the one to keep, then Merge duplicate. Every invoice, bill and entry on the other one moves over and the duplicate becomes inactive.', view: { kind: 'expenses', tab: 'vendors' }, viewLabel: 'Vendors' },
  { keys: /\b(reclassify|wrong account|move .* to another account|recode)\b/, topic: 'Reclassifying', answer: 'Accountant Centre, Reclassify Transactions. Pick the account the amounts sit in, tick the lines, choose where they belong. Each gets its own adjusting entry on the original date.', view: { kind: 'reclassify' }, viewLabel: 'Reclassify Transactions' },
  { keys: /\b(gifi|t2|corporate tax|t2125)\b/, topic: 'Business tax and GIFI', answer: 'Business Tax and GIFI. Every account maps to a GIFI code; Export builds the schedule 100 and 125 figures for the T2, and the T2125 for a sole proprietor.', view: { kind: 'taxGifi' }, viewLabel: 'Business Tax & GIFI' },
  { keys: /\b(late interest|overdue interest|charge interest)\b/, topic: 'Late interest', answer: 'Set the rate on the customer, then on their page press Charge late interest. It adds an interest invoice from the day after the due date and stamps how far it has been charged.', view: { kind: 'sales', tab: 'customers' }, viewLabel: 'Customers' },
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const NAV: Array<{ words: string[]; label: string; view: Record<string, unknown> }> = [
  { words: ['dashboard', 'home'], label: 'Dashboard', view: { kind: 'dashboard' } },
  { words: ['action centre', 'action center'], label: 'Action Centre', view: { kind: 'actionCentre' } },
  { words: ['new invoice', 'create invoice'], label: 'New Invoice', view: { kind: 'invoiceEditor' } },
  { words: ['invoices'], label: 'Invoices', view: { kind: 'sales', tab: 'invoices' } },
  { words: ['customers', 'clients'], label: 'Customers', view: { kind: 'sales', tab: 'customers' } },
  { words: ['sales'], label: 'Sales & Payments', view: { kind: 'sales' } },
  { words: ['new bill', 'enter bill', 'vendor bill'], label: 'Vendor Bills', view: { kind: 'purchases', tab: 'unpaid' } },
  { words: ['bills'], label: 'Vendor Bills', view: { kind: 'purchases', tab: 'unpaid' } },
  { words: ['vendors', 'suppliers'], label: 'Vendors', view: { kind: 'expenses', tab: 'vendors' } },
  { words: ['expenses'], label: 'Expenses & Bills', view: { kind: 'expenses' } },
  { words: ['quick entry', 'new expense'], label: 'Quick Entry', view: { kind: 'quickEntry', type: 'expense' } },
  { words: ['banking', 'bank'], label: 'Banking', view: { kind: 'bankImport' } },
  { words: ['bank reconciliation', 'reconcile'], label: 'Bank Reconciliation', view: { kind: 'bankReconciliation' } },
  { words: ['chart of accounts', 'accounts'], label: 'Chart of Accounts', view: { kind: 'chartOfAccounts' } },
  { words: ['journal entries', 'journal'], label: 'Journal Entries', view: { kind: 'journalList' } },
  { words: ['general ledger', 'ledger'], label: 'General Ledger', view: { kind: 'report', report: 'generalLedger' } },
  { words: ['inventory', 'products', 'items'], label: 'Inventory', view: { kind: 'products' } },
  { words: ['payroll'], label: 'Payroll', view: { kind: 'payroll' } },
  { words: ['sales tax', 'hst', 'gst'], label: 'Sales Tax (GST/HST)', view: { kind: 'hstCentre' } },
  { words: ['trial balance'], label: 'Trial Balance', view: { kind: 'report', report: 'trialBalance' } },
  { words: ['profit and loss', 'income statement', 'p and l'], label: 'Profit & Loss', view: { kind: 'report', report: 'incomeStatement' } },
  { words: ['balance sheet'], label: 'Balance Sheet', view: { kind: 'report', report: 'balanceSheet' } },
  { words: ['ageing', 'aging', 'who owes'], label: 'A/R Ageing', view: { kind: 'report', report: 'agingReceivable' } },
  { words: ['year end sign off', 'year-end sign-off', 'sign off'], label: 'Year-End Sign-off', view: { kind: 'report', report: 'yearEndSignoff' } },
  { words: ['reports'], label: 'Reports', view: { kind: 'reportsHub' } },
  { words: ['settings', 'company settings'], label: 'Settings', view: { kind: 'companySettings' } },
  { words: ['auditor centre', 'auditor center', 'audit'], label: 'Auditor Centre', view: { kind: 'audit' } },
];

/** "eighty five dollars and fifty cents" → 85.50; digits pass straight through. */
const SMALL: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE: Record<string, number> = { hundred: 100, thousand: 1000 };

function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const w of words) {
    if (w in SMALL) { current += SMALL[w]; seen = true; }
    else if (w in SCALE) { current = (current || 1) * SCALE[w]; if (SCALE[w] === 1000) { total += current; current = 0; } seen = true; }
    else if (w === 'and') continue;
    else return seen ? total + current : null;
  }
  return seen ? total + current : null;
}

/** Finds the amount in a sentence: "$85.50", "85 dollars 50", "eighty-five fifty", "85.5". */
export function extractAmountCents(text: string): { cents: number; consumed: string } | null {
  // "85 dollars 50" carries cents after the word dollars; a day number that follows ("14th",
  // "June") is not cents, hence the lookahead.
  const digit = text.match(/\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?:\s*(?:dollars?|bucks)(?:\s+(?:and\s+)?(\d{1,2})(?!\s*(?:st|nd|rd|th|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d|:))\b(?:\s*cents?)?)?)?/i);
  if (digit) {
    const whole = Number(digit[1].replace(/,/g, ''));
    const dec = digit[2] ? Number(digit[2].padEnd(2, '0')) : digit[3] ? Number(digit[3]) : 0;
    return { cents: whole * 100 + dec, consumed: digit[0] };
  }
  const tokens = text.toLowerCase().replace(/-/g, ' ').split(/\s+/);
  for (let i = 0; i < tokens.length; i += 1) {
    if (!(tokens[i] in SMALL) && !(tokens[i] in SCALE)) continue;
    let j = i;
    while (j < tokens.length && (tokens[j] in SMALL || tokens[j] in SCALE || tokens[j] === 'and')) j += 1;
    const dollars = wordsToNumber(tokens.slice(i, j));
    if (dollars === null) continue;
    let cents = 0;
    let k = j;
    if (tokens[k] === 'dollars' || tokens[k] === 'dollar') k += 1;
    if (tokens[k] === 'and') k += 1;
    let m = k;
    while (m < tokens.length && (tokens[m] in SMALL || tokens[m] === 'and')) m += 1;
    if (m > k) { const c = wordsToNumber(tokens.slice(k, m)); if (c !== null && c < 100 && (tokens[m] === 'cents' || tokens[m] === 'cent' || tokens[j] === 'dollars')) { cents = c; k = m + (tokens[m]?.startsWith('cent') ? 1 : 0); } }
    return { cents: dollars * 100 + cents, consumed: tokens.slice(i, k).join(' ') };
  }
  return null;
}

/** "today", "yesterday", "June 14", "14 June", "on the 14th", "2026-06-14". */
export function extractDate(text: string, today: string): { date: string; consumed: string } | null {
  const lower = text.toLowerCase();
  const iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { date: iso[0], consumed: iso[0] };
  const [y, m, d] = today.split('-').map(Number);
  const shift = (days: number) => { const t = new Date(Date.UTC(y, m - 1, d + days)); return t.toISOString().slice(0, 10); };
  if (/\byesterday\b/.test(lower)) return { date: shift(-1), consumed: 'yesterday' };
  if (/\btoday\b/.test(lower)) return { date: today, consumed: 'today' };
  const monthName = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/)
    ?? lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?(?:,?\s+(\d{4}))?\b/);
  if (monthName) {
    const a = monthName[1]; const b = monthName[2];
    const [mon, day] = /^\d/.test(a) ? [b, a] : [a, b];
    const idx = MONTHS.indexOf(mon) >= 0 ? MONTHS.indexOf(mon) : MONTH_SHORT.indexOf(mon.slice(0, 3));
    if (idx >= 0) {
      const year = monthName[3] ? Number(monthName[3]) : y;
      return { date: `${year}-${String(idx + 1).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`, consumed: monthName[0] };
    }
  }
  const dayOnly = lower.match(/\bon the (\d{1,2})(?:st|nd|rd|th)\b/);
  if (dayOnly) return { date: `${y}-${String(m).padStart(2, '0')}-${String(Number(dayOnly[1])).padStart(2, '0')}`, consumed: dayOnly[0] };
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Best account for a phrase: exact name, then every word of the phrase inside the name, then the
 * name's words inside the phrase. "fuel" → "Motor Vehicle Expenses" needs the synonym table. */
const SYNONYMS: Array<[RegExp, string[]]> = [
  [/\b(fuel|gas|gasoline|diesel|petrol|parking|mileage|car wash|oil change|tires?)\b/, ['motor vehicle', 'vehicle', 'auto', 'fuel']],
  [/\b(phone|cell|mobile|telephone|bell|rogers|telus)\b/, ['telephone', 'phone']],
  [/\b(internet|wifi|broadband)\b/, ['internet', 'telephone']],
  [/\b(hydro|electricity|water bill|gas bill|enbridge|utilities)\b/, ['utilities']],
  [/\b(rent|lease)\b/, ['rent']],
  [/\b(coffee|lunch|dinner|meal|meals|restaurant|tim hortons|starbucks)\b/, ['meals']],
  [/\b(software|subscription|saas|microsoft|adobe|zoom|quickbooks)\b/, ['software', 'subscriptions', 'dues']],
  [/\b(office|supplies|stationery|paper|toner|staples|pens?)\b/, ['office supplies', 'office']],
  [/\b(advertising|ads|marketing|google ads|facebook)\b/, ['advertising']],
  [/\b(insurance|premium)\b/, ['insurance']],
  [/\b(bank fee|bank charge|service charge|nsf)\b/, ['bank charges', 'bank']],
  [/\b(interest)\b/, ['interest']],
  [/\b(wages?|salary|salaries|payroll)\b/, ['wages', 'salaries']],
  [/\b(subcontract|contractor|sub)\b/, ['subcontract']],
  [/\b(travel|flight|hotel|airfare|air canada|westjet)\b/, ['travel']],
  [/\b(training|course|seminar|education)\b/, ['training']],
  [/\b(licen[cs]e|permit)\b/, ['licen']],
  [/\b(donation|charity)\b/, ['donation', 'charitable']],
  [/\b(legal|lawyer|accounting fee|accountant)\b/, ['legal', 'accounting']],
  [/\b(materials?|parts|supplies for job|cost of goods|inventory purchase)\b/, ['cost of goods', 'materials', 'purchases']],
  [/\b(repair|maintenance)\b/, ['repairs', 'maintenance']],
  [/\b(shipping|postage|courier|delivery)\b/, ['postage', 'delivery', 'shipping']],
  [/\b(sales?|service|consulting|job|revenue|fees?)\b/, ['service revenue', 'sales', 'consulting', 'revenue']],
  [/\b(interest income|interest earned)\b/, ['interest income']],
  [/\b(scrap|other income|misc)\b/, ['other revenue', 'other income']],
];

export function matchAccount(phrase: string, candidates: Account[]): Account | null {
  const p = normalize(phrase);
  if (!p) return null;
  const exact = candidates.find((a) => normalize(a.name) === p);
  if (exact) return exact;
  const words = p.split(' ').filter((w) => w.length > 2 && !['the', 'and', 'for', 'from', 'with'].includes(w));
  const scored = candidates.map((a) => {
    const n = normalize(a.name);
    const hits = words.filter((w) => n.includes(w)).length;
    return { a, score: hits };
  }).filter((s) => s.score > 0).sort((x, y) => y.score - x.score || x.a.name.length - y.a.name.length);
  if (scored[0]) return scored[0].a;
  for (const [re, keys] of SYNONYMS) {
    if (!re.test(p)) continue;
    for (const key of keys) {
      const hit = candidates.find((a) => normalize(a.name).includes(key));
      if (hit) return hit;
    }
  }
  return null;
}

const MONEY_WORDS: Array<[RegExp, string[]]> = [
  [/\b(visa)\b/, ['visa']],
  [/\b(mastercard|master card|mc)\b/, ['mastercard', 'master card']],
  [/\b(amex|american express)\b/, ['american express', 'amex']],
  [/\b(credit card|card)\b/, ['visa', 'mastercard', 'credit card']],
  [/\b(cash box|petty cash|cash)\b/, ['cash']],
  [/\b(savings)\b/, ['savings']],
  [/\b(td|toronto dominion)\b/, ['td']],
  [/\b(rbc|royal bank)\b/, ['rbc']],
  [/\b(scotia|scotiabank)\b/, ['scotia']],
  [/\b(bmo)\b/, ['bmo']],
  [/\b(cibc)\b/, ['cibc']],
  [/\b(chequing|checking|bank|debit|e-?transfer|etransfer|cheque|check)\b/, ['chequing', 'checking', 'bank']],
];

function matchMoneyAccount(text: string, accounts: Account[]): { account: Account | null; text: string | null } {
  const money = accounts.filter((a) => a.isActive && (a.accountSubtype === 'Cash and Bank' || a.accountSubtype === 'Credit Card'));
  const lower = normalize(text);
  for (const [re, keys] of MONEY_WORDS) {
    const m = lower.match(re);
    if (!m) continue;
    for (const key of keys) {
      const hit = money.find((a) => normalize(a.name).includes(key));
      if (hit) return { account: hit, text: m[0] };
    }
    return { account: null, text: m[0] };
  }
  return { account: null, text: null };
}

function taxFromWords(text: string, type: 'expense' | 'income'): { taxCode: TaxCode | null; taxIncluded: boolean; explicit: boolean } {
  const lower = text.toLowerCase();
  if (/\b(no tax|no hst|no gst|tax exempt|exempt|non[- ]?taxable|without tax|without hst)\b/.test(lower)) return { taxCode: 'NonHST', taxIncluded: false, explicit: true };
  if (/\b(meals?|coffee|lunch|dinner|restaurant)\b/.test(lower) && type === 'expense') return { taxCode: 'MealsHST', taxIncluded: /\b(including|included|incl|total|receipt)\b/.test(lower), explicit: true };
  if (/\b(gst only|gst 5|5 percent gst|alberta)\b/.test(lower)) return { taxCode: 'GST_AB', taxIncluded: /\b(including|included|incl|total)\b/.test(lower), explicit: true };
  if (/\b(hst|gst|tax|taxes)\b/.test(lower)) {
    const included = /\b(including|included|incl|inclusive|total|after tax|with tax in|tax in)\b/.test(lower) || /\b(total|receipt)\b/.test(lower);
    return { taxCode: 'HST', taxIncluded: included, explicit: true };
  }
  return { taxCode: 'HST', taxIncluded: false, explicit: false };
}

function rate(taxCode: TaxCode | null): number {
  switch (taxCode) {
    case 'HST': case 'MealsHST': case 'HST_NB': case 'HST_NL': case 'HST_PE': return 0.13;
    case 'HST_NS': case 'HST_15': return 0.15;
    case 'GST': case 'GST_AB': case 'GST_NT': case 'GST_NU': case 'GST_YT': return 0.05;
    default: return 0;
  }
}

function splitTax(spokenCents: number, taxCode: TaxCode | null, taxIncluded: boolean): { baseCents: number; taxCents: number } {
  const r = rate(taxCode);
  if (r === 0) return { baseCents: spokenCents, taxCents: 0 };
  if (taxIncluded) {
    const base = Math.round(spokenCents / (1 + r));
    return { baseCents: base, taxCents: spokenCents - base };
  }
  return { baseCents: spokenCents, taxCents: Math.round(spokenCents * r) };
}

function fiscalYearEndFrom(text: string): { month: number; day: number } | null {
  const lower = text.toLowerCase();
  const m = lower.match(/(?:year[- ]?end|fiscal year(?: end(?:s|ing)?)?|fye)\s*(?:is|of|on|:)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{1,2})?/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]) + 1;
  const lastDay = new Date(Date.UTC(2025, month, 0)).getUTCDate();
  return { month, day: m[2] ? Math.min(Number(m[2]), lastDay) : lastDay };
}

function businessTypeFrom(text: string, types: VoiceContext['businessTypes']): { id: string; label: string } | null {
  const lower = normalize(text);
  const scored = types.map((t) => {
    const words = normalize(t.label).split(' ').filter((w) => w.length > 3 && !['other', 'general', 'service', 'services', 'small', 'home', 'store', 'professional', 'company', 'centre'].includes(w));
    const hits = words.filter((w) => lower.includes(w.replace(/s$/, ''))).length;
    return { t, hits };
  }).filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits);
  return scored[0]?.t ?? null;
}

export function parseVoiceCommand(rawText: string, context: VoiceContext): VoiceCommand {
  const text = rawText.trim().replace(/[.!?]+$/, '');
  const lower = text.toLowerCase();
  if (!text) return { kind: 'unknown', text };
  if (/^(yes|yeah|yep|confirm|confirmed|post it|post|save|save it|go ahead|ok|okay|correct|that's right|do it)\b/.test(lower)) return { kind: 'confirm' };
  if (/^(no|nope|cancel|stop|never mind|nevermind|discard|forget it|wrong)\b/.test(lower)) return { kind: 'cancel' };

  // ---- company creation ----
  const company = lower.match(/^(?:please\s+)?(?:create|new|start|set up|setup|open)\s+(?:a\s+)?(?:new\s+)?company\s*(?:called|named|for|:)?\s*(.+)$/);
  if (company) {
    let rest = text.slice(text.length - company[1].length);
    const fye = fiscalYearEndFrom(rest);
    const bn = rest.match(/\b(\d{9})\s*(?:rc|rt)?\s*(\d{4})?\b/i);
    const type = businessTypeFrom(rest, context.businessTypes);
    // The name is whatever comes before the first comma or the first keyword.
    let name = rest.split(/,|\b(?:year[- ]?end|fiscal|business type|type|bn|business number|it's a|its a|it is a|which is a)\b/i)[0].trim();
    if (type && !name.split(',')[0]) name = rest.trim();
    name = name.replace(/\s+(inc|ltd|limited|corp|corporation)\.?$/i, (m) => ` ${m.trim().replace(/\.$/, '')}`).replace(/\s{2,}/g, ' ');
    rest = rest.trim();
    return { kind: 'createCompany', legalName: capitalize(name), businessType: type?.id ?? null, businessTypeLabel: type?.label ?? null, fiscalYearEnd: fye, businessNumber: bn ? `${bn[1]}${bn[2] ? `RC${bn[2]}` : ''}` : null };
  }

  // ---- questions about the books ----
  const query = parseQuery(lower, context);
  if (query) return query;

  // ---- lessons: "teach me quick entry", "how to create an invoice", "walk me through payroll" ----
  const teaching = /^(?:please\s+)?(?:teach(?: me| us)?|train me|show me how|walk me through|guide me(?: through)?|tutorial(?: on| for)?|lesson(?: on)?|learn|how to|how do (?:i|we)|i want to learn|help me learn)\b/.test(lower) || /\b(teach|tutorial|lesson|walk me through)\b/.test(lower);
  if (teaching) {
    const lesson = findLesson(lower);
    if (lesson) return { kind: 'teach', lessonId: lesson.id, title: lesson.title };
  }

  // ---- self-help ----
  const asking =/^(?:please\s+)?(?:how (?:do|can|would|should) (?:i|we|you)|how to|help(?: me)?(?: with)?|what is|what's|what are|what can (?:you|i)|what do you|where (?:is|do i|can i)|explain|tell me (?:how|about)|show me how|i want to|i need to)\b/.test(lower) || /\bhelp\b/.test(lower);
  if (asking) {
    const hit = HELP.find((h) => h.keys.test(lower));
    if (hit) return { kind: 'help', topic: hit.topic, answer: hit.answer, view: hit.view ?? null, viewLabel: hit.viewLabel ?? null };
    return { kind: 'help', topic: 'User Guide', answer: "I don't have a short answer for that one. The User Guide covers it; opening it.", view: { kind: 'userGuide' }, viewLabel: 'User Guide' };
  }

  // ---- navigation ----
  const nav = lower.match(/^(?:please\s+)?(?:show me|take me to|navigate to|switch to|go to|goto|open|show)\s+(?:the\s+|my\s+)?(.+)$/);
  if (nav) {
    const want = nav[1].replace(/\s+(page|screen|tab|report)$/, '').trim();
    const hit = NAV.find((n) => n.words.some((w) => want === w)) ?? NAV.find((n) => n.words.some((w) => want.includes(w)));
    if (hit) return { kind: 'navigate', label: hit.label, view: hit.view };
  }

  // ---- quick entry ----
  const isIncome = /^(?:record\s+|log\s+|enter\s+|add\s+)?(?:an?\s+)?(income|sale|sales|received|receipt|revenue|deposit|got paid|collected|earned)\b/.test(lower) || /\b(received|income|revenue)\b/.test(lower) && !/\b(paid|spent|expense|bought|purchased)\b/.test(lower);
  const isExpense = /^(?:record\s+|log\s+|enter\s+|add\s+)?(?:an?\s+)?(expense|spent|paid|bought|purchased|purchase|bill|cost|charge|payment)\b/.test(lower) || /\b(paid|spent|bought|purchased|expense)\b/.test(lower);
  const amount = extractAmountCents(text);
  if ((isIncome || isExpense || amount) && !nav) {
    const type: 'expense' | 'income' = isIncome && !isExpense ? 'income' : 'expense';
    const date = extractDate(text, context.today);
    const tax = taxFromWords(text, type);
    const money = matchMoneyAccount(text, context.accounts);
    // Strip what we have understood; the remainder is the description and the category hint.
    let remainder = lower;
    for (const chunk of [amount?.consumed, date?.consumed, money.text]) if (chunk) remainder = remainder.replace(chunk.toLowerCase(), ' ');
    remainder = remainder
      .replace(/\b(record|log|enter|add|an?|the|expense|income|sale|sales|received|spent|paid|bought|purchased|purchase|for|of|on|by|with|from|into|to|in|using|via|out of|through|charged|charge|plus|including|included|incl|inclusive|total|tax|taxes|hst|gst|no|exempt|receipt|dollars?|bucks|cents?|and)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const candidates = context.accounts.filter((a) => a.isActive && a.accountType === (type === 'expense' ? 'Expense' : 'Revenue'));
    const category = matchAccount(remainder, candidates) ?? matchAccount(lower, candidates);
    // "at Shell" names the vendor on the list as "Shell Canada"; the description leads with it.
    const party = [...(context.vendorNames ?? []), ...(context.customerNames ?? [])].find((n) => { const w = normalize(n).split(' ')[0]; return w.length > 3 && new RegExp(`\\b${w}\\b`).test(lower); }) ?? null;
    let rest = remainder;
    if (party) rest = rest.replace(new RegExp(`\\b(?:at|from|to)?\\s*${normalize(party).split(' ')[0]}\\b`), ' ').replace(/\s+/g, ' ').trim();
    rest = rest.replace(/\bat\b/g, ' ').replace(/\s+/g, ' ').trim();
    const descriptionSource = rest ? capitalize(rest) : category?.name ?? '';
    const description = party ? (descriptionSource ? `${party} — ${descriptionSource}` : party) : descriptionSource;
    const spokenCents = amount?.cents ?? 0;
    const { baseCents, taxCents } = splitTax(spokenCents, tax.taxCode, tax.taxIncluded);
    const missing: QuickEntryCommand['missing'] = [];
    if (!amount) missing.push('amount');
    if (!category) missing.push('category');
    if (!money.account) missing.push('moneyAccount');
    return {
      kind: 'quickEntry', type, entryDate: date?.date ?? context.today,
      spokenCents, taxIncluded: tax.taxIncluded, taxCode: tax.taxCode, baseCents, taxCents,
      categoryAccountId: category?.id ?? null, categoryText: remainder || null,
      moneyAccountId: money.account?.id ?? null, moneyText: money.text,
      description, missing,
    };
  }

  return { kind: 'unknown', text };
}

function capitalize(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bAnd\b/g, 'and').replace(/\bOf\b/g, 'of');
}

/** What the agent says back before asking for confirmation. */
export function describeCommand(cmd: VoiceCommand, accounts: Account[]): string {
  const name = (id: number | null) => accounts.find((a) => a.id === id)?.name ?? '';
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  switch (cmd.kind) {
    case 'quickEntry': {
      if (cmd.missing.length > 0) {
        const asks = cmd.missing.map((m) => m === 'amount' ? 'the amount' : m === 'category' ? 'the category' : 'which bank or card').join(' and ');
        return `I need ${asks}.`;
      }
      const tax = cmd.taxCents > 0 ? ` plus ${money(cmd.taxCents)} tax` : '';
      return `${cmd.type === 'expense' ? 'Expense' : 'Income'} ${money(cmd.baseCents)}${tax}, ${name(cmd.categoryAccountId)}, ${cmd.type === 'expense' ? 'paid from' : 'into'} ${name(cmd.moneyAccountId)}, dated ${cmd.entryDate}. Say confirm to post.`;
    }
    case 'createCompany':
      return `New company ${cmd.legalName}${cmd.businessTypeLabel ? `, ${cmd.businessTypeLabel}` : ''}${cmd.fiscalYearEnd ? `, year end ${MONTHS[cmd.fiscalYearEnd.month - 1]} ${cmd.fiscalYearEnd.day}` : ''}. Opening the company form.`;
    case 'navigate': return `Opening ${cmd.label}.`;
    case 'help': return cmd.answer;
    case 'teach': return `Starting the lesson: ${cmd.title}. Say next, back, repeat or stop.`;
    case 'query': return `Looking up ${cmd.subjectName ?? cmd.question} for ${cmd.periodLabel}.`;
    case 'confirm': return 'Posting.';
    case 'cancel': return 'Cancelled.';
    default: return "I didn't catch that. Try: expense 85 dollars fuel on Visa, or open payroll.";
  }
}
