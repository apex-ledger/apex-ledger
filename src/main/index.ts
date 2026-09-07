import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { registerIpcHandlers } from './ipc/registerHandlers';
import { removeNativeMenu } from './menu';
import { setupAutoUpdater } from './updater';
import { autoBackupOnQuit, closeCompany, getCurrentConnection, openCompany } from './companyFile';
import { recordAllSignedOut } from './staffSessions';
import { checkAndNotifyDeadlines } from './deadlineAlerts';
import { createMirrorWindow, createPrimaryWindow } from './windows';
import { installClipboardSupport } from './clipboardSupport';
import { quickEntryCorrect, quickEntryCreate } from './ipc/quickEntry.handlers';
import { journalCreateAndPost } from './ipc/journal.handlers';
import { billsCreate, billsDelete } from './ipc/bills.handlers';
import { seedFictitiousCompany } from './seed/fictitiousCompany';
import { seedFinalTestCompany } from './seed/finalTestCompany';
import { runDataFlowCheck } from './seed/flowCheck';

const IS_TEST_BUILD = app.getName().toUpperCase().includes('TEST') || process.env.NORTH_LEDGER_TEST_BUILD === '1';
function privateArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}
const SMOKE_COMPANY_PATH = privateArg('north-ledger-smoke-company') ?? process.env.NORTH_LEDGER_SMOKE_COMPANY_PATH;
const SMOKE_RESULT_PATH = privateArg('north-ledger-smoke-result') ?? process.env.NORTH_LEDGER_SMOKE_RESULT_PATH;
const SMOKE_USER_DATA = privateArg('north-ledger-smoke-user-data') ?? process.env.NORTH_LEDGER_SMOKE_USER_DATA;
// Builds the fictitious test company through the real handlers and exits. Private, like the smoke
// launch: never reachable from a normal session.
const SEED_COMPANY_PATH = privateArg('apex-seed-company');
const SEED_RESULT_PATH = privateArg('apex-seed-result');
// Which company the seed builds: the bundled test company (default) or the final acceptance company.
const SEED_KIND = privateArg('apex-seed-kind') ?? 'fictitious';
// The end-to-end data-flow check (scripts/check-data-flow.mjs). Private, like the seed.
const FLOW_COMPANY_PATH = privateArg('apex-flow-company');
const FLOW_RESULT_PATH = privateArg('apex-flow-result');
if (SMOKE_COMPANY_PATH) {
  // The automated release gate runs in a non-interactive Windows sandbox with no usable GPU
  // process. This affects only the private smoke-test launch, never a normal user session.
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('no-sandbox');
}
if (SMOKE_USER_DATA) {
  app.setPath('userData', SMOKE_USER_DATA);
} else if (IS_TEST_BUILD) {
  app.setPath('userData', path.join(app.getPath('appData'), 'North Ledger Ultimate TEST'));
}

// Wire copy/paste (keyboard + right-click) into every window — primary, mirror, and any future
// one — since the app runs without a native menu that would otherwise provide those shortcuts.
app.on('web-contents-created', (_event, contents) => installClipboardSupport(contents));

let mainWindow: BrowserWindow | null = null;

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection', reason);
});

function createWindow(): void {
  mainWindow = createPrimaryWindow();

  mainWindow.on('close', () => console.log('[main] window "close" event fired'));
  mainWindow.on('closed', () => console.log('[main] window "closed" event fired'));

  registerIpcHandlers(mainWindow);
  removeNativeMenu();
  if (!IS_TEST_BUILD) setupAutoUpdater(mainWindow);
  else console.log('[main] TEST build: auto-updater disabled');

  // Checks every client's filing deadlines and fires a native notification once each comes within
  // 2 weeks — on launch, then once every 12 hours so a long-running session still catches a
  // deadline that enters the window without needing a restart. Captured in a local const since
  // `mainWindow` is a reassignable module-level `let` that TS can't narrow inside the interval closure.
  const win = mainWindow;
  if (SEED_COMPANY_PATH) {
    void runFictitiousCompanySeed(win);
  } else if (FLOW_COMPANY_PATH) {
    void runFlowCheck(win);
  } else if (!SMOKE_COMPANY_PATH) {
    checkAndNotifyDeadlines(win);
    setInterval(() => checkAndNotifyDeadlines(win), 12 * 60 * 60 * 1000);
  } else {
    void runPackagedSmokeTest(win);
  }
}

async function runFictitiousCompanySeed(window: BrowserWindow): Promise<void> {
  const finish = (payload: Record<string, unknown>, exitCode: number) => {
    if (SEED_RESULT_PATH) {
      fs.mkdirSync(path.dirname(SEED_RESULT_PATH), { recursive: true });
      fs.writeFileSync(SEED_RESULT_PATH, JSON.stringify(payload, null, 2), 'utf8');
    }
    app.exit(exitCode);
  };
  try {
    window.hide();
    const summary = SEED_KIND === 'final' ? await seedFinalTestCompany(SEED_COMPANY_PATH!) : await seedFictitiousCompany(SEED_COMPANY_PATH!);
    closeCompany();
    finish({ ok: true, ...summary }, 0);
  } catch (error) {
    try { closeCompany(); } catch { /* already closed */ }
    finish({ ok: false, error: error instanceof Error ? error.stack ?? error.message : String(error) }, 2);
  }
}

async function runFlowCheck(window: BrowserWindow): Promise<void> {
  window.hide();
  const report = await runDataFlowCheck(FLOW_COMPANY_PATH!);
  if (FLOW_RESULT_PATH) {
    fs.mkdirSync(path.dirname(FLOW_RESULT_PATH), { recursive: true });
    fs.writeFileSync(FLOW_RESULT_PATH, JSON.stringify(report, null, 2), 'utf8');
  }
  app.exit(report.ok && report.checks.every((c) => c.pass) ? 0 : 1);
}

async function runPackagedSmokeTest(window: BrowserWindow): Promise<void> {
  const finish = (payload: Record<string, unknown>, exitCode: number) => {
    if (SMOKE_RESULT_PATH) {
      fs.mkdirSync(path.dirname(SMOKE_RESULT_PATH), { recursive: true });
      fs.writeFileSync(SMOKE_RESULT_PATH, JSON.stringify(payload, null, 2), 'utf8');
    }
    app.exit(exitCode);
  };
  const timeout = setTimeout(() => finish({ ok: false, error: 'Packaged renderer did not become ready within 25 seconds.' }, 2), 25_000);
  try {
    window.hide();
    await new Promise<void>((resolve, reject) => {
      if (!window.webContents.isLoading()) return resolve();
      window.webContents.once('did-finish-load', () => resolve());
      window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`Renderer load failed (${code}): ${description}`)));
    });
    let rendererReady = false;
    for (let attempt = 0; attempt < 20 && !rendererReady; attempt += 1) {
      rendererReady = await window.webContents.executeJavaScript("Boolean(document.getElementById('root')?.childElementCount)");
      if (!rendererReady) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!rendererReady) throw new Error('Renderer loaded but the Apex Ledger interface did not mount.');
    const opened = await openCompany(window, SMOKE_COMPANY_PATH!);
    if (!opened) throw new Error('Smoke company did not open.');
    const connection = getCurrentConnection();
    try {
      const integrity = connection.sqlite.pragma('quick_check') as { quick_check: string }[];
      const schemaVersion = (connection.sqlite.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }).version;
      const accountCount = (connection.sqlite.prepare('SELECT COUNT(*) AS count FROM accounts').get() as { count: number }).count;
      const entryCount = (connection.sqlite.prepare('SELECT COUNT(*) AS count FROM journal_entries').get() as { count: number }).count;
      const balanceSql = "SELECT a.id, COALESCE(SUM(CASE WHEN je.status='posted' THEN jel.debit_cents-jel.credit_cents ELSE 0 END),0) AS balance FROM accounts a LEFT JOIN journal_entry_lines jel ON jel.account_id=a.id LEFT JOIN journal_entries je ON je.id=jel.journal_entry_id GROUP BY a.id ORDER BY a.id";
      const moneyAccountId = (connection.sqlite.prepare("SELECT id FROM accounts WHERE account_type='Asset' AND account_subtype='Bank' ORDER BY id LIMIT 1").get() as { id: number } | undefined)?.id;
      const categoryAccountId = (connection.sqlite.prepare("SELECT id FROM accounts WHERE account_type='Expense' ORDER BY id LIMIT 1").get() as { id: number } | undefined)?.id;
      if (!moneyAccountId || !categoryAccountId) throw new Error('Smoke company lacks a bank or expense account for correction testing.');
      const smokeEntry = await quickEntryCreate({ type: 'expense', entryDate: '2026-03-31', moneyAccountId, categoryAccountId, baseCents: 12345, taxCode: 'MealsHST', taxCents: 1605, description: 'Packaged atomic correction smoke test', periodFrom: null, periodTo: null, foreignCurrency: 'USD', foreignAmountCents: 10000, exchangeRate: 1.2345 }, connection.db);
      const balancesBefore = connection.sqlite.prepare(balanceSql).all() as { id: number; balance: number }[];
      const originalCategory = smokeEntry.lines.find((line) => line.accountId === categoryAccountId)!;
      const originalGst = smokeEntry.lines.find((line) => line.description === 'GST/HST');
      const categoryPosted = originalCategory.debitCents || originalCategory.creditCents;
      const reconstructedTaxCents = Math.max(0, categoryPosted - (originalCategory.baseCents ?? categoryPosted)) + (originalGst ? originalGst.debitCents || originalGst.creditCents : 0);
      const correction = await quickEntryCorrect({ originalEntryId: smokeEntry.id, entryDate: smokeEntry.entryDate, baseCents: originalCategory.baseCents, taxCents: reconstructedTaxCents }, connection.db);
      const balancesAfter = connection.sqlite.prepare(balanceSql).all() as { id: number; balance: number }[];
      const correctedCategory = correction.corrected.lines.find((line) => line.accountId === categoryAccountId);
      const atomicCorrection = correction.original.status === 'void' && correction.corrected.status === 'posted' && reconstructedTaxCents === 1605 && correctedCategory?.foreignCurrency === 'USD' && correctedCategory.foreignAmountCents === 10000 && correctedCategory.exchangeRate === 1.2345 && JSON.stringify(balancesBefore) === JSON.stringify(balancesAfter);
      const entriesBeforeRejectedPost = (connection.sqlite.prepare('SELECT COUNT(*) AS count FROM journal_entries').get() as { count: number }).count;
      connection.sqlite.prepare("INSERT INTO fiscal_periods (period_start, period_end, label, is_locked, locked_at) VALUES ('2099-01-01', '2099-12-31', 'Atomic rollback smoke period', 1, CURRENT_TIMESTAMP)").run();
      let rejectedLockedPost = false;
      try {
        await journalCreateAndPost({ entryDate: '2099-06-30', memo: 'Must roll back', lines: [{ accountId: categoryAccountId, debitCents: 100, creditCents: 0 }, { accountId: moneyAccountId, debitCents: 0, creditCents: 100 }] }, connection.db);
      } catch {
        rejectedLockedPost = true;
      } finally {
        connection.sqlite.prepare("DELETE FROM fiscal_periods WHERE label = 'Atomic rollback smoke period'").run();
      }
      const entriesAfterRejectedPost = (connection.sqlite.prepare('SELECT COUNT(*) AS count FROM journal_entries').get() as { count: number }).count;
      const atomicCreateAndPost = rejectedLockedPost && entriesAfterRejectedPost === entriesBeforeRejectedPost;
      const vendorId = (connection.sqlite.prepare('SELECT id FROM vendors ORDER BY id LIMIT 1').get() as { id: number } | undefined)?.id;
      if (!vendorId) throw new Error('Smoke company lacks a vendor for duplicate vendor-invoice testing.');
      const billsBeforeDuplicateTest = (connection.sqlite.prepare('SELECT COUNT(*) AS count FROM bills').get() as { count: number }).count;
      const entriesBeforeDuplicateBill = (connection.sqlite.prepare('SELECT COUNT(*) AS count FROM journal_entries').get() as { count: number }).count;
      await billsCreate({ vendorId, billNumber: 'SMOKE-SUPPLIER-100', billDate: '2026-03-31', dueDate: '2026-04-30', categoryAccountId, baseCents: 100, taxCode: null, taxCents: 0, memo: 'Vendor invoice duplicate smoke test' });
      let rejectedDuplicateVendorInvoice = false;
      try {
        await billsCreate({ vendorId, billNumber: 'smoke-vendor-100', billDate: '2026-03-31', dueDate: '2026-04-30', categoryAccountId, baseCents: 100, taxCode: null, taxCents: 0, memo: 'Must not post twice' });
      } catch {
        rejectedDuplicateVendorInvoice = true;
      }
      const billsAfterDuplicateTest = (connection.sqlite.prepare('SELECT COUNT(*) AS count FROM bills').get() as { count: number }).count;
      const entriesAfterDuplicateBill = (connection.sqlite.prepare('SELECT COUNT(*) AS count FROM journal_entries').get() as { count: number }).count;
      const vendorInvoiceUniqueness = rejectedDuplicateVendorInvoice && billsAfterDuplicateTest === billsBeforeDuplicateTest + 1 && entriesAfterDuplicateBill === entriesBeforeDuplicateBill + 1;
      const rollbackBill = await billsCreate({ vendorId, billNumber: 'SMOKE-DELETE-ROLLBACK', billDate: '2026-03-31', dueDate: '2026-04-30', categoryAccountId, baseCents: 200, taxCode: null, taxCents: 0, memo: 'Atomic document reversal smoke test' });
      connection.sqlite.exec("CREATE TEMP TRIGGER reject_smoke_bill_delete BEFORE DELETE ON bills WHEN OLD.bill_number = 'SMOKE-DELETE-ROLLBACK' BEGIN SELECT RAISE(ABORT, 'deliberate delete failure'); END");
      let rejectedDocumentDelete = false;
      try { await billsDelete(rollbackBill.id); } catch { rejectedDocumentDelete = true; }
      connection.sqlite.exec('DROP TRIGGER reject_smoke_bill_delete');
      const rollbackBillStillExists = Boolean(connection.sqlite.prepare('SELECT id FROM bills WHERE id = ?').get(rollbackBill.id));
      const rollbackJournalStatus = (connection.sqlite.prepare('SELECT status FROM journal_entries WHERE id = ?').get(rollbackBill.billJournalEntryId!) as { status: string } | undefined)?.status;
      const atomicDocumentReversal = rejectedDocumentDelete && rollbackBillStillExists && rollbackJournalStatus === 'posted';
      const corruptPath = path.join(path.dirname(SMOKE_COMPANY_PATH!), 'Deliberately Corrupt.company');
      fs.writeFileSync(corruptPath, 'not a SQLite company file', 'utf8');
      let rejectedCorruptSwitch = false;
      try { await openCompany(window, corruptPath); } catch { rejectedCorruptSwitch = true; }
      const safeFailedSwitch = rejectedCorruptSwitch && getCurrentConnection().filePath === SMOKE_COMPANY_PATH && (getCurrentConnection().sqlite.pragma('quick_check') as { quick_check: string }[])[0]?.quick_check === 'ok';
      clearTimeout(timeout);
      finish({ ok: integrity[0]?.quick_check === 'ok' && atomicCorrection && atomicCreateAndPost && vendorInvoiceUniqueness && atomicDocumentReversal && safeFailedSwitch, rendererReady, schemaVersion, accountCount, entryCount, nativeDriver: 'better-sqlite3', atomicCorrection, atomicCreateAndPost, vendorInvoiceUniqueness, atomicDocumentReversal, safeFailedSwitch }, integrity[0]?.quick_check === 'ok' && atomicCorrection && atomicCreateAndPost && vendorInvoiceUniqueness && atomicDocumentReversal && safeFailedSwitch ? 0 : 2);
    } finally {
      closeCompany();
    }
  } catch (error) {
    clearTimeout(timeout);
    finish({ ok: false, error: error instanceof Error ? error.message : String(error) }, 2);
  }
}

ipcMain.handle('window:openMirror', () => {
  createMirrorWindow();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  console.log('[main] window-all-closed event fired');
  if (process.platform !== 'darwin') app.quit();
});

let quitBackupDone = false;
app.on('before-quit', (event) => {
  console.log('[main] before-quit event fired');
  if (quitBackupDone) return;
  event.preventDefault();
  recordAllSignedOut('app_closed')
    .then(() => autoBackupOnQuit())
    .catch((err) => console.error('[main] quit backup failed', err))
    .finally(() => {
      quitBackupDone = true;
      app.quit();
    });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
