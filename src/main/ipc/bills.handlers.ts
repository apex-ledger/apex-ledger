import { tagLinesWithContact } from '@shared/domain/ledger/tagLinesWithContact';
import { newBillSchema, payBillSchema, periodReportQuerySchema } from '@shared/validation/schemas';
import { currencyMatchRefusalReason, moneyAccountRefusalReason } from '@shared/domain/banking/bankAccountRules';
import { paymentDateRefusalReason } from '@shared/domain/documents/paymentTiming';
import { inactiveContactRefusalReason } from '@shared/domain/contacts/contactRules';
import { getCurrentDb } from '../companyFile';
import { getAllBills, getBillById } from '../db/queries';
import { mapBillLineRow, mapBillRow } from '../db/mappers';
import { ensureAccountByName } from '../db/ensureAccount';
import { ACCOUNTS_PAYABLE_ARGS, EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS } from '../db/controlAccounts';
import { buildTaxSplitJournalLines } from '../db/buildTaxSplitLines';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';
import { APPROVAL_LABELS, canTransition, filterApprovalRowsByPeriod, isPayable, summariseApprovals, type ApprovalStatus, type BillApprovalRow } from '@shared/domain/purchases/billApproval';
import type { AppDb } from '../db/schema';
import { assertPurchaseLineAccounts } from './purchaseLineAccounts';
import { billHeaderFigures, billLinesFromPayload, billLinesRefusalReason } from '@shared/domain/purchases/billLines';
import type { NewJournalEntryLineInput } from '@shared/domain/types';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { foreignOutstandingCents, settleForeignPayment } from '@shared/domain/currency/fxSettlement';
import { tagDocumentLines } from '@shared/domain/ledger/tagDocumentLines';

export async function billsList() {
  const db = getCurrentDb();
  return getAllBills(db);
}

export async function billsGet(id: number, executor?: AppDb) {
  const db = executor ?? getCurrentDb();
  const bill = await getBillById(db, id);
  if (!bill) throw new Error(`Bill ${id} not found.`);
  return bill;
}

export async function billsPayments(billId?: number) {
  const db = getCurrentDb();
  let query = db.selectFrom('billPayments').select(['id', 'billId', 'paymentDate', 'amountCents', 'bankAccountId', 'journalEntryId', 'memo', 'createdAt', 'foreignAmountCents', 'exchangeRate', 'fxGainLossCents']).orderBy('paymentDate', 'desc').orderBy('id', 'desc');
  if (billId !== undefined) query = query.where('billId', '=', billId);
  return query.execute();
}

/** Recording a bill posts it to the ledger immediately (Debit the expense/asset category, Credit
 * Accounts Payable) — matching how a real vendor bill increases what the company owes the moment
 * it's received, whether or not it's been paid yet. */
export async function billsCreate(input: unknown, executor?: AppDb) {
  const payload = newBillSchema.parse(input);
  const db = executor ?? getCurrentDb();
  const vendor = await db.selectFrom('vendors').select(['name', 'isActive']).where('id', '=', payload.vendorId).executeTakeFirst();
  const vendorRefusal = inactiveContactRefusalReason('vendor', vendor && { name: vendor.name, isActive: Boolean(vendor.isActive) });
  if (vendorRefusal) throw new Error(vendorRefusal);
  const billLines = billLinesFromPayload(payload);
  const linesRefusal = billLinesRefusalReason(billLines);
  if (linesRefusal) throw new Error(linesRefusal);
  await assertPurchaseLineAccounts(db, billLines.map((line) => line.categoryAccountId), 'bill');
  const header = billHeaderFigures(billLines);
  const billNumber = payload.billNumber?.trim() || null;

  // Stock received on a line must land in that product's inventory asset account with a quantity.
  const productIds = Array.from(new Set(billLines.map((line) => line.productId).filter((id): id is number => id !== null)));
  const products = productIds.length === 0 ? [] : await db.selectFrom('products').selectAll().where('id', 'in', productIds).execute();
  for (const line of billLines) {
    if (line.productId === null) continue;
    const product = products.find((row) => row.id === line.productId);
    if (!product) throw new Error('The selected product no longer exists.');
    if (!product.trackQuantity) continue;
    if (!line.quantity) throw new Error(`Enter the quantity received for ${product.name}.`);
    if (product.assetAccountId === null) throw new Error(`Set an Inventory Asset account on ${product.name} before receiving it.`);
    if (line.categoryAccountId !== product.assetAccountId) throw new Error(`Use ${product.name}'s Inventory Asset account as the category on the ${product.name} line.`);
  }

  if (billNumber) {
    const duplicate = await db.selectFrom('bills').select('id').where('vendorId', '=', payload.vendorId).where((eb) => eb.fn('lower', ['billNumber']), '=', billNumber.toLowerCase()).executeTakeFirst();
    if (duplicate) throw new Error('This vendor invoice number is already recorded on an existing bill. Open that bill instead of entering it again.');
  }

  const accountsPayableId = await ensureAccountByName(db, ...ACCOUNTS_PAYABLE_ARGS);

  const foreignFields =
    payload.foreignCurrency && payload.foreignAmountCents !== null && payload.exchangeRate !== null
      ? { foreignCurrency: payload.foreignCurrency, foreignAmountCents: payload.foreignAmountCents, exchangeRate: payload.exchangeRate }
      : {};

  // Each line posts its own category (and GST/HST) lines; the credit to Accounts Payable is one
  // line for the grand total, so the ledger shows one payable per bill however many lines it has.
  const lines: NewJournalEntryLineInput[] = [];
  let totalCents = 0;
  for (const line of billLines) {
    const built = await buildTaxSplitJournalLines(db, {
      categoryAccountId: line.categoryAccountId,
      moneyAccountId: accountsPayableId,
      baseCents: line.baseCents,
      taxCode: line.taxCode,
      taxCents: line.taxCode ? line.taxCents : 0,
      direction: 'expense',
      description: line.description ?? payload.memo ?? 'Vendor bill',
      foreignFields,
    });
    lines.push(...tagLinesWithContact(built.lines.filter((journalLine) => journalLine.accountId !== accountsPayableId), { vendorId: payload.vendorId }));
    totalCents += built.totalCents;
  }
  lines.push({ accountId: accountsPayableId, debitCents: 0, creditCents: totalCents, description: payload.memo ?? 'Vendor bill', vendorId: payload.vendorId });

  // The GL post and the bill row commit together: a failure anywhere in here rolls back both,
  // rather than leaving a posted journal entry with no bill behind it.
  const create = async (trx: AppDb) => {
    const entry = await journalCreate(
      {
        entryDate: payload.billDate,
        memo: payload.memo ?? 'Vendor bill',
        reference: billNumber,
        lines,
      },
      trx,
    );
    const posted = await journalPost(entry.id, trx);
    // Class / location: each document line's tags land on the journal line that carries it.
    {
      const tagPairs = tagDocumentLines(posted.lines.map((l) => ({ id: l.id, accountId: l.accountId, debitCents: l.debitCents, creditCents: l.creditCents })), billLines.map((line) => ({ accountId: line.categoryAccountId, baseCents: line.baseCents, tagIds: line.tagIds ?? [] })));
      if (tagPairs.length > 0) await trx.insertInto('journalEntryLineTags').values(tagPairs).execute();
    }

    const inserted = await trx
      .insertInto('bills')
      .values({
        vendorId: payload.vendorId,
        billNumber,
        purchaseOrderNumber: payload.purchaseOrderNumber,
        billDate: payload.billDate,
        dueDate: payload.dueDate,
        categoryAccountId: header.categoryAccountId,
        amountCents: totalCents,
        taxCode: header.taxCode,
        manualHstCents: header.taxCode ? header.taxCents : null,
        memo: payload.memo,
        status: 'unpaid',
        billJournalEntryId: posted.id,
        paymentJournalEntryId: null,
        foreignCurrency: payload.foreignCurrency,
        foreignAmountCents: payload.foreignAmountCents,
        exchangeRate: payload.exchangeRate,
        receiptFilePath: payload.receiptFilePath,
        paymentTerms: payload.paymentTerms ?? null,
        productId: billLines[0]?.productId ?? null,
        quantity: billLines[0]?.productId ? billLines[0]?.quantity ?? null : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const insertedLines = [];
    for (const [index, line] of billLines.entries()) {
      const insertedLine = await trx
        .insertInto('billLines')
        .values({
          billId: inserted.id,
          lineOrder: index,
          categoryAccountId: line.categoryAccountId,
          description: line.description,
          baseCents: line.baseCents,
          taxCode: line.taxCode,
          taxCents: line.taxCode ? line.taxCents : 0,
          productId: line.productId,
          quantity: line.productId ? line.quantity : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      insertedLines.push(insertedLine);
      const product = line.productId === null ? undefined : products.find((row) => row.id === line.productId);
      if (product?.trackQuantity && line.quantity) {
        await trx.insertInto('inventoryMovements').values({
          productId: product.id,
          movementDate: payload.billDate,
          quantityDelta: line.quantity,
          unitCostCents: Math.round(line.baseCents / line.quantity),
          kind: 'purchase',
          journalEntryId: posted.id,
          note: `${billNumber ?? `Bill ${inserted.id}`} — ${line.description ?? payload.memo ?? product.name}`,
          sourceDocumentType: 'bill',
          sourceDocumentId: inserted.id,
          sourceLineId: insertedLine.id,
        }).execute();
      }
    }
    return { inserted, insertedLines };
  };
  const { inserted, insertedLines } = await (executor ? create(db) : db.transaction().execute(create));

  return mapBillRow(inserted, insertedLines.map(mapBillLineRow));
}

/** Paying a bill posts a second entry (Debit Accounts Payable, Credit the bank account chosen),
 * settling the liability without touching the original expense recognition. */
export async function billsPay(input: unknown) {
  const parsed = payBillSchema.parse(input);
  const { id, bankAccountId, paymentDate, memo } = parsed;
  const db = getCurrentDb();
  const bill = await billsGet(id);
  if (bill.balanceDueCents <= 0) throw new Error('This bill has already been paid in full.');
  // A foreign-currency bill settles in its own currency — see invoicesReceivePayment.
  const settlement = bill.foreignCurrency && bill.foreignAmountCents !== null && bill.exchangeRate !== null && parsed.foreignAmountCents !== null && parsed.exchangeRate !== null
    ? settleForeignPayment({
        foreignPaidCents: parsed.foreignAmountCents,
        foreignOutstandingCents: foreignOutstandingCents(bill.foreignAmountCents, bill.amountCents, bill.balanceDueCents),
        cadOutstandingCents: bill.balanceDueCents,
        documentRate: bill.exchangeRate,
        paymentRate: parsed.exchangeRate,
        side: 'payable',
      })
    : null;
  const amountCents = settlement ? settlement.cadRelievedCents : parsed.amountCents;
  const cashCents = settlement ? settlement.cadCashCents : amountCents;
  if (amountCents > bill.balanceDueCents) {
    throw new Error(`Payment cannot exceed the outstanding balance of $${(bill.balanceDueCents / 100).toFixed(2)}.`);
  }
  if (!isPayable(bill.approvalStatus)) {
    throw new Error(`This bill is ${APPROVAL_LABELS[bill.approvalStatus].toLowerCase()} and cannot be paid until it is approved.`);
  }
  const timingRefusal = paymentDateRefusalReason(bill.billDate, paymentDate, bill.billNumber ? `vendor invoice ${bill.billNumber}` : `bill ${bill.id}`);
  if (timingRefusal) throw new Error(timingRefusal);

  const bank = await db.selectFrom('accounts').select(['id', 'name', 'accountSubtype', 'isActive', 'currency']).where('id', '=', bankAccountId).executeTakeFirst();
  const bankRefusal = moneyAccountRefusalReason(bank && { ...bank, isActive: Boolean(bank.isActive) }, 'pay this bill', { allowCreditCard: true });
  if (bankRefusal) throw new Error(bankRefusal);
  const currencyRefusal = bank ? currencyMatchRefusalReason(bank, bill.foreignCurrency, bill.billNumber ? `vendor invoice ${bill.billNumber}` : `bill ${bill.id}`) : null;
  if (currencyRefusal) throw new Error(currencyRefusal);

  const accountsPayableId = await ensureAccountByName(db, ...ACCOUNTS_PAYABLE_ARGS);
  const paymentMemo = memo?.trim() || (bill.billNumber ? `Payment — vendor invoice ${bill.billNumber}` : 'Vendor bill payment');

  const exchangeAccountId = settlement && settlement.gainLossCents !== 0 ? await ensureAccountByName(db, ...EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS) : null;
  const updated = await db.transaction().execute(async (trx) => {
    const foreign = settlement && bill.foreignCurrency ? { foreignCurrency: bill.foreignCurrency, foreignAmountCents: parsed.foreignAmountCents, exchangeRate: parsed.exchangeRate } : {};
    const lines = [
      { accountId: accountsPayableId, debitCents: amountCents, creditCents: 0, description: paymentMemo },
      { accountId: bankAccountId, debitCents: 0, creditCents: cashCents, description: paymentMemo, ...foreign },
    ];
    if (settlement && exchangeAccountId !== null && settlement.gainLossCents !== 0) {
      const gain = settlement.gainLossCents;
      lines.push({ accountId: exchangeAccountId, debitCents: gain < 0 ? -gain : 0, creditCents: gain > 0 ? gain : 0, description: `Exchange ${gain > 0 ? 'gain' : 'loss'} — ${bill.foreignCurrency} at ${parsed.exchangeRate} vs ${bill.exchangeRate} billed` });
    }
    const entry = await journalCreate(
      {
        entryDate: paymentDate,
        memo: paymentMemo,
        reference: `BILL-${bill.id}`,
        lines: tagLinesWithContact(lines, { vendorId: bill.vendorId }),
      },
      trx,
    );
    const posted = await journalPost(entry.id, trx);

    await trx.insertInto('billPayments').values({
      billId: id,
      paymentDate,
      amountCents,
      bankAccountId,
      journalEntryId: posted.id,
      memo: memo?.trim() || null,
      foreignAmountCents: settlement ? parsed.foreignAmountCents : null,
      exchangeRate: settlement ? parsed.exchangeRate : null,
      fxGainLossCents: settlement ? settlement.gainLossCents : 0,
    }).execute();

    const newPaidCents = bill.paidCents + amountCents;
    return trx
      .updateTable('bills')
      .set({
        paidCents: newPaidCents,
        status: newPaidCents >= bill.amountCents ? 'paid' : 'unpaid',
        paymentJournalEntryId: posted.id,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  return mapBillRow(updated);
}

/** Reverses the newest vendor payment as one unit: void GL, remove payment row, reopen balance. */
export async function billsReverseLastPayment(id: number) {
  const db = getCurrentDb();
  const bill = await billsGet(id);
  const payment = await db.selectFrom('billPayments').selectAll().where('billId', '=', id).orderBy('paymentDate', 'desc').orderBy('id', 'desc').executeTakeFirst();
  if (!payment) throw new Error('No reversible payment record exists for this bill. Older imported/legacy paid bills must be corrected with an adjusting entry.');
  const updated = await db.transaction().execute(async (trx) => {
    await journalVoid(payment.journalEntryId, false, trx, true);
    await trx.deleteFrom('billPayments').where('id', '=', payment.id).execute();
    const prior = await trx.selectFrom('billPayments').select('journalEntryId').where('billId', '=', id).orderBy('paymentDate', 'desc').orderBy('id', 'desc').executeTakeFirst();
    const paidCents = Math.max(0, bill.paidCents - payment.amountCents);
    return trx.updateTable('bills').set({ paidCents, status: paidCents >= bill.amountCents ? 'paid' : 'unpaid', paymentJournalEntryId: prior?.journalEntryId ?? null }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  });
  return mapBillRow(updated);
}

/** Voids the bill's original GL entry (rather than leaving a posted, orphaned journal entry
 * behind) and removes the bill's own tracking row. */
export async function billsDelete(id: number, executor?: AppDb) {
  const db = executor ?? getCurrentDb();
  const bill = await billsGet(id, db);
  if (bill.paidCents > 0) throw new Error('A bill with payments cannot be deleted. Void/reverse its payments first.');
  const linkedPo = await db.selectFrom('purchaseOrders').select(['id', 'poNumber']).where('matchedBillId', '=', id).executeTakeFirst();
  if (linkedPo) {
    throw new Error(`Bill is matched to received purchase order ${linkedPo.poNumber}. Reverse/unmatch the goods-receipt flow instead of deleting the bill directly.`);
  }
  const remove = async (trx: AppDb) => {
    await trx.deleteFrom('inventoryMovements').where('sourceDocumentType', '=', 'bill').where('sourceDocumentId', '=', id).execute();
    if (bill.billJournalEntryId) await journalVoid(bill.billJournalEntryId, false, trx, true);
    await trx.updateTable('purchaseOrders').set({ status: 'sent', convertedBillId: null, convertedAt: null, matchedBillId: null, matchedAt: null }).where('convertedBillId', '=', id).execute();
    await trx.deleteFrom('bills').where('id', '=', id).execute();
  };
  if (executor) await remove(db);
  else await db.transaction().execute(remove);
  return { deleted: true } as const;
}


/** Moves a bill between approval states.
 *
 * The transition is checked rather than assumed: a caller can always send any status, and silently
 * accepting an impossible move would leave the audit trail saying something that never happened.
 */
export async function billsSetApproval(input: unknown) {
  const { id, approvalStatus, approvedBy, note } = input as {
    id: number;
    approvalStatus: ApprovalStatus;
    approvedBy?: string | null;
    note?: string | null;
  };

  const db = getCurrentDb();
  const bill = await billsGet(id);

  if (!canTransition(bill.approvalStatus, approvalStatus)) {
    throw new Error(
      `A bill that is ${APPROVAL_LABELS[bill.approvalStatus].toLowerCase()} cannot move to ${APPROVAL_LABELS[approvalStatus].toLowerCase()}.`,
    );
  }

  // Rejecting without saying why is the note somebody will be asked about later and cannot answer.
  if (approvalStatus === 'rejected' && !note?.trim()) {
    throw new Error('A reason is required when rejecting a bill.');
  }

  const updated = await db
    .updateTable('bills')
    .set({
      approvalStatus,
      // Stamped only on approval — carrying a name and time on a rejection would read as if that
      // person had approved it.
      approvedBy: approvalStatus === 'approved' ? (approvedBy?.trim() || null) : null,
      approvedAt: approvalStatus === 'approved' ? new Date().toISOString() : null,
      approvalNote: note?.trim() || null,
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();

  return mapBillRow(updated);
}

/** The approval report: what is waiting, what is stuck, and what got paid without anyone deciding. */
export async function billsApprovalReport(input: unknown) {
  const requested = (input ?? {}) as { asOfDate?: string; periodStart?: string; periodEnd?: string };
  const period = requested.periodStart && requested.periodEnd ? periodReportQuerySchema.parse(requested) : null;
  const { asOfDate } = requested;
  const db = getCurrentDb();
  const bills = await getAllBills(db);
  const vendors = await db.selectFrom('vendors').select(['id', 'name']).execute();
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));

  const rows: BillApprovalRow[] = bills.map((b) => ({
    id: b.id,
    vendorName: vendorName.get(b.vendorId) ?? 'Unknown vendor',
    billNumber: b.billNumber,
    billDate: b.billDate,
    dueDate: b.dueDate,
    totalCents: b.amountCents,
    approvalStatus: b.approvalStatus,
    approvedBy: b.approvedBy,
    approvedAt: b.approvedAt,
    approvalNote: b.approvalNote,
    isPaid: b.status === 'paid',
  }));

  const filteredRows = period ? filterApprovalRowsByPeriod(rows, period.periodStart, period.periodEnd) : rows;
  return { ...summariseApprovals(filteredRows), asOfDate: asOfDate ?? period?.periodEnd ?? localIsoDate() };
}
