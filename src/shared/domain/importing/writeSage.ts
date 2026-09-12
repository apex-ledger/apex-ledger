import type { Account, Contact, JournalEntry } from '../types';

/**
 * Sage 50 Canadian Edition import files, built from this company's records.
 *
 * Sage 50 (Canada) imports general journal entries from a plain-text file (File → Import/Export →
 * Import Transactions → General Journal): one header line per entry with the date, source and
 * comment, a line with the number of distribution lines, then one line per distribution with the
 * account number, the amount (debits positive, credits negative) and a comment. Dates are
 * month-day-year with a two-digit year, as Sage expects.
 *
 * Sage 50 has no file import for the chart of accounts or contacts, so those come as plain CSVs a
 * bookkeeper can key or map from; Sage Business Cloud Accounting imports the same CSVs directly.
 */
function q(v: string | null | undefined): string {
  return `"${String(v ?? '').replace(/"/g, "'").replace(/[\r\n\t]+/g, ' ').trim()}"`;
}
const amount = (cents: number) => (cents / 100).toFixed(2);
export const sageDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${m}-${d}-${y.slice(2)}`; };

/** Sage 50 account numbers are four digits; anything else is passed through for the bookkeeper to map. */
const sageAccountNumber = (a: Account | undefined) => (a ? a.code.replace(/[^0-9]/g, '').slice(0, 4) || a.code : '');

export function writeSage50GeneralJournal(accounts: Account[], postedEntries: JournalEntry[]): string {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out: string[] = [];
  for (const e of postedEntries) {
    const lines = e.lines.filter((l) => l.debitCents - l.creditCents !== 0);
    if (lines.length === 0) continue;
    out.push([sageDate(e.entryDate), q((e.reference ?? `GJ-${e.id}`).slice(0, 20)), q((e.memo ?? '').slice(0, 75))].join(','));
    out.push(String(lines.length));
    for (const l of lines) {
      out.push([q(sageAccountNumber(byId.get(l.accountId))), amount(l.debitCents - l.creditCents), q((l.description ?? e.memo ?? '').slice(0, 75))].join(','));
    }
  }
  return out.join('\r\n') + '\r\n';
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const row = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(',');

export function sageAccountClass(a: Account): string {
  switch (a.accountType) {
    case 'Asset': return a.accountSubtype === 'Cash and Bank' ? 'Bank' : a.accountSubtype === 'Capital Asset' ? 'Fixed Asset' : 'Current Asset';
    case 'Liability': return a.accountSubtype === 'Credit Card' ? 'Credit Card' : a.accountSubtype === 'Long-Term Liability' ? 'Long Term Liability' : 'Current Liability';
    case 'Equity': return 'Equity';
    case 'Revenue': return 'Revenue';
    case 'Expense': return a.accountSubtype === 'Cost of Sales' ? 'Cost of Goods Sold' : 'Expense';
    default: return 'Other';
  }
}

export function writeSageAccountsCsv(accounts: Account[]): string {
  const lines = ['Account Number,Account Name,Type,Class,GIFI Code,Description'];
  for (const a of accounts.filter((x) => x.isActive)) lines.push(row([sageAccountNumber(a), a.name, a.accountType, sageAccountClass(a), a.gifiCode ?? '', a.description ?? '']));
  return lines.join('\r\n') + '\r\n';
}

export function writeSageContactsCsv(contacts: Contact[], kind: 'Customer' | 'Vendor'): string {
  const lines = [`${kind} Name,Contact,Email,Phone,Address,Website,Business Number`];
  for (const c of contacts.filter((x) => x.isActive)) lines.push(row([c.name, c.contactName ?? '', c.email ?? '', c.phone ?? '', (c.address ?? '').replace(/\r?\n/g, ', '), c.website ?? '', c.t4aBusinessNumber ?? '']));
  return lines.join('\r\n') + '\r\n';
}

export function sageReadme(company: string, counts: { accounts: number; journals: number; customers: number; vendors: number }): string {
  return [
    `Apex Ledger export for Sage: ${company}`,
    '',
    'Files:',
    `  general-journal.txt   ${counts.journals} posted journals -> Sage 50 (Canada): File > Import/Export > Import Transactions > General Journal`,
    `  accounts.csv          ${counts.accounts} accounts, with type, class and GIFI code`,
    `  customers.csv         ${counts.customers} customers`,
    `  vendors.csv           ${counts.vendors} vendors`,
    '',
    'Sage 50 (Canada) imports general journal entries from the text file. Create the accounts in Sage first',
    'with the same four-digit numbers as accounts.csv (Sage 50 has no file import for the chart itself);',
    'an account number that does not exist in Sage is reported on import.',
    'Amounts: debits positive, credits negative, one line per distribution; every entry balances.',
    'Dates are month-day-year with a two-digit year, the Sage 50 import format.',
    'GST/HST is included as posted, on its own control-account lines; do not let Sage add tax again.',
    'Sage Business Cloud Accounting: import accounts.csv, customers.csv and vendors.csv through its',
    'Settings > Import pages, mapping the columns when asked.',
    'Only posted transactions are included; drafts and voided entries are not.',
  ].join('\r\n') + '\r\n';
}
