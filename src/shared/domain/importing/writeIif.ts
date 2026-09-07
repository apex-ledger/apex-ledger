import type { Account, Contact, JournalEntry } from '../types';

/** The reverse of parseIif.ts's IIF_ACCOUNT_TYPE_MAP — maps this app's Asset/Liability/Equity/
 * Revenue/Expense + subtype back onto QuickBooks Desktop's IIF account-type codes, so a round
 * trip (import into this app, later export back out) lands on a reasonable equivalent type. Named
 * "Accounts Receivable"/"Accounts Payable" accounts get QuickBooks' special AR/AP codes
 * regardless of subtype, since those drive customer/vendor-balance behavior in QuickBooks. */
function toIifAccountType(account: Account): string {
  const name = account.name.trim().toLowerCase();
  if (name === 'accounts receivable') return 'AR';
  if (name === 'accounts payable') return 'AP';

  switch (account.accountType) {
    case 'Asset':
      if (account.accountSubtype === 'Cash and Bank') return 'BANK';
      if (account.accountSubtype === 'Capital Asset') return 'FIXASSET';
      return 'OASSET';
    case 'Liability':
      if (account.accountSubtype === 'Credit Card') return 'CCARD';
      if (account.accountSubtype === 'Long-Term Liability') return 'LTLIAB';
      return 'CLIAB';
    case 'Equity':
      return 'EQUITY';
    case 'Revenue':
      return 'INC';
    case 'Expense':
      return account.accountSubtype === 'Cost of Sales' ? 'COGS' : 'EXP';
    default:
      return 'EXP';
  }
}

function iifDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${Number(month)}/${Number(day)}/${year}`;
}

/** IIF is tab-delimited — a stray tab, newline, or leading/trailing quote inside a value would
 * corrupt the row layout, so those are stripped rather than escaped (IIF has no quoting
 * convention for embedded tabs the way CSV does). */
function iifSafe(value: string | null | undefined): string {
  return (value ?? '').replace(/[\t\r\n]/g, ' ').trim();
}

function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface WriteIifInput {
  accounts: Account[];
  /** Only posted entries make sense to hand off — drafts aren't real transactions yet, and voided
   * ones shouldn't carry forward into a new system. */
  postedJournalEntries: JournalEntry[];
  customers: Contact[];
  vendors: Contact[];
}

/**
 * Builds a QuickBooks Desktop IIF file (File → Utilities → Import → IIF Files) from this
 * company's Chart of Accounts, posted general ledger, customers, and vendors — the whole
 * accounting record, formatted so a client isn't locked in if they ever move to QuickBooks.
 * Symmetric with parseIif.ts, which reads this same format back in.
 */
export function writeIif({ accounts, postedJournalEntries, customers, vendors }: WriteIifInput): string {
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const lines: string[] = [];

  lines.push('!ACCNT\tNAME\tACCNTTYPE\tDESC');
  for (const account of accounts) {
    lines.push(['ACCNT', iifSafe(account.name), toIifAccountType(account), iifSafe(account.description)].join('\t'));
  }
  lines.push('');

  if (customers.length > 0) {
    lines.push('!CUST\tNAME\tADDR1\tPHONE1\tEMAIL\tNOTE');
    for (const c of customers) {
      lines.push(['CUST', iifSafe(c.name), iifSafe(c.address), iifSafe(c.phone), iifSafe(c.email), iifSafe(c.notes)].join('\t'));
    }
    lines.push('');
  }

  if (vendors.length > 0) {
    lines.push('!VEND\tNAME\tADDR1\tPHONE1\tEMAIL\tNOTE');
    for (const v of vendors) {
      lines.push(['VEND', iifSafe(v.name), iifSafe(v.address), iifSafe(v.phone), iifSafe(v.email), iifSafe(v.notes)].join('\t'));
    }
    lines.push('');
  }

  lines.push('!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO');
  lines.push('!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO');
  lines.push('!ENDTRNS');

  for (const entry of postedJournalEntries) {
    const orderedLines = [...entry.lines].sort((a, b) => a.lineOrder - b.lineOrder);
    if (orderedLines.length < 2) continue; // not a real double-entry transaction — nothing safe to write

    const date = iifDate(entry.entryDate);
    const memo = iifSafe(entry.memo);
    const docNum = iifSafe(entry.reference);

    orderedLines.forEach((line, i) => {
      const accountName = accountNameById.get(line.accountId) ?? 'Unknown Account';
      // IIF's sign convention: a positive AMOUNT is a debit, negative is a credit (matches how
      // parseIif.ts interprets an imported file, so a round trip preserves the same balances).
      const signedCents = line.debitCents > 0 ? line.debitCents : -line.creditCents;
      const row = [i === 0 ? 'TRNS' : 'SPL', '', 'GENERAL JOURNAL', date, iifSafe(accountName), '', formatAmount(signedCents), docNum, iifSafe(line.description) || memo];
      lines.push(row.join('\t'));
    });
    lines.push('ENDTRNS');
  }

  return lines.join('\r\n') + '\r\n';
}
