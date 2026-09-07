import type { Account, JournalEntry, JournalEntryLine } from '../types';

/** What the accountant changed on an entry the client supplied.
 *
 * Clients hand over a spreadsheet, the accountant fixes it, and at year end the question is always
 * "what did you change?" — for the review file, for the client's own sign-off, and because those
 * corrections are exactly what an adjusting entry is. Nothing recorded that, so the corrected entry
 * simply replaced the original and the difference was gone.
 *
 * This diffs the before and after of one entry into a list of changes. It is pure so the same
 * function can record a change when a save happens and re-describe it on the report afterwards.
 */

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface JournalEntryChange {
  /** Machine name of what changed: 'entryDate', 'memo', or 'line.debitCents' and so on. */
  field: string;
  /** How to say it on a report. */
  label: string;
  kind: ChangeKind;
  /** Rendered values, so the report needs no knowledge of how each field is stored. */
  oldValue: string | null;
  newValue: string | null;
  /** Which line this concerns, when it is a line-level change. */
  lineLabel?: string;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function accountLabel(accounts: Map<number, Account>, accountId: number): string {
  const account = accounts.get(accountId);
  return account ? account.name : 'Unknown account';
}

/** Lines have no stable identity across an edit — journalUpdate deletes and reinserts them all —
 * so they are matched by position, which is how they are presented and edited on screen. A line
 * inserted in the middle therefore reads as "this line changed" plus "a line was added" at the end,
 * rather than as a wholesale rewrite of everything below it. */
function describeLine(accounts: Map<number, Account>, line: JournalEntryLine): string {
  const side = line.debitCents > 0 ? `Dr ${money(line.debitCents)}` : `Cr ${money(line.creditCents)}`;
  return `${accountLabel(accounts, line.accountId)} — ${side}`;
}

export function diffJournalEntry(
  before: JournalEntry,
  after: JournalEntry,
  allAccounts: Account[],
): JournalEntryChange[] {
  const accounts = new Map(allAccounts.map((a) => [a.id, a]));
  const changes: JournalEntryChange[] = [];

  const header: { field: string; label: string; before: string | null; after: string | null }[] = [
    { field: 'entryDate', label: 'Date', before: before.entryDate, after: after.entryDate },
    { field: 'memo', label: 'Memo', before: before.memo, after: after.memo },
    { field: 'reference', label: 'Reference', before: before.reference, after: after.reference },
    {
      field: 'isAdjustingEntry',
      label: 'Adjusting entry',
      before: before.isAdjustingEntry ? 'Yes' : 'No',
      after: after.isAdjustingEntry ? 'Yes' : 'No',
    },
  ];
  for (const h of header) {
    if ((h.before ?? '') === (h.after ?? '')) continue;
    changes.push({ field: h.field, label: h.label, kind: 'changed', oldValue: h.before, newValue: h.after });
  }

  const beforeLines = [...before.lines].sort((a, b) => a.lineOrder - b.lineOrder);
  const afterLines = [...after.lines].sort((a, b) => a.lineOrder - b.lineOrder);

  for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i += 1) {
    const b = beforeLines[i];
    const a = afterLines[i];

    if (b && !a) {
      changes.push({
        field: 'line',
        label: 'Line removed',
        kind: 'removed',
        oldValue: describeLine(accounts, b),
        newValue: null,
        lineLabel: describeLine(accounts, b),
      });
      continue;
    }
    if (a && !b) {
      changes.push({
        field: 'line',
        label: 'Line added',
        kind: 'added',
        oldValue: null,
        newValue: describeLine(accounts, a),
        lineLabel: describeLine(accounts, a),
      });
      continue;
    }
    if (!a || !b) continue;

    const lineLabel = describeLine(accounts, a);
    const fields: { field: string; label: string; before: string | null; after: string | null }[] = [
      {
        field: 'line.accountId',
        label: 'Account',
        before: accountLabel(accounts, b.accountId),
        after: accountLabel(accounts, a.accountId),
      },
      { field: 'line.debitCents', label: 'Debit', before: money(b.debitCents), after: money(a.debitCents) },
      { field: 'line.creditCents', label: 'Credit', before: money(b.creditCents), after: money(a.creditCents) },
      { field: 'line.description', label: 'Line description', before: b.description, after: a.description },
      { field: 'line.taxCode', label: 'Tax code', before: b.taxCode, after: a.taxCode },
    ];
    for (const f of fields) {
      if ((f.before ?? '') === (f.after ?? '')) continue;
      changes.push({ field: f.field, label: f.label, kind: 'changed', oldValue: f.before, newValue: f.after, lineLabel });
    }
  }

  return changes;
}

/** The net effect of a set of changes on the entry's total, in cents — what the adjustment is
 * "worth". Zero for a reclassification, which moves money between accounts without changing the
 * size of the entry, and that distinction is the first thing a reviewer wants. */
export function netAmountChangeCents(before: JournalEntry, after: JournalEntry): number {
  const total = (e: JournalEntry) => e.lines.reduce((sum, l) => sum + l.debitCents, 0);
  return total(after) - total(before);
}

/** True when the accountant moved amounts between accounts without changing the entry's total —
 * the classic reclassification, which is worth labelling differently from a change in value. */
export function isReclassificationOnly(changes: JournalEntryChange[], netChangeCents: number): boolean {
  if (netChangeCents !== 0) return false;
  return changes.some((c) => c.field === 'line.accountId');
}
