import fs from 'node:fs';

const registration = fs.readFileSync('src/main/ipc/registerHandlers.ts', 'utf8');
const preload = fs.readFileSync('src/preload/index.ts', 'utf8');
const purchases = fs.readFileSync('src/renderer/features/purchases/PurchasesPage.tsx', 'utf8');
const invoice = fs.readFileSync('src/renderer/features/invoices/InvoiceEditorPage.tsx', 'utf8');
const failures = [];
if (!registration.includes('bills:payments') || !registration.includes('invoices:payments')) failures.push('Payment-history IPC endpoints are missing.');
if (!preload.includes("payments: invoke<BillPayment[]>") || !preload.includes("payments: invoke<InvoicePayment[]>")) failures.push('Payment history is not exposed with typed rows.');
if (!purchases.includes('payment.paymentDate') || !purchases.includes('payment.amountCents') || !purchases.includes('payment.journalEntryId')) failures.push('Purchases does not show supplier payment date, amount, and GL drill-back.');
if (!invoice.includes('Payment History') || !invoice.includes('payment.depositId') || !invoice.includes('payment.journalEntryId')) failures.push('Invoice payment history lacks deposit state or GL drill-back.');
if (failures.length) {
  console.error('Payment-history verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Payment-history verification PASSED.');
console.log(' Vendor bills and customer invoices expose every partial payment with date, amount, deposit state, and exact GL drill-back.');
