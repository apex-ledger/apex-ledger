import fs from 'node:fs';

const types = fs.readFileSync(new URL('../src/shared/domain/types.ts', import.meta.url), 'utf8');
const fields = fs.readFileSync(new URL('../src/renderer/components/ForeignCurrencyFields.tsx', import.meta.url), 'utf8');
const invoice = fs.readFileSync(new URL('../src/renderer/features/invoices/InvoiceEditorPage.tsx', import.meta.url), 'utf8');
const receipt = fs.readFileSync(new URL('../src/renderer/features/sales-receipts/SalesReceiptEditorPage.tsx', import.meta.url), 'utf8');
const schemas = fs.readFileSync(new URL('../src/shared/validation/schemas.ts', import.meta.url), 'utf8');

const expected = ['USD', 'EUR', 'GBP', 'AUD', 'JPY', 'CHF', 'CNY', 'HKD', 'INR', 'MXN', 'NZD', 'SGD', 'KRW', 'BRL', 'IDR', 'MYR', 'NOK', 'PEN', 'PLN', 'ZAR', 'SEK', 'TWD', 'THB', 'TRY'];
const failures = [];
for (const currency of expected) {
  if (!types.includes(`'${currency}'`)) failures.push(`${currency} is missing from the supported foreign-currency contract.`);
  if (!types.includes(`${currency}:`)) failures.push(`${currency} is missing its user-facing label.`);
}
if (!fields.includes('<option value="CAD">CAD — Canadian dollar (base)</option>')) failures.push('CAD is not visibly first and identified as the base currency.');
if (!fields.includes('FOREIGN_CURRENCY_CODES.map')) failures.push('The transaction currency selector is not driven by the shared currency contract.');
if (!schemas.includes("baseCurrency: z.literal('CAD').default('CAD')")) failures.push('Company validation does not keep CAD as the base currency.');
if (invoice.includes("'(USD)'")) failures.push('Invoice columns still have a hard-coded USD label.');
if (receipt.includes("'(USD)'")) failures.push('Sales receipt columns still have a hard-coded USD label.');
if (!invoice.includes('`(${fx.currency})`') || !receipt.includes('`(${fx.currency})`')) failures.push('Foreign document columns do not show the selected currency.');

if (failures.length) {
  console.error('Multi-currency verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('CAD-base multi-currency verification PASSED.');
console.log(' CAD remains the ledger/reporting base and all 24 Bank of Canada daily-rate currencies are selectable.');
