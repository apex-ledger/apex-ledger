import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = fs.readFileSync('src/main/db/migrations/0062_hst_filing_period_lock.sql', 'utf8');
const handler = fs.readFileSync('src/main/ipc/hstFilings.handlers.ts', 'utf8');
const periodHandler = fs.readFileSync('src/main/ipc/fiscalPeriods.handlers.ts', 'utf8');
const filingDomain = fs.readFileSync('src/shared/domain/ledger/hstFiling.ts', 'utf8');
const filingPage = fs.readFileSync('src/renderer/features/hst-centre/HstFilingPage.tsx', 'utf8');
const quickEntryPage = fs.readFileSync('src/renderer/features/quick-entry/QuickEntryPage.tsx', 'utf8');
const postingGate = fs.readFileSync('src/shared/domain/ledger/postJournalEntry.ts', 'utf8');
const failures = [];
if (!migration.includes('ALTER TABLE hst_filings ADD COLUMN fiscal_period_id')) failures.push('HST filing is not linked to its lock.');
if (!migration.includes('FROM hst_filings')) failures.push('Existing filed returns do not receive backfilled locks.');
if (!handler.includes("insertInto('fiscalPeriods')")) failures.push('Filing a new return does not create a period lock.');
if (!handler.includes('fiscalPeriodId: lockedPeriod.id')) failures.push('Filing-owned lock id is not stored.');
if (!handler.includes("deleteFrom('fiscalPeriods').where('id', '=', filing.fiscalPeriodId)")) failures.push('Voiding a return does not remove its own lock.');
if (handler.indexOf("deleteFrom('fiscalPeriods')") > handler.indexOf('journalVoid(filing.journalEntryId') && handler.indexOf('journalVoid(filing.journalEntryId') >= 0) failures.push('Return void tries to void inside its own locked period before removing the filing-owned lock.');
if (!periodHandler.includes("where('fiscalPeriodId', '=', id)") || !periodHandler.includes('Void that return from GST/HST Centre')) failures.push('Settings can unlock a filing-owned period while its return still exists.');
if (!handler.includes('hstFilingTimingError(payload.periodEnd, payload.filingDate')) failures.push('The main process still permits an incomplete/future GST/HST period to be filed.');
if (!filingDomain.includes('latestCompletedCalendarQuarter') || !filingPage.includes('latestCompletedCalendarQuarter(todayIso())')) failures.push('Sales Tax does not default to the latest fully completed quarter.');
if (!filingPage.includes('timingError !== null')) failures.push('Sales Tax does not disable filing when its timing is invalid.');
if (!quickEntryPage.includes('A filed Sales Tax return covers this date, but it is not an accountant lock.') || !quickEntryPage.includes('Save remains available.')) failures.push('Quick Entry does not clearly distinguish a filed-return warning from an accountant lock.');
if (!quickEntryPage.includes('This transaction date is inside an accountant-locked fiscal period.')) failures.push('Quick Entry does not identify the only lock that can block saving.');
if (!postingGate.includes('!isHstFilingPeriod(period)')) failures.push('The posting gate still treats a filed-return date marker as an accountant lock.');

try {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE fiscal_periods (id INTEGER PRIMARY KEY AUTOINCREMENT, period_start TEXT NOT NULL, period_end TEXT NOT NULL, label TEXT NOT NULL, is_locked INTEGER NOT NULL DEFAULT 0, locked_at TEXT);
    CREATE TABLE hst_filings (id INTEGER PRIMARY KEY AUTOINCREMENT, period_start TEXT NOT NULL, period_end TEXT NOT NULL, filing_date TEXT NOT NULL, collected_cents INTEGER NOT NULL, itc_cents INTEGER NOT NULL, net_payable_cents INTEGER NOT NULL, payment_account_id INTEGER, journal_entry_id INTEGER, memo TEXT, created_at TEXT);`);
  db.prepare("INSERT INTO hst_filings (period_start, period_end, filing_date, collected_cents, itc_cents, net_payable_cents) VALUES ('2025-01-01','2025-03-31','2025-04-30',13000,5000,8000)").run();
  db.exec(migration);
  const filing = db.prepare('SELECT fiscal_period_id AS lockId FROM hst_filings').get();
  const lock = db.prepare('SELECT period_start AS start, period_end AS end, is_locked AS locked FROM fiscal_periods WHERE id = ?').get(filing.lockId);
  if (!filing.lockId || lock?.start !== '2025-01-01' || lock?.end !== '2025-03-31' || lock?.locked !== 1) failures.push('Migration execution did not create/link the expected locked period.');
  db.close();
} catch (error) {
  failures.push(`Migration execution failed: ${error instanceof Error ? error.message : String(error)}`);
}
if (failures.length) {
  console.error('HST filing-period lock verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('HST filing-period lock verification PASSED.');
console.log(' Filed returns remain traceable and warn on back-dated entries; only accountant-locked fiscal periods block posting.');
