import fs from 'node:fs';

const files = [
  '../src/renderer/components/Combobox.tsx',
  '../src/renderer/components/JournalEntryLink.tsx',
  '../src/renderer/features/invoices/InvoiceEditorPage.tsx',
  '../src/renderer/features/purchases/PurchasesPage.tsx',
  '../src/renderer/features/receipt-inbox/ReceiptInboxPage.tsx',
  '../src/renderer/features/credit-notes/CreditNotesPage.tsx',
];
const source = files.map((file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
const failures = [];

if (!source.includes("value={open ? query : selected?.label ?? ''}")) {
  failures.push('Selected combobox values can expose internal ids before their labels.');
}
for (const forbidden of ['Journal #${id}', 'GL #${', 'Deposit #${', 'Vendor bill #${', 'Applied to #${']) {
  if (source.includes(forbidden)) failures.push(`Visible internal-id pattern remains: ${forbidden}`);
}

if (failures.length) {
  console.error('Visible record-id verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('Visible record-id verification PASSED.');
console.log(' Shared selectors render names only; known GL, deposit, bill, and settlement ids are hidden.');
