import type { BrowserWindow } from 'electron';
import { dialog, shell } from 'electron';
import { addWorkpaperAttachmentSchema, setWorkpaperNoteSchema, setWorkpaperStatusSchema, workpaperSheetQuerySchema } from '@shared/validation/schemas';
import {
  buildWorkpaperTrialBalance,
  groupWorkpaperRows,
  priorPeriodEndFor,
  summarizeReviewProgress,
  type WorkpaperReviewStatus,
  type WorkpaperStatements,
  type WorkpaperTrialBalance,
} from '@shared/domain/ledger/workpapers';
import path from 'node:path';
import { getCurrentDb } from '../companyFile';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';

export interface WorkpaperAttachmentInfo {
  id: number;
  fileName: string;
  filePath: string;
}

export interface WorkpaperAccountState {
  accountId: number;
  status: WorkpaperReviewStatus;
  note: string | null;
  reviewedAt: string | null;
  attachments: WorkpaperAttachmentInfo[];
}

export interface WorkpaperSheet {
  trialBalance: WorkpaperTrialBalance;
  /** The same rows grouped into balance-sheet and P&L sections with totals. */
  statements: WorkpaperStatements;
  /** Keyed by accountId for easy lookup while rendering rows. */
  states: WorkpaperAccountState[];
  progress: { reviewed: number; queries: number; pending: number; total: number };
}

async function loadStates(periodEnd: string): Promise<Map<number, WorkpaperAccountState>> {
  const db = getCurrentDb();
  const rows = await db.selectFrom('workpaperAccounts').selectAll().where('periodEnd', '=', periodEnd).execute();
  const ids = rows.map((r) => r.id);
  const attachments = ids.length
    ? await db.selectFrom('workpaperAttachments').selectAll().where('workpaperAccountId', 'in', ids).orderBy('addedAt').execute()
    : [];

  return new Map(
    rows.map((row) => [
      row.accountId,
      {
        accountId: row.accountId,
        status: row.status as WorkpaperReviewStatus,
        note: row.note,
        reviewedAt: row.reviewedAt,
        attachments: attachments
          .filter((a) => a.workpaperAccountId === row.id)
          .map((a) => ({ id: a.id, fileName: a.fileName, filePath: a.filePath })),
      },
    ]),
  );
}

/** Upserts the row for one account/period and returns its id — every mutation needs the row to
 * exist first, and a sheet only materializes rows for accounts actually worked on. */
async function ensureStateRow(periodEnd: string, accountId: number): Promise<number> {
  const db = getCurrentDb();
  const existing = await db.selectFrom('workpaperAccounts').select('id').where('periodEnd', '=', periodEnd).where('accountId', '=', accountId).executeTakeFirst();
  if (existing) return existing.id;
  const inserted = await db.insertInto('workpaperAccounts').values({ periodEnd, accountId, status: 'pending', note: null, reviewedAt: null }).returningAll().executeTakeFirstOrThrow();
  return inserted.id;
}

export async function workpapersSheet(input: unknown) {
  const { periodEnd, priorPeriodEnd } = workpaperSheetQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);

  const trialBalance = buildWorkpaperTrialBalance(accounts, entries, periodEnd, priorPeriodEnd ?? priorPeriodEndFor(periodEnd));
  const stateMap = await loadStates(periodEnd);

  // Every row on the sheet gets a state, defaulting to pending for accounts not yet touched — the
  // progress count has to be out of the whole sheet, not just the rows someone has clicked.
  const states: WorkpaperAccountState[] = trialBalance.rows.map(
    (row) => stateMap.get(row.account.id) ?? { accountId: row.account.id, status: 'pending', note: null, reviewedAt: null, attachments: [] },
  );

  const sheet: WorkpaperSheet = {
    trialBalance,
    statements: groupWorkpaperRows(trialBalance),
    states,
    progress: summarizeReviewProgress(states.map((s) => s.status)),
  };
  return sheet;
}

export async function workpapersSetStatus(input: unknown) {
  const { periodEnd, accountId, status } = setWorkpaperStatusSchema.parse(input);
  const db = getCurrentDb();
  const id = await ensureStateRow(periodEnd, accountId);
  await db
    .updateTable('workpaperAccounts')
    .set({ status, reviewedAt: status === 'reviewed' ? new Date().toISOString() : null })
    .where('id', '=', id)
    .execute();
  return { ok: true as const };
}

export async function workpapersSetNote(input: unknown) {
  const { periodEnd, accountId, note } = setWorkpaperNoteSchema.parse(input);
  const db = getCurrentDb();
  const id = await ensureStateRow(periodEnd, accountId);
  await db.updateTable('workpaperAccounts').set({ note: note && note.length > 0 ? note : null }).where('id', '=', id).execute();
  return { ok: true as const };
}

/** Opens a file picker and records the chosen files against this account's review. The files are
 * referenced in place rather than copied, so moving or deleting them later breaks the link — the
 * same trade-off bills already make for receipt attachments. */
export async function workpapersAddAttachment(window: BrowserWindow, input: unknown) {
  const { periodEnd, accountId } = addWorkpaperAttachmentSchema.parse(input);
  const result = await dialog.showOpenDialog(window, {
    title: 'Attach supporting documents',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'csv', 'xlsx', 'docx', 'txt'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { added: 0 };

  const db = getCurrentDb();
  const id = await ensureStateRow(periodEnd, accountId);
  for (const filePath of result.filePaths) {
    await db.insertInto('workpaperAttachments').values({ workpaperAccountId: id, filePath, fileName: path.basename(filePath) }).execute();
  }
  return { added: result.filePaths.length };
}

export async function workpapersRemoveAttachment(id: number) {
  const db = getCurrentDb();
  await db.deleteFrom('workpaperAttachments').where('id', '=', id).execute();
  return { deleted: true as const };
}

/** Opens an attachment in whatever application the OS associates with it. */
export async function workpapersOpenAttachment(id: number) {
  const db = getCurrentDb();
  const row = await db.selectFrom('workpaperAttachments').selectAll().where('id', '=', id).executeTakeFirst();
  if (!row) throw new Error(`Attachment ${id} not found.`);
  const error = await shell.openPath(row.filePath);
  if (error) throw new Error(`Could not open ${row.fileName} — it may have been moved or deleted.`);
  return { opened: true as const };
}
