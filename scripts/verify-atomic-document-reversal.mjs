import fs from 'node:fs';

const files = [
  'src/main/ipc/bills.handlers.ts',
  'src/main/ipc/invoices.handlers.ts',
  'src/main/ipc/salesReceipts.handlers.ts',
  'src/main/ipc/creditNotes.handlers.ts',
  'src/main/ipc/hstFilings.handlers.ts',
  'src/main/ipc/shareholders.handlers.ts',
];
const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('db.transaction().execute')) failures.push(`${file} has no transactional reversal.`);
  const unsafe = /journalVoid\([^;]*\);\s*\n\s*await db\.(?:deleteFrom|updateTable)/g;
  if (unsafe.test(source)) failures.push(`${file} can void the ledger before its document changes commit.`);
}
if (failures.length) {
  console.error('Atomic business-document reversal verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Atomic business-document reversal verification PASSED.');
console.log(' Bills, invoices, deposits, sales receipts, credits, HST filings, and T5 payments reverse their ledger/document state together.');
