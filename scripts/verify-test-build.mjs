import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const errors = [];
const appId = pkg?.build?.appId ?? '';
const productName = pkg?.build?.productName ?? '';
const output = pkg?.build?.directories?.output ?? '';
const artifactName = pkg?.build?.artifactName ?? '';

if (!/\.test$/i.test(appId)) errors.push(`TEST appId must end in .test (got ${appId})`);
if (!/TEST/i.test(productName)) errors.push(`productName must visibly contain TEST (got ${productName})`);
if (!/test/i.test(output)) errors.push(`build output must be a TEST folder (got ${output})`);
if (!/TEST/i.test(artifactName)) errors.push(`installer artifact name must visibly contain TEST (got ${artifactName})`);
if (pkg?.build?.publish) errors.push('TEST build must not define an auto-publish target.');

const indexTs = fs.readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8');
const companyTs = fs.readFileSync(new URL('../src/main/companyFile.ts', import.meta.url), 'utf8');
const updaterTs = fs.readFileSync(new URL('../src/main/updater.ts', import.meta.url), 'utf8');
if (!indexTs.includes("app.setPath('userData'")) errors.push('TEST userData isolation is missing in src/main/index.ts');
if (!companyTs.includes('North Ledger Ultimate TEST Companies')) errors.push('TEST company-file folder isolation is missing.');
if (!updaterTs.includes('isTestBuild()')) errors.push('Updater TEST-build guard is missing.');

if (errors.length) {
  console.error('North Ledger TEST build isolation verification FAILED:');
  for (const e of errors) console.error(` - ${e}`);
  process.exit(2);
}
console.log('North Ledger TEST build isolation verification PASSED.');
console.log(` appId: ${appId}`);
console.log(` productName: ${productName}`);
console.log(` output: ${output}`);
console.log(` artifact: ${artifactName}`);
