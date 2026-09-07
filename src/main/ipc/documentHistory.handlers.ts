import { z } from 'zod';
import { getCurrentDb } from '../companyFile';
import { getJournalEntryById } from '../db/queries';

/**
 * The history of one document, assembled from the trails the app already keeps: the journal
 * entry it posted (who, when), every later edit recorded as a journal revision, the payments
 * against it, voids and reversals, files attached, reminders sent, and the activity-log rows that
 * name it. Nothing new is written for this; it is the audit trail seen from the document instead
 * of from the report.
 */
const ENTITY = z.enum(['invoice', 'bill', 'salesReceipt', 'journalEntry']);
const inputSchema = z.object({ entityType: ENTITY, entityId: z.number().int().positive() });

export interface HistoryEvent {
  at: string;
  who: string | null;
  kind: 'created' | 'posted' | 'edited' | 'payment' | 'reversal' | 'void' | 'attachment' | 'reminder' | 'activity';
  summary: string;
  detail?: string | null;
  journalEntryId?: number | null;
}

function pushEntryEvents(events: HistoryEvent[], label: string, entry: { id: number; createdAt: string; createdBy?: string | null; status: string; postedAt: string | null } | null | undefined) {
  if (!entry) return;
  events.push({ at: entry.createdAt, who: entry.createdBy ?? null, kind: 'posted', summary: `${label} posted (journal ${entry.id})`, journalEntryId: entry.id });
  if (entry.status === 'void') events.push({ at: entry.postedAt ?? entry.createdAt, who: null, kind: 'void', summary: `${label} journal ${entry.id} is void`, journalEntryId: entry.id });
}

export async function documentHistory(input: unknown): Promise<HistoryEvent[]> {
  const { entityType, entityId } = inputSchema.parse(input);
  const db = getCurrentDb();
  const events: HistoryEvent[] = [];
  const journalIds: number[] = [];
  let reference: string | null = null;
  let label = 'Document';

  if (entityType === 'invoice') {
    const inv = await db.selectFrom('invoices').selectAll().where('id', '=', entityId).executeTakeFirst();
    if (!inv) throw new Error('Invoice not found.');
    label = `Invoice ${inv.invoiceNumber}`; reference = inv.invoiceNumber;
    const entry = inv.invoiceJournalEntryId ? await getJournalEntryById(db, inv.invoiceJournalEntryId) : null;
    events.push({ at: inv.createdAt, who: entry?.createdBy ?? null, kind: 'created', summary: `${label} created for ${(inv.totalCents / 100).toFixed(2)}` });
    if (inv.invoiceJournalEntryId) journalIds.push(inv.invoiceJournalEntryId);
    pushEntryEvents(events, label, entry);
    const payments = await db.selectFrom('invoicePayments').selectAll().where('invoiceId', '=', entityId).orderBy('id').execute();
    for (const p of payments) {
      const pe = await getJournalEntryById(db, p.journalEntryId);
      journalIds.push(p.journalEntryId);
      events.push({ at: p.createdAt, who: pe?.createdBy ?? null, kind: pe?.status === 'void' ? 'reversal' : 'payment', summary: `${pe?.status === 'void' ? 'Payment reversed' : 'Payment received'} ${(p.amountCents / 100).toFixed(2)} dated ${p.paymentDate}${p.foreignAmountCents ? ` (${p.foreignAmountCents / 100} at ${p.exchangeRate})` : ''}`, journalEntryId: p.journalEntryId });
    }
  } else if (entityType === 'bill') {
    const bill = await db.selectFrom('bills').selectAll().where('id', '=', entityId).executeTakeFirst();
    if (!bill) throw new Error('Bill not found.');
    label = bill.billNumber ? `Bill ${bill.billNumber}` : `Bill ${bill.id}`; reference = bill.billNumber;
    const entry = bill.billJournalEntryId ? await getJournalEntryById(db, bill.billJournalEntryId) : null;
    events.push({ at: bill.createdAt, who: entry?.createdBy ?? null, kind: 'created', summary: `${label} entered for ${(bill.amountCents / 100).toFixed(2)}` });
    if (bill.billJournalEntryId) journalIds.push(bill.billJournalEntryId);
    pushEntryEvents(events, label, entry);
    if (bill.approvedAt) events.push({ at: bill.approvedAt, who: bill.approvedBy ?? null, kind: 'activity', summary: `Approval: ${bill.approvalStatus}${bill.approvalNote ? ` — ${bill.approvalNote}` : ''}` });
    const payments = await db.selectFrom('billPayments').selectAll().where('billId', '=', entityId).orderBy('id').execute();
    for (const p of payments) {
      const pe = await getJournalEntryById(db, p.journalEntryId);
      journalIds.push(p.journalEntryId);
      events.push({ at: p.createdAt, who: pe?.createdBy ?? null, kind: pe?.status === 'void' ? 'reversal' : 'payment', summary: `${pe?.status === 'void' ? 'Payment reversed' : 'Paid'} ${(p.amountCents / 100).toFixed(2)} dated ${p.paymentDate}${p.foreignAmountCents ? ` (${p.foreignAmountCents / 100} at ${p.exchangeRate})` : ''}`, journalEntryId: p.journalEntryId });
    }
  } else if (entityType === 'salesReceipt') {
    const r = await db.selectFrom('salesReceipts').selectAll().where('id', '=', entityId).executeTakeFirst();
    if (!r) throw new Error('Sales receipt not found.');
    label = `Sales receipt ${r.receiptNumber}`; reference = r.receiptNumber;
    const entry = r.journalEntryId ? await getJournalEntryById(db, r.journalEntryId) : null;
    events.push({ at: r.createdAt, who: entry?.createdBy ?? null, kind: 'created', summary: `${label} created for ${(r.totalCents / 100).toFixed(2)}` });
    if (r.journalEntryId) journalIds.push(r.journalEntryId);
    pushEntryEvents(events, label, entry);
  } else {
    const entry = await getJournalEntryById(db, entityId);
    if (!entry) throw new Error('Journal entry not found.');
    label = `Journal ${entry.id}`; reference = entry.reference;
    journalIds.push(entry.id);
    events.push({ at: entry.createdAt, who: entry.createdBy ?? null, kind: 'created', summary: `${label} created (${entry.status})`, journalEntryId: entry.id });
    if (entry.status === 'void') events.push({ at: entry.postedAt ?? entry.createdAt, who: null, kind: 'void', summary: `${label} voided`, journalEntryId: entry.id });
  }

  if (journalIds.length > 0) {
    const revisions = await db.selectFrom('journalEntryRevisions').selectAll().where('journalEntryId', 'in', journalIds).orderBy('id').execute();
    for (const rev of revisions) {
      events.push({ at: rev.changedAt, who: rev.changedBy, kind: 'edited', summary: `${rev.label}${rev.lineLabel ? ` — ${rev.lineLabel}` : ''}`, detail: rev.oldValue || rev.newValue ? `${rev.oldValue ?? '—'} → ${rev.newValue ?? '—'}` : null, journalEntryId: rev.journalEntryId });
    }
  }

  const attachments = await db.selectFrom('attachments').selectAll().where('entityType', '=', entityType).where('entityId', '=', entityId).orderBy('id').execute();
  for (const a of attachments) events.push({ at: a.createdAt, who: a.addedBy, kind: 'attachment', summary: `Attached ${a.originalName}` });

  if (reference) {
    const activity = await db.selectFrom('userActivityLog').selectAll().where('targetReference', '=', reference).orderBy('id').execute();
    for (const row of activity) {
      if (row.topic === 'paymentReminder') { events.push({ at: row.changedAt, who: row.actorName, kind: 'reminder', summary: row.targetReference ?? 'Reminder sent' }); continue; }
      // The generic "Changed invoices" row is the same moment as a created/posted/payment event
      // already on the list; it only adds information when nothing more specific was recorded.
      const sameMoment = events.some((e) => e.kind !== 'activity' && e.at.slice(0, 19) === row.changedAt.slice(0, 19));
      if (!sameMoment) events.push({ at: row.changedAt, who: row.actorName, kind: 'activity', summary: row.action });
    }
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}
