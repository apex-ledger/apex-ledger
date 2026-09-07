import fs from 'node:fs';

const errors = [];

function source(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function requireOrder(relativePath, first, second) {
  const text = source(relativePath);
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  if (firstIndex < 0) errors.push(`${relativePath} is missing ${JSON.stringify(first)}.`);
  if (secondIndex < 0) errors.push(`${relativePath} is missing ${JSON.stringify(second)}.`);
  if (firstIndex >= 0 && secondIndex >= 0 && firstIndex > secondIndex) errors.push(`${relativePath} must place ${JSON.stringify(first)} before ${JSON.stringify(second)}.`);
}

function forbid(relativePath, fragment) {
  if (source(relativePath).includes(fragment)) errors.push(`${relativePath} still right-aligns a page action with ${JSON.stringify(fragment)}.`);
}

requireOrder('src/renderer/features/invoices/InvoicesPage.tsx', '+ New Invoice', 'Make Deposit');
requireOrder('src/renderer/features/sales-receipts/SalesReceiptsPage.tsx', '+ New Sales Receipt', 'Make Deposit');
requireOrder('src/renderer/features/credit-notes/CreditNotesPage.tsx', "New {kind === 'customer' ? 'Credit Note'", "(['customer', 'vendor']");
requireOrder('src/renderer/features/journal-entries/JournalEntryListPage.tsx', '+ New Journal Entry', 'All statuses');
requireOrder('src/renderer/features/chart-of-accounts/ChartOfAccountsPage.tsx', '+ New Account', 'Search accounts…');
requireOrder('src/renderer/features/reports/GifiExportPage.tsx', 'Export Excel', 'Fiscal period');
requireOrder('src/renderer/features/reports/ChequeRegisterPage.tsx', '+ Fill a Cheque', '>From</label>');

forbid('src/renderer/features/credit-notes/CreditNotesPage.tsx', 'className="ml-auto rounded-full bg-brand-100');
forbid('src/renderer/features/journal-entries/JournalEntryListPage.tsx', 'className="ml-auto rounded-full bg-brand-50');
forbid('src/renderer/features/chart-of-accounts/ChartOfAccountsPage.tsx', 'className="ml-auto rounded-full bg-gray-100');
forbid('src/renderer/features/invoices/InvoiceEditorPage.tsx', 'className="ml-auto flex items-center gap-2"');
forbid('src/renderer/features/purchase-orders/PurchaseOrderEditorPage.tsx', 'items-center justify-between gap-2');
forbid('src/renderer/features/estimates/EstimateEditorPage.tsx', 'items-center justify-between gap-2');

// The heading and the page's creation actions share one row (heading left, actions right) instead
// of the actions stacking beneath the description — that band of empty height was on every page.
for (const [file, action] of [
  ['src/renderer/features/contacts/ContactsPage.tsx', 'Add Customer/Add Vendor'],
  ['src/renderer/features/purchases/PurchasesPage.tsx', 'Enter Bill'],
  ['src/renderer/features/access-permissions/AccessPermissionsPage.tsx', 'Add User'],
]) {
  const text = source(file);
  if (!text.includes('className="flex flex-wrap items-center justify-between gap-3"')) errors.push(`${file} must keep ${action} on the heading row.`);
  if (text.includes('className="mt-2 flex flex-wrap items-center gap-2"')) errors.push(`${file} must not stack ${action} on a row beneath the heading.`);
}

if (errors.length > 0) {
  console.error('Left page-action placement verification FAILED:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(2);
}

console.log('Left page-action placement verification PASSED.');
console.log(' Primary New/Add/Create actions are grouped at the upper-left before filters and secondary actions.');
