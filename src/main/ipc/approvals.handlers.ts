import type { ApprovalQueueItem } from '@shared/domain/workflow/approvals';
import { getCurrentDb } from '../companyFile';
import { getAllBills, getAllVendors } from '../db/queries';

/** Everything awaiting a decision: journal entries, purchase orders and bills marked pending. */
export async function approvalsPending(): Promise<ApprovalQueueItem[]> {
  const db = getCurrentDb();
  const [journals, pos, bills, vendors] = await Promise.all([
    db.selectFrom('journalEntries').select(['id', 'entryDate', 'memo', 'createdBy', 'approvalStatus']).where('approvalStatus', 'in', ['pending', 'rejected']).where('status', '=', 'draft').execute(),
    db.selectFrom('purchaseOrders').select(['id', 'orderDate', 'poNumber', 'vendorId', 'totalCents', 'approvalStatus']).where('approvalStatus', 'in', ['pending', 'rejected']).where('status', '=', 'draft').execute(),
    getAllBills(db),
    getAllVendors(db),
  ]);
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
  const journalAmounts = new Map<number, number>();
  if (journals.length > 0) {
    const lines = await db.selectFrom('journalEntryLines').select(['journalEntryId', 'debitCents']).where('journalEntryId', 'in', journals.map((j) => j.id)).execute();
    for (const l of lines) journalAmounts.set(l.journalEntryId, (journalAmounts.get(l.journalEntryId) ?? 0) + l.debitCents);
  }
  const items: ApprovalQueueItem[] = [
    ...journals.map((j) => ({ kind: 'journal' as const, id: j.id, date: j.entryDate, title: `Journal #${j.id}${j.memo ? ` — ${j.memo}` : ''}`, detail: 'manual journal entry above the threshold', amountCents: journalAmounts.get(j.id) ?? 0, requestedBy: j.createdBy ?? null, status: j.approvalStatus as ApprovalQueueItem['status'] })),
    ...pos.map((p) => ({ kind: 'purchaseOrder' as const, id: p.id, date: p.orderDate, title: `${p.poNumber} — ${vendorName.get(p.vendorId) ?? 'Vendor'}`, detail: 'purchase order above the threshold', amountCents: p.totalCents, requestedBy: null, status: p.approvalStatus as ApprovalQueueItem['status'] })),
    ...bills.filter((b) => (b as { approvalStatus?: string }).approvalStatus === 'pending').map((b) => ({ kind: 'bill' as const, id: b.id, date: b.billDate, title: `Bill ${b.billNumber ?? ''} — ${vendorName.get(b.vendorId) ?? 'Vendor'}`.trim(), detail: 'bill awaiting approval before payment', amountCents: b.amountCents, requestedBy: null, status: 'pending' as const })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
