import fs from 'node:fs';

const invoices = fs.readFileSync(new URL('../src/main/ipc/invoices.handlers.ts', import.meta.url), 'utf8');
const bills = fs.readFileSync(new URL('../src/main/ipc/bills.handlers.ts', import.meta.url), 'utf8');
const estimates = fs.readFileSync(new URL('../src/main/ipc/estimates.handlers.ts', import.meta.url), 'utf8');
const orders = fs.readFileSync(new URL('../src/main/ipc/purchaseOrders.handlers.ts', import.meta.url), 'utf8');
const failures = [];

if (!invoices.includes('export async function invoicesCreate(input: unknown, executor?: AppDb)')) failures.push('Invoice creation cannot join an estimate conversion transaction.');
if (!bills.includes('export async function billsCreate(input: unknown, executor?: AppDb)')) failures.push('Bill creation cannot join a purchase-order conversion transaction.');
if (!estimates.includes('invoicesCreate({') || !estimates.includes('}, trx);') || !estimates.includes("trx.updateTable('estimates')")) failures.push('Estimate invoice and conversion link are not created in one transaction.');
if (!orders.includes('billsCreate({') || !orders.includes('}, trx);') || !orders.includes("trx.updateTable('purchaseOrders')")) failures.push('Purchase-order bill and conversion link are not created in one transaction.');
if (!invoices.includes("set({ status: 'accepted', convertedInvoiceId: null, convertedAt: null })")) failures.push('Deleting a permitted converted invoice does not reopen its estimate.');
if (!bills.includes("set({ status: 'sent', convertedBillId: null, convertedAt: null")) failures.push('Deleting a permitted converted bill does not reopen its purchase order.');
if (!bills.includes("where('matchedBillId', '=', id)")) failures.push('Goods-receipt matched bills are not protected from direct deletion.');

if (failures.length) {
  console.error('Commitment conversion safety verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Estimate/PO conversion and reopen verification passed.');
