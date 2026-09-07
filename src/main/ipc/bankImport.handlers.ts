import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import { extractBankStatementTable, type BankStatementExtraction } from '../pdf/extractBankStatementTable';
import { stripLeadingHeaderLine } from '../pdf/bankStatementTableReconstruction';
import { addBankImportExclusionSchema, saveBankImportRowProgressSchema, clearBankImportRowProgressSchema } from '@shared/validation/schemas';
import { getCurrentDb } from '../companyFile';
import { getBankImportExclusions, getBankImportRowProgress } from '../db/queries';
import { mapBankImportExclusionRow } from '../db/mappers';

export async function bankImportExclusionsList(accountId: number) {
  const db = getCurrentDb();
  return getBankImportExclusions(db, accountId);
}

export async function bankImportRowProgressList(accountId: number) {
  const db = getCurrentDb();
  return getBankImportRowProgress(db, accountId);
}

/** Upserts one row of in-progress categorization per item — called from BankImportPage's "Save"
 * action (the same Save & Exit prompt every other unsaved-changes form uses) so a whole review
 * session's category/tax/vendor/customer/include choices survive the app actually closing, not
 * just navigating to another page (which the in-memory bankImportSessionStore already covered). */
export async function bankImportRowProgressSave(input: unknown) {
  const rows = saveBankImportRowProgressSchema.parse(input);
  const db = getCurrentDb();
  for (const row of rows) {
    await db
      .insertInto('bankImportRowProgress')
      .values({
        accountId: row.accountId,
        transactionDate: row.transactionDate,
        description: row.description,
        amountCents: row.amountCents,
        categoryAccountId: row.categoryAccountId,
        taxCode: row.taxCode,
        manualHstCents: row.manualHstCents,
        vendorId: row.vendorId,
        customerId: row.customerId,
        include: row.include ? 1 : 0,
      })
      .onConflict((oc) =>
        oc.columns(['accountId', 'transactionDate', 'description', 'amountCents']).doUpdateSet({
          categoryAccountId: row.categoryAccountId,
          taxCode: row.taxCode,
          manualHstCents: row.manualHstCents,
          vendorId: row.vendorId,
          customerId: row.customerId,
          include: row.include ? 1 : 0,
          updatedAt: new Date().toISOString(),
        }),
      )
      .execute();
  }
  return { saved: true as const, count: rows.length };
}

/** Clears saved progress for exactly the rows that just left the review table (imported, or
 * deleted from it) — called after a successful import so re-opening this account later doesn't
 * keep re-offering categorization for transactions that are already posted. */
export async function bankImportRowProgressClear(input: unknown) {
  const payload = clearBankImportRowProgressSchema.parse(input);
  const db = getCurrentDb();
  for (const row of payload.rows) {
    await db
      .deleteFrom('bankImportRowProgress')
      .where('accountId', '=', payload.accountId)
      .where('transactionDate', '=', row.transactionDate)
      .where('description', '=', row.description)
      .where('amountCents', '=', row.amountCents)
      .execute();
  }
  return { cleared: true as const };
}

/** Remembers one statement line (exact date + description + amount, within one account) so it's
 * pre-excluded next time an overlapping statement range gets imported — for recurring noise the
 * reviewer never wants to see again (a known personal transaction, a recurring fee reversal). An
 * explicit "never show again" action, not automatic on every plain exclude, since an ordinary
 * one-off exclude (e.g. a duplicate of a row already imported) shouldn't quietly turn into a
 * standing rule that could hide a genuinely different future transaction sharing the same date,
 * description, and amount. */
export async function bankImportExclusionsAdd(input: unknown) {
  const payload = addBankImportExclusionSchema.parse(input);
  const db = getCurrentDb();
  const inserted = await db
    .insertInto('bankImportExclusions')
    .values(payload)
    .onConflict((oc) => oc.columns(['accountId', 'transactionDate', 'description', 'amountCents']).doNothing())
    .returningAll()
    .executeTakeFirst();
  if (inserted) return mapBankImportExclusionRow(inserted);
  const existing = await db
    .selectFrom('bankImportExclusions')
    .selectAll()
    .where('accountId', '=', payload.accountId)
    .where('transactionDate', '=', payload.transactionDate)
    .where('description', '=', payload.description)
    .where('amountCents', '=', payload.amountCents)
    .executeTakeFirstOrThrow();
  return mapBankImportExclusionRow(existing);
}

export async function bankImportExclusionsRemove(id: number) {
  const db = getCurrentDb();
  await db.deleteFrom('bankImportExclusions').where('id', '=', id).execute();
  return { deleted: true } as const;
}

export interface ReadCsvFileResult {
  loaded: boolean;
  fileName?: string;
  content?: string;
}

/** Opens a native file picker and reads the chosen CSV/TSV as text — parsing happens in the renderer. */
export async function bankImportReadCsvFile(window: BrowserWindow): Promise<ReadCsvFileResult> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Import Bank Transactions',
    properties: ['openFile'],
    filters: [
      { name: 'Bank download (CSV, OFX, QFX, QBO)', extensions: ['csv', 'txt', 'ofx', 'qfx', 'qbo'] },
      { name: 'CSV / Text', extensions: ['csv', 'txt'] },
      { name: 'OFX / QFX / QBO', extensions: ['ofx', 'qfx', 'qbo'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return { loaded: false };

  const filePath = result.filePaths[0];
  // Excel's "CSV UTF-8" export prepends a BOM, which otherwise breaks date parsing on row one.
  const BOM = String.fromCharCode(0xfeff);
  const content = fs.readFileSync(filePath, 'utf-8').replace(new RegExp(`^${BOM}`), '');
  return { loaded: true, fileName: filePath.split(/[\\/]/).pop() ?? filePath, content };
}

export interface ReadPdfBankStatementResult extends ReadCsvFileResult {
  error?: string;
  openingBalanceCents?: number | null;
  closingBalanceCents?: number | null;
}

interface PerFileResult {
  fileName: string;
  extraction: BankStatementExtraction | null;
  /** Set only when extraction genuinely threw (a real bug, a corrupt file) — kept distinct from
   * "extraction returned null" (that PDF parsed fine but has no text layer, an expected, common
   * case for a scanned statement) so the two are never reported to the user as the same thing. See
   * extractBankStatementTable's own doc comment for why the distinction matters. */
  thrownError: string | null;
}

/** Opens a native file picker for one or more PDF bank/credit-card statements — select all 12
 * months of a year at once and they're merged into a single batch — reconstructs each one's table
 * structure from its text layer's character positions (see extractBankStatementTable.ts), and
 * hands back the combined tab-delimited text plus the batch's Opening (from the earliest file) and
 * Closing (from the latest file) balance, for a reconciliation check before posting. Same content
 * shape bankImportReadCsvFile returns, so it flows into the identical column-mapping/review screen
 * the CSV path already uses; the review table's own chronological sort and duplicate-detection
 * then handle multiple statements exactly like one long one, including catching the day or two of
 * overlap consecutive monthly statements commonly repeat. A file with no usable text layer (a
 * scanned/photographed statement) is skipped with a note rather than failing the whole batch — the
 * rest still import normally. A file that genuinely fails to process (a corrupt PDF, an unexpected
 * pdfjs-dist error) is also skipped rather than failing the batch, but reports its real error
 * message distinctly from "no text layer" — the two look identical to the reviewer otherwise,
 * which makes a real bug indistinguishable from an expected scanned-statement case.
 *
 * Multiple selected files are sorted by filename before processing — real bank statement exports
 * are named with an embedded date (e.g. "Chequing Statement-0542 2025-04-01.pdf"), so alphabetical
 * order already matches chronological order for the common case; this only affects which file's
 * Opening/Closing balance is treated as "first"/"last", not the transaction order itself (every
 * row is independently date-sorted in the renderer regardless of which file it came from). */
export async function bankImportReadPdfFile(window: BrowserWindow): Promise<ReadPdfBankStatementResult> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Import Bank Statement (PDF) — select one file, or several to import a full year at once',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { loaded: false };

  const sortedPaths = [...result.filePaths].sort();
  const perFile: PerFileResult[] = await Promise.all(
    sortedPaths.map(async (filePath) => {
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
      try {
        return { fileName, extraction: await extractBankStatementTable(filePath), thrownError: null };
      } catch (err) {
        console.error('[bankImportReadPdfFile]', fileName, err instanceof Error ? err.stack ?? err.message : err);
        return { fileName, extraction: null, thrownError: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  const readable = perFile.filter((f): f is PerFileResult & { extraction: BankStatementExtraction } => f.extraction !== null);
  const failed = perFile.filter((f) => f.extraction === null && f.thrownError !== null);
  const noTextLayer = perFile.filter((f) => f.extraction === null && f.thrownError === null);

  if (readable.length === 0) {
    if (failed.length > 0) {
      // At least one file hit a genuine error rather than "just no text layer" — surface that
      // real message instead of the generic scanned-statement wording, since that wording would
      // actively mislead about what's actually wrong.
      return { loaded: false, error: failed.map((f) => `${f.fileName}: ${f.thrownError}`).join('; ') };
    }
    return {
      loaded: false,
      error:
        (sortedPaths.length === 1
          ? 'This PDF has no readable text layer — it looks like a scanned or photographed statement, which isn\'t supported yet.'
          : `None of the ${sortedPaths.length} selected PDFs have a readable text layer — they look like scanned or photographed statements, which isn't supported yet.`) +
        ' Try downloading a text-based statement from your bank\'s website instead (usually available alongside the PDF), or use CSV.',
    };
  }

  // Only the first file keeps its own header line — every later file's text also starts with its
  // own (correct, for it alone) header line, which would otherwise plant a bogus, unparseable
  // "data row" in the middle of the combined table.
  const content = readable
    .map((f, i) => (i === 0 ? f.extraction.text : stripLeadingHeaderLine(f.extraction.text.split('\n')).join('\n')))
    .join('\n');
  const fileName = readable.length === 1 ? readable[0].fileName : `${readable.length} PDF statements`;
  const noteParts: string[] = [];
  if (noTextLayer.length > 0) {
    noteParts.push(`Skipped ${noTextLayer.length} file(s) with no readable text layer (scanned/photographed): ${noTextLayer.map((f) => f.fileName).join(', ')}.`);
  }
  if (failed.length > 0) {
    noteParts.push(`Skipped ${failed.length} file(s) that failed to process: ${failed.map((f) => `${f.fileName} (${f.thrownError})`).join('; ')}.`);
  }
  // Chains each statement's own Closing balance to the next one's own Opening balance — the whole-
  // batch reconciliation check (first file's Opening vs last file's Closing vs the sum of every
  // parsed row) can still balance out even with a whole month missing or two files out of order,
  // if unrelated errors happen to cancel out. Checking every adjacent pair catches that: a real
  // gap always shows up as a mismatch right at the seam between the two statements involved, naming
  // exactly which two files and by how much, rather than one unexplained batch-wide discrepancy.
  for (let i = 0; i < readable.length - 1; i++) {
    const a = readable[i];
    const b = readable[i + 1];
    if (a.extraction.closingBalanceCents === null || b.extraction.openingBalanceCents === null) continue;
    if (a.extraction.closingBalanceCents !== b.extraction.openingBalanceCents) {
      const diffCents = b.extraction.openingBalanceCents - a.extraction.closingBalanceCents;
      const diffDollars = (Math.abs(diffCents) / 100).toFixed(2);
      noteParts.push(
        `"${a.fileName}" closes at a different balance than "${b.fileName}" opens at (off by $${diffDollars}) — check for a missing statement in between, or files selected out of order.`,
      );
    }
  }
  const error = noteParts.length > 0 ? noteParts.join(' ') : undefined;
  // First file's Opening, last file's Closing — meaningful for the whole batch when files are in
  // chronological order (see the filename-sort note above); either figure the reviewer can still
  // correct by hand if a particular statement's wording wasn't recognized.
  const openingBalanceCents = readable[0].extraction.openingBalanceCents;
  const closingBalanceCents = readable[readable.length - 1].extraction.closingBalanceCents;
  return { loaded: true, fileName, content, error, openingBalanceCents, closingBalanceCents };
}
