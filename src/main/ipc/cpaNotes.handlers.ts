import type { BrowserWindow } from 'electron';
import { cpaReviewPackageSchema, saveCpaNoteSchema } from '@shared/validation/schemas';
import { balanceSheet } from '@shared/domain/ledger/balanceSheet';
import { incomeStatement } from '@shared/domain/ledger/incomeStatement';
import { trialBalance } from '@shared/domain/ledger/trialBalance';
import { getCurrentDb } from '../companyFile';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';
import { mapCpaNoteRow } from '../db/mappers';
import { companyGet } from './company.handlers';
import { generateCpaReviewPdf } from '../forms/generateCpaReviewPdf';
import { safeFileNamePart, savePdfAndOpen } from '../forms/savePdfAndOpen';

export async function cpaNotesList() {
  const db = getCurrentDb();
  const rows = await db.selectFrom('cpaNotes').selectAll().orderBy('noteDate', 'desc').orderBy('id', 'desc').execute();
  return rows.map(mapCpaNoteRow);
}

/** Insert when id is null, update otherwise — the form is the same either way. */
export async function cpaNotesSave(input: unknown) {
  const payload = saveCpaNoteSchema.parse(input);
  const db = getCurrentDb();

  const fields = {
    noteDate: payload.noteDate,
    subject: payload.subject,
    body: payload.body,
    accountId: payload.accountId,
    journalEntryId: payload.journalEntryId,
    cpaResponse: payload.cpaResponse,
  };

  if (payload.id !== null) {
    await db.updateTable('cpaNotes').set(fields).where('id', '=', payload.id).execute();
    const updated = await db.selectFrom('cpaNotes').selectAll().where('id', '=', payload.id).executeTakeFirstOrThrow();
    return mapCpaNoteRow(updated);
  }

  const inserted = await db.insertInto('cpaNotes').values({ ...fields, status: 'open', resolvedAt: null }).returningAll().executeTakeFirstOrThrow();
  return mapCpaNoteRow(inserted);
}

/** Flips a note between open and resolved — resolving stamps the date so the reader view can show
 * when it was dealt with. */
export async function cpaNotesSetStatus(input: unknown) {
  const { id, status } = input as { id: number; status: 'open' | 'resolved' };
  if (status !== 'open' && status !== 'resolved') throw new Error('A note is either open or resolved.');
  const db = getCurrentDb();
  await db
    .updateTable('cpaNotes')
    .set({ status, resolvedAt: status === 'resolved' ? new Date().toISOString() : null })
    .where('id', '=', id)
    .execute();
  const row = await db.selectFrom('cpaNotes').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return mapCpaNoteRow(row);
}

export async function cpaNotesDelete(id: number) {
  const db = getCurrentDb();
  await db.deleteFrom('cpaNotes').where('id', '=', id).execute();
  return { deleted: true as const };
}

/**
 * Builds the review package PDF and saves it wherever the user chooses. Statements are computed
 * here from the same domain functions the on-screen reports use, so the CPA can't be handed numbers
 * that differ from what the app displays.
 */
export async function cpaNotesGenerateReviewPackage(window: BrowserWindow, input: unknown) {
  const payload = cpaReviewPackageSchema.parse(input);
  if (payload.periodEnd < payload.periodStart) throw new Error('The review period ends before it starts.');

  const db = getCurrentDb();
  const [company, accounts, entries] = await Promise.all([companyGet(), getAllAccounts(db), getAllJournalEntriesWithLines(db)]);

  const allNotes = await cpaNotesList();
  const notes = allNotes
    .filter((n) => n.noteDate >= payload.periodStart && n.noteDate <= payload.periodEnd)
    .filter((n) => (payload.includeOpenNotesOnly ? n.status === 'open' : true))
    // Oldest first in the package — a reviewer reads a note list chronologically.
    .sort((a, b) => a.noteDate.localeCompare(b.noteDate));

  const bytes = await generateCpaReviewPdf({
    company,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    coverMessage: payload.coverMessage,
    notes,
    balanceSheet: payload.includeBalanceSheet ? balanceSheet(accounts, entries, payload.periodEnd) : null,
    incomeStatement: payload.includeIncomeStatement ? incomeStatement(accounts, entries, payload.periodStart, payload.periodEnd) : null,
    trialBalance: payload.includeTrialBalance ? trialBalance(accounts, entries, payload.periodEnd) : null,
  });

  const fileName = `CPA-Review-${safeFileNamePart(company.legalName)}-${payload.periodEnd}.pdf`;
  return savePdfAndOpen(window, 'Save CPA Review Package', fileName, bytes);
}
