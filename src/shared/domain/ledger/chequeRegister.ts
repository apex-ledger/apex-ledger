import type { Account, JournalEntry } from '../types';
import { filterEntriesByDateRange } from './computeAccountBalances';

/** The cheque register, and the gaps in it.
 *
 * The gaps are the point. A missing number in an otherwise unbroken run is how you find a cheque
 * that was written and never entered — the single most common way money leaves a small business
 * without appearing in its books. Voided and spoiled cheques produce the same gap, which is why
 * the report lists them for explanation rather than declaring them errors.
 *
 * Cheque numbers are read from a line's or entry's reference. There is no dedicated field for one:
 * they arrive as the reference on a manual entry, or in the description of an imported bank line
 * ("CHQ#1043", "Cheque 1043"), and both have to be understood.
 */

export interface ChequeRow {
  chequeNumber: number;
  entryId: number;
  entryDate: string;
  /** When the entry was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt: string;
  accountId: number;
  accountName: string;
  payee: string | null;
  amountCents: number;
  status: JournalEntry['status'];
}

export interface ChequeGap {
  /** First missing number in this run. */
  from: number;
  /** Last missing number in this run. */
  to: number;
  count: number;
}

export interface ChequeRegisterResult {
  periodStart: string;
  periodEnd: string;
  cheques: ChequeRow[];
  gaps: ChequeGap[];
  totalCents: number;
  /** Same number used more than once — either a duplicate entry or a reused cheque. */
  duplicates: number[];
}

/** Pulls a cheque number out of free text.
 *
 * Deliberately narrow. A loose "any number in the string" rule would read the amount, the date, or
 * an invoice number as a cheque number and fill the register with things that are not cheques. It
 * matches an explicit cheque marker, or a string that is nothing but digits. */
export function parseChequeNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const marked = /(?:^|\b)(?:chq|chk|cheque|check)\s*[#.:]?\s*(\d{1,8})\b/i.exec(text);
  if (marked) return Number(marked[1]);
  const bare = /^\s*#?(\d{1,8})\s*$/.exec(text);
  return bare ? Number(bare[1]) : null;
}

export function chequeRegister(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  contactNames: Map<number, string> = new Map(),
): ChequeRegisterResult {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const isBank = (accountId: number) => {
    const account = byId.get(accountId);
    if (!account) return false;
    return account.accountSubtype === 'Cash and Bank' || /chequing|checking|bank/i.test(account.name);
  };

  const cheques: ChequeRow[] = [];

  for (const entry of filterEntriesByDateRange(entries, periodStart, periodEnd)) {
    if (entry.status === 'draft') continue; // not yet money
    for (const line of entry.lines) {
      // Money leaving a bank account: a cheque is always a credit to the bank.
      if (!isBank(line.accountId) || line.creditCents <= 0) continue;
      const chequeNumber = parseChequeNumber(line.description) ?? parseChequeNumber(entry.reference);
      if (chequeNumber === null) continue;
      const contactId = line.vendorId ?? line.customerId;
      cheques.push({
        chequeNumber,
        entryId: entry.id,
        entryDate: entry.entryDate,
        createdAt: entry.createdAt,
        accountId: line.accountId,
        accountName: byId.get(line.accountId)?.name ?? 'Unknown account',
        payee: contactId != null ? contactNames.get(contactId) ?? null : entry.memo,
        amountCents: line.creditCents,
        status: entry.status,
      });
    }
  }

  cheques.sort((a, b) => a.chequeNumber - b.chequeNumber || a.entryId - b.entryId);

  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const cheque of cheques) {
    if (seen.has(cheque.chequeNumber)) duplicates.add(cheque.chequeNumber);
    seen.add(cheque.chequeNumber);
  }

  // Gaps are collapsed into runs: "1044–1051 missing" is one fact a person can act on, where eight
  // separate rows is a list they will skim past.
  const gaps: ChequeGap[] = [];
  const numbers = [...seen].sort((a, b) => a - b);
  for (let i = 1; i < numbers.length; i += 1) {
    const previous = numbers[i - 1];
    const current = numbers[i];
    if (current - previous > 1) {
      gaps.push({ from: previous + 1, to: current - 1, count: current - previous - 1 });
    }
  }

  return {
    periodStart,
    periodEnd,
    cheques,
    gaps,
    // Voided cheques moved no money, so they are listed but not totalled.
    totalCents: cheques.filter((c) => c.status === 'posted').reduce((sum, c) => sum + c.amountCents, 0),
    duplicates: [...duplicates].sort((a, b) => a - b),
  };
}
