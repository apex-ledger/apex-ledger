// Builds the final acceptance company (Lakeshore Plumbing & Heating Inc.) through the app's private
// seed mode, so every record goes through the real handlers. Writes the company file to the path
// given (default: D:\ApexLedger Demo Companies\Lakeshore Plumbing FINAL TEST.company) and a
// summary JSON beside it.
//
//   npm run build && node scripts/create-final-test-company.mjs [output.company]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const defaultDir = fs.existsSync('D:\\') ? 'D:\\ApexLedger Demo Companies' : path.join(root, 'demo-companies');
const companyPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(defaultDir, 'Lakeshore Plumbing FINAL TEST.company');
const resultPath = path.join(root, '.seed-final-result.json');
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!fs.existsSync(electron)) { console.error('electron.exe not found under node_modules.'); process.exit(2); }
if (!fs.existsSync(path.join(root, 'dist-electron', 'main', 'index.js'))) { console.error('Run npm run build first.'); process.exit(2); }
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(companyPath + suffix, { force: true });
fs.rmSync(resultPath, { force: true });
fs.mkdirSync(path.dirname(companyPath), { recursive: true });

const env = { ...process.env, NORTH_LEDGER_TEST_BUILD: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const launched = spawnSync(electron, ['.', `--apex-seed-company=${companyPath}`, `--apex-seed-result=${resultPath}`, '--apex-seed-kind=final'], { cwd: root, env, encoding: 'utf8', timeout: 600_000, windowsHide: true });
if (launched.error) { console.error('launch failed:', launched.error.message); process.exit(2); }
if (!fs.existsSync(resultPath)) { console.error('no seed result written. exit', launched.status, '\n', launched.stderr?.slice(-2000)); process.exit(2); }
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
fs.rmSync(resultPath, { force: true });
if (!result.ok) { console.error('SEED FAILED:\n' + result.error); process.exit(2); }
fs.writeFileSync(companyPath.replace(/\.company$/, '') + ' - summary.json', JSON.stringify(result, null, 2), 'utf8');
console.log(`Final test company written: ${companyPath}`);
console.log(JSON.stringify({ counts: result.counts, expected: result.expected }, null, 1));
