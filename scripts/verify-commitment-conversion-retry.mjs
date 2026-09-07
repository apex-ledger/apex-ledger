import fs from 'node:fs';

const estimates = fs.readFileSync(new URL('../src/main/ipc/estimates.handlers.ts', import.meta.url), 'utf8');
const orders = fs.readFileSync(new URL('../src/main/ipc/purchaseOrders.handlers.ts', import.meta.url), 'utf8');
const failures = [];

if (!estimates.includes("where('convertedInvoiceId', 'is', null)") || !estimates.includes('if (!claimed)')) failures.push('Estimate conversion does not atomically claim an unconverted source.');
if (!orders.includes("where('convertedBillId', 'is', null)") || !orders.includes("where('matchedBillId', 'is', null)") || !orders.includes('if (!claimed)')) failures.push('Purchase-order conversion does not atomically claim an unbilled source.');
if (!estimates.includes('converted by another request')) failures.push('Estimate retry collision lacks a clear recovery message.');
if (!orders.includes('billed by another request')) failures.push('Purchase-order retry collision lacks a clear recovery message.');

if (failures.length) {
  console.error('Commitment conversion retry verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Estimate/PO conversion retry verification passed.');
