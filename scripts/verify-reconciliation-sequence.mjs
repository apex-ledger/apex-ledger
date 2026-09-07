import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/bankReconciliation.handlers.ts', import.meta.url), 'utf8');
const failures = [];
const start = handler.slice(handler.indexOf('export async function bankReconciliationStart'), handler.indexOf('export async function bankReconciliationToggleLine'));

if (!start.includes("where('status', '=', 'in_progress')")) failures.push('Backend permits more than one open reconciliation per account.');
if (!start.includes('payload.statementDate <= previous.statementDate')) failures.push('Backend permits a statement before/equal to the latest completed statement.');
if (!start.includes("account.accountType !== 'Asset' && account.accountType !== 'Liability'")) failures.push('Backend accepts an invalid reconciliation account type.');
if (!start.includes('db.transaction().execute')) failures.push('Sequence checks and reconciliation creation are not atomic.');

if (failures.length) {
  console.error('Reconciliation sequence verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Bank reconciliation sequence verification passed.');
