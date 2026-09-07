import fs from 'node:fs';

const search = fs.readFileSync(new URL('../src/renderer/features/client-hub/clientSearch.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/renderer/features/client-hub/ClientHubPage.tsx', import.meta.url), 'utf8');
const requiredClientFields = [
  'client.clientName', 'client.phone', 'client.email', 'client.address', 'client.companyFilePath',
  'client.notes', 'client.sin', 'client.dateOfBirth', 'client.spouseSin', 'client.dependents',
  'client.outstandingDocuments', 'client.insuranceTypes', 'client.policyExpiryDate', 'client.comments',
];
const failures = [];
for (const field of requiredClientFields) if (!search.includes(field)) failures.push(`CRM search is missing ${field}.`);
for (const linked of ['clientReminders', 'clientAppointments']) if (!search.includes(linked)) failures.push(`CRM search is missing linked ${linked}.`);
if (!search.includes("replace(/[^a-z0-9]/g, '')")) failures.push('CRM search is not punctuation-insensitive for phone/SIN values.');
if (!search.includes('linkedCompanyName(client.companyFilePath)')) failures.push('CRM search does not explicitly index the linked company name.');
if (!search.includes('dateSearchValues(client.dateOfBirth)')) failures.push('CRM search does not support common DOB formats.');
if (!search.includes('queryTokens.every')) failures.push('CRM search does not support multi-word matching across fields.');
if (!page.includes('clientMatchesSearch(client, searchTerm, reminders, appointments)')) failures.push('Client Hub is not using the comprehensive CRM search.');
if (!page.includes('placeholder="Search company/name, DOB, phone, SIN or address…"')) failures.push('The CRM search prompt does not identify the requested client fields.');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Comprehensive CRM search verification PASSED.');
