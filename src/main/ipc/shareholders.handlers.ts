import type { BrowserWindow } from 'electron';
import { recordT5PaymentSchema, saveShareholderSchema } from '@shared/validation/schemas';
import { computeT5SlipsForYear } from '@shared/domain/payroll/computeT5Slip';
import { getCurrentDb } from '../companyFile';
import { getAllShareholders, getAllT5Payments, getShareholderById } from '../db/queries';
import { mapShareholderRow, mapT5PaymentRow } from '../db/mappers';
import { ensureAccountByName } from '../db/ensureAccount';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';
import { companyGet } from './company.handlers';
import { generateT5Pdf } from '../forms/generateT5Pdf';
import { savePdfAndOpen } from '../forms/savePdfAndOpen';

export async function shareholdersList() {
  const db = getCurrentDb();
  return getAllShareholders(db);
}

export async function shareholdersSave(input: unknown) {
  const payload = saveShareholderSchema.parse(input);
  const db = getCurrentDb();
  const fields = {
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    address: payload.address,
    notes: payload.notes,
    sin: payload.sin,
    businessNumber: payload.businessNumber,
    loanAccountId: payload.loanAccountId,
  };
  if (payload.id) {
    await db.updateTable('shareholders').set(fields).where('id', '=', payload.id).execute();
    const row = await db.selectFrom('shareholders').selectAll().where('id', '=', payload.id).executeTakeFirstOrThrow();
    return mapShareholderRow(row);
  }
  const inserted = await db
    .insertInto('shareholders')
    .values({ ...fields, isActive: 1 })
    .returningAll()
    .executeTakeFirstOrThrow();
  return mapShareholderRow(inserted);
}

export async function shareholdersDeactivate(id: number) {
  const db = getCurrentDb();
  await db.updateTable('shareholders').set({ isActive: 0 }).where('id', '=', id).execute();
  const row = await db.selectFrom('shareholders').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return mapShareholderRow(row);
}

export async function t5PaymentsList(shareholderId?: number) {
  const db = getCurrentDb();
  return getAllT5Payments(db, shareholderId);
}

const T5_PAYMENT_LABELS: Record<string, string> = {
  eligible_dividend: 'Eligible dividend',
  non_eligible_dividend: 'Non-eligible dividend',
  interest: 'Interest',
};

/** Records a dividend or shareholder-loan-interest payment and posts it immediately — a single
 * event, same one-step pattern as paying a bill, rather than payroll's draft/post workflow.
 * Dividends debit "Dividends Declared" (equity, closed to Retained Earnings at year end);
 * interest debits "Interest Expense — Shareholder Loans" (a deductible expense to the
 * corporation, taxable interest income to the shareholder). Both credit the bank account paid
 * from. */
export async function t5PaymentsRecord(input: unknown) {
  const payload = recordT5PaymentSchema.parse(input);
  const db = getCurrentDb();
  const shareholder = await getShareholderById(db, payload.shareholderId);
  if (!shareholder) throw new Error(`Shareholder ${payload.shareholderId} not found.`);

  const debitAccountId =
    payload.paymentType === 'interest'
      ? await ensureAccountByName(db, 'Interest Expense — Shareholder Loans', 'Expense', 'SHLDR-INT', '8710', 'Operating Expense')
      : await ensureAccountByName(db, 'Dividends Declared', 'Equity', 'DIV-DECLARED', '3700', 'Equity');

  const label = T5_PAYMENT_LABELS[payload.paymentType] ?? 'Payment';
  const memo = payload.memo ?? `${label} — ${shareholder.name}`;

  // Atomic: without this, a failure after posting would leave dividend/interest expense on the
  // books with no T5 payment record — and so nothing to report on the T5 slip at year end.
  const inserted = await db.transaction().execute(async (trx) => {
    const entry = await journalCreate(
      {
        entryDate: payload.paymentDate,
        memo,
        reference: null,
        lines: [
          { accountId: debitAccountId, debitCents: payload.amountCents, creditCents: 0, description: memo },
          { accountId: payload.bankAccountId, debitCents: 0, creditCents: payload.amountCents, description: memo },
        ],
      },
      trx,
    );
    const posted = await journalPost(entry.id, trx);

    return trx
      .insertInto('t5Payments')
      .values({
        shareholderId: payload.shareholderId,
        paymentDate: payload.paymentDate,
        paymentType: payload.paymentType,
        amountCents: payload.amountCents,
        bankAccountId: payload.bankAccountId,
        memo: payload.memo,
        journalEntryId: posted.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  return mapT5PaymentRow(inserted);
}

/** Voids the payment's GL entry and removes its tracking row — same undo pattern as deleting an
 * unpaid bill. */
export async function t5PaymentsDelete(id: number) {
  const db = getCurrentDb();
  const row = await db.selectFrom('t5Payments').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  await db.transaction().execute(async (trx) => {
    if (row.journalEntryId) await journalVoid(row.journalEntryId, false, trx, true);
    await trx.deleteFrom('t5Payments').where('id', '=', id).execute();
  });
  return { deleted: true } as const;
}

/** Generates printable T5 slips (one per shareholder with payments that year), lets the
 * accountant pick where to save it, then opens it. */
export async function shareholdersGenerateT5Slips(window: BrowserWindow, input: unknown) {
  const { taxYear } = input as { taxYear: number };
  const db = getCurrentDb();
  const [payments, shareholders, company] = await Promise.all([getAllT5Payments(db), getAllShareholders(db), companyGet()]);
  const slips = computeT5SlipsForYear(payments, shareholders, taxYear);
  if (slips.length === 0) throw new Error(`No shareholders with a payment dated in ${taxYear}.`);
  const bytes = await generateT5Pdf(company, slips, taxYear);
  return savePdfAndOpen(window, 'Save T5 Slips', `T5 Slips ${taxYear} - ${company.legalName.replace(/[\\/:*?"<>|]/g, '').trim()}.pdf`, bytes);
}

export async function shareholdersGetT5Preview(taxYear: number) {
  const db = getCurrentDb();
  const [payments, shareholders] = await Promise.all([getAllT5Payments(db), getAllShareholders(db)]);
  return computeT5SlipsForYear(payments, shareholders, taxYear);
}
