import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/receiptInbox.handlers.ts', import.meta.url), 'utf8');
const failures = [];

if (!handler.includes('function uniqueDestination(')) failures.push('Duplicate receipt filenames can overwrite or block an archive move.');
if (!handler.includes('await billsDelete(createdBill.id)')) failures.push('A failed bill receipt archive/link does not roll back its posted bill.');
if ((handler.match(/fs\.renameSync\(archivedPath, sourcePath\)/g) ?? []).length < 2) failures.push('Failed bill and quick-entry imports do not both restore the scan to Inbox.');
if (!handler.includes('const skippedPath = uniqueDestination(skipped, safe)')) failures.push('Skipped duplicate filenames are not preserved safely.');

if (failures.length) {
  console.error('Receipt file safety verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Receipt file safety verification passed.');
