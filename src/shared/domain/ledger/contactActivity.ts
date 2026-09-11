import type { Account, JournalEntry } from '../types';
import { filterEntriesByDateRange } from './computeAccountBalances';
import { isGstHstControlAccount } from './gstHstAccounts';

/** Reports built around who a transaction was with, rather than which account it hit.
 *
 * Journal lines already carry a vendor or a customer; nothing until now read them in aggregate. Two
 * questions fall out of that data and are asked constantly: what did we spend with each vendor
 * this year, and what does this customer's account look like from their side.
 */

export interface VendorSpendRow {
  vendorId: number | null;
  vendorName: string;
  /** What was spent with them, in the period, on expense and asset accounts. */
  amountCents: number;
  transactionCount: number;
  /** The expense accounts it went to, largest first — answers "what do we buy from them". */
  topAccounts: { accountId: number; accountName: string; amountCents: number }[];
}

export interface ExpensesByVendorResult {
  periodStart: string;
  periodEnd: string;
  rows: VendorSpendRow[];
  totalCents: number;
  /** Spend with no vendor recorded against it. Kept as its own row rather than shared out. */
  untaggedCents: number;
}

/** Whether a line on this account represents money spent WITH a vendor.
 *
 * Expenses always are. Assets are too when they are something bought — equipment, inventory — but
 * NOT when they are the money itself or a debt owed to you: every purchase credits a bank account,
 * and counting that credit would cancel out the very purchase it paid for. Cash, cards and
 * receivables are therefore excluded. */
function isSpendAccount(account: Account): boolean {
  if (account.accountType === 'Expense') return true;
  if (account.accountType !== 'Asset') return false;
  // The input tax credit on a purchase is money coming back from the CRA, not spend with the vendor.
  if (isGstHstControlAccount(account)) return false;
  if (account.accountSubtype === 'Cash and Bank' || account.accountSubtype === 'Credit Card') return false;
  // Subtype is optional on an account, so the name is a second line of defence for the two cases
  // that would otherwise wreck the totals.
  return !/receivable|chequing|checking|savings|cash|bank/i.test(account.name);
}

/** Total spend per vendor for a period.
 *
 * Counts what was BOUGHT, not what was paid: a line hitting an expense or asset account with that
 * vendor on it. Paying an old bill is not this year's spending, and counting the payment instead
 * would move the cost into whichever year the cheque cleared.
 */
export function expensesByVendor(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  contactNames: Map<number, string> = new Map(),
): ExpensesByVendorResult {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rows = new Map<number | null, VendorSpendRow & { accountTotals: Map<number, number> }>();

  const rowFor = (vendorId: number | null) => {
    if (!rows.has(vendorId)) {
      rows.set(vendorId, {
        vendorId,
        vendorName: vendorId === null ? 'No vendor recorded' : contactNames.get(vendorId) ?? 'Unknown vendor',
        amountCents: 0,
        transactionCount: 0,
        topAccounts: [],
        accountTotals: new Map(),
      });
    }
    return rows.get(vendorId)!;
  };

  for (const entry of filterEntriesByDateRange(entries, periodStart, periodEnd)) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines) {
      const account = byId.get(line.accountId);
      if (!account) continue;
      if (!isSpendAccount(account)) continue;
      // Debit less credit: a return or a credit note reduces what was spent rather than adding.
      const amountCents = line.debitCents - line.creditCents;
      if (amountCents === 0) continue;
      const row = rowFor(line.vendorId ?? null);
      row.amountCents += amountCents;
      row.transactionCount += 1;
      row.accountTotals.set(line.accountId, (row.accountTotals.get(line.accountId) ?? 0) + amountCents);
    }
  }

  const list = [...rows.values()].map((row) => ({
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    amountCents: row.amountCents,
    transactionCount: row.transactionCount,
    topAccounts: [...row.accountTotals.entries()]
      .map(([accountId, amountCents]) => ({
        accountId,
        accountName: byId.get(accountId)?.name ?? 'Unknown account',
        amountCents,
      }))
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 3),
  }));

  list.sort((a, b) => b.amountCents - a.amountCents || a.vendorName.localeCompare(b.vendorName));

  return {
    periodStart,
    periodEnd,
    rows: list,
    totalCents: list.reduce((sum, r) => sum + r.amountCents, 0),
    untaggedCents: list.find((r) => r.vendorId === null)?.amountCents ?? 0,
  };
}

export interface StatementLine {
  entryId: number;
  entryDate: string;
  /** When the entry was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt: string;
  description: string;
  /** What they were billed. */
  chargeCents: number;
  /** What they paid, or what was credited back to them. */
  paymentCents: number;
  /** Running balance owing after this line. */
  balanceCents: number;
}

export interface CustomerStatementResult {
  customerId: number;
  customerName: string;
  periodStart: string;
  periodEnd: string;
  /** What was owing before the statement period opened. */
  openingBalanceCents: number;
  lines: StatementLine[];
  closingBalanceCents: number;
  totalChargesCents: number;
  totalPaymentsCents: number;
}

/** A customer's account as they would see it: opening balance, what they were billed, what they
 * paid, and what is left.
 *
 * Different from the receivables ageing, which is the same money read from the business's side —
 * ageing answers "who is overdue and by how long", a statement answers "here is your account, this
 * is what you owe". One is for chasing, the other is what gets sent.
 *
 * Read from receivable-account lines rather than from invoices, so a credit note, a write-off or a
 * payment posted straight to the ledger all appear. An invoice-only statement would show a balance
 * the customer disputes because their payment is missing from it.
 */
export function customerStatement(
  accounts: Account[],
  entries: JournalEntry[],
  customerId: number,
  customerName: string,
  periodStart: string,
  periodEnd: string,
): CustomerStatementResult {
  const receivableIds = new Set(
    accounts.filter((a) => a.accountType === 'Asset' && /receivable/i.test(a.name)).map((a) => a.id),
  );

  const relevant = (entry: JournalEntry) =>
    entry.status === 'posted' && entry.lines.some((l) => l.customerId === customerId && receivableIds.has(l.accountId));

  let openingBalanceCents = 0;
  for (const entry of entries.filter((e) => e.entryDate < periodStart && relevant(e))) {
    for (const line of entry.lines) {
      if (line.customerId !== customerId || !receivableIds.has(line.accountId)) continue;
      openingBalanceCents += line.debitCents - line.creditCents;
    }
  }

  const lines: StatementLine[] = [];
  let running = openingBalanceCents;
  const periodEntries = filterEntriesByDateRange(entries, periodStart, periodEnd)
    .filter(relevant)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.id - b.id);

  for (const entry of periodEntries) {
    let chargeCents = 0;
    let paymentCents = 0;
    for (const line of entry.lines) {
      if (line.customerId !== customerId || !receivableIds.has(line.accountId)) continue;
      chargeCents += line.debitCents;
      paymentCents += line.creditCents;
    }
    if (chargeCents === 0 && paymentCents === 0) continue;
    running += chargeCents - paymentCents;
    lines.push({
      entryId: entry.id,
      entryDate: entry.entryDate,
      createdAt: entry.createdAt,
      description: entry.memo ?? entry.reference ?? (chargeCents > 0 ? 'Invoice' : 'Payment received'),
      chargeCents,
      paymentCents,
      balanceCents: running,
    });
  }

  return {
    customerId,
    customerName,
    periodStart,
    periodEnd,
    openingBalanceCents,
    lines,
    closingBalanceCents: running,
    totalChargesCents: lines.reduce((sum, l) => sum + l.chargeCents, 0),
    totalPaymentsCents: lines.reduce((sum, l) => sum + l.paymentCents, 0),
  };
}
