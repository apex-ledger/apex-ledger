import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/receiptInbox.handlers.ts', import.meta.url), 'utf8');
const register = fs.readFileSync(new URL('../src/main/ipc/registerHandlers.ts', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../src/preload/index.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/renderer/features/receipt-inbox/ReceiptInboxPage.tsx', import.meta.url), 'utf8');
const failures = [];

if (!handler.includes('export async function receiptInboxHistory')) failures.push('Processed receipt history query is missing.');
if (!register.includes("'receiptInbox:history'")) failures.push('Processed receipt history IPC is not registered.');
if (!preload.includes("history: invoke<ProcessedReceiptEntry[]>('receiptInbox:history')")) failures.push('Processed receipt history is not exposed safely to the UI.');
if (!page.includes('Processed receipts (') || !page.includes("kind: 'purchases'") || !page.includes("kind: 'journalForm'")) failures.push('Processed scans do not drill back to their original bill/journal pages.');
if (!page.includes('openFile(item.archivedFilePath)')) failures.push('Archived scans cannot be opened from the register.');

if (failures.length) {
  console.error('Receipt history verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Receipt history and drill-back verification passed.');
