import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main/companyFile.ts', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../src/renderer/features/bookkeeping-checklist/BackupRecoveryPanel.tsx', import.meta.url), 'utf8');
const requiredSource = [
  'verifyCompanyBackup(backupPath)',
  'verifyCompanyBackup(result.filePath)',
  'Recovery cannot overwrite the company that is currently open',
  'Recovery will not replace any existing company file',
  'listCompanyRecoveryPoints().find',
  'readRecoverySummary(filePath)',
];
const failures = requiredSource.filter((text) => !source.includes(text)).map((text) => `Missing recovery safeguard: ${text}`);
if (!renderer.includes('Restore as new copy')) failures.push('Recovery UI no longer promises a new copy.');
if (!renderer.includes('journalEntries') || !renderer.includes('customers') || !renderer.includes('vendors')) failures.push('Recovery identity/count preview is missing.');
if (!renderer.includes('window.api.company.open(result.data.filePath)') || !renderer.includes('setCompany(opened.data.filePath')) failures.push('Verified recovery copy cannot be opened directly from the recovery workflow.');
if (failures.length) {
  console.error('Backup recovery safety verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Backup recovery safety verification PASSED.');
console.log(' source and restored copies are verified; existing files are protected; identity/count preview and direct open are exposed.');
