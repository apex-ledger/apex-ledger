import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { writeIif } from '@shared/domain/importing/writeIif';
import { writeXeroAccountsCsv, writeXeroContactsCsv, writeXeroManualJournalsCsv, xeroReadme } from '@shared/domain/importing/writeXero';
import { sageReadme, writeSage50GeneralJournal, writeSageAccountsCsv, writeSageContactsCsv } from '@shared/domain/importing/writeSage';
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

async function companyRecords() {
  const db = getCurrentDb();
  const [accounts, allEntries, customers, vendors] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db), getAllCustomers(db), getAllVendors(db)]);
  const filePath = getCurrentFilePath();
  const baseName = filePath ? filePath.split(/[/\\]/).pop()?.replace(/\.company$/, '') ?? 'export' : 'export';
  return { accounts, postedJournalEntries: allEntries.filter((e) => e.status === 'posted'), customers, vendors, baseName };
}

async function saveZip(window: BrowserWindow, title: string, fileName: string, files: Record<string, string>) {
  const saveResult = await dialog.showSaveDialog(window, { title, defaultPath: fileName, filters: [{ name: 'Zip archive', extensions: ['zip'] }] });
  if (saveResult.canceled || !saveResult.filePath) return null;
  const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 6 });
  fs.writeFileSync(saveResult.filePath, zipped);
  return saveResult.filePath;
}

/** Xero's import templates, zipped: chart of accounts, manual journals, customers and suppliers, plus a README with the import order. */
export async function exportToXero(window: BrowserWindow) {
  const r = await companyRecords();
  const counts = { accounts: r.accounts.filter((a) => a.isActive).length, journals: r.postedJournalEntries.length, customers: r.customers.filter((x) => x.isActive).length, vendors: r.vendors.filter((x) => x.isActive).length };
  const filePath = await saveZip(window, 'Export to Xero', `${r.baseName}-xero-export.zip`, {
    'README.txt': xeroReadme(r.baseName, counts),
    'accounts.csv': writeXeroAccountsCsv(r.accounts),
    'manual-journals.csv': writeXeroManualJournalsCsv(r.accounts, r.postedJournalEntries),
    'customers.csv': writeXeroContactsCsv(r.customers),
    'suppliers.csv': writeXeroContactsCsv(r.vendors),
  });
  if (!filePath) return { saved: false as const };
  return { saved: true as const, filePath, accountCount: counts.accounts, transactionCount: counts.journals };
}

/** Sage 50 (Canada) general journal text plus account and contact CSVs, zipped with a README. */
export async function exportToSage(window: BrowserWindow) {
  const r = await companyRecords();
  const counts = { accounts: r.accounts.filter((a) => a.isActive).length, journals: r.postedJournalEntries.length, customers: r.customers.filter((x) => x.isActive).length, vendors: r.vendors.filter((x) => x.isActive).length };
  const filePath = await saveZip(window, 'Export to Sage', `${r.baseName}-sage-export.zip`, {
    'README.txt': sageReadme(r.baseName, counts),
    'general-journal.txt': writeSage50GeneralJournal(r.accounts, r.postedJournalEntries),
    'accounts.csv': writeSageAccountsCsv(r.accounts),
    'customers.csv': writeSageContactsCsv(r.customers, 'Customer'),
    'vendors.csv': writeSageContactsCsv(r.vendors, 'Vendor'),
  });
  if (!filePath) return { saved: false as const };
  return { saved: true as const, filePath, accountCount: counts.accounts, transactionCount: counts.journals };
}
