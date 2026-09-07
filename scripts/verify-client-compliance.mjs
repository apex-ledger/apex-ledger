import fs from 'node:fs';

const templates = fs.readFileSync(new URL('../src/shared/domain/forms/formTemplates.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/renderer/features/forms/FormsPage.tsx', import.meta.url), 'utf8');
const failures = [];

for (const id of [
  'engagement_letter',
  'client_acceptance_continuance',
  'privacy_technology_consent',
  'cra_rep_authorization_checklist',
  'compilation_management_acknowledgement',
  'fintrac_applicability_kyc',
]) {
  if (!templates.includes(`id: '${id}'`)) failures.push(`Missing client-compliance form: ${id}`);
}

if (!templates.includes('do not by themselves trigger')) {
  failures.push('FINTRAC form does not preserve its conditional-applicability warning.');
}
if (templates.includes('T1013')) failures.push('Obsolete CRA T1013 wording remains in the client forms.');
if (!page.includes('Before starting or continuing client work')) {
  failures.push('Forms page is missing the pre-engagement compliance alert.');
}
if (!page.includes('not a substitute for professional or legal judgment')) {
  failures.push('Forms page is missing the provincial and professional-judgment limitation.');
}

if (failures.length) {
  console.error('Client compliance verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('Client compliance verification PASSED.');
console.log(' Engagement, acceptance, privacy, CRA, compilation, and conditional FINTRAC workflows are present.');
