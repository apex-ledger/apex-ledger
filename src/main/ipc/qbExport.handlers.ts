import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import { writeIif } from '@shared/domain/importing/writeIif';
import { getCurrentDb, getCurrentFilePath } from '../companyFile';
import { getAllAccounts, getAllCustomers, getAllJournalEntriesWithLines, getAllVendors } from '../db/queries';

/** Lets a client take their whole accounting record — Chart of Accounts, general ledger,
 * customers, vendors — with them if they ever leave this software, in a format (QuickBooks
 * Desktop's IIF) any bookkeeper can import elsewhere. Drafts and voided entries are left out
 * since they aren't real transactions. */
export async function qbExportIif(window: BrowserWindow) {
  const db = getCurrentDb();
  const [accounts, allEntries, customers, vendors] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    getAllCustomers(db),
    getAllVendors(db),
  ]);
  const postedJournalEntries = allEntries.filter((e) => e.status === 'posted');

  const iif = writeIif({ accounts, postedJournalEntries, customers, vendors });

  const filePath = getCurrentFilePath();
  const baseName = filePath ? filePath.split(/[/\\]/).pop()?.replace(/\.company$/, '') ?? 'export' : 'export';

  const saveResult = await dialog.showSaveDialog(window, {
    title: 'Export to QuickBooks (IIF)',
    defaultPath: `${baseName}-quickbooks-export.iif`,
    filters: [{ name: 'QuickBooks IIF', extensions: ['iif'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return { saved: false as const };

  fs.writeFileSync(saveResult.filePath, iif, 'utf-8');
  return { saved: true as const, filePath: saveResult.filePath, accountCount: accounts.length, transactionCount: postedJournalEntries.length };
}
