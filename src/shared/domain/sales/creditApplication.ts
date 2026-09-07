/** How a credit settles documents — in parts, across more than one of them.
 *
 * A credit note is money the contact is owed. It is applied against what they owe, and there is
 * no reason the two should be the same size: a $500 return against a $1,200 invoice leaves $700 to
 * pay, and a $500 credit against two $250 invoices clears both. Requiring the amounts to match
 * forced people to raise a fake second invoice or a fake second credit to make the numbers line up,
 * which is a worse record than the truth.
 *
 * Every application is recorded on its own, so each one can be undone in order, and the credit's
 * running balance is always the total less what has been applied.
 */

export type CreditNoteStatus = 'open' | 'applied' | 'refunded';

export interface CreditForApplication {
  creditNoteNumber: string;
  status: CreditNoteStatus;
  totalCents: number;
  appliedCents: number;
}

export function creditRemainingCents(credit: Pick<CreditForApplication, 'totalCents' | 'appliedCents'>): number {
  return Math.max(0, credit.totalCents - credit.appliedCents);
}

/** What to apply when the person has not said: the whole credit, or the whole balance, whichever
 * is smaller. Never more than either. */
export function defaultApplicationCents(credit: Pick<CreditForApplication, 'totalCents' | 'appliedCents'>, targetBalanceCents: number): number {
  return Math.max(0, Math.min(creditRemainingCents(credit), targetBalanceCents));
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Why this application cannot happen, or null if it can. */
export function creditApplicationRefusalReason(
  credit: CreditForApplication,
  targetBalanceCents: number,
  amountCents: number,
  targetLabel: string,
): string | null {
  if (credit.status === 'refunded') return `${credit.creditNoteNumber} has already been refunded in cash.`;
  const remaining = creditRemainingCents(credit);
  if (remaining <= 0) return `${credit.creditNoteNumber} has already been applied in full.`;
  if (targetBalanceCents <= 0) return `${targetLabel} is already settled.`;
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'Enter the amount of the credit to apply.';
  if (amountCents > remaining) return `Only ${dollars(remaining)} remains on ${credit.creditNoteNumber}; ${dollars(amountCents)} cannot be applied.`;
  if (amountCents > targetBalanceCents) return `${targetLabel} has only ${dollars(targetBalanceCents)} outstanding; ${dollars(amountCents)} cannot be applied to it.`;
  return null;
}

/** The credit's status once `appliedCents` has been applied against `totalCents`. */
export function statusAfterApplication(totalCents: number, appliedCents: number): Extract<CreditNoteStatus, 'open' | 'applied'> {
  return appliedCents >= totalCents ? 'applied' : 'open';
}

/** Why the remaining credit cannot be refunded, or null if it can. */
export function creditRefundRefusalReason(credit: CreditForApplication): string | null {
  if (credit.status === 'refunded') return `${credit.creditNoteNumber} has already been refunded.`;
  if (creditRemainingCents(credit) <= 0) return `${credit.creditNoteNumber} has been applied in full — there is nothing left to refund.`;
  return null;
}
