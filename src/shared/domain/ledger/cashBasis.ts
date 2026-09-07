import type { Account, JournalEntry, JournalEntryLine } from '../types';

/**
 * Cash-basis view of the books.
 *
 * On an accrual basis an invoice is income the day it is raised and a bill is an expense the day
 * it arrives. On a cash basis they count only when the money moves, in proportion to how much
 * moved. Everything else — a sales receipt, an expense paid from the bank, a payroll run, a
 * journal entry — already happens when the cash does, so it stays exactly as posted.
 *
 * The transform therefore: drops the posting entry behind every invoice and bill; for each
 * payment against one, re-creates that entry's revenue and expense lines dated on the payment and
 * scaled by payment ÷ document total. Payment entries themselves (bank against receivable or
 * payable) carry no income-statement lines, except an exchange gain or loss, which is real cash
 * and is kept. Credit notes are left on their own date: they are small, and a note applied to an
 * unpaid invoice never sees cash at all.
 */
export interface CashBasisDocument {
  /** The posting entry behind the invoice or bill. */
  journalEntryId: number | null;
  /** The document's full amount, including tax — what the payments are measured against. */
  totalCents: number;
}

export interface CashBasisPayment {
  documentJournalEntryId: number | null;
  paymentDate: string;
  amountCents: number;
}

export interface CashBasisSources {
  invoices: CashBasisDocument[];
  bills: CashBasisDocument[];
  invoicePayments: CashBasisPayment[];
  billPayments: CashBasisPayment[];
}

function roundHalfAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function toCashBasisEntries(entries: JournalEntry[], accounts: Account[], sources: CashBasisSources): JournalEntry[] {
  const plAccountIds = new Set(accounts.filter((a) => a.accountType === 'Revenue' || a.accountType === 'Expense').map((a) => a.id));
  const byId = new Map(entries.map((e) => [e.id, e]));
  const documentEntryIds = new Set<number>();
  const totalByEntry = new Map<number, number>();
  for (const doc of [...sources.invoices, ...sources.bills]) {
    if (doc.journalEntryId === null) continue;
    documentEntryIds.add(doc.journalEntryId);
    totalByEntry.set(doc.journalEntryId, doc.totalCents);
  }

  const kept = entries.filter((e) => !documentEntryIds.has(e.id));

  let syntheticId = -1;
  const recognised: JournalEntry[] = [];
  for (const payment of [...sources.invoicePayments, ...sources.billPayments]) {
    if (payment.documentJournalEntryId === null) continue;
    const source = byId.get(payment.documentJournalEntryId);
    if (!source || source.status !== 'posted') continue;
    const total = totalByEntry.get(source.id) ?? 0;
    if (total === 0) continue;
    const share = payment.amountCents / total;
    const lines: JournalEntryLine[] = source.lines
      .filter((line) => plAccountIds.has(line.accountId))
      .map((line, index) => ({
        ...line,
        id: syntheticId * 1000 - index,
        journalEntryId: syntheticId,
        debitCents: roundHalfAway(line.debitCents * share),
        creditCents: roundHalfAway(line.creditCents * share),
      }))
      .filter((line) => line.debitCents !== 0 || line.creditCents !== 0);
    if (lines.length === 0) continue;
    recognised.push({ ...source, id: syntheticId, entryDate: payment.paymentDate, lines });
    syntheticId -= 1;
  }

  return [...kept, ...recognised];
}
