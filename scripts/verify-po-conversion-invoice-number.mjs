import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/purchaseOrders.handlers.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/renderer/features/purchase-orders/PurchaseOrdersPage.tsx', import.meta.url), 'utf8');
const failures = [];
const conversion = handler.slice(handler.indexOf('export async function purchaseOrdersConvertToBill'));

if (!conversion.includes('const supplierInvoiceNumber = billNumber?.trim()') || !conversion.includes('Vendor invoice number is required')) failures.push('PO-to-bill conversion does not require a supplier invoice number.');
if (!conversion.includes('billNumber: supplierInvoiceNumber')) failures.push('Converted bill does not retain the supplier invoice number.');
if (!page.includes('Enter the vendor invoice number') || !page.includes('convertToBill({ id: row.id, billNumber })')) failures.push('PO Enter Bill action does not collect/pass the supplier invoice number.');

if (failures.length) {
  console.error('PO conversion invoice-number verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('PO conversion supplier invoice-number verification passed.');
