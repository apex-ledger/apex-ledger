import type { HstFiling, NewJournalEntryLineInput } from '../types';

/**
 * Filing a GST/HST return closes out a reporting period: the GST/HST Payable balance built up from
 * sales is cleared against the GST/HST Recoverable balance built up from purchases (the input tax
 * credits), and whatever is left is either paid to CRA or refunded by them. This is the equivalent
 * of QuickBooks' and Xero's "File sales tax" — before it existed, the only way to record a
 * remittance here was a hand-written journal entry, and the balances just kept growing.
 *
 * Both figures come from computeHstSummary for the same period, so what gets filed always matches
 * what the HST Centre reported.
 */
export interface HstFilingAccountIds {
  gstHstPayableAccountId: number;
  gstHstRecoverableAccountId: number;
  /** Liability used to hold a filed net amount owed to CRA until the actual payment is recorded. */
  filedPayableAccountId: number;
  /** Asset used to hold a filed refund claim until CRA actually deposits the refund. */
  refundReceivableAccountId: number;
}

export interface HstFilingFigures {
  collectedCents: number;
  itcCents: number;
  /** collected − itc. Positive = owed to CRA, negative = refund due from CRA. */
  netPayableCents: number;
}

export function computeHstFilingFigures(collectedCents: number, itcCents: number): HstFilingFigures {
  return { collectedCents, itcCents, netPayableCents: collectedCents - itcCents };
}

/** The most recent calendar quarter that has fully ended. Filing used to default to the quarter
 * containing today, which made it possible to close July–September in August and then blocked
 * every ordinary August entry as a late posting. */
export function latestCompletedCalendarQuarter(referenceDate: string): { start: string; end: string } {
  const reference = new Date(`${referenceDate}T00:00:00Z`);
  const currentQuarterStartMonth = Math.floor(reference.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(reference.getUTCFullYear(), currentQuarterStartMonth - 3, 1));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), currentQuarterStartMonth, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Returns the filing-timing error that both the UI and the main process enforce. */
export function hstFilingTimingError(periodEnd: string, filingDate: string, today: string): string | null {
  if (periodEnd > today) return `The GST/HST reporting period has not ended yet. It ends on ${periodEnd}.`;
  if (filingDate < periodEnd) return `The filing date cannot be before the reporting period ends on ${periodEnd}.`;
  if (filingDate > today) return `The filing date cannot be in the future (${filingDate}).`;
  return null;
}

/** What filing a given period would post, shown for confirmation before anything is committed. */
export interface HstFilingPreview extends HstFilingFigures {
  /** Taxable sales/income before GST/HST for the selected return period. */
  taxableIncomeCents: number;
  /** Taxable purchase/expense base supporting the ITCs claimed for the period. */
  taxablePurchasesCents: number;
  /** Manual-HST lines in the period still waiting on an amount — excluded from the totals above,
   * so filing now would under-report by however much they turn out to be. */
  pendingManualCount: number;
  /** Any already-filed period sharing a day with this one — non-empty means filing is blocked. */
  overlappingFilings: HstFiling[];
}

/**
 * Builds the GL lines for one filing:
 *   Debit  GST/HST Payable      (clears the tax collected)
 *   Credit GST/HST Recoverable  (clears the ITCs claimed)
 *   Credit GST/HST Filed Payable (net owed) — or Debit GST/HST Refund Receivable (net refund)
 *
 * Filing and cash settlement are deliberately separate events. A return can be filed today and
 * paid later; likewise CRA can assess a refund before the cash reaches the bank. This preserves
 * the bank reconciliation trail and prevents the filing date from pretending to be the payment date.
 *
 * A period where collected and ITCs are both zero has nothing to file and is rejected rather than
 * posting a meaningless empty entry.
 */
export function buildHstFilingJournalLines(figures: HstFilingFigures, accounts: HstFilingAccountIds, periodLabel: string): NewJournalEntryLineInput[] {
  const { collectedCents, itcCents, netPayableCents } = figures;
  if (collectedCents < 0 || itcCents < 0) {
    throw new Error('A GST/HST filing needs non-negative collected and ITC totals.');
  }
  if (collectedCents === 0 && itcCents === 0) {
    throw new Error(`There is no GST/HST activity to file for ${periodLabel}.`);
  }
  const lines: NewJournalEntryLineInput[] = [
    {
      accountId: accounts.gstHstPayableAccountId,
      debitCents: collectedCents,
      creditCents: 0,
      description: `GST/HST collected — ${periodLabel}`,
    },
    {
      accountId: accounts.gstHstRecoverableAccountId,
      debitCents: 0,
      creditCents: itcCents,
      description: `Input tax credits — ${periodLabel}`,
    },
  ];

  if (netPayableCents > 0) {
    lines.push({
      accountId: accounts.filedPayableAccountId,
      debitCents: 0,
      creditCents: netPayableCents,
      description: `GST/HST return filed — amount owing to CRA — ${periodLabel}`,
    });
  } else if (netPayableCents < 0) {
    lines.push({
      accountId: accounts.refundReceivableAccountId,
      debitCents: -netPayableCents,
      creditCents: 0,
      description: `GST/HST return filed — refund receivable from CRA — ${periodLabel}`,
    });
  }

  return lines.filter((line) => line.debitCents > 0 || line.creditCents > 0);
}

/** True when two periods share any day — used to stop the same period being filed twice, which
 * would double-clear the payable and post a second payment. */
export function periodsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
