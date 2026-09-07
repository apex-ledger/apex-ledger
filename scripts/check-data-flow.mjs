// Runs the end-to-end data-flow check inside the real app (Electron + the real handlers + a fresh
// company file) and prints every check with its result. Exit code 1 if any check fails.
//
//   npm run check:flow
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-flow-'));
const companyPath = path.join(workDir, 'Flow Check Co.company');
const resultPath = path.join(workDir, 'flow-result.json');
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!fs.existsSync(electron)) { console.error('electron.exe not found under node_modules.'); process.exit(2); }
if (!fs.existsSync(path.join(root, 'dist-electron', 'main', 'index.js'))) { console.error('Run npm run build first.'); process.exit(2); }

const env = { ...process.env, NORTH_LEDGER_TEST_BUILD: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const launched = spawnSync(electron, ['.', `--apex-flow-company=${companyPath}`, `--apex-flow-result=${resultPath}`], { cwd: root, env, encoding: 'utf8', timeout: 240_000, windowsHide: true });
if (launched.error) { console.error('launch failed:', launched.error.message); process.exit(2); }
if (!fs.existsSync(resultPath)) { console.error('no result written. exit', launched.status, '\n', launched.stderr?.slice(-3000)); process.exit(2); }
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
fs.rmSync(workDir, { recursive: true, force: true });

let failed = 0;
for (const check of result.checks) {
  if (!check.pass) failed += 1;
  console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
}
console.log(`\n${result.checks.length - failed} of ${result.checks.length} data-flow checks passed.`);
if (!result.ok && result.error) { console.error('FLOW CHECK STOPPED EARLY:\n' + result.error); process.exit(1); }
process.exit(failed === 0 ? 0 : 1);
