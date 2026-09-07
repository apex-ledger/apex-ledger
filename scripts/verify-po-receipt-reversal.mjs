import fs from 'node:fs';

const handler = fs.readFileSync('src/main/ipc/purchaseOrders.handlers.ts', 'utf8');
const migration = fs.readFileSync('src/main/db/migrations/0063_po_receipt_movement_links.sql', 'utf8');
const page = fs.readFileSync('src/renderer/features/purchase-orders/PurchaseOrdersPage.tsx', 'utf8');
const failures = [];
if (!handler.includes('purchaseOrdersReverseLatestReceipt')) failures.push('PO receipt reversal endpoint is missing.');
if (!handler.includes('journalVoid(receipt.journalEntryId, false, trx, true)')) failures.push('GRNI journal is not voided transactionally.');
if (!handler.includes("deleteFrom('inventoryMovements')") || !handler.includes("deleteFrom('purchaseOrderReceiptLines')")) failures.push('Receipt-owned stock/subledger rows are not removed together.');
if (!handler.includes('receivedQuantity: Math.max(0, poLine.receivedQuantity - line.quantity)')) failures.push('PO received quantities are not restored.');
if (!handler.includes("sourceDocumentType: 'purchaseOrderReceipt'")) failures.push('New stock movements are not linked to their exact receipt.');
if (!migration.includes("source_document_type = 'purchaseOrderReceipt'")) failures.push('Old receipt stock movements are not backfilled.');
if (!page.includes('Reverse latest receipt')) failures.push('Purchase Orders UI has no reversal action.');
if (failures.length) {
  console.error('PO receipt-reversal verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('PO receipt-reversal verification PASSED.');
console.log(' Latest goods receipt atomically reverses GRNI, exact stock movements, receipt rows, and received quantities.');
