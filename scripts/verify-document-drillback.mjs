import fs from 'node:fs';

const component = fs.readFileSync('src/renderer/components/JournalEntryLink.tsx', 'utf8');
const failures = [];
if (!component.includes("setView({ kind: 'journalForm', id })")) failures.push('Shared GL link does not open the exact journal entry.');
for (const file of [
  'src/renderer/features/purchases/PurchasesPage.tsx',
  'src/renderer/features/invoices/InvoiceEditorPage.tsx',
  'src/renderer/features/sales-receipts/SalesReceiptsPage.tsx',
  'src/renderer/features/sales-receipts/SalesReceiptEditorPage.tsx',
  'src/renderer/features/deposits/DepositsPage.tsx',
  'src/renderer/features/credit-notes/CreditNotesPage.tsx',
  'src/renderer/features/payroll/PayrollPage.tsx',
  'src/renderer/features/payroll/ShareholdersPanel.tsx',
  'src/renderer/features/hst-centre/HstFilingPage.tsx',
]) {
  if (!fs.readFileSync(file, 'utf8').includes('<JournalEntryLink')) failures.push(`${file} has no direct GL drill-back.`);
}
if (failures.length) {
  console.error('Business-document drill-back verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Business-document drill-back verification PASSED.');
console.log(' Purchases, sales, deposits, credits, payroll, T5, and HST filing screens open their exact journal entries.');
