import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/purchaseOrders.handlers.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/renderer/features/purchase-orders/PurchaseOrdersPage.tsx', import.meta.url), 'utf8');
const failures = [];

if (!handler.includes('export async function purchaseOrdersUnmatchSupplierBill')) failures.push('Supplier bill unmatch handler is missing.');
if (!handler.includes("status: 'received', convertedBillId: null") || !handler.includes("deleteFrom('bills')")) failures.push('Unmatch does not restore the received PO and remove its matched bill together.');
if (!handler.includes('await journalVoid(bill.billJournalEntryId, false, trx, true)')) failures.push('Unmatch does not reverse the matched AP/GRNI journal atomically.');
if (!handler.includes('Reverse the vendor bill payments')) failures.push('Paid matched bills are not protected.');
if ((handler.match(/where\('matchedBillId', 'is', null\)/g) ?? []).length < 2) failures.push('Supplier matching lacks retry-safe source claiming.');
if (!page.includes('Unmatch bill') || !page.includes('Open vendor bill')) failures.push('Purchase order lacks unmatch and original-bill drill-back actions.');

if (failures.length) {
  console.error('PO supplier unmatch verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('PO supplier match retry/unmatch verification passed.');
