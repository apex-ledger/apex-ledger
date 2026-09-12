import type { Account, Contact, JournalEntry } from '../types';

/**
 * Xero's own CSV import templates, built from this company's records so a client can move to
 * Xero without re-keying: Accounting → Advanced → Chart of accounts → Import; Accounting →
 * Manual journals → Import; Contacts → Import.
 *
 * Tax is exported as posted. Every journal line carries "Tax Exempt (0%)" because the GST/HST
 * already sits on its own control-account line in the ledger; letting Xero add tax again would
 * double it. Bank accounts cannot be created by Xero's chart import, so they are exported as
 * current assets with the same code; the bookkeeper adds them as bank accounts in Xero under
 * that code before importing the journals.
 */
export const XERO_TAX_EXEMPT = 'Tax Exempt (0%)';

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const row = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(',');
const amount = (cents: number) => (cents / 100).toFixed(2);
/** Xero reads dates in the organisation's format; day/month/year is the Canadian default. */
export const xeroDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

export function xeroAccountType(a: Account): string {
  const name = a.name.toLowerCase();
  switch (a.accountType) {
    case 'Asset':
      if (a.accountSubtype === 'Capital Asset') return /accumulated|depreciation|amortization/.test(name) ? 'DEPRECIATN' : 'FIXED';
      if (/inventory|stock/.test(name)) return 'INVENTORY';
      if (/prepaid/.test(name)) return 'PREPAYMENT';
      return 'CURRENT';
    case 'Liability':
      return a.accountSubtype === 'Long-Term Liability' ? 'TERMLIAB' : 'CURRLIAB';
    case 'Equity':
      return 'EQUITY';
    case 'Revenue':
      return /interest|other|gain|exchange|grant|rental|commission/.test(name) ? 'OTHERINCOME' : 'REVENUE';
    case 'Expense':
      return a.accountSubtype === 'Cost of Sales' ? 'DIRECTCOSTS' : 'EXPENSE';
    default:
      return 'CURRENT';
  }
}

export function writeXeroAccountsCsv(accounts: Account[]): string {
  const lines = ['*Code,*Name,*Type,*Tax Code,Description,Dashboard,Expense Claims,Enable Payments,Balance'];
  for (const a of accounts.filter((x) => x.isActive)) {
    lines.push(row([a.code, a.name, xeroAccountType(a), XERO_TAX_EXEMPT, a.description ?? '', 'No', 'No', a.accountSubtype === 'Cash and Bank' ? 'Yes' : 'No', '']));
  }
  return lines.join('\r\n') + '\r\n';
}

export function writeXeroManualJournalsCsv(accounts: Account[], postedEntries: JournalEntry[]): string {
  const codeById = new Map(accounts.map((a) => [a.id, a.code]));
  const lines = ['*Narration,*Date,*Description,*AccountCode,*TaxRate,*Amount,TrackingName1,TrackingOption1,TrackingName2,TrackingOption2'];
  for (const e of postedEntries) {
    const narration = (e.memo?.trim() || e.reference?.trim() || `Journal ${e.id}`).slice(0, 250);
    for (const l of e.lines) {
      const cents = l.debitCents - l.creditCents;
      if (cents === 0) continue;
      lines.push(row([narration, xeroDate(e.entryDate), l.description ?? '', codeById.get(l.accountId) ?? '', XERO_TAX_EXEMPT, amount(cents), '', '', '', '']));
    }
  }
  return lines.join('\r\n') + '\r\n';
}

const XERO_CONTACT_HEADER = '*ContactName,AccountNumber,EmailAddress,FirstName,LastName,POAttentionTo,POAddressLine1,POAddressLine2,POAddressLine3,POAddressLine4,POCity,PORegion,POPostalCode,POCountry,SAAttentionTo,SAAddressLine1,SAAddressLine2,SAAddressLine3,SAAddressLine4,SACity,SARegion,SAPostalCode,SACountry,PhoneNumber,FaxNumber,MobileNumber,DDINumber,SkypeName,BankAccountName,BankAccountNumber,BankAccountParticulars,TaxNumberName,TaxNumber,AccountsReceivableTaxCodeName,AccountsPayableTaxCodeName,Website,LegalName,Discount,CompanyNumber,DueDateBillDay,DueDateBillTerm,DueDateSalesDay,DueDateSalesTerm,SalesAccount,PurchasesAccount,TrackingName1,SalesTrackingOption1,PurchasesTrackingOption1,TrackingName2,SalesTrackingOption2,PurchasesTrackingOption2,BrandingTheme,DefaultTaxBillsName,DefaultTaxSalesName,Person1FirstName,Person1LastName,Person1Email,Person1IncludeInEmails,Person2FirstName,Person2LastName,Person2Email,Person2IncludeInEmails,Person3FirstName,Person3LastName,Person3Email,Person3IncludeInEmails,Person4FirstName,Person4LastName,Person4Email,Person4IncludeInEmails,Person5FirstName,Person5LastName,Person5Email,Person5IncludeInEmails';

export function writeXeroContactsCsv(contacts: Contact[]): string {
  const columns = XERO_CONTACT_HEADER.split(',').length;
  const lines = [XERO_CONTACT_HEADER];
  for (const c of contacts.filter((x) => x.isActive)) {
    const cells: (string | null)[] = new Array(columns).fill('');
    const [first, ...rest] = (c.contactName ?? '').trim().split(/\s+/).filter(Boolean);
    const addr = (c.address ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    cells[0] = c.name; cells[2] = c.email ?? ''; cells[3] = first ?? ''; cells[4] = rest.join(' ');
    cells[6] = addr[0] ?? ''; cells[7] = addr[1] ?? ''; cells[8] = addr[2] ?? ''; cells[9] = addr[3] ?? '';
    cells[23] = c.phone ?? ''; cells[32] = c.t4aBusinessNumber ?? ''; cells[35] = c.website ?? ''; cells[36] = c.companyName ?? '';
    lines.push(row(cells));
  }
  return lines.join('\r\n') + '\r\n';
}

export function xeroReadme(company: string, counts: { accounts: number; journals: number; customers: number; vendors: number }): string {
  return [
    `Apex Ledger export for Xero: ${company}`,
    '',
    'Files:',
    `  accounts.csv          ${counts.accounts} accounts  -> Accounting > Advanced > Chart of accounts > Import`,
    `  manual-journals.csv   ${counts.journals} posted journals -> Accounting > Manual journals > Import`,
    `  customers.csv         ${counts.customers} customers -> Contacts > Customers > Import`,
    `  suppliers.csv         ${counts.vendors} suppliers -> Contacts > Suppliers > Import`,
    '',
    'Order: accounts first, then contacts, then manual journals.',
    'Bank and credit-card accounts: Xero does not create these from the chart import. Add each one in Xero',
    'as a bank account with the same account code before importing the journals.',
    'Tax: every journal line is "Tax Exempt (0%)" on purpose. GST/HST is already on its own line in the',
    'ledger (GST/HST Payable, GST/HST Recoverable), so Xero must not add tax again. Set the account',
    'tax defaults in Xero for new transactions after the import.',
    'Dates are day/month/year. If Xero rejects the dates, set the organisation date format to DD/MM/YYYY',
    'for the import, or ask for the file in the other format.',
    'Only posted transactions are included; drafts and voided entries are not.',
  ].join('\r\n') + '\r\n';
}
