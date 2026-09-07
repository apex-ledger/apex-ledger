import fs from 'node:fs';

const handler = fs.readFileSync(new URL('../src/main/ipc/purchaseOrders.handlers.ts', import.meta.url), 'utf8');
const modal = fs.readFileSync(new URL('../src/renderer/features/purchase-orders/MatchSupplierBillModal.tsx', import.meta.url), 'utf8');
const failures = [];

if (!handler.includes("if (!billNumber) throw new Error('Vendor invoice number is required")) failures.push('Supplier invoice number is not required by the backend match workflow.');
if (!handler.includes("eb.fn('lower', ['billNumber'])") || !handler.includes("where('vendorId', '=', po.vendorId)")) failures.push('Supplier invoice duplicate check is not case-insensitive and vendor-specific.');
if (!handler.includes('billNumber,') || !handler.includes('reference: billNumber')) failures.push('Matched bill/journal do not retain the supplier invoice number.');
if (!modal.includes('Vendor Invoice Number') || !modal.includes('!billNumber.trim()')) failures.push('Match modal does not collect and require the supplier invoice number.');

if (failures.length) {
  console.error('PO supplier invoice-number verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('PO supplier invoice-number verification passed.');
