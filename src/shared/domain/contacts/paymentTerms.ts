/** Payment terms — when an invoice or a bill falls due.
 *
 * The same list serves both sides. Terms a business offers its customers and terms its vendors
 * offer it are the same vocabulary, and keeping one list means "Net 30" cannot come to mean 30 days
 * on a sale and 31 on a purchase.
 *
 * Terms live on the contact as a default and on each document as the actual figure. Both are needed:
 * the contact answers "what do we normally do with this customer", and the document has to keep
 * what was agreed at the time, because changing a customer's terms must not silently move the due
 * date of an invoice sent last year.
 */

export type PaymentTerm = 'dueOnReceipt' | 'net7' | 'net15' | 'net30' | 'net45' | 'net60' | 'net90' | 'custom';

export interface PaymentTermDefinition {
  term: PaymentTerm;
  label: string;
  /** Days from the document date until payment is due. Null for `custom`, where the date is typed. */
  days: number | null;
  description: string;
}

export const PAYMENT_TERMS: PaymentTermDefinition[] = [
  { term: 'dueOnReceipt', label: 'Due on receipt', days: 0, description: 'Payable as soon as it arrives.' },
  { term: 'net7', label: 'Net 7', days: 7, description: 'Due 7 days after the invoice date.' },
  { term: 'net15', label: 'Net 15', days: 15, description: 'Due 15 days after the invoice date.' },
  { term: 'net30', label: 'Net 30', days: 30, description: 'Due 30 days after the invoice date. The common default.' },
  { term: 'net45', label: 'Net 45', days: 45, description: 'Due 45 days after the invoice date.' },
  { term: 'net60', label: 'Net 60', days: 60, description: 'Due 60 days after the invoice date.' },
  { term: 'net90', label: 'Net 90', days: 90, description: 'Due 90 days after the invoice date.' },
  { term: 'custom', label: 'Custom date', days: null, description: 'A due date typed by hand.' },
];

/** What a business gets by default when nothing has been chosen.
 *
 * Net 30 rather than due-on-receipt: it is what most Canadian small businesses actually offer, and
 * a default that quietly makes everything due immediately would put invoices into the overdue
 * bucket on the ageing report the day after they were raised. */
export const DEFAULT_PAYMENT_TERM: PaymentTerm = 'net30';

const BY_TERM = new Map(PAYMENT_TERMS.map((t) => [t.term, t]));

export function paymentTermDefinition(term: PaymentTerm): PaymentTermDefinition {
  return BY_TERM.get(term) ?? BY_TERM.get(DEFAULT_PAYMENT_TERM)!;
}

export function paymentTermLabel(term: PaymentTerm | null | undefined): string {
  if (!term) return paymentTermDefinition(DEFAULT_PAYMENT_TERM).label;
  return paymentTermDefinition(term).label;
}

/** Reads a stored value back, tolerating anything unexpected.
 *
 * Company files predate this field and hold null; a file that changed hands between versions could
 * hold something else. Falling back to the default keeps the screen usable instead of blank. */
export function asPaymentTerm(value: string | null | undefined): PaymentTerm {
  if (!value) return DEFAULT_PAYMENT_TERM;
  return BY_TERM.has(value as PaymentTerm) ? (value as PaymentTerm) : DEFAULT_PAYMENT_TERM;
}

/** The due date these terms produce from a document date.
 *
 * Returns null for `custom`, where the caller keeps whatever was typed. Plain calendar days, not
 * business days — "Net 30" means thirty days, and every accounting package and every vendor
 * invoice counts it that way.
 */
export function dueDateFor(documentDate: string, term: PaymentTerm): string | null {
  const definition = paymentTermDefinition(term);
  if (definition.days === null) return null;

  // Parsed as UTC so the result cannot shift a day either side depending on the local timezone —
  // a due date that lands a day early puts an invoice into the wrong ageing bucket.
  const parsed = Date.parse(`${documentDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;

  return new Date(parsed + definition.days * 86_400_000).toISOString().slice(0, 10);
}

/** Which term a due date corresponds to, if any.
 *
 * Lets an existing document with only a due date on it show the matching term rather than reading
 * as custom, which is what every invoice and bill entered before terms existed would otherwise do. */
export function termFromDates(documentDate: string, dueDate: string): PaymentTerm {
  for (const definition of PAYMENT_TERMS) {
    if (definition.days === null) continue;
    if (dueDateFor(documentDate, definition.term) === dueDate) return definition.term;
  }
  return 'custom';
}

/** Days between a due date and today — negative once overdue. */
export function daysUntilDue(dueDate: string, asOfDate: string): number | null {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const asOf = Date.parse(`${asOfDate}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(asOf)) return null;
  return Math.round((due - asOf) / 86_400_000);
}
