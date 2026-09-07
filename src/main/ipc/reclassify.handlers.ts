import { z } from 'zod';
import { getCurrentDb } from '../companyFile';
import { journalCreateAndPost } from './journal.handlers';

/**
 * Reclassify transactions: move posted amounts from one account to another in bulk, the way an
 * accountant tidies a year — every "Office Supplies" that should have been "Computer Equipment",
 * in one pass.
 *
 * Nothing already posted is edited. Each selected line gets its own adjusting entry, dated the
 * same day as the original, that takes the amount out of the old account and puts it in the new
 * one, with a memo naming the original entry. The audit trail keeps both the mistake and the
 * fix, which is what an auditor expects to see, and a locked period refuses the entry the same
 * way it refuses any other.
 */
export interface ReclassifyCandidate {
  lineId: number;
  entryId: number;
  entryDate: string;
  createdAt: string | null;
  memo: string | null;
  description: string | null;
  reference: string | null;
  debitCents: number;
  creditCents: number;
  partyName: string | null;
}

const listSchema = z.object({ accountId: z.number().int().positive(), dateFrom: z.string(), dateTo: z.string() });

export async function reclassifyCandidates(input: unknown): Promise<ReclassifyCandidate[]> {
  const { accountId, dateFrom, dateTo } = listSchema.parse(input);
  const db = getCurrentDb();
  const rows = await db
    .selectFrom('journalEntryLines')
    .innerJoin('journalEntries', 'journalEntries.id', 'journalEntryLines.journalEntryId')
    .leftJoin('customers', 'customers.id', 'journalEntryLines.customerId')
    .leftJoin('vendors', 'vendors.id', 'journalEntryLines.vendorId')
    .select([
      'journalEntryLines.id as lineId',
      'journalEntries.id as entryId',
      'journalEntries.entryDate as entryDate',
      'journalEntries.createdAt as createdAt',
      'journalEntries.memo as memo',
      'journalEntries.reference as reference',
      'journalEntryLines.description as description',
      'journalEntryLines.debitCents as debitCents',
      'journalEntryLines.creditCents as creditCents',
      'customers.name as customerName',
      'vendors.name as vendorName',
    ])
    .where('journalEntryLines.accountId', '=', accountId)
    .where('journalEntries.status', '=', 'posted')
    .where('journalEntries.entryDate', '>=', dateFrom)
    .where('journalEntries.entryDate', '<=', dateTo)
    .orderBy('journalEntries.entryDate', 'desc')
    .orderBy('journalEntryLines.id', 'desc')
    .limit(2000)
    .execute();
  return rows.map((r) => ({
    lineId: r.lineId,
    entryId: r.entryId,
    entryDate: r.entryDate,
    createdAt: (r.createdAt as string | null) ?? null,
    memo: r.memo,
    description: r.description,
    reference: r.reference,
    debitCents: r.debitCents,
    creditCents: r.creditCents,
    partyName: r.customerName ?? r.vendorName ?? null,
  }));
}

const reclassifySchema = z.object({
  lineIds: z.array(z.number().int().positive()).min(1).max(500),
  toAccountId: z.number().int().positive(),
  note: z.string().trim().max(200).nullable().optional(),
});

export async function reclassifyLines(input: unknown): Promise<{ moved: number; entryIds: number[]; totalCents: number }> {
  const { lineIds, toAccountId, note } = reclassifySchema.parse(input);
  const db = getCurrentDb();
  const to = await db.selectFrom('accounts').select(['id', 'name', 'isActive']).where('id', '=', toAccountId).executeTakeFirst();
  if (!to || !to.isActive) throw new Error('Choose an active account to move the amounts to.');
  const lines = await db
    .selectFrom('journalEntryLines')
    .innerJoin('journalEntries', 'journalEntries.id', 'journalEntryLines.journalEntryId')
    .innerJoin('accounts', 'accounts.id', 'journalEntryLines.accountId')
    .select(['journalEntryLines.id as lineId', 'journalEntryLines.accountId as fromAccountId', 'accounts.name as fromName', 'journalEntryLines.debitCents as debitCents', 'journalEntryLines.creditCents as creditCents', 'journalEntryLines.description as description', 'journalEntryLines.customerId as customerId', 'journalEntryLines.vendorId as vendorId', 'journalEntries.id as entryId', 'journalEntries.entryDate as entryDate', 'journalEntries.memo as memo', 'journalEntries.status as status'])
    .where('journalEntryLines.id', 'in', lineIds)
    .execute();
  if (lines.length !== lineIds.length) throw new Error('One of the selected lines no longer exists. Refresh the list and try again.');
  if (lines.some((l) => l.status !== 'posted')) throw new Error('Only posted entries can be reclassified.');
  if (lines.some((l) => l.fromAccountId === toAccountId)) throw new Error(`Some lines are already in ${to.name}.`);

  const entryIds: number[] = [];
  let totalCents = 0;
  for (const line of lines) {
    const amount = line.debitCents - line.creditCents;
    if (amount === 0) continue;
    const posted = await journalCreateAndPost({
      entryDate: line.entryDate,
      memo: `Reclassify ${line.fromName} → ${to.name} (entry #${line.entryId}${line.memo ? `: ${line.memo}` : ''})${note ? ` — ${note}` : ''}`,
      reference: `RECLASS-${line.entryId}`,
      isAdjustingEntry: true,
      lines: [
        { accountId: toAccountId, debitCents: amount > 0 ? amount : 0, creditCents: amount < 0 ? -amount : 0, description: line.description, customerId: line.customerId, vendorId: line.vendorId },
        { accountId: line.fromAccountId, debitCents: amount < 0 ? -amount : 0, creditCents: amount > 0 ? amount : 0, description: line.description, customerId: line.customerId, vendorId: line.vendorId },
      ],
    });
    entryIds.push(posted.id);
    totalCents += Math.abs(amount);
  }
  return { moved: entryIds.length, entryIds, totalCents };
}
