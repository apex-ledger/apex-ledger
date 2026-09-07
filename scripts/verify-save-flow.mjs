import fs from 'node:fs';

const repeatableForms = [
  'purchases/BillFormModal.tsx',
  'invoices/InvoiceEditorPage.tsx',
  'sales-receipts/SalesReceiptEditorPage.tsx',
  'estimates/EstimateEditorPage.tsx',
  'purchase-orders/PurchaseOrderEditorPage.tsx',
  'credit-notes/CreditNoteFormModal.tsx',
  'contacts/ContactFormModal.tsx',
  'payroll/PayRunFormModal.tsx',
  'payroll/EmployeeFormModal.tsx',
  'payroll/ShareholderFormModal.tsx',
  'payroll/T5PaymentFormModal.tsx',
  'client-hub/ReminderFormModal.tsx',
  'quick-entry/QuickEntryPage.tsx',
];
const failures = [];
for (const relative of repeatableForms) {
  const source = fs.readFileSync(new URL(`../src/renderer/features/${relative}`, import.meta.url), 'utf8');
  if (!source.includes('Save &amp; Close')) failures.push(`${relative} is missing Save & Close.`);
  if (!source.includes('Save &amp; Next')) failures.push(`${relative} is missing Save & Next.`);
}

const bill = fs.readFileSync(new URL('../src/renderer/features/purchases/BillFormModal.tsx', import.meta.url), 'utf8');
if (!bill.includes("handleSave('close')") || !bill.includes("handleSave('next')") || !bill.includes('prepareNextBill')) {
  failures.push('Bill buttons do not have separate close and continuous-entry behaviours.');
}

if (failures.length) {
  console.error('Continuous save-flow verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}
console.log('Continuous save-flow verification PASSED.');
console.log(` ${repeatableForms.length} repeatable entry forms expose Save & Close and Save & Next.`);
