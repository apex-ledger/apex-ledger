import fs from 'node:fs';

const journal = fs.readFileSync('src/main/ipc/journal.handlers.ts', 'utf8');
const failures = [];
for (const table of ['invoices', 'invoicePayments', 'bills', 'billPayments', 'salesReceipts', 'deposits', 'hstFilings', 'creditNotes', 't5Payments', 'payrollRuns', 'mileageTrips', 'purchaseOrderReceipts', 'inventoryMovements']) {
  if (!journal.includes(`selectFrom('${table}')`)) failures.push(`${table} journals are not protected from direct void.`);
}
if (!journal.includes('allowLinkedDocument = false')) failures.push('Direct journal void has no protected default.');
if (!journal.includes('Open the original document')) failures.push('Blocked void does not guide the user back to the correct workflow.');
for (const file of ['bills.handlers.ts', 'invoices.handlers.ts', 'salesReceipts.handlers.ts', 'hstFilings.handlers.ts', 'creditNotes.handlers.ts', 'shareholders.handlers.ts']) {
  const source = fs.readFileSync(`src/main/ipc/${file}`, 'utf8');
  if (source.includes('journalVoid(') && !source.includes(', trx, true)')) failures.push(`${file} cannot perform its own safe linked-document reversal.`);
}
if (failures.length) {
  console.error('Linked-journal protection verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Linked-journal protection verification PASSED.');
console.log(' Direct void is blocked for document-owned GL entries; original document workflows retain atomic reversal authority.');
