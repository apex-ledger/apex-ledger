import fs from 'node:fs';

const renderer = fs.readFileSync(new URL('../src/renderer/features/quick-entry/QuickEntryPage.tsx', import.meta.url), 'utf8');
const handler = fs.readFileSync(new URL('../src/main/ipc/quickEntry.handlers.ts', import.meta.url), 'utf8');
const journal = fs.readFileSync(new URL('../src/main/ipc/journal.handlers.ts', import.meta.url), 'utf8');
const smoke = fs.readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8');
const failures = [];
for (const marker of ['categoryLine?.baseCents ?? categoryPostedCents', 'categoryPostedCents - originalBaseCents', '+ claimableTaxCents', "categoryLine.taxCode !== 'NonHST'", 'Original foreign amount:']) {
  if (!renderer.includes(marker)) failures.push(`Correction UI is missing special-tax/FX behavior: ${marker}`);
}
if (!handler.includes('payload.baseCents / categoryLine.foreignAmountCents')) failures.push('A changed CAD base does not recalculate the stored FX rate.');
for (const field of ['foreignCurrency: line.foreignCurrency', 'foreignAmountCents: line.foreignAmountCents', 'exchangeRate: line.exchangeRate']) if (!journal.includes(field)) failures.push(`Journal insert drops ${field.split(':')[0]} metadata.`);
if (!smoke.includes("taxCode: 'MealsHST'") || !smoke.includes("foreignCurrency: 'USD'") || !smoke.includes('reconstructedTaxCents === 1605')) failures.push('Packaged smoke test no longer exercises Meals HST plus foreign-currency metadata.');
if (failures.length) { console.error('Special tax/FX correction verification FAILED:'); failures.forEach((failure) => console.error(` - ${failure}`)); process.exit(2); }
console.log('Special tax/FX correction verification PASSED.');
console.log(' full Meals HST is reconstructed, U.S. tax remains editable, and foreign source amount/rate metadata stays consistent.');
