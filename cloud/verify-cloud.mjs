/** The local release gate for the cloud stack — everything that can be proven without Azure.
 *
 * Runs the three packages the way the pipeline will: the API compiles and its tests pass, the
 * web front end compiles, builds and its tests pass, and every PostgreSQL migration applies in
 * order inside an embedded Postgres with row security checked. Then it refuses obvious deployment
 * mistakes: a parameters file with placeholders still in it, or a version that disagrees between
 * the packages and the infrastructure default.
 *
 *   node cloud/verify-cloud.mjs
 *
 * What it cannot prove is written in DEPLOYMENT-READINESS.md: Bicep what-if against a real
 * subscription, Entra token validation, and email delivery all need Azure.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const failures = [];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(label, cwd, args) {
  process.stdout.write(`\n== ${label}\n`);
  const result = spawnSync(npm, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) failures.push(`${label} failed (exit ${result.status}).`);
}

for (const pkg of ['api', 'web', 'integration']) {
  if (!existsSync(join(here, pkg, 'node_modules'))) run(`${pkg}: install`, join(here, pkg), ['ci', '--no-audit', '--no-fund']);
}
run('api: build', join(here, 'api'), ['run', 'build']);
run('api: tests', join(here, 'api'), ['test']);
run('web: build', join(here, 'web'), ['run', 'build']);
run('web: tests', join(here, 'web'), ['test']);
run('database: migration chain', join(here, 'integration'), ['test']);

// One version, stated in three places. A mismatch ships an image tagged differently from what the
// container app was told to pull, and the deployment fails at the last step instead of the first.
const version = (file) => JSON.parse(readFileSync(join(here, file), 'utf8')).version;
const apiVersion = version('api/package.json');
const bicep = readFileSync(join(here, 'infra', 'main.bicep'), 'utf8');
const bicepTag = /param apiImageTag string = '([^']+)'/.exec(bicep)?.[1];
for (const [label, value] of [['web/package.json', version('web/package.json')], ['integration/package.json', version('integration/package.json')], ['infra/main.bicep apiImageTag', bicepTag]]) {
  if (value !== apiVersion) failures.push(`Version mismatch: api/package.json is ${apiVersion} but ${label} is ${value}.`);
}

// The example parameters file must keep its placeholders — it is the template — but any other
// .bicepparam in the folder is a real one that must not.
const infraDir = join(here, 'infra');
for (const name of ['main.bicepparam']) {
  const path = join(infraDir, name);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, 'utf8');
  if (/<[^>]+>|replace-with|replace\.ciamlogin/.test(text)) failures.push(`${name} still contains placeholders. Real parameters belong outside source control.`);
}

// The API must never be started as the database owner; the migrations create the restricted
// role for it, and the connection string is the only place that choice is made.
const migrations = readFileSync(join(here, 'database', 'migrations', '002_runtime_permissions.sql'), 'utf8');
if (!/northledger_app/.test(migrations)) failures.push('The runtime database role northledger_app is missing from the migrations.');

if (failures.length > 0) {
  console.error('\nCloud release gate FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}
console.log(`\nCloud release gate PASSED for version ${apiVersion}.`);
console.log(' API, web and migration chain verified locally. Azure-side validation still required — see DEPLOYMENT-READINESS.md.');
