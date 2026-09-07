import fs from 'node:fs';

const paystub = fs.readFileSync(new URL('../src/renderer/features/payroll/PaystubPage.tsx', import.meta.url), 'utf8');
const payRunForm = fs.readFileSync(new URL('../src/renderer/features/payroll/PayRunFormModal.tsx', import.meta.url), 'utf8');
const failures = [];

for (const forbidden of [
  'Paid by Employer',
  'Employer CPP',
  'Employer EI',
  'WSIB Premium',
  'Employer RRSP Contribution',
  'Health/Dental Benefit',
  'cpp1EmployerCents',
  'eiEmployerCents',
  'rrspEmployerMatchCents',
]) {
  if (paystub.includes(forbidden)) failures.push(`Employee paystub still exposes: ${forbidden}`);
}

// The amounts must remain available to payroll processing and employer accounting; only the
// employee-facing paystub presentation is removed.
for (const required of ['Employer CPP', 'Employer EI', 'Employer RRSP Contribution']) {
  if (!payRunForm.includes(required)) failures.push(`Payroll calculation review lost required employer amount: ${required}`);
}

if (failures.length) {
  console.error('Paystub employer-detail verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('Paystub employer-detail verification PASSED.');
console.log(' Employer-only CPP, EI, WSIB, RRSP and benefit details are absent from the employee paystub while payroll calculations remain intact.');
