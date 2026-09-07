import fs from 'node:fs';

const receipt = fs.readFileSync(new URL('../src/main/ipc/receiptInbox.handlers.ts', import.meta.url), 'utf8');
const bills = fs.readFileSync(new URL('../src/main/ipc/bills.handlers.ts', import.meta.url), 'utf8');
const register = fs.readFileSync(new URL('../src/main/ipc/registerHandlers.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/renderer/features/receipt-inbox/ReceiptInboxPage.tsx', import.meta.url), 'utf8');
const failures = [];

if (!receipt.includes('export async function receiptInboxReprocess')) failures.push('Receipt reprocess handler is missing.');
if (!receipt.includes('await billsDelete(item.billId, trx)') || !receipt.includes('await journalVoid(item.journalEntryId, false, trx, true)')) failures.push('Reprocess does not reverse bill/quick-entry accounting in its transaction.');
if (!receipt.includes('fs.renameSync(inboxPath, item.archivedFilePath)')) failures.push('A failed accounting reversal does not restore the archived scan.');
if (!bills.includes('export async function billsDelete(id: number, executor?: AppDb)')) failures.push('Bill deletion cannot participate in the receipt reprocess transaction.');
if (!register.includes("'receiptInbox:reprocess'")) failures.push('Receipt reprocess IPC is not registered.');
if (!page.includes('onClick={() => reprocess(item)}')) failures.push('Processed receipts do not expose Reprocess.');

if (failures.length) {
  console.error('Receipt reprocess verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Receipt reprocess correction verification passed.');
