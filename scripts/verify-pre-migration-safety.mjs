import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main/db/connection.ts', import.meta.url), 'utf8');
const company = fs.readFileSync(new URL('../src/main/companyFile.ts', import.meta.url), 'utf8');
const test = fs.readFileSync(new URL('../src/main/db/connection.preMigrationBackup.test.ts', import.meta.url), 'utf8');
const failures = [];
const required = [
  'createPreMigrationBackupIfNeeded(filePath)',
  'await source.backup(destination)',
  'verifyPreMigrationBackup(destination, sourceVersion)',
  "prefix = `${baseName} - pre-upgrade-v${sourceVersion}-to-v${latestVersion}`",
  'const migrationBackup = await createPreMigrationBackupIfNeeded(filePath)',
  'runMigrations(sqlite)',
  'sqlite.close()',
  'A verified pre-upgrade copy is safe at:',
];
for (const marker of required) if (!source.includes(marker)) failures.push(`Missing migration safeguard: ${marker}`);
if (source.indexOf('createPreMigrationBackupIfNeeded(filePath)') > source.lastIndexOf('runMigrations(sqlite)')) failures.push('Migration runs before its safety copy.');
if ((company.match(/await openCompanyDatabase\(/g) ?? []).length !== 3) failures.push('Not every company open/create/save-as path awaits protected migration.');
if (!test.includes('pre-upgrade-v59-to-v${latest}') || !test.includes("toBe(59)") || !test.includes("toBe(latest)")) failures.push('Executable native-driver regression test no longer proves the version-59 snapshot and the upgrade to the latest version.');
if (failures.length) { console.error('Pre-migration safety verification FAILED:'); failures.forEach((failure) => console.error(` - ${failure}`)); process.exit(2); }
console.log('Pre-migration safety verification PASSED.');
console.log(' protected ordering, verified snapshot, failure recovery path, all open paths, and native-driver regression coverage are present.');
