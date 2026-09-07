import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/bankReconciliation.handlers.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/renderer/features/bank-reconciliation/BankReconciliationPage.tsx', import.meta.url), 'utf8');
const failures = [];

if (!handler.includes('export async function bankReconciliationAbandon')) failures.push('Unfinished reconciliation abandon handler is missing.');
if (!handler.includes("set({ clearedAt: null, reconciliationId: null }).where('reconciliationId', '=', id)")) failures.push('Abandon does not release only the reconciliation-owned cleared marks.');
if (!handler.includes("deleteFrom('bankReconciliations').where('id', '=', id)")) failures.push('Abandon does not remove the unfinished reconciliation.');
if (!handler.includes('db.transaction().execute')) failures.push('Cleared-mark release and reconciliation removal are not atomic.');
if (!page.includes('onClick={onAbandon}') || !page.includes('no journal entries will be deleted')) failures.push('The safe abandon action/confirmation is missing from the page.');

if (failures.length) {
  console.error('Reconciliation abandon verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Bank reconciliation abandon verification passed.');
