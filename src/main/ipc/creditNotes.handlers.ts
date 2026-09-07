import { nextDocumentNumber, resolveNewDocumentNumber } from '@shared/domain/documents/documentNumbering';
import { assertSaleLineAccounts } from './saleLineAccounts';
import { assertPurchaseLineAccounts } from './purchaseLineAccounts';
import { applyCreditNoteSchema, newCreditNoteSchema, refundCreditNoteSchema } from '@shared/validation/schemas';
import type { CreditNote, CreditNoteKind } from '@shared/domain/types';
import {
  buildCustomerCreditNoteJournalLines,
  buildCustomerRefundJournalLines,
  buildVendorCreditJournalLines,
  buildVendorRefundJournalLines,
} from '@shared/domain/ledger/buildCreditNoteJournalLines';
import { computeInvoiceLineAmountCents } from '@shared/domain/ledger/buildInvoiceJournalLines';
import { moneyAccountRefusalReason } from '@shared/domain/banking/bankAccountRules';
import { paymentDateRefusalReason } from '@shared/domain/documents/paymentTiming';
import { inactiveContactRefusalReason } from '@shared/domain/contacts/contactRules';
import {
  creditApplicationRefusalReason,
  creditRefundRefusalReason,
  creditRemainingCents,
  defaultApplicationCents,
  statusAfterApplication,
} from '@shared/domain/sales/creditApplication';
import { getCurrentDb } from '../companyFile';
import { ensureAccountByName } from '../db/ensureAccount';
import { ensureGstHstAccountId } from '../db/buildTaxSplitLines';
import { mapCreditNoteLineRow, mapCreditNoteRow } from '../db/mappers';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';

import { ACCOUNTS_PAYABLE_ARGS as AP_ACCOUNT_ARGS, ACCOUNTS_RECEIVABLE_ARGS as AR_ACCOUNT_ARGS } from '../db/controlAccounts';
import { localIsoDate } from '@shared/domain/dates/localDate';

async function loadCreditNote(id: number): Promise<CreditNote> {
  const db = getCurrentDb();
  const row = await db.selectFrom('creditNotes').selectAll().where('id', '=', id).executeTakeFirst();
  if (!row) throw new Error(`Credit note ${id} not found.`);
  const lines = await db.selectFrom('creditNoteLines').selectAll().where('creditNoteId', '=', id).orderBy('lineOrder').execute();
  return mapCreditNoteRow(row, lines.map(mapCreditNoteLineRow));
}

export async function creditNotesList(kind?: CreditNoteKind) {
  const db = getCurrentDb();
  let query = db.selectFrom('creditNotes').selectAll();
  if (kind) query = query.where('kind', '=', kind);
  const rows = await query.orderBy('creditNoteDate', 'desc').orderBy('id', 'desc').execute();
  const allLines = await db.selectFrom('creditNoteLines').selectAll().orderBy('lineOrder').execute();
  return rows.map((row) =>
    mapCreditNoteRow(
      row,
      allLines.filter((l) => l.creditNoteId === row.id).map(mapCreditNoteLineRow),
    ),
  );
}

export async function creditNotesGet(id: number) {
  return loadCreditNote(id);
}

/** Next number in the CN-#### (customer) or VC-#### (vendor) sequence — continuing whatever
 * pattern the file already uses (see documentNumbering.ts), CN-0001 / VC-0001 for a new file. */
export async function creditNotesNextNumber(kind: unknown) {
  const parsedKind: CreditNoteKind = kind === 'vendor' ? 'vendor' : 'customer';
  const db = getCurrentDb();
  const prefix = parsedKind === 'customer' ? 'CN' : 'VC';
  const rows = await db.selectFrom('creditNotes').select('creditNoteNumber').where('kind', '=', parsedKind).execute();
  if (rows.length === 0) return `${prefix}-0001`;
  return nextDocumentNumber(prefix, rows.map((r) => r.creditNoteNumber), localIsoDate());
}

export async function creditNotesCreate(input: unknown) {
  const payload = newCreditNoteSchema.parse(input);
  const db = getCurrentDb();

  const contact = await db.selectFrom(payload.kind === 'customer' ? 'customers' : 'vendors').select(['name', 'isActive']).where('id', '=', payload.contactId).executeTakeFirst();
  const contactRefusal = inactiveContactRefusalReason(payload.kind, contact && { name: contact.name, isActive: Boolean(contact.isActive) }, payload.kind === 'customer' ? 'credit note' : 'vendor credit');
  if (contactRefusal) throw new Error(contactRefusal);
  const lineAccountIds = payload.lines.map((line) => line.categoryAccountId);
  if (payload.kind === 'customer') await assertSaleLineAccounts(db, lineAccountIds, 'credit note');
  else await assertPurchaseLineAccounts(db, lineAccountIds, 'vendor credit');

  const lineAmounts = payload.lines.map((line) => computeInvoiceLineAmountCents(line));

  const built =
    payload.kind === 'customer'
      ? buildCustomerCreditNoteJournalLines(
          await ensureAccountByName(db, ...AR_ACCOUNT_ARGS),
          await ensureGstHstAccountId(db, 'payable'),
          payload.lines,
          lineAmounts,
        )
      : buildVendorCreditJournalLines(
          await ensureAccountByName(db, ...AP_ACCOUNT_ARGS),
          await ensureGstHstAccountId(db, 'recoverable'),
          payload.lines,
          lineAmounts,
        );

  const takenNumbers = (await db.selectFrom('creditNotes').select('creditNoteNumber').where('kind', '=', payload.kind).execute()).map((row) => row.creditNoteNumber);
  const creditNoteNumber = resolveNewDocumentNumber(payload.kind === 'customer' ? 'CN' : 'VC', payload.creditNoteNumber, takenNumbers, payload.creditNoteDate, payload.kind === 'customer' ? 'Credit note number' : 'Vendor credit number');
  const memo = payload.memo ?? `${payload.kind === 'customer' ? 'Credit note' : 'Vendor credit'} ${creditNoteNumber}`;

  const inserted = await db.transaction().execute(async (trx) => {
    const entry = await journalCreate({ entryDate: payload.creditNoteDate, memo, reference: creditNoteNumber, lines: built.lines }, trx);
    const posted = await journalPost(entry.id, trx);

    const noteRow = await trx
      .insertInto('creditNotes')
      .values({
        kind: payload.kind,
        contactId: payload.contactId,
        creditNoteNumber,
        creditNoteDate: payload.creditNoteDate,
        memo: payload.memo,
        totalCents: built.totalCents,
        status: 'open',
        appliedToId: null,
        creditJournalEntryId: posted.id,
        refundJournalEntryId: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    for (const [i, line] of payload.lines.entries()) {
      await trx
        .insertInto('creditNoteLines')
        .values({
          creditNoteId: noteRow.id,
          lineOrder: i,
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          amountCents: lineAmounts[i],
          categoryAccountId: line.categoryAccountId,
          taxCode: line.taxCode ?? null,
          manualHstCents: line.taxCode === 'Manual' ? (line.manualHstCents ?? null) : null,
        })
        .execute();
    }

    return noteRow.id;
  });

  return loadCreditNote(inserted);
}

/**
 * Applies some or all of an open credit to an unpaid invoice or bill. No journal entry is posted:
 * issuing the credit already moved the amount through AR/AP, and the invoice put the opposite
 * amount there, so the two net to zero on their own — posting anything more would double-count the
 * reversal. This only records how much of the credit settled which document, and reduces that
 * document's balance by the same amount.
 *
 * The amount need not match either side: a credit can settle part of a document and be applied
 * again to another. Each application is its own row so it can be undone in order — see
 * creditApplication.ts for the rules.
 */
export async function creditNotesApply(input: unknown) {
  const { id, targetId, amountCents: requestedCents } = applyCreditNoteSchema.parse(input);
  const db = getCurrentDb();
  const note = await loadCreditNote(id);
  const today = localIsoDate();

  if (note.kind === 'customer') {
    const invoice = await db.selectFrom('invoices').selectAll().where('id', '=', targetId).executeTakeFirst();
    if (!invoice) throw new Error(`Invoice ${targetId} not found.`);
    const invoicePaidCents = invoice.paidCents ?? (invoice.status === 'paid' ? invoice.totalCents : 0);
    const invoiceBalanceCents = Math.max(0, invoice.totalCents - invoicePaidCents);
    const amountCents = requestedCents ?? defaultApplicationCents(note, invoiceBalanceCents);
    const refusal = creditApplicationRefusalReason(note, invoiceBalanceCents, amountCents, `Invoice ${invoice.invoiceNumber}`);
    if (refusal) throw new Error(refusal);
    const newPaidCents = invoicePaidCents + amountCents;
    await db.transaction().execute(async (trx) => {
      await trx.insertInto('creditNoteApplications').values({ creditNoteId: id, targetId, amountCents, appliedDate: today }).execute();
      await trx.updateTable('invoices').set({ paidCents: newPaidCents, status: newPaidCents >= invoice.totalCents ? 'paid' : 'unpaid', paymentJournalEntryId: note.creditJournalEntryId }).where('id', '=', targetId).execute();
      const appliedCents = note.appliedCents + amountCents;
      await trx.updateTable('creditNotes').set({ appliedCents, status: statusAfterApplication(note.totalCents, appliedCents), appliedToId: targetId }).where('id', '=', id).execute();
    });
  } else {
    const bill = await db.selectFrom('bills').selectAll().where('id', '=', targetId).executeTakeFirst();
    if (!bill) throw new Error(`Bill ${targetId} not found.`);
    const billPaidCents = bill.paidCents ?? (bill.status === 'paid' ? bill.amountCents : 0);
    const billBalanceCents = Math.max(0, bill.amountCents - billPaidCents);
    const amountCents = requestedCents ?? defaultApplicationCents(note, billBalanceCents);
    const refusal = creditApplicationRefusalReason(note, billBalanceCents, amountCents, bill.billNumber ? `Vendor invoice ${bill.billNumber}` : `Bill ${bill.id}`);
    if (refusal) throw new Error(refusal);
    const newPaidCents = billPaidCents + amountCents;
    await db.transaction().execute(async (trx) => {
      await trx.insertInto('creditNoteApplications').values({ creditNoteId: id, targetId, amountCents, appliedDate: today }).execute();
      await trx.updateTable('bills').set({ paidCents: newPaidCents, status: newPaidCents >= bill.amountCents ? 'paid' : 'unpaid', paymentJournalEntryId: note.creditJournalEntryId }).where('id', '=', targetId).execute();
      const appliedCents = note.appliedCents + amountCents;
      await trx.updateTable('creditNotes').set({ appliedCents, status: statusAfterApplication(note.totalCents, appliedCents), appliedToId: targetId }).where('id', '=', id).execute();
    });
  }

  return loadCreditNote(id);
}

/** Pays an open customer credit back in cash (or banks a refund cheque received from a vendor). */
export async function creditNotesRefund(input: unknown) {
  const { id, bankAccountId, refundDate } = refundCreditNoteSchema.parse(input);
  const db = getCurrentDb();
  const note = await loadCreditNote(id);
  const refundRefusal = creditRefundRefusalReason(note);
  if (refundRefusal) throw new Error(refundRefusal);
  const refundCents = creditRemainingCents(note);
  const timingRefusal = paymentDateRefusalReason(note.creditNoteDate, refundDate, `credit note ${note.creditNoteNumber}`, 'refund');
  if (timingRefusal) throw new Error(timingRefusal);
  const bank = await db.selectFrom('accounts').select(['id', 'name', 'accountSubtype', 'isActive']).where('id', '=', bankAccountId).executeTakeFirst();
  const bankRefusal = moneyAccountRefusalReason(bank && { ...bank, isActive: Boolean(bank.isActive) }, 'refund this credit');
  if (bankRefusal) throw new Error(bankRefusal);

  const label = `Refund — ${note.creditNoteNumber}`;
  const lines =
    note.kind === 'customer'
      ? buildCustomerRefundJournalLines(await ensureAccountByName(db, ...AR_ACCOUNT_ARGS), bankAccountId, refundCents, label)
      : buildVendorRefundJournalLines(await ensureAccountByName(db, ...AP_ACCOUNT_ARGS), bankAccountId, refundCents, label);

  await db.transaction().execute(async (trx) => {
    const entry = await journalCreate({ entryDate: refundDate, memo: label, reference: note.creditNoteNumber, lines }, trx);
    const posted = await journalPost(entry.id, trx);
    await trx.updateTable('creditNotes').set({ status: 'refunded', refundJournalEntryId: posted.id }).where('id', '=', id).execute();
  });

  return loadCreditNote(id);
}

/** Backs out the most recent settlement without altering the credit note's original GL. A
 * refund had a cash journal, so that journal is voided and the credit reopens. An application had
 * no extra journal, so the latest one is removed and the document it settled gets its balance
 * back — one application at a time, newest first, so a credit spread over three invoices is
 * unwound in the order it was applied. Any earlier cash payments on the document stay linked. */
export async function creditNotesUndoSettlement(id: number) {
  const db = getCurrentDb();
  const note = await loadCreditNote(id);

  await db.transaction().execute(async (trx) => {
    if (note.status === 'refunded') {
      if (note.refundJournalEntryId === null) throw new Error('The refund journal link is missing; use an adjusting entry instead of an unsafe automatic reversal.');
      await journalVoid(note.refundJournalEntryId, false, trx, true);
      await trx.updateTable('creditNotes').set({ status: 'open', refundJournalEntryId: null }).where('id', '=', id).execute();
      return;
    }

    const latest = await trx.selectFrom('creditNoteApplications').selectAll().where('creditNoteId', '=', id).orderBy('id', 'desc').executeTakeFirst();
    if (!latest) throw new Error('This credit has not been applied to anything.');
    if (note.kind === 'customer') {
      const invoice = await trx.selectFrom('invoices').selectAll().where('id', '=', latest.targetId).executeTakeFirst();
      if (!invoice) throw new Error('The invoice this credit settled no longer exists.');
      const prior = await trx.selectFrom('invoicePayments').select(['journalEntryId', 'moneyAccountId']).where('invoiceId', '=', invoice.id).orderBy('paymentDate', 'desc').orderBy('id', 'desc').executeTakeFirst();
      const paidCents = Math.max(0, invoice.paidCents - latest.amountCents);
      await trx.updateTable('invoices').set({ paidCents, status: paidCents >= invoice.totalCents ? 'paid' : 'unpaid', paymentJournalEntryId: prior?.journalEntryId ?? null, paymentAccountId: prior?.moneyAccountId ?? null }).where('id', '=', invoice.id).execute();
    } else {
      const bill = await trx.selectFrom('bills').selectAll().where('id', '=', latest.targetId).executeTakeFirst();
      if (!bill) throw new Error('The bill this credit settled no longer exists.');
      const prior = await trx.selectFrom('billPayments').select('journalEntryId').where('billId', '=', bill.id).orderBy('paymentDate', 'desc').orderBy('id', 'desc').executeTakeFirst();
      const paidCents = Math.max(0, bill.paidCents - latest.amountCents);
      await trx.updateTable('bills').set({ paidCents, status: paidCents >= bill.amountCents ? 'paid' : 'unpaid', paymentJournalEntryId: prior?.journalEntryId ?? null }).where('id', '=', bill.id).execute();
    }
    await trx.deleteFrom('creditNoteApplications').where('id', '=', latest.id).execute();
    const previous = await trx.selectFrom('creditNoteApplications').select('targetId').where('creditNoteId', '=', id).orderBy('id', 'desc').executeTakeFirst();
    const appliedCents = Math.max(0, note.appliedCents - latest.amountCents);
    if (previous) await trx.updateTable('creditNotes').set({ appliedCents, status: 'open', appliedToId: previous.targetId }).where('id', '=', id).execute();
    else await trx.updateTable('creditNotes').set({ appliedCents, status: 'open', appliedToId: null }).where('id', '=', id).execute();
  });
  return loadCreditNote(id);
}

/** Voids the credit's GL entry and deletes it. Only allowed while still open — once applied or
 * refunded, unwinding it would silently reopen an invoice/bill or strand a cash movement. */
export async function creditNotesDelete(id: number) {
  const db = getCurrentDb();
  const note = await loadCreditNote(id);
  if (note.status !== 'open' || note.appliedCents > 0) {
    throw new Error(`Only a credit that has not been applied or refunded can be deleted — undo its settlement first.`);
  }
  await db.transaction().execute(async (trx) => {
    if (note.creditJournalEntryId !== null) await journalVoid(note.creditJournalEntryId, false, trx, true);
    await trx.deleteFrom('creditNoteLines').where('creditNoteId', '=', id).execute();
    await trx.deleteFrom('creditNotes').where('id', '=', id).execute();
  });
  return { deleted: true as const };
}
