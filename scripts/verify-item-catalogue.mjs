import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const checks = [
  ['migration stores purchase price', read('src/main/db/migrations/0067_item_catalogue_links.sql'), 'purchase_price_cents'],
  ['migration links bills to products', read('src/main/db/migrations/0067_item_catalogue_links.sql'), 'ALTER TABLE bills ADD COLUMN product_id'],
  ['sales receipts save product id', read('src/main/ipc/salesReceipts.handlers.ts'), 'productId: line.productId ?? null'],
  ['POS sales reduce stock', read('src/main/ipc/salesReceipts.handlers.ts'), "sourceDocumentType: 'salesReceipt'"],
  ['bills receive stock', read('src/main/ipc/bills.handlers.ts'), "sourceDocumentType: 'bill'"],
  ['item catalogue shows purchase cost', read('src/renderer/features/inventory/ProductsPage.tsx'), 'Purchase cost'],
  ['POS picker uses shared products', read('src/renderer/features/sales-receipts/SalesReceiptEditorPage.tsx'), '+ New product / service'],
  ['bill picker uses shared products', read('src/renderer/features/purchases/BillFormModal.tsx'), 'Item received (optional)'],
];

const failed = checks.filter(([, source, marker]) => !source.includes(marker));
if (failed.length) {
  for (const [label] of failed) console.error(`FAILED: ${label}`);
  process.exit(1);
}
console.log('Shared item catalogue verification PASSED.');
console.log(' Sales prices, purchase costs, bills, invoices/POS, quantities and inventory movements remain linked.');
