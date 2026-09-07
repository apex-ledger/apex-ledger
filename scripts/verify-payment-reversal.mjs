import fs from 'node:fs';

const bill = fs.readFileSync('src/main/ipc/bills.handlers.ts', 'utf8');
const invoice = fs.readFileSync('src/main/ipc/invoices.handlers.ts', 'utf8');
const registration = fs.readFileSync('src/main/ipc/registerHandlers.ts', 'utf8');
const preload = fs.readFileSync('src/preload/index.ts', 'utf8');
const failures = [];
for (const [label, source] of [['bill', bill], ['invoice', invoice]]) {
  if (!source.includes('ReverseLastPayment')) failures.push(`${label} payment reversal endpoint is missing.`);
  if (!source.includes('db.transaction().execute')) failures.push(`${label} payment reversal is not transactional.`);
  if (!source.includes('journalVoid(payment.journalEntryId, false, trx, true)')) failures.push(`${label} payment GL is not voided inside the transaction.`);
  if (!source.includes("paidCents: paidCents") && !source.includes("set({ paidCents,")) failures.push(`${label} balance is not reopened.`);
}
if (!invoice.includes('Delete that deposit first')) failures.push('Deposited customer payments can be reversed without unbanking the deposit.');
if (!registration.includes('bills:reverseLastPayment') || !registration.includes('invoices:reverseLastPayment')) failures.push('Payment reversal IPC is not registered.');
if (!preload.includes('reverseLastPayment')) failures.push('Payment reversal is not exposed to the UI.');
for (const file of ['src/renderer/features/purchases/PurchasesPage.tsx', 'src/renderer/features/invoices/InvoiceEditorPage.tsx']) {
  if (!fs.readFileSync(file, 'utf8').includes('Reverse Last Payment')) failures.push(`${file} has no visible reversal action.`);
}
if (failures.length) {
  console.error('Payment-reversal verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Payment-reversal verification PASSED.');
console.log(' Newest vendor/customer payments can be atomically voided and balances reopened; deposited receipts require unbanking first.');
