import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/bankReconciliation.handlers.ts', import.meta.url), 'utf8');
const register = fs.readFileSync(new URL('../src/main/ipc/registerHandlers.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/renderer/features/bank-reconciliation/BankReconciliationPage.tsx', import.meta.url), 'utf8');
const failures = [];

if (!handler.includes('export async function bankReconciliationReopen')) failures.push('Completed reconciliation reopen handler is missing.');
if (!handler.includes("row.statementDate > reconciliation.statementDate") || !handler.includes('Reopen the later')) failures.push('Older reconciliations can be reopened despite a later statement chain.');
if (!handler.includes("status: 'in_progress', completedAt: null")) failures.push('Reopen does not restore editable reconciliation state.');
if (!register.includes("'bankReconciliation:reopen'")) failures.push('Reconciliation reopen IPC is not registered.');
if (!page.includes('Reopen Reconciliation') || !page.includes('onClick={onReopen}')) failures.push('Completed reconciliation does not expose its correction action.');

if (failures.length) {
  console.error('Reconciliation reopen verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Bank reconciliation reopen verification passed.');
