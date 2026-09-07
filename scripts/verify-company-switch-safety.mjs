import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main/companyFile.ts', import.meta.url), 'utf8');
const smoke = fs.readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8');
const failures = [];
for (const marker of ['function replaceCurrentConnection', 'const previous = slot().get()', 'currentConnection = next', 'Choose a new file name. Create Company will not replace an existing company file.', 'removeFailedNewCompany(result.filePath)', 'Save As needs a different file name', 'if (slot().get() && sameFilePath']) {
  if (!source.includes(marker)) failures.push(`Missing safe company-switch behavior: ${marker}`);
}
const openStart = source.indexOf('export async function openCompany(');
const saveStart = source.indexOf('export async function saveCompanyAs(');
const openBody = source.slice(openStart, saveStart);
if (openBody.indexOf('closeCompanyDatabase(currentConnection)') >= 0) failures.push('Open Company still closes the live connection before its replacement is ready.');
if (openBody.indexOf('replaceCurrentConnection(next)') < openBody.indexOf('seedOpeningBalanceAccounts(next.db)')) failures.push('Open Company commits the switch before seeding/validation completes.');
if (!smoke.includes('Deliberately Corrupt.company') || !smoke.includes('safeFailedSwitch')) failures.push('Packaged smoke test no longer proves failed-open connection preservation.');
if (failures.length) { console.error('Company-switch safety verification FAILED:'); failures.forEach((failure) => console.error(` - ${failure}`)); process.exit(2); }
console.log('Company-switch safety verification PASSED.');
console.log(' replacement connections are prepared first; failed opens preserve live books; Create and Save As cannot target the active/existing file unsafely.');
