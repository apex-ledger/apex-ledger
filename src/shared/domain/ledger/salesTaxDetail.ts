import type { Account, JournalEntry, JournalEntryLine, TaxCode } from '../types';
import { filterEntriesByDateRange } from './computeAccountBalances';
import { gstHstPortionOfInclusive, taxCodeDefinition, taxCodeLabel } from './taxCodes';
import { isGstHstControlAccount, isGstHstReturnAccount } from './gstHstAccounts';
import { allocateByBase, signedAmountCents } from './hstSummary';

/** Every line behind a GST/HST return figure, listed.
 *
 * The HST Centre gives the totals that go on the return. This gives the lines those totals are made
 * of, which is what CRA asks for when a return is queried and what you check before filing. A total
 * you cannot break down is a total you cannot defend.
 *
 * Split by tax code as well as by direction, because a return is filed on GST/HST only: the PST
 * half of a British Columbia purchase and the QST half of a Quebec one belong to the province and
 * must not swell the federal figures.
 */

export interface SalesTaxDetailLine {
  entryId: number;
  entryDate: string;
  /** When the entry was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt: string;
  memo: string | null;
  accountId: number;
  accountCode: string;
  accountName: string;
  contactName: string | null;
  taxCode: TaxCode;
  taxCodeLabel: string;
  /** The line amount as posted, tax included. */
  amountCents: number;
  /** The GST/HST inside it — the part that belongs on a CRA return. */
  gstHstCents: number;
  direction: 'collected' | 'paid';
}

export interface SalesTaxCodeSummary {
  taxCode: TaxCode;
  label: string;
  lineCount: number;
  amountCents: number;
  gstHstCents: number;
}

export interface SalesTaxDetailResult {
  periodStart: string;
  periodEnd: string;
  collected: SalesTaxDetailLine[];
  paid: SalesTaxDetailLine[];
  byCodeCollected: SalesTaxCodeSummary[];
  byCodePaid: SalesTaxCodeSummary[];
  totalCollectedCents: number;
  totalPaidCents: number;
  /** Collected less paid — what would be remitted, before any adjustment. */
  netCents: number;
  /** Lines tagged 'Manual' whose amount has not been entered yet: they contribute nothing to the
   * figures above and would silently understate the return, so they are counted separately. */
  manualPendingCount: number;
}

export function salesTaxDetail(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  contactNames: Map<number, string> = new Map(),
): SalesTaxDetailResult {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const collected: SalesTaxDetailLine[] = [];
  const paid: SalesTaxDetailLine[] = [];
  let manualPendingCount = 0;

  const push = (entry: JournalEntry, line: JournalEntryLine, account: Account, direction: 'collected' | 'paid', amountCents: number, gstHstCents: number) => {
    const contactId = line.customerId ?? line.vendorId;
    const detail: SalesTaxDetailLine = {
      entryId: entry.id,
      entryDate: entry.entryDate,
      createdAt: entry.createdAt,
      memo: entry.memo,
      accountId: line.accountId,
      accountCode: account.code,
      accountName: account.name,
      contactName: contactId != null ? contactNames.get(contactId) ?? null : null,
      taxCode: line.taxCode as TaxCode,
      taxCodeLabel: taxCodeLabel(line.taxCode),
      amountCents,
      gstHstCents,
      direction,
    };
    (direction === 'collected' ? collected : paid).push(detail);
  };

  for (const entry of filterEntriesByDateRange(entries, periodStart, periodEnd)) {
    if (entry.status !== 'posted') continue;
    // Filing a return moves the control accounts into "filed"; it is bookkeeping about a return,
    // not tax charged or paid, and the HST summary skips it for the same reason.
    if (entry.lines.length > 0 && entry.lines.every((l) => { const a = byId.get(l.accountId); return a !== undefined && isGstHstReturnAccount(a); })) continue;

    // Entries posted since tax was split onto its own GST/HST line carry the real tax there: read
    // it, and attribute it to the revenue/expense lines it was charged on in proportion to their
    // amounts. This keeps the detail equal to the summary (and to the ledger) to the cent. The
    // category lines of such entries hold the before-tax amount, so extracting "tax included" from
    // them, as the legacy path below does, would understate the return by the tax rate.
    const gstLines = entry.lines.filter((l) => { const a = byId.get(l.accountId); return a !== undefined && isGstHstControlAccount(a); });
    if (gstLines.length > 0) {
      const gstIds = new Set(gstLines.map((l) => l.accountId));
      for (const gstLine of gstLines) {
        const gstAccount = byId.get(gstLine.accountId)!;
        const hstDirection = gstAccount.name.toLowerCase() === 'gst/hst payable' ? 'collected' : 'itc';
        const direction: 'collected' | 'paid' = hstDirection === 'collected' ? 'collected' : 'paid';
        const hstCents = signedAmountCents(gstLine, hstDirection);
        if (hstCents === 0) continue;
        const categoryLines = entry.lines.filter((l) => !gstIds.has(l.accountId) && l.taxCode);
        if (categoryLines.length === 0) { push(entry, gstLine, gstAccount, direction, 0, hstCents); continue; }
        const bases = categoryLines.map((l) => signedAmountCents(l, hstDirection));
        const shares = allocateByBase(hstCents, bases);
        categoryLines.forEach((categoryLine, i) => {
          const account = byId.get(categoryLine.accountId) ?? gstAccount;
          push(entry, categoryLine, account, direction, bases[i], shares[i]);
        });
      }
      continue;
    }

    for (const line of entry.lines) {
      if (!line.taxCode) continue;
      const account = byId.get(line.accountId);
      if (!account) continue;
      // A line written by the tax split (baseCents recorded) with no control-account line in the
      // entry carries no tax at all (tax deliberately zero); deriving some would invent it.
      if (line.baseCents !== null) continue;

      // Revenue is tax collected from customers; expenses and assets are tax paid to vendors.
      // Anything else carrying a tax code is not part of a return.
      const direction: 'collected' | 'paid' | null =
        account.accountType === 'Revenue' ? 'collected' : account.accountType === 'Expense' || account.accountType === 'Asset' ? 'paid' : null;
      if (!direction) continue;

      const amountCents = direction === 'collected' ? line.creditCents - line.debitCents : line.debitCents - line.creditCents;
      if (amountCents === 0) continue;

      let gstHstCents: number;
      if (line.taxCode === 'Manual') {
        // Manual lines carry a hand-entered figure. Until it is entered there is nothing to report,
        // and quietly treating that as zero is how a return goes out understated.
        if (line.manualHstCents === null) {
          manualPendingCount += 1;
          continue;
        }
        gstHstCents = line.manualHstCents;
      } else {
        gstHstCents = gstHstPortionOfInclusive(line.taxCode, amountCents);
      }
      push(entry, line, account, direction, amountCents, gstHstCents);
    }
  }

  const sortByDate = (a: SalesTaxDetailLine, b: SalesTaxDetailLine) =>
    a.entryDate.localeCompare(b.entryDate) || a.entryId - b.entryId;
  collected.sort(sortByDate);
  paid.sort(sortByDate);

  function summarise(lines: SalesTaxDetailLine[]): SalesTaxCodeSummary[] {
    const map = new Map<TaxCode, SalesTaxCodeSummary>();
    for (const line of lines) {
      if (!map.has(line.taxCode)) {
        map.set(line.taxCode, {
          taxCode: line.taxCode,
          label: taxCodeDefinition(line.taxCode)?.label ?? line.taxCode,
          lineCount: 0,
          amountCents: 0,
          gstHstCents: 0,
        });
      }
      const summary = map.get(line.taxCode)!;
      summary.lineCount += 1;
      summary.amountCents += line.amountCents;
      summary.gstHstCents += line.gstHstCents;
    }
    return [...map.values()].sort((a, b) => b.gstHstCents - a.gstHstCents);
  }

  const totalCollectedCents = collected.reduce((sum, l) => sum + l.gstHstCents, 0);
  const totalPaidCents = paid.reduce((sum, l) => sum + l.gstHstCents, 0);

  return {
    periodStart,
    periodEnd,
    collected,
    paid,
    byCodeCollected: summarise(collected),
    byCodePaid: summarise(paid),
    totalCollectedCents,
    totalPaidCents,
    netCents: totalCollectedCents - totalPaidCents,
    manualPendingCount,
  };
}
