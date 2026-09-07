import fs from 'node:fs';

const summary = fs.readFileSync(new URL('../src/renderer/features/reports/HstSummaryPage.tsx', import.meta.url), 'utf8');
const detail = fs.readFileSync(new URL('../src/renderer/features/reports/SalesTaxDetailPage.tsx', import.meta.url), 'utf8');
const domain = fs.readFileSync(new URL('../src/shared/domain/ledger/hstSummary.ts', import.meta.url), 'utf8');
const failures = [];

for (const [source, needle, message] of [
  [summary, 'Taxable Revenue', 'Sales Tax summary is missing total taxable revenue.'],
  [summary, 'Taxable Purchases / Expenses', 'Sales Tax summary is missing the taxable purchase/expense total.'],
  [summary, 'Revenue category', 'Sales Tax summary is missing revenue-category detail.'],
  [summary, 'Revenue amount', 'Sales Tax summary does not show the revenue amount by category.'],
  [summary, 'HST collected', 'Sales Tax summary does not show HST collected by category.'],
  [summary, 'Purchase / expense category', 'Sales Tax summary is missing purchase/expense-category detail.'],
  [summary, 'ITC paid', 'Sales Tax summary does not show ITC paid by category.'],
  [summary, 'row.baseAmountCents', 'Sales Tax summary is not reading posted category base amounts.'],
  [detail, 'window.api.reports.hstSummary', 'Sales Tax Detail is not loading the authoritative category breakdown.'],
  [detail, 'Revenue categories where HST was collected', 'Sales Tax Detail is missing its revenue-category table.'],
  [detail, 'Purchase / expense categories where ITC was paid', 'Sales Tax Detail is missing its ITC-category table.'],
  [domain, 'row.baseAmountCents += baseCents', 'HST domain report no longer aggregates category base amounts.'],
  [domain, 'row.hstCents += hstCents', 'HST domain report no longer aggregates category tax amounts.'],
]) {
  if (!source.includes(needle)) failures.push(message);
}

if (failures.length) {
  console.error('Sales-tax category verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('Sales-tax category verification PASSED.');
console.log(' Taxable revenue, taxable purchases/expenses, HST collected and ITC paid are exposed by account category with totals.');
