import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../src/main/db/migrations/0069_practical_document_fields.sql');
const products = read('../src/renderer/features/inventory/ProductsPage.tsx');
const productModal = read('../src/renderer/features/inventory/NewProductModal.tsx');
const invoice = read('../src/renderer/features/invoices/InvoiceEditorPage.tsx');
const bill = read('../src/renderer/features/purchases/BillFormModal.tsx');
const contacts = read('../src/renderer/features/contacts/ContactFormModal.tsx');
const contactList = read('../src/renderer/features/contacts/ContactsPage.tsx');
const invoicePdf = read('../src/main/forms/generateInvoicePdf.ts');
const failures = [];

for (const column of ['company_name', 'contact_name', 'website', 'shipping_address', 'barcode', 'default_tax_code', 'reorder_point', 'customer_po_number', 'purchase_order_number']) {
  if (!migration.includes(column)) failures.push(`Migration is missing ${column}.`);
}
for (const needle of ['Barcode / UPC', 'Default tax', 'Reorder at', 'product.barcode', 'product.reorderPoint']) {
  if (!products.includes(needle) && !productModal.includes(needle)) failures.push(`Product entry is missing ${needle}.`);
}
for (const needle of ['Customer PO / Reference', 'Ship-to address', 'product?.defaultTaxCode', 'customerPoNumber:', 'shippingAddress:']) {
  if (!invoice.includes(needle)) failures.push(`Invoice entry/data flow is missing ${needle}.`);
}
for (const needle of ['Purchase Order / Reference', 'purchaseOrderNumber:', 'product.defaultTaxCode']) {
  if (!bill.includes(needle)) failures.push(`Bill entry/data flow is missing ${needle}.`);
}
for (const needle of ['Company / Legal Name', 'Primary Contact', 'Website', 'Shipping address']) {
  if (!contacts.includes(needle)) failures.push(`Contact entry is missing ${needle}.`);
}
for (const needle of ['contact.companyName', 'contact.shippingAddress', 'Search ${title.toLowerCase()}']) {
  if (!contactList.includes(needle)) failures.push(`Contact search is missing ${needle}.`);
}
for (const needle of ['Customer PO / Ref.', 'invoice.shippingAddress', 'customer.contactName']) {
  if (!invoicePdf.includes(needle)) failures.push(`Invoice PDF is missing ${needle}.`);
}

if (failures.length) {
  console.error('Practical entry-field verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Practical entry-field verification PASSED.');
console.log(' Customer, product, invoice, bill, search, tax-default and PDF paths are connected.');
