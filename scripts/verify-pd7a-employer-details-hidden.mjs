import fs from 'node:fs';

const panel = fs.readFileSync(new URL('../src/renderer/features/payroll/Pd7aSummaryPanel.tsx', import.meta.url), 'utf8');
const pdf = fs.readFileSync(new URL('../src/main/forms/generatePd7aPdf.ts', import.meta.url), 'utf8');
const failures = [];

for (const forbidden of ['CPP (employee + employer)', 'EI (employee + employer)', 'CPP — Employer Contributions', 'EI — Employer Premiums']) {
  if (panel.includes(forbidden) || pdf.includes(forbidden)) failures.push(`PD7A still exposes a separate employer detail: ${forbidden}`);
}

for (const [source, required, message] of [
  [panel, 'summary.cppEmployeeCents + summary.cppEmployerCents', 'On-screen CPP remittance no longer includes the required employer portion.'],
  [panel, 'summary.eiEmployeeCents + summary.eiEmployerCents', 'On-screen EI remittance no longer includes the required employer portion.'],
  [pdf, 'summary.cppEmployeeCents + summary.cppEmployerCents', 'PDF CPP remittance no longer includes the required employer portion.'],
  [pdf, 'summary.eiEmployeeCents + summary.eiEmployerCents', 'PDF EI remittance no longer includes the required employer portion.'],
  [panel, 'summary.totalRemittanceCents', 'On-screen PD7A total remittance is missing.'],
  [pdf, 'summary.totalRemittanceCents', 'PDF PD7A total remittance is missing.'],
]) {
  if (!source.includes(required)) failures.push(message);
}

if (failures.length) {
  console.error('PD7A employer-detail verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('PD7A employer-detail verification PASSED.');
console.log(' Employer CPP/EI are included in combined remittance totals without a separate employer-paid breakdown.');
