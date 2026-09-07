import fs from 'node:fs';

const checks = [
  ['src/renderer/features/reports/SalesTaxDetailPage.tsx', /row\.account\.code|\{l\.accountCode\}/],
  ['src/renderer/features/reports/JournalReportPage.tsx', /\{l\.accountCode\}/],
  ['src/renderer/features/inventory/ProductsPage.tsx', /sublabel:\s*a\.code/],
  ['src/renderer/features/chart-of-accounts/AccountFormModal.tsx', /Account Code \(optional\)|setCodeManuallyEdited/],
  ['src/renderer/features/reports/GifiExportPage.tsx', /a\.account\.code/],
  ['src/main/forms/generateCpaReviewPdf.ts', /line\.account\.code/],
  ['src/shared/domain/ledger/journalEntryDiff.ts', /account\.code[^\n]*account\.name/],
  ['src/main/ipc/journal.handlers.ts', /account\.code[^\n]*account\.name/],
];

const failures = [];
for (const [file, forbidden] of checks) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  if (forbidden.test(source)) failures.push(`${file} still renders an internal account code in an account label.`);
}

const salesTax = fs.readFileSync(new URL('../src/renderer/features/reports/SalesTaxDetailPage.tsx', import.meta.url), 'utf8');
if (!salesTax.includes('<td className="px-3 py-1">{l.accountName}</td>')) {
  failures.push('Sales Tax transaction detail does not render the account name by itself.');
}
if (!salesTax.includes('<td className="px-3 py-1.5"><AccountLink id={row.account.id} name={row.account.name} dateFrom={periodStart} dateTo={periodEnd} /></td>')) {
  failures.push('Sales Tax category detail does not render the account name by itself.');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Account-code display verification passed.');
