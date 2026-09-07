import fs from 'node:fs';

const failures = [];
const modal = fs.readFileSync('src/renderer/components/Modal.tsx', 'utf8');
if (!modal.includes('flex flex-wrap justify-start gap-2')) failures.push('Shared modal actions are not grouped on the left.');

const traceComponent = fs.readFileSync('src/renderer/components/OpenEntryButton.tsx', 'utf8');
if (!traceComponent.includes('openOriginalEntry(entryId, setView)')) failures.push('Report trace control no longer resolves the original business entry.');
if (!traceComponent.includes('event.stopPropagation()')) failures.push('Report trace control can trigger its row twice.');

const app = fs.readFileSync('src/renderer/App.tsx', 'utf8');
if (!app.includes('↗ Trace Source Entries')) failures.push('The shared report header has no route to the source-entry list.');

for (const file of [
  'GeneralLedgerPage.tsx',
  'SalesTaxDetailPage.tsx',
  'ProfitAndLossDetailPage.tsx',
  'CustomerStatementPage.tsx',
  'ChequeRegisterPage.tsx',
  'ReconciliationReportPage.tsx',
  'JournalReportPage.tsx',
  'InvalidTransactionsPage.tsx',
  'AdjustingEntriesPage.tsx',
]) {
  const source = fs.readFileSync(`src/renderer/features/reports/${file}`, 'utf8');
  if (!source.includes('<OpenEntryButton')) failures.push(`${file} has transaction rows but no visible one-click trace control.`);
}

if (failures.length) {
  console.error('Entry action and report trace verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}

console.log('Entry action and report trace verification PASSED.');
console.log(' Shared sheet actions stay left; every transaction-level report exposes one-click source tracing.');
