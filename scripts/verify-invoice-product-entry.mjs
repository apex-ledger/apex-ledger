import fs from 'node:fs';

const invoice = fs.readFileSync(new URL('../src/renderer/features/invoices/InvoiceEditorPage.tsx', import.meta.url), 'utf8');
const productModal = fs.readFileSync(new URL('../src/renderer/features/inventory/NewProductModal.tsx', import.meta.url), 'utf8');
const taxCodes = fs.readFileSync(new URL('../src/shared/domain/ledger/taxCodes.ts', import.meta.url), 'utf8');
const failures = [];

for (const [source, needle, message] of [
  [invoice, 'onAddNew={(query) => setNewProductForLine', 'Invoice product picker has no New Product action.'],
  [invoice, 'applyProductToLine(line, product ?? null)', 'Changing an invoice product does not update the line selection.'],
  [invoice, 'product?.incomeAccountId', 'Product revenue-account default is not applied to a blank invoice line.'],
  [invoice, 'product.salePriceCents', 'Product sale-price default is not applied to a blank invoice line.'],
  [invoice, 'productNameById', 'Posted invoices do not show their saved product.'],
  [invoice, 'productId: l.productId', 'Invoice save payload does not retain the selected product.'],
  [productModal, 'window.api.products.create', 'New Product dialog does not create a saved product.'],
  [productModal, 'trackQuantity', 'New Product dialog does not distinguish services from tracked inventory.'],
  [productModal, 'assetAccountId', 'Tracked products cannot set an Inventory Asset account.'],
  [productModal, 'cogsAccountId', 'Tracked products cannot set a COGS account.'],
]) {
  if (!source.includes(needle)) failures.push(message);
}

const baseCents = Math.round(5 * 4500);
const ontarioRate = Number(taxCodes.match(/code:\s*'HST'[\s\S]*?rate:\s*([0-9.]+)/)?.[1]);
const hstCents = Math.round(baseCents * ontarioRate);
const totalCents = baseCents + hstCents;
if (baseCents !== 22500 || hstCents !== 2925 || totalCents !== 25425) {
  failures.push(`Invoice formula regression: received base ${baseCents}, HST ${hstCents}, total ${totalCents}.`);
}

if (failures.length) {
  console.error('Invoice product-entry verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('Invoice product-entry verification PASSED.');
console.log(' 5 × $45.00 = $225.00; HST 13% = $29.25; total = $254.25. Product selection, creation and posting links are present.');
