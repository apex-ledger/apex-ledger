/** Money cannot be received for a document that does not exist yet.
 *
 * A payment dated before its invoice is almost always a typo — the wrong year, or the invoice date
 * typed into the payment field. Left in, it ages the receivable negatively, shows a customer as
 * paying before being billed, and puts the cash in the wrong period. The same holds for a deposit
 * dated before the payments it banks. Real prepayments are a deposit or a credit, not a payment
 * against a future invoice, so refusing this loses nothing legitimate.
 */

/** Why this payment date is impossible, or null if it is fine. */
export function paymentDateRefusalReason(documentDate: string, paymentDate: string, documentLabel: string, moneyWord = 'payment'): string | null {
  if (paymentDate >= documentDate) return null;
  return `The ${moneyWord} is dated ${paymentDate}, before ${documentLabel} was issued on ${documentDate}. Check the date — a ${moneyWord} cannot precede the document it settles.`;
}

/** Why a follow-on document cannot carry this date, or null if it can. The follow-on — a goods
 * receipt, a vendor invoice, an invoice raised from an estimate — cannot predate the document it
 * came from. */
export function dateOrderRefusalReason(sourceLabel: string, sourceDate: string, laterLabel: string, laterDate: string): string | null {
  if (laterDate >= sourceDate) return null;
  return `The ${laterLabel} is dated ${laterDate}, before ${sourceLabel} was raised on ${sourceDate}. Check the date — it cannot come first.`;
}

/** Why this deposit date is impossible, or null if it is fine. `paymentDates` are the dates of
 * everything being banked together. */
export function depositDateRefusalReason(depositDate: string, paymentDates: string[]): string | null {
  const latest = paymentDates.reduce<string | null>((max, date) => (max === null || date > max ? date : max), null);
  if (latest === null || depositDate >= latest) return null;
  return `The deposit is dated ${depositDate}, but it includes a payment received on ${latest}. Money cannot be banked before it arrives — check the deposit date.`;
}
