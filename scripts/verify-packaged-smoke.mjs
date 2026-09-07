import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('.');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const output = path.resolve(root, pkg.build.directories.output);
const unpacked = path.join(output, 'win-unpacked');
const executable = path.join(unpacked, `${pkg.build.productName}.exe`);
const bundledDemo = path.join(unpacked, 'resources', 'demo-companies', 'North Ledger Comprehensive Demo.company');
const smokeDir = path.join(output, '.packaged-smoke-test');
const companyPath = path.join(smokeDir, 'Packaged Smoke.company');
const resultPath = path.join(smokeDir, 'result.json');
const userDataPath = path.join(smokeDir, 'user-data');
const smokeDrive = 'Z:';
const migrationsSource = fs.readFileSync(path.join(root, 'src/main/db/migrations/index.ts'), 'utf8');
const latestSchema = Math.max(...[...migrationsSource.matchAll(/version:\s*(\d+)/g)].map((match) => Number(match[1])));

if (!fs.existsSync(executable) || !fs.existsSync(bundledDemo)) {
  console.error('Packaged smoke test FAILED: unpacked application or bundled demo is missing.');
  process.exit(2);
}
fs.rmSync(smokeDir, { recursive: true, force: true });
fs.mkdirSync(smokeDir, { recursive: true });
fs.copyFileSync(bundledDemo, companyPath);
const env = { ...process.env, NORTH_LEDGER_TEST_BUILD: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const mapped = spawnSync('subst', [smokeDrive, root], { encoding: 'utf8', windowsHide: true });
if (mapped.status !== 0) {
  console.error(`Packaged smoke test FAILED: could not create the temporary ${smokeDrive} workspace mapping.`);
  process.exit(2);
}
const viaDrive = (absolutePath) => path.join(`${smokeDrive}\\`, path.relative(root, absolutePath));
let launched;
try {
  launched = spawnSync(viaDrive(executable), [`--north-ledger-smoke-company=${viaDrive(companyPath)}`, `--north-ledger-smoke-result=${viaDrive(resultPath)}`, `--north-ledger-smoke-user-data=${viaDrive(userDataPath)}`], { cwd: viaDrive(unpacked), env, encoding: 'utf8', timeout: 45_000, windowsHide: true });
} finally {
  spawnSync('subst', [smokeDrive, '/D'], { encoding: 'utf8', windowsHide: true });
}
const failures = [];
if (launched.error) failures.push(`Application launch failed: ${launched.error.message}`);
if (launched.status !== 0) failures.push(`Application exited with code ${launched.status ?? 'unknown'}. ${launched.stderr || launched.stdout || ''}`.trim());
if (!fs.existsSync(resultPath)) failures.push('Application did not write its smoke-test result.');
let result = {};
if (fs.existsSync(resultPath)) {
  try { result = JSON.parse(fs.readFileSync(resultPath, 'utf8')); } catch (error) { failures.push(`Smoke-test result is not valid JSON: ${error}`); }
}
if (result.ok !== true) failures.push(`Application reported failure: ${result.error ?? 'unknown error'}`);
if (result.rendererReady !== true) failures.push('Packaged renderer did not mount.');
if (result.nativeDriver !== 'better-sqlite3') failures.push('Native accounting driver was not exercised.');
if (result.atomicCorrection !== true) failures.push('Atomic Quick Entry correction did not preserve balances and the voided audit trail.');
if (result.atomicCreateAndPost !== true) failures.push('A failed immediate post left a hidden journal draft behind.');
if (result.vendorInvoiceUniqueness !== true) failures.push('A duplicate supplier invoice number created a second bill or journal entry.');
if (result.atomicDocumentReversal !== true) failures.push('A failed business-document delete left its journal entry voided.');
if (result.safeFailedSwitch !== true) failures.push('A failed attempt to open a corrupt company did not preserve the current live connection.');
if (result.schemaVersion !== latestSchema) failures.push(`Company migration ended at schema ${result.schemaVersion}; expected ${latestSchema}.`);
if (!(result.accountCount > 0) || !(result.entryCount > 0)) failures.push('Comprehensive company accounts or entries were not readable.');
if (failures.length) { console.error('Packaged application smoke test FAILED:'); failures.forEach((failure) => console.error(` - ${failure}`)); process.exit(2); }
console.log('Packaged application smoke test PASSED.');
console.log(` renderer mounted; native driver opened and migrated the demo to schema ${result.schemaVersion}; ${result.accountCount} accounts and ${result.entryCount} entries read; atomic correction, immediate-post rollback, supplier-invoice uniqueness, document-reversal rollback, and failed-switch recovery passed; clean exit.`);
