import fs from 'node:fs';

const editor = fs.readFileSync(new URL('../src/renderer/features/sales-receipts/SalesReceiptEditorPage.tsx', import.meta.url), 'utf8');
const taxCodes = fs.readFileSync(new URL('../src/shared/domain/ledger/taxCodes.ts', import.meta.url), 'utf8');
const failures = [];

for (const [needle, message] of [
  ['defaultTaxCode, loaded: taxDefaultLoaded', 'Sales Receipt does not load the company tax default.'],
  ["const effectiveDefaultTaxCode = defaultTaxCode ?? 'HST'", 'Sales Receipt has no safe HST default.'],
  ['line.taxCode === null ? { ...line, taxCode: effectiveDefaultTaxCode } : line', 'Blank Sales Receipt lines are not linked to the visible default tax code.'],
  ['newRow(effectiveDefaultTaxCode)', 'Additional Sales Receipt lines do not inherit the tax default.'],
  ['suggestTaxCents(line.taxCode, typed)', 'Sales Receipt line HST is not calculated from its base amount.'],
  ['const totalCents = subtotalCents + taxCents', 'Sales Receipt total does not include calculated HST.'],
  ["? 'Manual' : l.taxCode,", 'Sales Receipt save payload does not retain the selected tax code.'],
]) {
  if (!editor.includes(needle)) failures.push(message);
}

const ontarioHst = taxCodes.match(/code:\s*'HST'[\s\S]*?rate:\s*([0-9.]+)/)?.[1];
const taxOnFortyDollars = ontarioHst ? Math.round(4000 * Number(ontarioHst)) : Number.NaN;
if (taxOnFortyDollars !== 520) failures.push(`Ontario HST calculation regression: expected 520 cents, received ${taxOnFortyDollars}.`);
if (4000 + taxOnFortyDollars !== 4520) failures.push('Sales Receipt $40.00 total regression: expected $45.20 including HST.');

if (failures.length) {
  console.error('Sales Receipt HST verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('Sales Receipt HST verification PASSED.');
console.log(' $40.00 base + $5.20 Ontario HST = $45.20, and new lines store the visible tax default.');
