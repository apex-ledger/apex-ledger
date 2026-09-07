import type { Account, FiscalPeriod, NewJournalEntryLineInput, Result } from '../types';
import { isGstHstControlAccount, lineAffectsGstHstReturn } from './gstHstAccounts';

/** Structural checks that apply even to in-progress drafts. */
export function validateJournalEntryLines(
  lines: NewJournalEntryLineInput[],
  accounts: Account[],
): Result<void> {
  const accountIds = new Set(accounts.map((a) => a.id));
  for (const line of lines) {
    if (!accountIds.has(line.accountId)) {
      return { ok: false, error: `Account ${line.accountId} does not exist.` };
    }
    if (line.debitCents < 0 || line.creditCents < 0) {
      return { ok: false, error: 'Debit and credit amounts cannot be negative.' };
    }
    if (line.debitCents > 0 && line.creditCents > 0) {
      return { ok: false, error: 'A single line cannot have both a debit and a credit amount.' };
    }
  }
  return { ok: true, data: undefined };
}

export function isHstFilingPeriod(period: FiscalPeriod): boolean {
  return period.label.toLowerCase().startsWith('gst/hst filed');
}

/** Only a period deliberately locked from Fiscal Periods by an accountant blocks posting. A
 * GST/HST filing record is retained as a filed-return marker and warning, but its date range does
 * not become an accountant lock merely because a return was filed. Check every overlapping row
 * so an accountant-created lock still wins when it overlaps a filed-return marker. */
export function isDateInLockedPeriod(date: string, fiscalPeriods: FiscalPeriod[]): FiscalPeriod | undefined {
  return fiscalPeriods.find(
    (period) => period.isLocked && !isHstFilingPeriod(period) && date >= period.periodStart && date <= period.periodEnd,
  );
}

/** Whether this entry would change a filed GST/HST return — decided line by line with the same
 * rule GST/HST Centre uses to build the return, so the lock and the report can never disagree about
 * what is on it. See lineAffectsGstHstReturn. */
export function isFiledReturnAffectingEntry(
  input: { lines: NewJournalEntryLineInput[] },
  accounts: Account[],
): boolean {
  const controlAccountIds = new Set(accounts.filter(isGstHstControlAccount).map((account) => account.id));
  return input.lines.some((line) => lineAffectsGstHstReturn(line, controlAccountIds));
}

export type PostingLock =
  /** A period an accountant closed by hand. Blocks everything dated inside it. */
  | { period: FiscalPeriod; kind: 'accountant' }
  /** A filed GST/HST return. Blocks only entries that would restate the return itself. */
  | { period: FiscalPeriod; kind: 'hstFiling' };

/** The lock that stops this entry, if any.
 *
 * Two locks with deliberately different reach. An accountant's close is absolute: nothing dated
 * inside it posts. A filed GST/HST return is narrower — payroll, banking and payments inside the
 * quarter must keep posting, because filing a return does not close the books. Only an entry that
 * touches the GST/HST control accounts is refused, since that is the entry that would change the
 * filed figures. */
export function postingLockWithReason(
  input: { entryDate: string; lines: NewJournalEntryLineInput[] },
  accounts: Account[],
  fiscalPeriods: FiscalPeriod[],
): PostingLock | undefined {
  const accountantLock = isDateInLockedPeriod(input.entryDate, fiscalPeriods);
  if (accountantLock) return { period: accountantLock, kind: 'accountant' };
  if (!isFiledReturnAffectingEntry(input, accounts)) return undefined;
  const filedReturn = fiscalPeriods.find(
    (period) => period.isLocked && isHstFilingPeriod(period) && input.entryDate >= period.periodStart && input.entryDate <= period.periodEnd,
  );
  return filedReturn ? { period: filedReturn, kind: 'hstFiling' } : undefined;
}

export function postingLockForEntry(
  input: { entryDate: string; lines: NewJournalEntryLineInput[] },
  accounts: Account[],
  fiscalPeriods: FiscalPeriod[],
): FiscalPeriod | undefined {
  return postingLockWithReason(input, accounts, fiscalPeriods)?.period;
}

/**
 * The single validation gate every posted entry must pass: structurally valid lines, at least two
 * non-zero lines, debits exactly equal credits, and the entry date isn't inside a locked fiscal period.
 * The caller (IPC handler) must run this before the insert transaction and reject on failure —
 * it is the only thing standing between the UI and an unbalanced ledger.
 */
export function validateJournalEntryForPosting(
  input: { entryDate: string; lines: NewJournalEntryLineInput[] },
  accounts: Account[],
  fiscalPeriods: FiscalPeriod[],
): Result<{ totalDebitCents: number; totalCreditCents: number }> {
  const structural = validateJournalEntryLines(input.lines, accounts);
  if (!structural.ok) return structural;

  const nonZeroLines = input.lines.filter((l) => l.debitCents > 0 || l.creditCents > 0);
  if (nonZeroLines.length < 2) {
    return { ok: false, error: 'A journal entry needs at least two non-zero lines to post.' };
  }

  const totalDebitCents = input.lines.reduce((sum, l) => sum + l.debitCents, 0);
  const totalCreditCents = input.lines.reduce((sum, l) => sum + l.creditCents, 0);
  if (totalDebitCents !== totalCreditCents) {
    return {
      ok: false,
      error: `Entry is not balanced: total debits ${totalDebitCents} ≠ total credits ${totalCreditCents}.`,
    };
  }

  const lock = postingLockWithReason(input, accounts, fiscalPeriods);
  if (lock?.kind === 'accountant') {
    return {
      ok: false,
      error: `Cannot post to ${input.entryDate}: fiscal period "${lock.period.label}" is locked by an accountant.`,
    };
  }
  if (lock?.kind === 'hstFiling') {
    return {
      ok: false,
      error: `Cannot post GST/HST to ${input.entryDate}: the return for "${lock.period.label}" has already been filed. Reopen that return (void it from GST/HST Centre) before changing the tax it reports.`,
    };
  }

  return { ok: true, data: { totalDebitCents, totalCreditCents } };
}
