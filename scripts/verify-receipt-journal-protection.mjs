import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/journal.handlers.ts', import.meta.url), 'utf8');
const failures = [];

if (!handler.includes("['receipt-inbox quick entry', db.selectFrom('receiptImports')")) {
  failures.push('Receipt Inbox quick-entry journals are not protected by their source-document link.');
}
if (!handler.includes("where('journalEntryId', '=', id)")) {
  failures.push('Receipt Inbox protection does not match the journal-entry ownership field.');
}

if (failures.length) {
  console.error('Receipt journal protection verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Receipt Inbox journal protection verification passed.');
