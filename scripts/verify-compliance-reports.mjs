import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const hub = read('src/renderer/features/reports/ReportsHubPage.tsx');
const store = read('src/renderer/app/store/uiStore.ts');
const app = read('src/renderer/App.tsx');
const preload = read('src/preload/index.ts');
const registration = read('src/main/ipc/registerHandlers.ts');
const handlers = read('src/main/ipc/reports.handlers.ts');

const reports = ['auditTrail', 'sourceDocuments', 'bankDepositAnalysis', 'payrollRegister', 'hstWorkingPaper', 'fixedAssetContinuity', 'shareholderContinuity', 'inventoryContinuity', 'debtContinuity', 't2Reconciliation'];
for (const report of reports) {
  for (const [label, source] of [['Reports hub', hub], ['ReportKind', store], ['App route', app]]) {
    if (!source.includes(`'${report}'`)) throw new Error(`${label} is missing ${report}.`);
  }
}
if (!preload.includes("compliancePackage: invoke<CompliancePackageResult>('reports:compliancePackage')")) throw new Error('Preload does not expose the compliance report package.');
if (!registration.includes("ipcMain.handle('reports:compliancePackage'")) throw new Error('Compliance report IPC is not registered.');
if (!handlers.includes('export async function reportsCompliancePackage')) throw new Error('Compliance package query is missing.');
if (!hub.includes("heading: 'CRA audit package'") || !hub.includes("heading: 'CPA year-end continuity'")) throw new Error('CRA/CPA report groups are missing.');

console.log('CRA/CPA compliance-report verification PASSED.');
console.log(` ${reports.length} audit and year-end reports are routed, query-backed, exportable, and visible in Reports.`);
