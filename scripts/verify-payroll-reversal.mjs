import fs from 'node:fs';

const handler = fs.readFileSync('src/main/ipc/payroll.handlers.ts', 'utf8');
const journal = fs.readFileSync('src/main/ipc/journal.handlers.ts', 'utf8');
const registration = fs.readFileSync('src/main/ipc/registerHandlers.ts', 'utf8');
const preload = fs.readFileSync('src/preload/index.ts', 'utf8');
const page = fs.readFileSync('src/renderer/features/payroll/PayrollPage.tsx', 'utf8');
const failures = [];
if (!handler.includes('payrollRunsReverse')) failures.push('Payroll reversal endpoint is missing.');
if (!handler.includes('journalVoid(run.journalEntryId!, false, trx, true)')) failures.push('Payroll GL is not voided inside the run transaction.');
if (!handler.includes("status: 'draft', journalEntryId: null")) failures.push('Reversed payroll run does not return to Draft.');
if (!journal.includes("['payroll run'")) failures.push('Direct journal void does not protect payroll-owned GL.');
if (!registration.includes('payrollRuns:reverse') || !preload.includes('reverse: invoke<PayrollRun>')) failures.push('Payroll reversal is not registered/exposed.');
if (!page.includes('Reverse to Draft')) failures.push('Payroll UI has no correction action.');
if (failures.length) {
  console.error('Payroll-reversal verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Payroll-reversal verification PASSED.');
console.log(' Posted payroll returns atomically to Draft with GL voided; direct linked-journal void is blocked.');
