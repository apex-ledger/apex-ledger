/** One customer's or one vendor's money, document by document.
 *
 * An invoice knows its own payments and a payment knows its invoice, but nothing put them side by
 * side for one contact: what they were billed, what they paid, when, into which account, and
 * what is still open. This builds that view from the same rows the ledger already holds, so it
 * can never disagree with the documents it lists.
 */

export interface TrackedDocument {
  id: number;
  contactId: number;
  /** Invoice number or vendor invoice number; null when a bill was entered without one. */
  number: string | null;
  date: string;
  dueDate: string;
  totalCents: number;
  balanceDueCents: number;
  status: string;
}

export interface TrackedPayment {
  id: number;
  documentId: number;
  paymentDate: string;
  amountCents: number;
  accountId: number;
  journalEntryId: number;
  memo: string | null;
}

export interface DocumentWithPayments {
  document: TrackedDocument;
  payments: (TrackedPayment & { accountName: string })[];
  paidCents: number;
  /** Days past due today, 0 when not overdue or already settled. */
  daysOverdue: number;
}

export interface ContactPaymentSummary {
  documentCount: number;
  billedCents: number;
  paidCents: number;
  outstandingCents: number;
  overdueCents: number;
  overdueCount: number;
  lastPaymentDate: string | null;
}

export interface ContactPaymentHistory {
  documents: DocumentWithPayments[];
  summary: ContactPaymentSummary;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

/** Every document for the contact, newest first, each with its payments oldest first. */
export function buildContactPaymentHistory(
  contactId: number,
  documents: TrackedDocument[],
  payments: TrackedPayment[],
  accountNames: Map<number, string>,
  todayIso: string,
): ContactPaymentHistory {
  const own = documents.filter((document) => document.contactId === contactId).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const byDocument = new Map<number, TrackedPayment[]>();
  for (const payment of payments) {
    const list = byDocument.get(payment.documentId) ?? [];
    list.push(payment);
    byDocument.set(payment.documentId, list);
  }

  const rows: DocumentWithPayments[] = own.map((document) => {
    const list = (byDocument.get(document.id) ?? []).slice().sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id - b.id);
    const paidCents = list.reduce((sum, payment) => sum + payment.amountCents, 0);
    return {
      document,
      payments: list.map((payment) => ({ ...payment, accountName: accountNames.get(payment.accountId) ?? 'Account' })),
      // A document settled by a credit note carries no payment row, so "paid" is what the document
      // itself reports as no longer owed — the payments beneath it explain as much of that as cash.
      paidCents: Math.max(paidCents, document.totalCents - document.balanceDueCents),
      daysOverdue: document.balanceDueCents > 0 && document.dueDate < todayIso ? daysBetween(document.dueDate, todayIso) : 0,
    };
  });

  const overdue = rows.filter((row) => row.daysOverdue > 0);
  const paymentDates = rows.flatMap((row) => row.payments.map((payment) => payment.paymentDate));
  return {
    documents: rows,
    summary: {
      documentCount: rows.length,
      billedCents: rows.reduce((sum, row) => sum + row.document.totalCents, 0),
      paidCents: rows.reduce((sum, row) => sum + row.paidCents, 0),
      outstandingCents: rows.reduce((sum, row) => sum + row.document.balanceDueCents, 0),
      overdueCents: overdue.reduce((sum, row) => sum + row.document.balanceDueCents, 0),
      overdueCount: overdue.length,
      lastPaymentDate: paymentDates.length > 0 ? paymentDates.reduce((max, date) => (date > max ? date : max)) : null,
    },
  };
}
