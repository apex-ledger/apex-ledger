import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const migration = read('src/main/db/migrations/0061_vendor_bill_number.sql');
const handler = read('src/main/ipc/bills.handlers.ts');
const form = read('src/renderer/features/purchases/BillFormModal.tsx');
const list = read('src/renderer/features/purchases/PurchasesPage.tsx');
const failures = [];
const requireText = (source, text, message) => { if (!source.includes(text)) failures.push(message); };

requireText(migration, 'ALTER TABLE bills ADD COLUMN bill_number TEXT', 'Bill number migration is missing.');
requireText(migration, 'UNIQUE INDEX idx_bills_vendor_number', 'Database does not enforce one invoice number per vendor.');
requireText(migration, 'COLLATE NOCASE', 'Duplicate invoice numbers are still case-sensitive.');
requireText(handler, 'This vendor invoice number is already recorded', 'Duplicate bill feedback is not user-friendly.');
requireText(handler, 'reference: billNumber', 'Vendor invoice number does not drill through to the journal reference.');
requireText(form, 'Vendor Invoice Number', 'Purchase Invoice form does not collect the supplier number.');
requireText(list, 'b.billNumber', 'Purchases does not display/search the supplier number.');

if (failures.length) {
  console.error('Vendor invoice-number verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Vendor invoice-number verification PASSED.');
console.log(' Supplier invoice numbers are collected, searchable, carried to the ledger, and unique per vendor.');
